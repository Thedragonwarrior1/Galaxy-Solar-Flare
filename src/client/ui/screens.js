// Menu screens: main menu, mode select, match setup, arena select, settings, credits, pause overlay.
import { h, FocusNav, hex } from './dom.js';
import { ROSTER, CHARACTER_IDS } from '../../shared/characters/index.js';
import { ARENAS, ARENA_IDS } from '../../shared/sim/arenas.js';
import { PLAYER_COLORS, TEAM_COLORS, CPU_COLOR } from '../render/renderer.js';
import { ACTIONS, ACTION_LABELS, DEFAULT_KEYS } from '../input/input.js';
import { DEFAULT_SETTINGS } from '../settings.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const keyLabel = (c) => (c || '—').replace(/^Key/, '').replace(/^Digit/, '').replace('Mouse0', 'LMB').replace('Mouse2', 'RMB').replace('Mouse1', 'MMB').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'L-Ctrl').replace('Arrow', '↑→↓←'.length ? '' : '').replace('Space', 'Space');

export const ARENA_COLORS = {
  pirate_haven: ['#ff9f1c', '#1f8a9e'], marine_fortress: ['#4a6fa5', '#1b2a4a'], sky_kingdom: ['#7ad7f0', '#b388eb'], volcanic_island: ['#ff4d00', '#3a0c0c'],
};

function topBar(app, title, crumb, back) {
  return h('div.top-bar', h('button.back-btn.focusable', { onclick: back }, '‹ Back'), h('h1', title), crumb ? h('span.crumb', crumb) : null);
}

// ------------------------------------------------------------------ main menu
export function mainMenu(app) {
  const el = h('div.screen.menu-main');
  const item = (icon, label, hint, fn) => h('button.menu-btn.focusable', { onclick: () => { app.sfx('ui_select'); fn(); } }, h('span.ico', icon), h('span', label), hint ? h('small', hint) : null);
  const canExit = !!(window.opener || window.matchMedia('(display-mode: standalone)').matches);
  el.append(
    h('div.logo', h('span.l1', 'GRAND'), h('span.l2', 'BRAWL'), h('span.sub', 'A PIRATE PLATFORM FIGHTER')),
    h('div.menu-list',
      item('⚔', 'Play', 'Free for all · 1v1 · 2v2', () => app.go('modes')),
      item('🏆', 'Tournament', '8-fighter knockout', () => app.go('setup', { mode: 'tournament' })),
      item('🌐', 'Online', 'Create or join a room', () => app.go('online')),
      item('🎯', 'Training', 'Practice combos', () => app.go('select', { mode: 'training', slots: [{ type: 'human', device: 'any' }, { type: 'cpu', level: 5 }] })),
      item('⚙', 'Settings', 'Audio · video · controls', () => app.go('settings', { back: 'main' })),
      item('✦', 'Credits', null, () => app.go('credits')),
      canExit ? item('⏻', 'Exit', null, () => window.close()) : null,
    ),
    h('div.menu-foot',
      h('span', h('span.kbd', 'WASD'), ' move  ', h('span.kbd', 'Space'), ' jump  ', h('span.kbd', 'LMB'), '/', h('span.kbd', 'RMB'), ' attack  ', h('span.kbd', 'Q'), h('span.kbd', 'E'), h('span.kbd', 'R'), ' specials  ', h('span.kbd', 'F'), ' ultimate'),
      h('span', 'Gamepad & touch supported · all 8 fighters unlocked'),
    ),
  );
  const nav = new FocusNav(el);
  return {
    el, nav,
    enter() {
      app.music('menu');
      const chars = [...CHARACTER_IDS].sort(() => Math.random() - 0.5).slice(0, 4);
      if (app.renderer.mode !== 'showcase' || app.renderer.showcase.layout !== 'menu') app.renderer.startShowcase(pick(ARENA_IDS), chars.map((c) => ({ char: c })), 'menu');
    },
  };
}

// ------------------------------------------------------------------ mode select
export function modeSelect(app) {
  const el = h('div.screen');
  const card = (big, title, desc, c1, c2, fn) => h('button.mode-card.focusable', { vars: { c1, c2 }, onclick: () => { app.sfx('ui_select'); fn(); } }, h('div.big', big), h('h3', title), h('p', desc));
  el.append(
    topBar(app, 'Choose a Mode', null, () => { app.sfx('ui_back'); app.go('main'); }),
    h('div.mode-grid',
      card('4', 'Free for All', 'Up to four fighters. Everyone for themselves — last pirate standing wins.', '#e63946', '#7a1020', () => app.go('setup', { mode: 'ffa' })),
      card('1v1', 'Duel', 'A competitive one-on-one. Hazards off by default.', '#3fa7ff', '#123a7a', () => app.go('setup', { mode: '1v1' })),
      card('2v2', 'Teams', 'Two crews of two. Friendly fire optional.', '#4fe08a', '#0f5132', () => app.go('setup', { mode: '2v2' })),
      card('🏆', 'Tournament', 'Fight through an 8-pirate knockout bracket to become champion.', '#ffc93c', '#a35c00', () => app.go('setup', { mode: 'tournament' })),
      card('🎯', 'Training', 'Practice combos, test abilities, adjust dummy damage, view frame data.', '#b388eb', '#3c1a6e', () => app.go('select', { mode: 'training', slots: [{ type: 'human', device: 'any' }, { type: 'cpu', level: 5 }] })),
    ),
  );
  const nav = new FocusNav(el, { onBack: () => app.go('main') });
  return { el, nav, enter() { app.music('menu'); } };
}

// ------------------------------------------------------------------ match setup (players + rules)
export function matchSetup(app, params) {
  const mode = params.mode;
  const prev = app.lastSetup && app.lastSetup.mode === mode ? app.lastSetup : null;
  const n = mode === '1v1' || mode === 'tournament' ? 2 : 4;
  const st = prev ? JSON.parse(JSON.stringify(prev)) : {
    mode,
    slots: Array.from({ length: n }, (_, i) => ({ type: i === 0 ? 'human' : mode === 'tournament' ? 'cpu' : (i < (mode === 'ffa' ? 4 : n) ? 'cpu' : 'off'), level: 5, team: i % 2 })),
    rules: { stocks: 3, time: mode === '1v1' ? 420 : 300, hazards: mode === 'ffa' || mode === '2v2' ? false : false, friendlyFire: false, cpuLevel: 5 },
  };
  const el = h('div.screen');
  const body = h('div.setup-wrap');
  const title = { ffa: 'Free for All', '1v1': 'Duel', '2v2': 'Teams', tournament: 'Tournament' }[mode];
  el.append(topBar(app, title, 'Players & rules', () => { app.sfx('ui_back'); app.go(mode === 'tournament' ? 'main' : 'modes'); }), body);
  const seg = (opts, cur, on) => h('div.seg', ...opts.map(([v, l]) => h('button.focusable', { class: v === cur ? 'on' : '', onclick: () => { app.sfx('ui_move'); on(v); render(); } }, l)));

  function devices() {
    const humans = st.slots.filter((s) => s.type === 'human').length;
    let pad = 0;
    return st.slots.map((s, i) => {
      if (s.type !== 'human') return null;
      if (humans === 1) return 'any';
      if (i === 0) return 'kbm';
      return 'pad' + pad++;
    });
  }

  function render() {
    body.innerHTML = '';
    const devs = devices();
    const players = h('div.panel.pad', h('div.panel-h', mode === 'tournament' ? 'Your fighter' : 'Fighters'));
    st.slots.forEach((s, i) => {
      if (mode === 'tournament' && i > 0) return;
      const col = mode === '2v2' ? TEAM_COLORS[s.team % 2] : s.type === 'cpu' ? CPU_COLOR : PLAYER_COLORS[i];
      const typeOpts = i === 0 ? [['human', 'Player'], ['cpu', 'CPU']] : [['human', 'Player'], ['cpu', 'CPU'], ['off', 'Off']];
      const dev = devs[i];
      players.append(h('div.slot-row', { vars: { pc: hex(col) } },
        h('div.tag', `P${i + 1}`),
        h('div',
          mode === 'tournament' ? h('b', 'You (keyboard / gamepad / touch)') : seg(typeOpts.filter(([v]) => !(mode === '1v1' && v === 'off')), s.type, (v) => { s.type = v; }),
          s.type === 'cpu' ? h('div', { style: { marginTop: '6px' } }, h('span.device', 'Level '), seg([1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => [k, String(k)]), s.level, (v) => { s.level = v; })) : null,
          s.type === 'human' && mode !== 'tournament' ? h('div.device', dev === 'any' ? 'Keyboard + mouse / gamepad / touch' : dev === 'kbm' ? 'Keyboard + mouse' : `Gamepad ${+dev.slice(3) + 1}${app.input.pads()[+dev.slice(3)] ? ' ✓ connected' : ' (connect & press a button)'}`) : null,
        ),
        mode === '2v2' && s.type !== 'off' ? seg([[0, 'Red'], [1, 'Blue']], s.team, (v) => { s.team = v; }) : h('span'),
      ));
    });
    if (mode === 'tournament') {
      players.append(h('div.rule', h('label', 'Opponent difficulty', h('span.hint', 'CPU level of the other 7 pirates')), seg([[3, 'Easy'], [5, 'Normal'], [7, 'Hard'], [9, 'Legend']], st.rules.cpuLevel, (v) => { st.rules.cpuLevel = v; })));
    }
    const R = st.rules;
    const rules = h('div.panel.pad', h('div.panel-h', 'Rules'),
      h('div.rule', h('label', 'Stocks', h('span.hint', 'Lives per fighter')), seg([[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], R.stocks, (v) => { R.stocks = v; })),
      h('div.rule', h('label', 'Time limit', h('span.hint', 'Ranked by stocks, then damage, at time-out')), seg([[0, 'None'], [180, '3:00'], [300, '5:00'], [420, '7:00']], R.time, (v) => { R.time = v; })),
      h('div.rule', h('label', 'Stage hazards', h('span.hint', 'Cannons, wind, geysers. Off = competitive')), seg([[false, 'Off'], [true, 'On']], R.hazards, (v) => { R.hazards = v; })),
      mode === '2v2' ? h('div.rule', h('label', 'Friendly fire'), seg([[false, 'Off'], [true, 'On']], R.friendlyFire, (v) => { R.friendlyFire = v; })) : null,
      h('div.row', { style: { marginTop: '18px', justifyContent: 'flex-end' } }, h('button.cta.focusable', { 'data-autofocus': '', onclick: next }, 'CHOOSE FIGHTERS ›')),
    );
    body.append(players, rules);
    if (nav) { const cur = nav.cur && nav.cur.textContent; nav.cur = null; const again = nav.items().find((e) => e.textContent === cur); if (again) nav.set(again); }
  }

  function next() {
    const active = st.slots.filter((s) => s.type !== 'off');
    if (active.length < 2) { app.sfx('ui_error'); app.toast('Need at least two fighters'); return; }
    if (mode === '2v2') {
      const t0 = active.filter((s) => s.team === 0).length;
      if (active.length !== 4 || t0 !== 2) { app.sfx('ui_error'); app.toast('2v2 needs four fighters, two per team'); return; }
    }
    app.lastSetup = JSON.parse(JSON.stringify(st));
    app.sfx('ui_start');
    const devs = devices();
    const slots = st.slots.map((s, i) => (s.type === 'off' ? null : { ...s, device: devs[i] })).filter(Boolean);
    app.go('select', { mode, slots, rules: st.rules });
  }

  const nav = new FocusNav(el, { onBack: () => app.go(mode === 'tournament' ? 'main' : 'modes') });
  render();
  return { el, nav, enter() { app.music('menu'); }, update() { if ((this._t = (this._t || 0) + 1) % 90 === 0) { /* refresh pad status */ } } };
}

// ------------------------------------------------------------------ arena select
export function arenaSelect(app, params) {
  const el = h('div.screen');
  let sel = params.arena || app.lastArena || 'random';
  const cards = h('div.arena-grid');
  const showArena = (id) => {
    const a = id === 'random' ? ARENA_IDS[0] : id;
    const chars = params.picks.map((p) => ({ char: p.char }));
    app.renderer.startShowcase(a, chars, 'menu');
  };
  const mk = (id) => {
    const a = ARENAS[id];
    const [c1, c2] = id === 'random' ? ['#555', '#222'] : ARENA_COLORS[id];
    const c = h('button.arena-card.focusable', { vars: { a1: c1, a2: c2 }, class: id === sel ? 'sel' : '', onclick: () => { sel = id; app.sfx('ui_select'); for (const x of cards.children) x.classList.toggle('sel', x === c); go(); } },
      h('h3', id === 'random' ? 'Random' : a.name), h('p', id === 'random' ? 'Let the sea decide.' : a.tagline));
    c.addEventListener('focusnav', () => { if (id !== 'random' && app.renderer.arenaId !== id) showArena(id); });
    return c;
  };
  for (const id of [...ARENA_IDS, 'random']) cards.appendChild(mk(id));
  function go() {
    const arena = sel === 'random' ? pick(ARENA_IDS) : sel;
    app.lastArena = sel;
    params.onPick(arena);
  }
  el.append(topBar(app, 'Choose an Arena', `${params.picks.length} fighters`, () => { app.sfx('ui_back'); params.onBack(); }), h('div', { style: { flex: 1 } }), cards,
    h('div.arena-bottom', h('span.status', 'Hazards: ' + (params.hazards ? 'ON' : 'OFF') + ' · Stocks ' + (params.stocks || 3)), h('button.cta.focusable', { onclick: go }, 'FIGHT! ›')));
  const nav = new FocusNav(el, { onBack: params.onBack });
  return { el, nav, enter() { showArena(sel === 'random' ? ARENA_IDS[0] : sel); } };
}

// ------------------------------------------------------------------ settings
export function settingsScreen(app, params) {
  const S = app.settings;
  const el = h('div.screen');
  const wrap = h('div.settings-wrap');
  const back = () => { app.sfx('ui_back'); app.applySettings(); params.onBack ? params.onBack() : app.go(params.back || 'main'); };
  el.append(topBar(app, 'Settings', 'Saved automatically', back), wrap);
  const slider = (label, key, min, max, step, fmt = (v) => Math.round(v * 100) + '%') => {
    const val = h('span', fmt(S[key]));
    const inp = h('input.focusable', { type: 'range', min, max, step, value: S[key] });
    inp.addEventListener('input', () => { S[key] = +inp.value; val.textContent = fmt(S[key]); app.applySettings(); });
    return h('div.set', h('span', label), h('span.row', inp, val));
  };
  const seg = (label, key, opts) => {
    const box = h('div.seg', ...opts.map(([v, l]) => h('button.focusable', { class: S[key] === v ? 'on' : '', onclick: (e) => { S[key] = v; for (const b of box.children) b.classList.toggle('on', b === e.currentTarget); app.sfx('ui_move'); app.applySettings(); } }, l)));
    return h('div.set', h('span', label), box);
  };
  const audioP = h('div.panel.pad', h('div.panel-h', 'Audio'), slider('Music volume', 'music', 0, 1, 0.05), slider('Sound effects', 'sfx', 0, 1, 0.05), h('div.set', h('span', 'Test'), h('button.ghost.focusable', { onclick: () => app.sfx('hit_heavy') }, 'Play sound')));
  const gfx = h('div.panel.pad', h('div.panel-h', 'Graphics'),
    seg('Quality', 'quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]),
    slider('Resolution scale', 'resolution', 0.5, 1, 0.05),
    slider('VFX intensity', 'vfx', 0.25, 1, 0.05),
    seg('Screen shake', 'screenShake', [[true, 'On'], [false, 'Off']]),
    slider('Camera sensitivity', 'cameraSensitivity', 0.3, 2, 0.1, (v) => v.toFixed(1) + '×'),
    h('div.set', h('span', 'Fullscreen'), h('button.ghost.focusable', { onclick: () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch { app.toast('Fullscreen not supported here'); } } }, 'Toggle')),
    seg('Touch controls', 'touch', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]),
  );
  const binds = h('div');
  const renderBinds = () => {
    binds.innerHTML = '';
    for (const a of ACTIONS) {
      const ks = app.input.bindings[a] || [];
      const mkBtn = (slot) => {
        const b = h('button.focusable', { onclick: () => { b.classList.add('wait'); b.textContent = 'press…'; app.input.rebind(a, slot, (bindings) => { S.keys = bindings; app.applySettings(); renderBinds(); }); } }, keyLabel(ks[slot]));
        return b;
      };
      binds.append(h('div.bind', h('span', ACTION_LABELS[a]), mkBtn(0), mkBtn(1)));
    }
  };
  renderBinds();
  const ctrl = h('div.panel.pad', h('div.panel-h', 'Keyboard & mouse'), binds,
    h('div.row', { style: { marginTop: '10px' } }, h('button.ghost.focusable', { onclick: () => { S.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); app.applySettings(); renderBinds(); } }, 'Reset keys')));
  const pad = h('div.panel.pad', h('div.panel-h', 'Gamepad & touch'),
    h('div.padmap', h('div', 'Left stick — move · Right stick — rotate camera'), h('div', 'A / Cross — jump · X / Square — basic attack'), h('div', 'Y / Triangle — special (Q) · B / Circle — dodge'), h('div', 'LB — special (E) · LT — recovery (R)'), h('div', 'RT — heavy attack · RB — block / parry'), h('div', 'R3 or D-pad ↑ — ultimate · D-pad ↓ — fast fall'), h('div', 'Start — pause'),
      h('div', { style: { marginTop: '8px', color: '#a9b2d6' } }, 'Touch: virtual stick on the left, action buttons on the right.')),
    h('div.row', { style: { marginTop: '14px' } }, h('button.ghost.focusable', { onclick: () => { Object.assign(S, { ...DEFAULT_SETTINGS, name: S.name, server: S.server }); app.applySettings(); app.go('settings', params); } }, 'Restore all defaults')));
  wrap.append(audioP, gfx, ctrl, pad);
  const nav = new FocusNav(el, { onBack: back });
  return { el, nav };
}

// ------------------------------------------------------------------ credits
export function credits(app) {
  const el = h('div.screen');
  el.append(topBar(app, 'Credits', null, () => { app.sfx('ui_back'); app.go('main'); }), h('div.credits', h('div.panel',
    h('h3', 'GRAND BRAWL'),
    h('p', 'An original 3D anime-style pirate platform fighter. All characters, arenas, moves, music and sound effects are original and were created procedurally for this project.'),
    h('h3', 'Technology'),
    h('p', 'Rendering: Three.js (MIT licence). Networking: Node.js + ws (MIT licence). Build: esbuild (MIT licence).'),
    h('p', 'Characters are sculpted procedurally from primitives with cel shading and ink outlines; animation is procedural (keyed effector tracks + inverse kinematics) and shares its data with the hitboxes, so what you see is what hits.'),
    h('h3', 'Audio'),
    h('p', 'Every sound effect, music track and ambience bed is synthesized in real time with the Web Audio API — no sample libraries.'),
    h('h3', 'Fonts'),
    h('p', 'Bangers and Rubik via Google Fonts (SIL Open Font Licence).'),
    h('h3', 'Thanks for playing!'),
    h('p', 'Knock them off the edge, captain.'),
  )));
  const nav = new FocusNav(el, { onBack: () => app.go('main') });
  return { el, nav };
}

// ------------------------------------------------------------------ pause overlay
export function pauseOverlay(app, { match }) {
  const panel = h('div.panel');
  const el = h('div.overlay', panel);
  const btn = (label, fn) => h('button.menu-btn.focusable', { onclick: () => { app.sfx('ui_select'); fn(); } }, h('span', label));
  panel.append(h('h2', match.net ? 'Menu' : 'Paused'),
    btn('Resume', () => app.pause(false)),
    !match.net && !match.opts.noRestart ? btn('Restart', () => { app.closeOverlay(); app.restartLocal(); }) : null,
    btn('Settings', () => { app.closeOverlay(); const s = settingsScreen(app, { onBack: () => { app.closeOverlay(); app.pause(true); } }); app.openOverlay({ el: h('div.overlay', { style: { display: 'block', padding: 0 } }, s.el), nav: s.nav, onBack: () => { app.applySettings(); app.closeOverlay(); app.pause(true); } }); }),
    btn(match.net ? 'Leave match' : 'Quit to menu', () => { app.closeOverlay(); app.quitMatch(); }),
    h('div', { style: { color: '#a9b2d6', fontSize: '12px', textAlign: 'center', marginTop: '6px' } }, 'Arrow keys / ← → rotate the camera during play'),
  );
  const nav = new FocusNav(el, { onBack: () => app.pause(false) });
  return { el, nav, onBack: () => app.pause(false) };
}

export { pick };
void ROSTER;
