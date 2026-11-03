// In-match HUD: player cards (portrait, damage %, stocks, ultimate meter, cooldowns), timer, countdown,
// KO notifications, ultimate cinematics banner, player indicators, combo counter and the training panel.
import { h, hex, fmtTime } from './dom.js';
import { PLAYER_COLORS, TEAM_COLORS, CPU_COLOR } from '../render/renderer.js';
import { CHARACTERS } from '../../shared/characters/index.js';
import { LOOKS } from '../render/characterModels.js';
import { RULES } from '../../shared/sim/constants.js';
import { computeKnockback } from '../../shared/sim/knockback.js';

function pctColor(p) {
  // white -> yellow -> orange -> red -> dark red
  const stops = [[0, [255, 255, 255]], [40, [255, 236, 120]], [80, [255, 170, 60]], [120, [255, 70, 60]], [180, [190, 20, 30]]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (p <= b) { const t = Math.max(0, (p - a) / (b - a)); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * t)).join(',')})`; }
  }
  return 'rgb(150,10,25)';
}

export class Hud {
  constructor(app, match) {
    this.app = app;
    this.match = match;
    const view = match.view;
    this.el = h('div.hud.screen.passthru');
    if (app.settings.touch === 'on' || (app.settings.touch === 'auto' && app.isTouch)) this.el.classList.add('touch');
    this.top = h('div.hud-top', h('div.hud-mode', modeLabel(view, match)), this.timerEl = h('div.hud-timer', '0:00'));
    this.bottom = h('div.hud-bottom');
    this.tags = h('div');
    this.fx = h('div');
    this.el.append(this.tags, this.top, this.bottom, this.fx);
    this.cards = view.fighters.map((f) => this.makeCard(f, view));
    this.lastPct = view.fighters.map(() => 0);
    this.comboEl = null;
    this.comboT = 0;
    if (match.training) this.buildTraining(view);
    if (match.net) this.netEl = this.el.appendChild(h('div.netstat', 'ONLINE'));
    this.countdownShown = -1;
    this.goShown = false;
  }

  colorOf(f, view) { return view.teams ? TEAM_COLORS[f.team % 2] : f.cpu ? CPU_COLOR : PLAYER_COLORS[f.slot % 4]; }

  makeCard(f, view) {
    const c = hex(this.colorOf(f, view));
    const def = CHARACTERS[f.charId];
    const tagName = f.cpu ? `CPU ${f.cpu}` : (this.match.net ? f.name : `P${f.slot + 1}`);
    const el = h('div.pc', { vars: { pc: c } },
      h('div.bg'),
      h('img.por', { src: this.app.portraits[f.charId], alt: def.name }),
      h('div.nm', `${tagName} · ${def.name}`),
      h('div.stocks'),
      h('div.cds', ...['Q', 'E', 'R'].map((k) => h('div.cd', { vars: { p: 0 } }, k))),
      h('div.pct', '0', h('small', '%')),
      h('div.ult', h('i')),
      h('div.ultlbl', 'ULT [F]'),
      view.teams ? h('div.team', f.team === 0 ? 'RED TEAM' : 'BLUE TEAM') : null,
    );
    this.bottom.appendChild(el);
    const tag = h('div.tag-ind', { vars: { pc: c } }, f.cpu ? 'CPU' : (this.match.net ? (f.id === this.match.you ? 'YOU' : f.name.slice(0, 8)) : `P${f.slot + 1}`));
    this.tags.appendChild(tag);
    return { el, tag, pct: el.querySelector('.pct'), stocks: el.querySelector('.stocks'), ult: el.querySelector('.ult i'), cds: [...el.querySelectorAll('.cd')], lastStocks: -1, lastPctShown: -1, lastUlt: -1 };
  }

  update(dt, view) {
    // timer
    const t = view.timed ? view.timer : view.elapsed || 0;
    this.timerEl.textContent = view.training ? 'TRAINING' : fmtTime(view.timed ? (view.phase === 'countdown' ? view.cfg.time * 60 : t) : (view.elapsed || 0));
    this.timerEl.classList.toggle('low', !!view.timed && view.timer < 600 && view.phase === 'play');
    // countdown banner
    if (view.phase === 'countdown') {
      const n = Math.ceil(view.countdown / 60);
      if (n !== this.countdownShown && n > 0) { this.countdownShown = n; this.banner(String(n), 900); }
    } else if (view.phase === 'play' && !this.goShown && view.frame < 400) { this.goShown = true; this.banner('BRAWL!', 900, true); }
    // cards
    view.fighters.forEach((f, i) => {
      const c = this.cards[i];
      const pct = Math.floor(f.pct);
      if (pct !== c.lastPctShown) {
        c.pct.firstChild.nodeValue = String(pct);
        c.pct.style.setProperty('--pctc', pctColor(pct));
        if (pct > c.lastPctShown && c.lastPctShown >= 0) { c.pct.classList.remove('pop'); void c.pct.offsetWidth; c.pct.classList.add('pop'); }
        c.lastPctShown = pct;
        c.el.classList.toggle('danger', pct >= 100);
      }
      if (f.stocks !== c.lastStocks) {
        c.lastStocks = f.stocks;
        c.stocks.innerHTML = '';
        if (view.training) c.stocks.appendChild(h('span', '∞'));
        else if (view.cfg && view.cfg.stocks > 6) c.stocks.appendChild(h('span', `× ${Math.max(0, f.stocks)}`));
        else for (let k = 0; k < (view.cfg ? view.cfg.stocks : 3); k++) c.stocks.appendChild(h('i', { class: k < f.stocks ? '' : 'lost' }));
      }
      const u = Math.floor(f.ult);
      if (u !== c.lastUlt) { c.lastUlt = u; c.ult.style.width = Math.min(100, u) + '%'; c.el.classList.toggle('ultready', u >= RULES.ULT_MAX); }
      const def = CHARACTERS[f.charId];
      ['sp1', 'sp2', 'sp3'].forEach((k, j) => {
        const cdMax = def.moves[k].cooldown || 1;
        const rem = (f.cd && f.cd[k]) || 0;
        const cd = c.cds[j];
        const used = k === 'sp3' && f.recUsed && !f.grounded;
        cd.style.setProperty('--p', used ? 100 : Math.round((rem / cdMax) * 100));
        cd.classList.toggle('used', used);
      });
      c.el.classList.toggle('out', !!f.eliminated);
      // floating tag
      const alive = f.state !== 'dead' && !f.eliminated;
      c.tag.style.display = alive ? '' : 'none';
      if (alive) {
        const p = this.app.renderer.project({ x: f.pos.x, y: f.pos.y + (f.def ? f.def.stats.height : 1.8) * (f.scale || 1) + 0.45, z: f.pos.z });
        if (p) {
          const W = this.el.clientWidth, H = this.el.clientHeight;
          const x = Math.max(24, Math.min(W - 24, p.x)), y = Math.max(30, Math.min(H - 110, p.y));
          c.tag.style.left = x + 'px'; c.tag.style.top = y + 'px';
          c.tag.classList.toggle('edge', x !== p.x || y !== p.y);
        }
      }
    });
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0 && this.comboEl) { this.comboEl.remove(); this.comboEl = null; } }
    if (this.training) this.updateTraining(view);
    if (this.netEl && this.match.client) this.netEl.textContent = `ONLINE · ${this.match.client.rtt | 0} ms`;
  }

  banner(text, ms = 1200, gold = false) {
    const b = h('div.banner', { class: gold ? 'gold' : '' }, text);
    this.fx.appendChild(b);
    setTimeout(() => b.remove(), ms);
  }

  onEvents(events, view) {
    for (const e of events) {
      if (e.type === 'ko') {
        const f = view.fighters[e.id];
        const by = e.by >= 0 ? view.fighters[e.by] : null;
        const c = hex(this.colorOf(f, view));
        const pop = h('div.ko-pop', { vars: { pc: c } },
          h('img', { src: this.app.portraits[f.charId] }),
          h('div', h('div.k', 'K.O.!'), h('div.d', by ? `${CHARACTERS[by.charId].name} launched ${CHARACTERS[f.charId].name}!` : `${CHARACTERS[f.charId].name} fell!`)));
        this.fx.appendChild(pop);
        setTimeout(() => pop.remove(), 2600);
        const fl = h('div.flash'); this.fx.appendChild(fl); setTimeout(() => fl.remove(), 400);
      } else if (e.type === 'ultStart') {
        const f = view.fighters[e.id];
        const def = CHARACTERS[f.charId];
        const m = def.moves[e.move] || def.moves.ult;
        const col = hex(LOOKS[f.charId].trail);
        const lines = h('div.speedlines');
        const b = h('div.ult-banner', { vars: { uc: col } }, h('img', { src: this.app.portraits[f.charId] }), h('div', h('div.uw', `${def.name} — Ultimate`), h('div.un', m.name)));
        this.fx.append(lines, b);
        setTimeout(() => { b.remove(); lines.remove(); }, 1150);
      } else if (e.type === 'gameSet') {
        this.banner(e.reason === 'time' ? 'TIME!' : 'GAME!', 2400, true);
      } else if (e.type === 'hit' && e.a >= 0) {
        const t = view.fighters[e.t];
        const attacker = view.fighters[e.a];
        if (e.combo >= 3 && attacker && !attacker.cpu) {
          if (this.comboEl) this.comboEl.remove();
          this.comboEl = h('div.combo', `${e.combo} HITS`, h('small', `${Math.round(t.pct)}%`));
          this.fx.appendChild(this.comboEl);
          this.comboT = 1.2;
        }
        if (this.training && attacker && attacker.id === this.match.opts.locals[0].slot) this.lastHit = { e, pct: t.pct };
      }
    }
  }

  // ---------------------------------------------------------------- training mode panel
  buildTraining(view) {
    const m = this.match;
    const app = this.app;
    const dummy = view.fighters.find((f) => !m.opts.locals.some((l) => l.slot === f.id));
    this.training = { dummy };
    const sel = (opts, cur, on) => { const s = h('select', null, ...opts.map(([v, l]) => h('option', { value: v, selected: v === cur }, l))); s.addEventListener('change', () => on(s.value)); return s; };
    const pctIn = h('input', { type: 'range', min: 0, max: 300, step: 5, value: 0 });
    const pctLbl = h('span', '0%');
    pctIn.addEventListener('input', () => { view.setTrainingPct(dummy.id, +pctIn.value); pctLbl.textContent = pctIn.value + '%'; });
    const setDummy = (mode, lvl) => {
      const c = m.cpus.get(dummy.id);
      if (!c) return;
      c.mode = mode; if (lvl) c.setLevel(lvl);
    };
    this.fdata = h('div.fdata', 'Use an attack to see its frame data.');
    const hbBtn = h('button.ghost', { onclick: () => { this.showHit = !this.showHit; hbBtn.classList.toggle('on', this.showHit); app.renderer.showHitboxes = this.showHit; } }, 'Show hitboxes');
    const ultBtn = h('button.ghost', { onclick: () => { this.infUlt = !this.infUlt; ultBtn.classList.toggle('on', this.infUlt); } }, 'Infinite ultimate');
    const panel = h('div.train.panel.interactive',
      h('h4', { onclick: () => panel.classList.toggle('collapsed') }, 'Training'),
      h('div.r', h('span', 'Dummy'), sel([['stand', 'Stand'], ['shield', 'Shield'], ['jump', 'Jump'], ['move', 'Walk'], ['cpu', 'Fight back (CPU)']], 'stand', (v) => setDummy(v))),
      h('div.r', h('span', 'CPU level'), sel([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), String(n)]), '5', (v) => setDummy(m.cpus.get(dummy.id).mode, +v))),
      h('div.r', h('span', 'Dummy %'), pctIn, pctLbl),
      h('div.row', h('button.ghost', { onclick: () => { view.resetPositions(); app.renderer.captureStep(view); app.renderer.captureStep(view); } }, 'Reset (T)'), hbBtn, ultBtn),
      this.fdata,
      h('div', { style: { marginTop: '8px', color: '#a9b2d6', fontSize: '12px' } }, 'Practice recovery: walk off the stage edge and use R. Esc = pause.'),
    );
    this.el.appendChild(panel);
    if (this.el.classList.contains('touch')) panel.classList.add('collapsed');
    this.trainPanel = panel;
    this._tkey = (e) => { if (e.code === 'KeyT' && this.match === app.match) { view.resetPositions(); app.renderer.captureStep(view); app.renderer.captureStep(view); } };
    window.addEventListener('keydown', this._tkey);
  }

  updateTraining(view) {
    const m = this.match;
    const me = view.fighters[m.opts.locals[0].slot];
    const d = this.training.dummy;
    if (this.infUlt) me.ult = RULES.ULT_MAX;
    const info = me.lastMoveInfo;
    const key = info ? info.key + ':' + (this.lastHit ? this.lastHit.e.f : 0) + ':' + Math.round(d.pct) : 'none';
    if (key !== this.lastFdKey && info) {
      this.lastFdKey = key;
      const mv = me.def.moves[info.key];
      const hb = mv.hb.find((x) => !x.grab) || null;
      const kb = hb ? Math.round(computeKnockback(d.pct + hb.dmg, hb.dmg, d.st.weight, hb.bkb || 0, hb.kbg ?? 100, hb.setKb)) : 0;
      const lh = this.lastHit;
      this.fdata.innerHTML = '';
      this.fdata.append(...[
        h('div', h('b', info.name), ` (${info.key})`),
        h('div', `Startup: ${info.startup ?? '-'}f  Active: ${info.active}`),
        h('div', `Total: ${info.total}f  Damage: ${info.dmg}%`),
        hb ? h('div', `Angle: ${hb.ang === 361 ? 'auto' : hb.ang + '°'}  KB@dummy%: ${kb}`) : null,
        mv.cooldown ? h('div', `Cooldown: ${(mv.cooldown / 60).toFixed(1)}s`) : null,
        lh ? h('div', `Last hit: ${lh.e.dmg.toFixed(1)}%  launch ${Math.round(lh.e.kb)}  combo ${lh.e.combo}`) : null,
        h('div', `Dummy: ${Math.round(d.pct)}%  state ${d.state}`),
      ].filter(Boolean));
    }
  }

  destroy() {
    this.el.remove();
    if (this._tkey) window.removeEventListener('keydown', this._tkey);
    this.app.renderer.showHitboxes = false;
  }
}

function modeLabel(view, match) {
  if (match.training) return 'Training';
  if (match.net) return 'Online · ' + (view.mode === '2v2' ? '2 vs 2' : view.mode === '1v1' ? '1 vs 1' : 'Free for all');
  if (match.opts && match.opts.label) return match.opts.label;
  return view.mode === '2v2' ? '2 vs 2' : view.mode === '1v1' ? '1 vs 1' : 'Free for all';
}
