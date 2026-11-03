// Results screen + Tournament bracket mode.
import { h, FocusNav, hex, fmtTime } from './dom.js';
import { CHARACTERS, CHARACTER_IDS } from '../../shared/characters/index.js';
import { PLAYER_COLORS, TEAM_COLORS, CPU_COLOR } from '../render/renderer.js';
import { LOOKS } from '../render/characterModels.js';
import { ARENA_IDS, ARENAS } from '../../shared/sim/arenas.js';
import { World } from '../../shared/sim/world.js';
import { CpuController } from '../../shared/sim/ai.js';
import { pick } from './screens.js';

export function resultsScreen(app, p) {
  const { results } = p;
  const el = h('div.screen.results');
  const world = p.world;
  const colOf = (r) => hex(world && world.teams ? TEAM_COLORS[r.team % 2] : r.cpu ? CPU_COLOR : PLAYER_COLORS[r.slot % 4]);
  const win = results.rows[0];
  const winName = world && world.teams ? (win.team === 0 ? 'RED TEAM' : 'BLUE TEAM') : CHARACTERS[win.char].name.toUpperCase();
  const who = (r) => (p.netNames ? p.netNames[r.id] : r.cpu ? `CPU ${r.cpu}` : r.name || `P${r.slot + 1}`);
  el.append(h('div.res-win', { vars: { wc: hex(LOOKS[win.char].trail) } }, h('div.w1', `${who(win)} WINS!`), h('div.w2', winName)));
  const table = h('table.res-table', h('tr', ...['#', 'Fighter', 'Stocks', 'Damage dealt', 'Damage taken', 'KOs', 'Falls', 'Best combo'].map((t) => h('th', t))));
  for (const r of results.rows) {
    table.append(h('tr', { vars: { pc: colOf(r) } },
      h('td', String(r.place)),
      h('td.who', h('img', { src: app.portraits[r.char] }), h('div', h('div', who(r)), h('div', { style: { fontSize: '12px', color: '#a9b2d6' } }, CHARACTERS[r.char].name))),
      h('td', String(r.stocks)), h('td', `${r.dmgDealt}%`), h('td', `${r.dmgTaken}%`), h('td', String(r.kos)), h('td', String(r.falls)), h('td', String(r.maxCombo)),
    ));
  }
  const btn = (label, fn, cta) => h(cta ? 'button.cta.focusable' : 'button.ghost.focusable', { onclick: () => { app.sfx('ui_select'); fn(); } }, label);
  el.append(
    h('div.res-meta', `${ARENAS[results.arena] ? ARENAS[results.arena].name : ''} · Match time ${fmtTime(results.duration)} · ${results.reason === 'time' ? 'Time out' : 'Knockout'}`),
    table,
    h('div.res-actions', p.rematch ? btn('REMATCH', p.rematch, true) : null, p.toSelect ? btn('Character select', p.toSelect) : null, p.extra || null, btn('Main menu', p.toMenu || (() => app.go('main')))),
  );
  const nav = new FocusNav(el, { onBack: p.toMenu || (() => app.go('main')) });
  return {
    el, nav,
    enter() {
      app.music('results');
      app.sfx(win && !win.cpu ? 'victory_fanfare' : 'crowd_cheer');
      const entries = results.rows.slice(0, 4).map((r, i) => ({ char: r.char, pose: i === 0 || (world && world.teams && r.team === win.team) ? 'victory' : 'defeat' }));
      app.renderer.startShowcase(results.arena || pick(ARENA_IDS), entries, 'results');
    },
  };
}

// ------------------------------------------------------------------ tournament
function headless(a, b, arena, level, seed) {
  const w = new World({ arena, mode: '1v1', stocks: 2, time: 150, players: [{ char: a }, { char: b }], seed, skipCountdown: true });
  const cpus = w.fighters.map((f) => new CpuController(w, f.id, level, 'cpu', seed));
  let guard = 0;
  while (w.phase !== 'ended' && guard++ < 60 * 160) w.step(cpus.map((c) => c.think()));
  if (w.phase !== 'ended') return Math.random() < 0.5 ? 0 : 1;
  return w.results.rows[0].id;
}

export function tournamentScreen(app, p) {
  if (p.create || !app.tournament) {
    const others = CHARACTER_IDS.filter((c) => c !== p.char).sort(() => Math.random() - 0.5);
    const entrants = [{ char: p.char, you: true, name: 'YOU' }, ...others.slice(0, 7).map((c) => ({ char: c, name: CHARACTERS[c].name }))].sort(() => Math.random() - 0.5);
    app.tournament = { entrants, rounds: [entrants.map((_, i) => i)], results: [], round: 0, device: p.device, rules: p.rules || { stocks: 3, time: 300, hazards: false, cpuLevel: 5 }, done: false, champion: null };
  }
  const T = app.tournament;
  const el = h('div.screen');
  const youIdx = T.entrants.findIndex((e) => e.you);
  const names = ['Quarterfinals', 'Semifinals', 'Final', 'Champion'];

  function currentPair() {
    const r = T.rounds[T.round];
    for (let i = 0; i < r.length; i += 2) if (r[i] === youIdx || r[i + 1] === youIdx) return [r[i], r[i + 1]];
    return null;
  }

  function resolveOthers(playerWinner) {
    const r = T.rounds[T.round];
    const winners = [];
    for (let i = 0; i < r.length; i += 2) {
      const a = r[i], b = r[i + 1];
      let w;
      if (a === youIdx || b === youIdx) w = playerWinner;
      else { const k = headless(T.entrants[a].char, T.entrants[b].char, pick(ARENA_IDS), T.rules.cpuLevel, (Math.random() * 1e6) | 0); w = k === 0 ? a : b; }
      winners.push(w);
      T.results.push({ round: T.round, a, b, w });
    }
    T.rounds.push(winners);
    T.round++;
    if (winners.length === 1) { T.done = true; T.champion = winners[0]; }
  }

  function simulateRest() {
    while (!T.done) {
      const r = T.rounds[T.round];
      const winners = [];
      for (let i = 0; i < r.length; i += 2) {
        const a = r[i], b = r[i + 1];
        const k = headless(T.entrants[a].char, T.entrants[b].char, pick(ARENA_IDS), T.rules.cpuLevel, (Math.random() * 1e6) | 0);
        const w = k === 0 ? a : b;
        winners.push(w); T.results.push({ round: T.round, a, b, w });
      }
      T.rounds.push(winners); T.round++;
      if (winners.length === 1) { T.done = true; T.champion = winners[0]; }
    }
  }

  const eliminated = T.results.some((r) => (r.a === youIdx || r.b === youIdx) && r.w !== youIdx);

  function fight() {
    const pair = currentPair();
    if (!pair) return;
    const opp = pair[0] === youIdx ? pair[1] : pair[0];
    const R = T.rules;
    const arena = pick(ARENA_IDS);
    const cfg = { arena, mode: '1v1', stocks: R.stocks, time: R.time, hazards: R.hazards, players: [{ char: T.entrants[youIdx].char, name: 'YOU' }, { char: T.entrants[opp].char, name: T.entrants[opp].name, cpu: R.cpuLevel + T.round }] };
    const opts = {
      locals: [{ slot: 0, device: T.device || 'any' }], cpu: { 1: Math.min(9, R.cpuLevel + T.round) }, label: `Tournament · ${names[T.round]}`, noRestart: true,
      onQuit: () => app.go('tournament'),
      onEnd: (res, world) => {
        const youWon = res.rows[0].id === 0;
        resolveOthers(youWon ? youIdx : opp);
        if (!youWon) simulateRest();
        app.go('results', { results: res, world, toMenu: () => app.go('tournament'), extra: h('button.cta.focusable', { onclick: () => app.go('tournament') }, 'BRACKET ›') });
      },
    };
    app.sfx('ui_start');
    app.startLocalMatch(cfg, opts);
  }

  // ---- render bracket
  const bracket = h('div.bracket');
  for (let r = 0; r < 4; r++) {
    const col = h('div.round', h('h4', names[r]));
    const ids = T.rounds[r];
    if (r === 3) {
      if (T.champion !== null) { const e = T.entrants[T.champion]; col.append(h('div.champ', h('img', { src: app.portraits[e.char] }), h('h3', { style: { fontFamily: 'Bangers', fontSize: '30px', margin: '8px 0 0', color: e.you ? '#ffc93c' : '#fff' } }, e.you ? 'YOU!' : e.name))); }
      else col.append(h('div.champ', h('div', { style: { fontSize: '60px' } }, '🏆')));
      bracket.append(col); continue;
    }
    const n = 8 >> r;
    for (let i = 0; i < n; i += 2) {
      const a = ids ? ids[i] : undefined, b = ids ? ids[i + 1] : undefined;
      const res = T.results.find((x) => x.round === r && x.a === a && x.b === b);
      const isCur = !T.done && r === T.round && (a === youIdx || b === youIdx) && !eliminated;
      const ent = (k) => {
        if (k === undefined) return h('div.bent', h('span', '—'));
        const e = T.entrants[k];
        return h('div.bent', { class: [res ? (res.w === k ? 'win' : 'lose') : '', e.you ? 'you' : ''].join(' ') }, h('img', { src: app.portraits[e.char] }), h('span', e.you ? `YOU (${CHARACTERS[e.char].name})` : e.name));
      };
      col.append(h('div.bmatch', { class: isCur ? 'current' : '' }, ent(a), ent(b)));
    }
    bracket.append(col);
  }
  const status = T.done ? (T.champion === youIdx ? 'You are the GRAND BRAWL champion!' : eliminated ? `Eliminated. ${T.entrants[T.champion].name} won the tournament.` : '') : eliminated ? 'Eliminated.' : `Next: ${names[T.round]}`;
  const actions = h('div.arena-bottom', h('span.status', status),
    !T.done && !eliminated ? h('button.cta.focusable', { 'data-autofocus': '', onclick: fight }, 'FIGHT ›') : h('button.cta.focusable', { 'data-autofocus': '', onclick: () => { app.tournament = null; app.go('main'); } }, 'FINISH'),
  );
  el.append(h('div.top-bar', h('button.back-btn.focusable', { onclick: () => { app.go('main'); } }, '‹ Menu'), h('h1', 'Tournament'), h('span.crumb', 'Single elimination · 8 pirates')), bracket, actions);
  const nav = new FocusNav(el, { onBack: () => app.go('main') });
  return {
    el, nav,
    enter() {
      app.music('tournament');
      if (T.done && T.champion === youIdx) app.sfx('victory_fanfare');
      const pair = currentPair();
      const show = pair ? pair.map((k) => ({ char: T.entrants[k].char })) : [{ char: T.entrants[T.champion ?? youIdx].char, pose: 'victory' }];
      app.renderer.startShowcase(pick(ARENA_IDS), show, pair ? 'select' : 'results');
    },
  };
}
