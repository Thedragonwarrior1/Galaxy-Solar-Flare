// Online: connect, create/join a room, lobby (fighter pick, ready, host rules), start authoritative matches.
import { h, FocusNav, hex } from './dom.js';
import { ROSTER, CHARACTERS } from '../../shared/characters/index.js';
import { ARENAS, ARENA_IDS } from '../../shared/sim/arenas.js';
import { NetClient } from '../net/netClient.js';
import { PLAYER_COLORS, TEAM_COLORS } from '../render/renderer.js';
import { pick } from './screens.js';

export function onlineScreen(app) {
  const el = h('div.screen');
  const S = app.settings;
  let net = app.net && app.net.connected ? app.net : null;
  const left = h('div.panel.pad');
  const right = h('div.panel.pad.scroll');
  const err = h('div.err');
  const back = () => { app.sfx('ui_back'); if (net) { net.leave(); } app.go('main'); };
  el.append(h('div.top-bar', h('button.back-btn.focusable', { onclick: back }, '‹ Back'), h('h1', 'Online'), h('span.crumb', 'Authoritative server · up to 4 players')), h('div.online-wrap', left, right));

  function renderConnect() {
    left.innerHTML = '';
    const name = h('input.text-in.focusable', { value: S.name || 'Captain', maxlength: 16, placeholder: 'Your name' });
    const url = h('input.text-in.focusable', { value: S.server || NetClient.defaultUrl(), placeholder: 'ws://host:8080/ws' });
    const code = h('input.text-in.focusable', { maxlength: 4, placeholder: 'ROOM CODE', style: { textTransform: 'uppercase', letterSpacing: '6px', fontSize: '22px' } });
    const connect = async () => {
      err.textContent = '';
      S.name = name.value.trim() || 'Captain'; S.server = url.value.trim(); app.applySettings();
      if (net && net.connected) return net;
      net = new NetClient();
      app.net = net;
      wire(net);
      try { await net.connect(S.server || NetClient.defaultUrl(), S.name); return net; }
      catch (e) { err.textContent = e.message + ' — run `npm start` to host the GRAND BRAWL server, then connect to it here.'; net = null; return null; }
    };
    left.append(
      h('div.panel-h', 'Captain'), name,
      h('div', { style: { height: '10px' } }), h('div.panel-h', 'Server'), url,
      h('div.status', { style: { marginTop: '6px' } }, 'Play over LAN/Internet by pointing everyone at the same server.'),
      h('div', { style: { height: '16px' } }),
      h('div.row', h('button.cta.focusable', { 'data-autofocus': '', onclick: async () => { const n = await connect(); if (n) n.create(); } }, 'CREATE ROOM')),
      h('div', { style: { height: '14px' } }),
      h('div.row', code, h('button.ghost.focusable', { onclick: async () => { const c = code.value.trim().toUpperCase(); if (!/^[A-Z0-9]{4}$/.test(c)) { err.textContent = 'Enter the 4-character room code'; return; } const n = await connect(); if (n) n.join(c); } }, 'Join')),
      err,
    );
    right.innerHTML = '';
    right.append(h('div.panel-h', 'How online works'),
      h('p.status', 'The host creates a room and shares the 4-letter code. Everyone picks a fighter and readies up; the host sets the rules and starts.'),
      h('p.status', 'The server runs the only true simulation. Your client sends inputs; damage, knockouts and results are decided by the server, so they cannot be faked.'),
      h('p.status', 'Your fighter is rendered from server snapshots (30 Hz) with smooth interpolation. Expect a little input delay on high-ping connections.'));
  }

  function renderLobby(room) {
    left.innerHTML = '';
    const me = room.players.find((p) => p.id === net.id);
    const isHost = room.host === net.id;
    left.append(h('div.panel-h', 'Room code'), h('div.code', room.code), h('div.status', room.state === 'lobby' ? 'Share this code with friends' : room.state === 'playing' ? 'Match in progress…' : 'Match finished'));
    left.append(h('div', { style: { height: '10px' } }), h('div.panel-h', 'Pirates'));
    room.players.forEach((p, i) => {
      const col = hex(room.settings.mode === '2v2' ? TEAM_COLORS[p.team % 2] : PLAYER_COLORS[i % 4]);
      left.append(h('div.lobby-p', { vars: { pc: col } }, h('img', { src: p.char ? app.portraits[p.char] : '' }), h('div', h('b', p.name + (p.id === room.host ? ' ★' : '') + (p.id === net.id ? ' (you)' : '')), h('div.status', p.char ? CHARACTERS[p.char].name : 'choosing…')),
        h('span.st', { style: { color: p.ready || p.id === room.host ? '#4fe08a' : '#a9b2d6' } }, p.id === room.host ? 'HOST' : p.ready ? 'READY' : 'NOT READY')));
    });
    for (let i = room.players.length; i < 4 && i < room.players.length + (room.settings.cpus || 0); i++) left.append(h('div.lobby-p', { vars: { pc: '#b0b0b8' } }, h('div', h('b', 'CPU'), h('div.status', 'random fighter'))));
    left.append(err);
    right.innerHTML = '';
    const grid = h('div.mini-grid', ...ROSTER.map((c) => h('button.focusable', { class: me && me.char === c.id ? 'on' : '', title: c.name, onclick: () => { app.sfx('char_pick'); net.pick(c.id); } }, h('img', { src: app.portraits[c.id], alt: c.name }))));
    right.append(h('div.panel-h', 'Your fighter'), grid, h('div.status', { style: { margin: '6px 0 12px' } }, me && me.char ? `${CHARACTERS[me.char].name} — ${CHARACTERS[me.char].style}` : 'Pick a fighter'));
    const seg = (opts, cur, on, enabled) => h('div.seg', ...opts.map(([v, l]) => h('button.focusable', { class: v === cur ? 'on' : '', disabled: !enabled, onclick: () => { app.sfx('ui_move'); on(v); } }, l)));
    const st = room.settings;
    const set = (k) => (v) => net.settings({ ...st, [k]: v });
    right.append(...[h('div.panel-h', 'Rules' + (isHost ? '' : ' (host decides)')),
      h('div.rule', h('label', 'Mode'), seg([['ffa', 'Free for all'], ['1v1', '1v1'], ['2v2', '2v2']], st.mode, set('mode'), isHost)),
      h('div.rule', h('label', 'Arena'), seg([['random', 'Random'], ...ARENA_IDS.map((a) => [a, ARENAS[a].name])], st.arena, set('arena'), isHost)),
      h('div.rule', h('label', 'Stocks'), seg([[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], st.stocks, set('stocks'), isHost)),
      h('div.rule', h('label', 'Time'), seg([[0, 'None'], [180, '3:00'], [300, '5:00'], [420, '7:00']], st.time, set('time'), isHost)),
      h('div.rule', h('label', 'Hazards'), seg([[false, 'Off'], [true, 'On']], st.hazards, set('hazards'), isHost)),
      h('div.rule', h('label', 'CPU fill'), seg([[0, '0'], [1, '1'], [2, '2'], [3, '3']], st.cpus || 0, set('cpus'), isHost)),
      st.mode === '2v2' && me ? h('div.rule', h('label', 'Your team'), seg([[0, 'Red'], [1, 'Blue']], me.team, (v) => net.team(v), true)) : null,
      h('div.row', { style: { marginTop: '14px', justifyContent: 'flex-end' } },
        h('button.ghost.focusable', { onclick: () => { net.leave(); renderConnect(); } }, 'Leave room'),
        room.state === 'results' && isHost ? h('button.ghost.focusable', { onclick: () => net.rematch() }, 'Back to lobby') : null,
        !isHost && room.state === 'lobby' ? h('button.cta.focusable', { onclick: () => { app.sfx('ready'); net.ready(!(me && me.ready)); } }, me && me.ready ? 'UNREADY' : 'READY') : null,
        isHost && room.state === 'lobby' ? h('button.cta.focusable', { onclick: () => { app.sfx('ui_start'); net.start(); } }, 'START MATCH') : null,
      ),
    ].filter(Boolean));
    if (me && me.char) app.renderer.setLineup(room.players.filter((p) => p.char).map((p, i) => ({ char: p.char, color: room.settings.mode === '2v2' ? TEAM_COLORS[p.team % 2] : PLAYER_COLORS[i % 4] })));
  }

  function wire(n) {
    n.on('room', (room) => { if (app.screen && app.screen.el === el) { if (room) renderLobby(room); else renderConnect(); } });
    n.on('error', (msg) => { err.textContent = msg; app.sfx('ui_error'); });
    n.on('start', (m) => {
      const names = m.cfg.players.map((p) => p.name);
      app.sfx('ui_start');
      app.startNetMatch(n, m, {
        onEnd: (results, view) => app.go('results', {
          results, world: view, netNames: names,
          toSelect: () => app.go('online'), rematch: null,
          extra: h('button.cta.focusable', { onclick: () => { if (n.room && n.room.host === n.id) n.rematch(); app.go('online'); } }, 'BACK TO LOBBY'),
          toMenu: () => { n.leave(); app.go('main'); },
        }),
        onQuit: () => { n.leave(); app.go('online'); },
      });
    });
  }

  const nav = new FocusNav(el, { onBack: back });
  return {
    el, nav,
    enter() {
      app.music('select');
      app.renderer.startShowcase(pick(ARENA_IDS), [{ char: pick(ROSTER).id }], 'select');
      if (net && net.room) { wire(net); renderLobby(net.room); } else renderConnect();
    },
  };
}
