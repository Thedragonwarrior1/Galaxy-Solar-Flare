// Online client: lobby messaging, input upload (60 Hz), snapshot buffering + interpolation into a renderable view.
import { decodeFighter, decodeProjectile, decodeZone, decodeHazard } from '../../shared/protocol.js';
import { CHARACTERS } from '../../shared/characters/index.js';
import { ARENAS, platformAt } from '../../shared/sim/arenas.js';

const INTERP_FRAMES = 5; // render ~83 ms behind the newest snapshot for smooth interpolation

export class NetClient {
  constructor() {
    this.ws = null;
    this.id = null;
    this.room = null;
    this.handlers = {};
    this.seq = 0;
    this.rtt = 0;
    this.connected = false;
  }

  on(type, fn) { this.handlers[type] = fn; }
  emit(type, data) { if (this.handlers[type]) this.handlers[type](data); }

  static defaultUrl() {
    if (typeof location === 'undefined' || !/^https?:/.test(location.protocol)) return 'ws://localhost:8080/ws';
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  connect(url, name) {
    return new Promise((ok, fail) => {
      let settled = false;
      try { this.ws = new WebSocket(url); } catch (e) { fail(e); return; }
      const to = setTimeout(() => { if (!settled) { settled = true; fail(new Error('Could not reach the GRAND BRAWL server')); try { this.ws.close(); } catch {} } }, 5000);
      this.ws.onopen = () => { this.connected = true; this.send({ t: 'hello', name }); };
      this.ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); fail(new Error('Could not reach the GRAND BRAWL server')); } };
      this.ws.onclose = () => { this.connected = false; this.emit('close'); };
      this.ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') { this.id = m.id; if (!settled) { settled = true; clearTimeout(to); ok(); } this.pingLoop(); }
        else if (m.t === 'room') { this.room = m.room; this.emit('room', m.room); }
        else if (m.t === 'error') this.emit('error', m.msg);
        else if (m.t === 'start') this.emit('start', m);
        else if (m.t === 'snap') this.emit('snap', m);
        else if (m.t === 'end') this.emit('end', m.results);
        else if (m.t === 'pong') this.rtt = Date.now() - m.c;
        else if (m.t === 'left') { this.room = null; this.emit('room', null); }
      };
    });
  }

  pingLoop() {
    clearInterval(this._ping);
    this._ping = setInterval(() => { if (this.connected) this.send({ t: 'ping', c: Date.now() }); }, 2000);
  }

  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  create() { this.send({ t: 'create' }); }
  join(code) { this.send({ t: 'join', code: code.toUpperCase() }); }
  leave() { this.send({ t: 'leave' }); }
  pick(char) { this.send({ t: 'char', char }); }
  ready(v) { this.send({ t: 'ready', v }); }
  team(t) { this.send({ t: 'team', team: t }); }
  settings(s) { this.send({ t: 'settings', ...s }); }
  start() { this.send({ t: 'start' }); }
  rematch() { this.send({ t: 'rematch' }); }
  input(inp) { this.send({ t: 'in', s: ++this.seq, m: [Math.round(inp.mx * 1000) / 1000, Math.round(inp.mz * 1000) / 1000], b: inp.b }); }
  close() { clearInterval(this._ping); if (this.ws) this.ws.close(); }
}

/** A renderable world view reconstructed from server snapshots (same field names as the local World). */
export class NetView {
  constructor(cfg, you) {
    this.cfg = cfg;
    this.you = you;
    this.arena = ARENAS[cfg.arena];
    this.mode = cfg.mode;
    this.teams = cfg.mode === '2v2';
    this.training = false;
    this.frame = 0;
    this.phase = 'countdown';
    this.countdown = 180;
    this.timer = 0;
    this.timed = cfg.time > 0;
    this.cine = null;
    this.snaps = [];
    this.renderFrame = null;
    this.pendingEvents = [];
    this.fighters = cfg.players.map((p, i) => {
      const def = CHARACTERS[p.char];
      return {
        id: i, slot: i, name: p.name, cpu: p.cpu || 0, team: this.teams ? p.team : i, charId: def.id, def, st: def.stats,
        pos: { x: 0, y: 0, z: 0 }, facing: 0, vel: { x: 0, y: 0, z: 0 }, kb: { x: 0, y: 0, z: 0 }, state: 'idle', sf: 0, move: null, mdef: null,
        mf: 0, charge: 0, grounded: true, pct: 0, stocks: cfg.stocks, ult: 0, cd: {}, recUsed: false, scale: 1, transform: 0, shieldHP: 50,
        inv: false, flash: 0, tumble: false, eliminated: false, hitlag: 0, lag: 0, rollDir: null, jumpsLeft: 1, place: 0, height: def.stats.height,
        get alive() { return this.state !== 'dead' && !this.eliminated; },
      };
    });
    this.projectiles = []; this.zones = []; this.hazards = [];
    this.placements = this.arena.platforms.map((p) => platformAt(p, 0));
  }

  push(snap) {
    this.snaps.push(snap);
    if (this.snaps.length > 30) this.snaps.shift();
    for (const e of snap.E || []) this.pendingEvents.push(e);
    if (this.renderFrame === null) this.renderFrame = snap.f - INTERP_FRAMES;
  }

  /** Advance render time and rebuild interpolated state. Returns events that became due. */
  update(dt) {
    if (!this.snaps.length) return [];
    const newest = this.snaps[this.snaps.length - 1].f;
    this.renderFrame += dt * 60;
    // keep the buffer delay stable (catch up / slow down gently)
    const target = newest - INTERP_FRAMES;
    const err = target - this.renderFrame;
    if (Math.abs(err) > 20) this.renderFrame = target;
    else this.renderFrame += err * 0.08;
    const rf = this.renderFrame;
    let a = this.snaps[0], b = this.snaps[0];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].f <= rf && this.snaps[i + 1].f >= rf) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
      if (this.snaps[i + 1].f < rf) { a = b = this.snaps[i + 1]; }
    }
    const t = b.f > a.f ? Math.min(1, Math.max(0, (rf - a.f) / (b.f - a.f))) : 1;
    this.apply(a, b, t);
    const due = [];
    const rest = [];
    for (const e of this.pendingEvents) (e.f <= rf + 1 ? due : rest).push(e);
    this.pendingEvents = rest;
    return due;
  }

  apply(a, b, t) {
    this.frame = Math.round(a.f + (b.f - a.f) * t);
    this.phase = b.ph; this.countdown = b.cd; this.timer = b.tm; this.elapsed = b.el;
    this.cine = b.cine ? { id: b.cine[0], left: b.cine[1] } : null;
    this.placements = this.arena.platforms.map((p) => platformAt(p, this.frame));
    for (let i = 0; i < b.F.length; i++) {
      const A = decodeFighter(a.F[i] || b.F[i]), B = decodeFighter(b.F[i]);
      const f = this.fighters[B.id];
      const L = (x, y) => x + (y - x) * t;
      const jump = Math.hypot(A.pos.x - B.pos.x, A.pos.y - B.pos.y, A.pos.z - B.pos.z) > 3;
      f.pos.x = jump ? B.pos.x : L(A.pos.x, B.pos.x); f.pos.y = jump ? B.pos.y : L(A.pos.y, B.pos.y); f.pos.z = jump ? B.pos.z : L(A.pos.z, B.pos.z);
      let df = B.facing - A.facing; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
      f.facing = A.facing + df * t;
      Object.assign(f.vel, B.vel); Object.assign(f.kb, B.kb);
      f.state = B.state; f.sf = B.sf; f.move = B.move; f.grounded = B.grounded;
      f.mdef = B.move ? f.def.moves[B.move] || null : null;
      f.mf = A.move === B.move && A.state === B.state ? L(A.mf, B.mf) : B.mf;
      for (const k of ['charge', 'pct', 'stocks', 'ult', 'cd', 'recUsed', 'scale', 'transform', 'shieldHP', 'inv', 'flash', 'tumble', 'eliminated', 'hitlag', 'lag', 'rollDir', 'jumpsLeft', 'place']) f[k] = B[k];
    }
    this.projectiles = b.P.map(decodeProjectile);
    if (t < 1) {
      const prev = new Map(a.P.map((p) => [p[0], p]));
      for (const p of this.projectiles) { const q = prev.get(p.pid); if (q) { p.x = q[3] + (p.x - q[3]) * t; p.y = q[4] + (p.y - q[4]) * t; p.z = q[5] + (p.z - q[5]) * t; } }
    }
    this.zones = b.Z.map(decodeZone);
    this.hazards = b.H.map(decodeHazard);
  }
}
