// Character select: portrait grid, animated 3D lineup, fighter info with stats and abilities (hover to preview),
// per-player cursors (P1 mouse/keyboard, P2-P4 gamepads), CPU picks, ready-up.
import { h, FocusNav, hex } from './dom.js';
import { ROSTER, CHARACTERS, CHARACTER_IDS } from '../../shared/characters/index.js';
import { PLAYER_COLORS, TEAM_COLORS, CPU_COLOR } from '../render/renderer.js';
import { LOOKS } from '../render/characterModels.js';
import { ARENA_IDS } from '../../shared/sim/arenas.js';
import { pick } from './screens.js';

const KEY_OF = { sp1: 'Q', sp2: 'E', sp3: 'R', ult: 'F', jab1: 'LMB', fwdHeavy: 'RMB', nair: 'AIR', fair: 'AIR+' };

export function charSelect(app, params) {
  const { mode } = params;
  const slots = params.slots.map((s, i) => ({ ...s, idx: i, char: null, cursor: 0 }));
  // CPUs pick at random (distinct when possible); humans start on their last pick
  const used = new Set();
  slots.forEach((s) => {
    if (s.type === 'cpu' && mode !== 'training') { let c; do c = pick(CHARACTER_IDS); while (used.has(c) && used.size < CHARACTER_IDS.length); used.add(c); s.char = c; }
    if (s.type === 'cpu' && mode === 'training') s.char = 'monster_doctor';
    if (s.type === 'human') s.cursor = Math.max(0, CHARACTER_IDS.indexOf((app.settings.lastChars || {})[s.idx]));
  });
  const el = h('div.screen');
  const titles = { ffa: 'Free for All', '1v1': 'Duel', '2v2': 'Teams', tournament: 'Tournament', training: 'Training' };
  const backTo = () => { app.sfx('ui_back'); if (mode === 'training') app.go('main'); else app.go('setup', { mode }); };
  el.append(h('div.top-bar', h('button.back-btn.focusable', { onclick: backTo }, '‹ Back'), h('h1', 'Choose Your Fighter'), h('span.crumb', titles[mode] + ' · all fighters unlocked')));
  const cs = h('div.cs');
  const grid = h('div.cs-grid');
  const info = h('div.cs-info.panel');
  const players = h('div.cs-players');
  const actions = h('div.cs-actions');
  cs.append(h('div.cs-left', grid), info, players, actions);
  el.append(cs);

  const colorOf = (s) => hex(mode === '2v2' ? TEAM_COLORS[s.team % 2] : s.type === 'cpu' ? CPU_COLOR : PLAYER_COLORS[s.idx % 4]);
  const tiles = [];
  ROSTER.forEach((c, i) => {
    const t = h('button.cs-tile.focusable', { vars: { tc: LOOKS[c.id] ? hex(LOOKS[c.id].trail) : '#888' }, onclick: () => choose(slots.find((s) => s.type === 'human' && s.device !== 'pad' && s.idx === p1().idx), i) },
      h('img', { src: app.portraits[c.id], alt: c.name }), h('div.cursors'), h('div.nm', c.name));
    t.addEventListener('focusnav', () => { const s = p1(); if (s && !s.char) { s.cursor = i; showInfo(c.id); refresh(); } else showInfo(c.id); app.sfx('char_hover'); });
    tiles.push(t); grid.appendChild(t);
  });
  const rnd = h('button.cs-tile.random.focusable', { onclick: () => choose(p1(), -1) }, '?');
  grid.appendChild(rnd);

  function p1() { return slots.find((s) => s.type === 'human'); }
  function slotForPad(src) { return slots.find((s) => s.type === 'human' && s.device === src) || null; }

  let infoChar = null;
  function showInfo(id) {
    if (infoChar === id) return;
    infoChar = id;
    const c = CHARACTERS[id];
    const cc = hex(LOOKS[id].trail);
    info.style.setProperty('--cc', cc);
    info.innerHTML = '';
    const pips = (n) => h('div.pips', ...[1, 2, 3, 4, 5].map((k) => h('i', { class: k <= n ? 'on' : '' })));
    const ab = (key, mk) => {
      const m = c.moves[mk];
      const row = h('div.ability.focusable', { class: mk === 'ult' ? 'ult' : '' }, h('div.key', KEY_OF[mk] || key), h('div', h('b', m.name), h('span', (m.desc || '').replace(/^[QERF] — /, ''))));
      const preview = () => { const s = p1(); const i = lineupIndex(s ? s.idx : 0); app.renderer.previewMove(i, mk); };
      row.addEventListener('mouseenter', preview);
      row.addEventListener('focusnav', preview);
      row.addEventListener('click', preview);
      return row;
    };
    info.append(
      h('div', h('span.cs-style', c.style)),
      h('h2.cs-name', c.name),
      h('div.cs-title', c.title),
      h('p.cs-desc', c.desc),
      h('p.cs-desc', { style: { color: '#a9b2d6', fontStyle: 'italic' } }, c.personality),
      h('div.stats', ...['power', 'speed', 'range', 'defense', 'recovery', 'difficulty'].flatMap((k) => [h('span', k), pips(c.ratings[k])])),
      h('div.abilities', ab('Q', 'sp1'), ab('E', 'sp2'), ab('R', 'sp3'), ab('F', 'ult'), ab('LMB', 'jab1'), ab('RMB', 'fwdHeavy'), ab('AIR', 'fair')),
      h('div', { style: { fontSize: '12px', color: '#a9b2d6' } }, `Weight ${c.stats.weight} · Run ${c.stats.runSpeed} · Jumps ${c.stats.airJumps + 1}  —  hover an ability to preview it`),
    );
  }

  function lineupIndex(slotIdx) { return slots.filter((s) => s.idx < slotIdx).length; }

  function choose(s, i) {
    if (!s) return;
    const id = i < 0 ? pick(CHARACTER_IDS) : CHARACTER_IDS[i];
    s.char = id; s.cursor = i < 0 ? CHARACTER_IDS.indexOf(id) : i;
    app.settings.lastChars = { ...(app.settings.lastChars || {}), [s.idx]: id };
    app.sfx('char_pick');
    showInfo(id);
    refresh();
    const idx = lineupIndex(s.idx);
    setTimeout(() => app.renderer.previewMove(idx, 'ult'), 50);
  }

  function refresh() {
    // cursors on tiles
    tiles.forEach((t) => { t.querySelector('.cursors').innerHTML = ''; });
    for (const s of slots) {
      if (s.type !== 'human') continue;
      const ti = s.char ? CHARACTER_IDS.indexOf(s.char) : s.cursor;
      if (ti >= 0) tiles[ti].querySelector('.cursors').appendChild(h('b', { vars: { pc: colorOf(s) } }, `P${s.idx + 1}${s.char ? '✓' : ''}`));
    }
    // player cards
    players.innerHTML = '';
    for (const s of slots) {
      const id = s.char || (s.type === 'human' ? CHARACTER_IDS[s.cursor] : null);
      const c = id ? CHARACTERS[id] : null;
      const card = h('div.pcard', { vars: { pc: colorOf(s) }, class: s.type === 'cpu' ? 'cpu focusable' : '' },
        h('img', { src: c ? app.portraits[c.id] : '' }),
        h('div', h('div.who', s.type === 'cpu' ? (mode === 'training' ? 'DUMMY' : `CPU`) : `P${s.idx + 1}`), h('div.what', c ? c.name : '—'),
          s.type === 'cpu' ? h('div.lvl', mode === 'training' ? 'click to change' : `Level ${s.level} · click to change`) : h('div.lvl', s.char ? 'Ready!' : s.device && s.device.startsWith('pad') ? `Gamepad ${+s.device.slice(3) + 1}: D-pad + A` : 'Pick a fighter')),
        s.char && s.type === 'human' ? h('div.ready', 'READY') : null,
      );
      if (s.type === 'cpu') card.addEventListener('click', () => { const k = (CHARACTER_IDS.indexOf(s.char) + 1) % CHARACTER_IDS.length; s.char = CHARACTER_IDS[k]; app.sfx('char_pick'); refresh(); });
      if (s.type === 'human' && s.char) card.addEventListener('click', () => { s.char = null; app.sfx('ui_back'); refresh(); });
      players.appendChild(card);
    }
    // 3D lineup
    app.renderer.setLineup(slots.map((s) => ({ char: s.char || (s.type === 'human' ? CHARACTER_IDS[s.cursor] : CHARACTER_IDS[0]), color: parseInt(colorOf(s).slice(1), 16) })));
    // continue button
    const allIn = slots.every((s) => s.char);
    actions.innerHTML = '';
    actions.append(...[
      h('span.status', allIn ? 'Everyone is ready!' : 'Click a fighter (or Enter / A). Click your card to change.'),
      mode !== 'training' ? h('button.ghost.focusable', { onclick: () => { for (const s of slots) if (s.type === 'cpu') s.char = pick(CHARACTER_IDS); app.sfx('ui_move'); refresh(); } }, 'Shuffle CPUs') : null,
      h('button.cta.focusable', { disabled: !allIn, onclick: proceed }, mode === 'tournament' ? 'TO THE BRACKET ›' : 'CHOOSE ARENA ›'),
    ].filter(Boolean));
  }

  function proceed() {
    if (!slots.every((s) => s.char)) return;
    app.sfx('ready');
    app.settings && app.applySettings();
    if (mode === 'tournament') {
      app.go('tournament', { create: true, char: slots[0].char, device: slots[0].device || 'any', rules: params.rules });
      return;
    }
    const picks = slots.map((s) => ({ char: s.char }));
    app.go('arena', {
      picks, hazards: mode === 'training' ? false : params.rules.hazards, stocks: params.rules ? params.rules.stocks : 3,
      onBack: () => app.go('select', { ...params, slots: params.slots }),
      onPick: (arena) => startMatch(arena),
    });
  }

  function startMatch(arena) {
    const R = params.rules || { stocks: 3, time: 0, hazards: false };
    const cfg = {
      arena, mode, stocks: R.stocks, time: mode === 'training' ? 0 : R.time, hazards: mode === 'training' ? false : R.hazards, friendlyFire: R.friendlyFire,
      players: slots.map((s) => ({ char: s.char, name: s.type === 'cpu' ? 'CPU' : `P${s.idx + 1}`, team: mode === '2v2' ? s.team : s.idx, cpu: s.type === 'cpu' ? s.level : 0 })),
    };
    const locals = slots.filter((s) => s.type === 'human').map((s) => ({ slot: s.idx, device: s.device || 'any' }));
    const cpu = Object.fromEntries(slots.filter((s) => s.type === 'cpu').map((s) => [s.idx, s.level]));
    const again = () => app.go('select', { ...params });
    const opts = {
      locals, cpu, label: mode === '2v2' ? '2 vs 2' : mode === '1v1' ? 'Duel' : 'Free for all',
      training: mode === 'training' ? { dummyMode: 'stand' } : null,
      onQuit: again,
      onEnd: (results, world) => app.go('results', {
        results, world,
        rematch: () => app.startLocalMatch(cfg, opts),
        toSelect: again,
        toMenu: () => app.go('main'),
      }),
    };
    app.sfx('ui_start');
    app.startLocalMatch(cfg, opts);
  }

  const nav = new FocusNav(el, { onBack: backTo });
  return {
    el, nav,
    enter() {
      app.music('select');
      app.renderer.startShowcase(pick(ARENA_IDS), slots.map((s) => ({ char: s.char || CHARACTER_IDS[s.cursor] })), 'select');
      showInfo(slots[0].char || CHARACTER_IDS[slots[0].cursor]);
      refresh();
      setTimeout(() => nav.set(tiles[slots[0].cursor] || tiles[0]), 0);
    },
    onEdge(e) {
      // gamepad cursors for additional local players
      const s = e.src.startsWith('pad') ? slotForPad(e.src) : null;
      if (!s || s === p1() && s.device === 'any') return false;
      const cols = 4;
      if (['up', 'down', 'left', 'right'].includes(e.dir) && !s.char) {
        const d = { left: -1, right: 1, up: -cols, down: cols }[e.dir];
        s.cursor = (s.cursor + d + CHARACTER_IDS.length) % CHARACTER_IDS.length;
        showInfo(CHARACTER_IDS[s.cursor]); app.sfx('char_hover'); refresh();
      } else if (e.dir === 'ok') { if (!s.char) choose(s, s.cursor); else if (slots.every((x) => x.char)) proceed(); }
      else if (e.dir === 'back') { if (s.char) { s.char = null; refresh(); } }
      return true;
    },
  };
}
