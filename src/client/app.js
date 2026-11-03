// App controller: screens, the main loop, and match runtimes (local sim or online snapshots).
import { World } from '../shared/sim/world.js';
import { CpuController } from '../shared/sim/ai.js';
import { DT } from '../shared/sim/constants.js';
import { CHARACTERS } from '../shared/characters/index.js';
import { NetView } from './net/netClient.js';
import { Hud } from './ui/hud.js';
import { saveSettings } from './settings.js';

const NEUTRAL = { mx: 0, mz: 0, b: 0 };

export class App {
  constructor({ renderer, input, audio, simAudio, settings, portraits, touch, uiRoot }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.simAudio = simAudio;
    this.settings = settings;
    this.portraits = portraits;
    this.touch = touch;
    this.uiRoot = uiRoot;
    this.screen = null;
    this.match = null;
    this.last = performance.now();
    this.screenFactories = {};
    this.overlay = null;
    this.audioUnlocked = false;
    this.fpsT = 0; this.fpsN = 0; this.fps = 60;
    const unlock = () => {
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      Promise.resolve(audio.unlock()).catch(() => {});
      audio.setVolumes({ music: settings.music, sfx: settings.sfx });
    };
    for (const ev of ['keydown', 'mousedown', 'touchstart', 'pointerdown']) window.addEventListener(ev, unlock, { capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.match && !this.match.net && !this.match.paused) this.pause(true); });
    this.loop = this.loop.bind(this);
  }

  register(name, factory) { this.screenFactories[name] = factory; }

  go(name, params = {}) {
    const factory = this.screenFactories[name];
    if (!factory) throw new Error('No screen ' + name);
    this.closeOverlay();
    if (this.screen) { this.screen.exit && this.screen.exit(); this.screen.el.remove(); }
    const s = factory(this, params);
    this.screen = s;
    this.uiRoot.appendChild(s.el);
    if (s.enter) s.enter();
    if (s.nav && s.nav.first) requestAnimationFrame(() => { if (this.screen === s && !s.nav.cur) s.nav.first(); });
    this.screenName = name;
  }

  sfx(name, opts) { try { this.audio.play(name, opts); } catch { /* audio not ready */ } }
  music(id) { try { this.audio.playMusic(id); } catch { /* */ } }

  applySettings() {
    const s = this.settings;
    saveSettings(s);
    this.renderer.applySettings(s);
    this.input.sensitivity = s.cameraSensitivity;
    this.input.setBindings(s.keys);
    try { this.audio.setVolumes({ music: s.music, sfx: s.sfx }); } catch { /* */ }
    this.updateTouchVisibility();
  }

  updateTouchVisibility() {
    if (!this.touch) return;
    const want = this.settings.touch === 'on' || (this.settings.touch === 'auto' && this.isTouch);
    this.touch.show(!!(want && this.match && !this.match.paused));
  }

  // ---------------------------------------------------------------- main loop
  start() { requestAnimationFrame(this.loop); }

  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT >= 1) { this.fps = this.fpsN / this.fpsT; this.fpsT = 0; this.fpsN = 0; }
    // menu navigation edges (keyboard / gamepad)
    const edges = this.input.menuEdges();
    for (const e of edges) {
      if (this.overlay && this.overlay.nav) { if (e.dir === 'back' || e.dir === 'pause') { this.overlay.onBack ? this.overlay.onBack() : this.closeOverlay(); } else if (this.overlay.nav.handle(e.dir)) this.sfx(e.dir === 'ok' ? 'ui_select' : 'ui_move'); continue; }
      if (this.match && (e.dir === 'pause' || (e.dir === 'back' && e.src === 'kb'))) { this.pause(!this.match.paused); continue; }
      if (this.match) continue;
      if (this.screen && this.screen.onEdge && this.screen.onEdge(e)) continue;
      if (this.screen && this.screen.nav) { if (this.screen.nav.handle(e.dir)) this.sfx(e.dir === 'ok' ? 'ui_select' : e.dir === 'back' ? 'ui_back' : 'ui_move'); }
    }
    try {
      if (this.match) this.updateMatch(dt);
      else {
        if (this.screen && this.screen.update) this.screen.update(dt);
        this.renderer.renderShowcase(dt);
      }
    } catch (err) {
      console.error(err);
      if (!this._errShown) { this._errShown = true; this.toast('Something went wrong: ' + err.message); }
    }
  }

  toast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);background:#300;color:#fff;padding:10px 16px;border-radius:8px;font-weight:700;z-index:99;pointer-events:none';
    t.textContent = msg;
    this.uiRoot.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  // ---------------------------------------------------------------- overlays
  openOverlay(o) { this.closeOverlay(); this.overlay = o; this.uiRoot.appendChild(o.el); if (o.nav) requestAnimationFrame(() => o.nav.first()); }
  closeOverlay() { if (this.overlay) { this.overlay.el.remove(); if (this.overlay.onClose) this.overlay.onClose(); this.overlay = null; } }

  pause(on) {
    const m = this.match;
    if (!m) return;
    if (on && !this.overlay) {
      m.paused = !m.net;
      this.openOverlay(this.screenFactories.pause(this, { match: m }));
      this.sfx('ui_back');
    } else if (!on) {
      m.paused = false;
      this.closeOverlay();
    }
    this.updateTouchVisibility();
  }

  // ---------------------------------------------------------------- local matches
  /**
   * cfg: World config. opts: { locals: [{slot, device}], cpu: {slot: level}, onEnd(results, world), training: {dummyMode, level},
   *        label, onQuit() }
   */
  startLocalMatch(cfg, opts) {
    this.endMatch();
    const world = new World({ ...cfg, seed: cfg.seed || ((Math.random() * 1e9) | 0) });
    const cpus = new Map();
    for (const f of world.fighters) {
      if (opts.locals.some((l) => l.slot === f.id)) continue;
      const lvl = (opts.cpu && opts.cpu[f.id]) || 5;
      f.cpu = lvl;
      const mode = opts.training ? opts.training.dummyMode || 'stand' : 'cpu';
      cpus.set(f.id, new CpuController(world, f.id, lvl, mode, world.cfg.seed));
    }
    const m = {
      net: false, world, view: world, cfg, opts, cpus, acc: 0, paused: false, timeScale: 1, slowT: 0, cues: new Map(), ended: false,
      training: !!opts.training,
    };
    this.match = m;
    this.renderer.startMatch(world);
    this.renderer.captureStep(world); this.renderer.captureStep(world);
    this.hud = new Hud(this, m);
    this.uiRoot.appendChild(this.hud.el);
    if (this.screen) { this.screen.exit && this.screen.exit(); this.screen.el.remove(); this.screen = null; }
    this.simAudio.enterArena(world.arena.id);
    this.updateTouchVisibility();
    try { this.audio.prepare && this.audio.prepare(['hit_light', 'hit_med', 'hit_heavy', 'hit_deadly', 'ko_blast', 'whoosh_light', 'whoosh_med', 'whoosh_heavy', 'jump', 'land']); } catch { /* */ }
    return m;
  }

  endMatch() {
    if (!this.match) return;
    if (this.hud) { this.hud.destroy(); this.hud = null; }
    this.renderer.endMatch();
    if (this.match.net && this.match.netCleanup) this.match.netCleanup();
    this.match = null;
    try { this.audio.setAmbience(null); } catch { /* */ }
    this.updateTouchVisibility();
  }

  localInputs(m) {
    const basis = this.renderer.inputBasis();
    const w = m.world;
    return w.fighters.map((f) => {
      const local = m.opts.locals.find((l) => l.slot === f.id);
      if (local) return this.input.frame(local.device, basis);
      const c = m.cpus.get(f.id);
      return c ? c.think() : NEUTRAL;
    });
  }

  updateMatch(dt) {
    const m = this.match;
    const r = this.renderer;
    if (m.net) return this.updateNetMatch(dt);
    const w = m.world;
    if (!m.paused) {
      if (m.slowT > 0) { m.slowT -= dt; m.timeScale = m.slowT > 0 ? 0.3 : 1; }
      m.acc += dt * m.timeScale;
      let steps = 0;
      const events = [];
      while (m.acc >= DT && steps < 4) {
        m.acc -= DT;
        const inputs = this.localInputs(m);
        w.step(inputs);
        r.captureStep(w);
        events.push(...w.events);
        this.moveCues(w);
        steps++;
      }
      if (m.acc > DT * 4) m.acc = 0;
      if (events.length) this.onEvents(events, w);
      if (w.phase === 'ended' && !m.ended) { m.ended = true; setTimeout(() => this.finishLocal(m), 300); }
    }
    const orbit = m.opts.locals.length ? this.input.orbit(m.opts.locals[0].device) : 0;
    r.renderMatch(dt, m.paused ? 1 : Math.min(1, m.acc / DT), w, { orbit: m.paused ? 0 : orbit });
    if (this.hud) this.hud.update(dt, w);
  }

  moveCues(w) {
    const m = this.match;
    for (const f of w.fighters) {
      const prev = m.cues.get(f.id) || { move: null, mf: -1 };
      if (f.state === 'move' && f.mdef && f.mdef.sfx) {
        const from = prev.move === f.move ? prev.mf : -1;
        for (const [fr, name] of f.mdef.sfx) if (fr > from && fr <= f.mf) this.simAudio.event({ type: 'sfx', name, x: f.pos.x });
        m.cues.set(f.id, { move: f.move, mf: f.mf });
      } else if (prev.move) m.cues.set(f.id, { move: null, mf: -1 });
    }
  }

  onEvents(events, view) {
    const r = this.renderer;
    r.handleEvents(events, view);
    const camX = r.camera.position.x;
    this.simAudio.handle(events, { cameraX: camX, halfWidth: 14, posOf: (id) => view.fighters[id] && view.fighters[id].pos });
    if (this.hud) this.hud.onEvents(events, view);
    for (const e of events) {
      if (e.type === 'gameSet' && this.match && !this.match.net) this.match.slowT = 1.4;
      if (e.type === 'ko') {
        const f = view.fighters[e.id];
        if (f && f.cpu === 0 && this.isTouch && navigator.vibrate) navigator.vibrate(120);
      }
    }
  }

  finishLocal(m) {
    if (this.match !== m) return;
    const res = m.world.results;
    const onEnd = m.opts.onEnd;
    const world = m.world;
    this.endMatch();
    if (onEnd) onEnd(res, world);
  }

  restartLocal() {
    const m = this.match;
    if (!m || m.net) return;
    const { cfg, opts } = m;
    this.startLocalMatch(cfg, opts);
  }

  quitMatch() {
    const m = this.match;
    if (!m) return;
    const quit = m.opts && m.opts.onQuit;
    this.endMatch();
    if (quit) quit(); else this.go('main');
  }

  // ---------------------------------------------------------------- online matches
  startNetMatch(net, startMsg, { onEnd, onQuit } = {}) {
    this.endMatch();
    const view = new NetView(startMsg.cfg, startMsg.you);
    const m = { net: true, client: net, view, world: view, cfg: startMsg.cfg, you: startMsg.you, opts: { locals: [{ slot: startMsg.you, device: 'any' }], onQuit }, paused: false, inputAcc: 0, ended: false };
    this.match = m;
    net.on('snap', (s) => view.push(s));
    net.on('end', (res) => { if (this.match === m && !m.ended) { m.ended = true; m.results = res; setTimeout(() => { if (this.match === m) { this.endMatch(); onEnd && onEnd(res, view); } }, 2200); } });
    net.on('close', () => { if (this.match === m) { this.toast('Disconnected from server'); this.endMatch(); onQuit ? onQuit() : this.go('main'); } });
    m.netCleanup = () => { net.on('snap', null); net.on('end', null); };
    this.renderer.startMatch(view);
    this.hud = new Hud(this, m);
    this.uiRoot.appendChild(this.hud.el);
    if (this.screen) { this.screen.exit && this.screen.exit(); this.screen.el.remove(); this.screen = null; }
    this.simAudio.enterArena(view.arena.id);
    this.updateTouchVisibility();
  }

  updateNetMatch(dt) {
    const m = this.match;
    const r = this.renderer;
    // upload input at 60 Hz
    m.inputAcc += dt;
    let sends = 0;
    while (m.inputAcc >= DT && sends < 4) {
      m.inputAcc -= DT;
      const inp = m.paused || this.overlay ? NEUTRAL : this.input.frame('any', r.inputBasis());
      m.client.input(inp);
      sends++;
    }
    if (m.inputAcc > 0.2) m.inputAcc = 0;
    const due = m.view.update(dt);
    if (due.length) this.onEvents(due, m.view);
    r.renderMatch(dt, 1, m.view, { net: true, orbit: this.overlay ? 0 : this.input.orbit('any') });
    if (this.hud) this.hud.update(dt, m.view);
  }

  get isTouch() { return !!this._isTouch; }
  set isTouch(v) { this._isTouch = v; }

  charName(id) { return CHARACTERS[id] ? CHARACTERS[id].name : id; }
}
