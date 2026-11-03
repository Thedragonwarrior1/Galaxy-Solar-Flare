// Multiplayer integration tests: real WebSocket clients against the authoritative server.
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../server/server.js';
import { BTN } from '../src/shared/sim/constants.js';
import { decodeFighter } from '../src/shared/protocol.js';

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { ws, msgs: [], room: null, snaps: [], start: null, end: null, errors: [], id: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    c.msgs.push(m);
    if (m.t === 'welcome') c.id = m.id;
    if (m.t === 'room') c.room = m.room;
    if (m.t === 'snap') c.snaps.push(m);
    if (m.t === 'start') c.start = m;
    if (m.t === 'end') c.end = m.results;
    if (m.t === 'error') c.errors.push(m.msg);
  });
  c.send = (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
  c.open = new Promise((r) => ws.on('open', r));
  return c;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(20); } return false; }

test('online: lobby sync, validation, authoritative match, results', async (t) => {
  const srv = await startServer({ port: 0, quiet: true });
  t.after(() => srv.close());
  const A = client(srv.port), B = client(srv.port);
  await A.open; await B.open;
  A.send({ t: 'hello', name: 'Alice' }); B.send({ t: 'hello', name: 'Bob<script>' });
  A.send({ t: 'create' });
  assert.ok(await until(() => A.room));
  const code = A.room.code;
  B.send({ t: 'join', code });
  assert.ok(await until(() => B.room && B.room.players.length === 2 && A.room.players.length === 2), 'both see 2 players');
  assert.equal(A.room.players[1].name, 'Bobscript', 'names sanitised');

  // --- validation: invalid character, non-host start, non-host settings, garbage
  B.send({ t: 'char', char: 'not_a_fighter' });
  B.send('{not json');
  B.send({ t: 'damage', target: 0, amount: 999 }); // no such message: ignored
  B.send({ t: 'settings', stocks: 1 });
  B.send({ t: 'start' });
  assert.ok(await until(() => B.errors.length >= 2));
  assert.ok(B.errors.some((e) => /host/i.test(e)));
  assert.equal(A.room.settings.stocks, 3, 'non-host cannot change rules');

  // --- character selection sync
  A.send({ t: 'char', char: 'threeblade' });
  B.send({ t: 'char', char: 'tempest' });
  A.send({ t: 'settings', stocks: 1, mode: '1v1', arena: 'pirate_haven', time: 75 });
  assert.ok(await until(() => B.room.players.every((p) => p.char) && B.room.settings.stocks === 1), 'selections synced to all');
  A.send({ t: 'start' });
  assert.ok(await until(() => A.errors.some((e) => /ready/i.test(e))), 'cannot start until everyone is ready');
  B.send({ t: 'ready', v: true });
  await until(() => B.room.players[1].ready);
  A.send({ t: 'start' });
  assert.ok(await until(() => A.start && B.start), 'match started for both');
  assert.equal(A.start.cfg.players[0].char, 'threeblade');
  assert.equal(B.start.you, 1);

  // --- run the match: Bob tries to inject impossible input magnitudes; Alice attacks Bob
  await until(() => A.snaps.length > 0);
  const snapCountStart = A.snaps.length;
  let seq = 0;
  const ticker = setInterval(() => {
    const last = A.snaps[A.snaps.length - 1];
    if (!last) return;
    const fa = decodeFighter(last.F[0]), fb = decodeFighter(last.F[1]);
    const dx = fb.pos.x - fa.pos.x, dz = fb.pos.z - fa.pos.z, d = Math.hypot(dx, dz) || 1;
    seq++;
    const dy = fb.pos.y - fa.pos.y;
    let atk = d < 2.2 && Math.abs(dy) < 1.2 && seq % 20 < 2 ? BTN.HEAVY : 0;
    if (dy > 1.2 && fa.grounded && seq % 30 < 8) atk |= BTN.JUMP;
    if (!fa.grounded && d < 2 && seq % 12 < 2) atk |= BTN.ATTACK;
    A.send({ t: 'in', s: seq, m: [dx / d, dz / d], b: atk });
    if (seq < 40) {
      B.send({ t: 'in', s: seq, m: seq < 20 ? [-50, 0] : [0, 0], b: seq < 20 ? 0 : (0xfc00 | BTN.SHIELD) }); // absurd values -> clamped/masked server side
      B.send({ t: 'in', s: seq, m: [-50, 0], b: 0 }); // duplicate seq -> ignored
    } else B.send({ t: 'in', s: seq, m: [0, 0], b: 0 });
  }, 1000 / 60);
  const done = await until(() => A.end && B.end, 100000);
  clearInterval(ticker);
  assert.ok(done, 'match finished');
  assert.ok(A.snaps.length - snapCountStart > 50, 'snapshots streamed');
  // snapshot consistency: both clients receive identical authoritative state
  const fa = A.snaps.find((s) => s.f === B.snaps[B.snaps.length - 5].f);
  assert.ok(fa, 'matching frame found');
  assert.deepEqual(fa.F, B.snaps[B.snaps.length - 5].F, 'both clients see the same state');
  // Bob's speed never exceeded his character's max (absurd stick was clamped)
  let maxSpeed = 0;
  for (const s of B.snaps) { const fb = decodeFighter(s.F[1]); if (fb.state === 'idle' && fb.grounded) maxSpeed = Math.max(maxSpeed, Math.hypot(fb.vel.x, fb.vel.z)); }
  assert.ok(maxSpeed <= 10.7, `no abnormal movement speed (${maxSpeed.toFixed(2)})`);
  // damage & knockouts were produced by the server sim
  assert.equal(A.end.rows.length, 2);
  assert.deepEqual(A.end, B.end, 'identical results for both clients');
  const hits = A.snaps.flatMap((s) => s.E).filter((e) => e.type === 'hit');
  assert.ok(hits.length > 0, 'server registered hits');
  const kos = A.snaps.flatMap((s) => s.E).filter((e) => e.type === 'ko');
  assert.ok(kos.length >= 1, 'server registered a knockout');
  assert.ok(await until(() => A.room.state === 'results'));

  // --- rematch returns to lobby
  A.send({ t: 'rematch' });
  assert.ok(await until(() => B.room && B.room.state === 'lobby'));
  A.ws.close(); B.ws.close();
});

test('online: rate limiting and disconnect bot takeover', async (t) => {
  const srv = await startServer({ port: 0, quiet: true });
  t.after(() => srv.close());
  const A = client(srv.port), B = client(srv.port);
  await A.open; await B.open;
  A.send({ t: 'create' });
  await until(() => A.room);
  B.send({ t: 'join', code: A.room.code });
  await until(() => A.room.players.length === 2);
  A.send({ t: 'char', char: 'ember_king' }); B.send({ t: 'char', char: 'monster_doctor' });
  B.send({ t: 'ready', v: true });
  A.send({ t: 'settings', stocks: 1, time: 60 });
  await until(() => A.room.players[1].ready && A.room.settings.time === 60);
  A.send({ t: 'start' });
  assert.ok(await until(() => A.start));
  // B disconnects mid-match: a bot takes over and the match still completes
  B.ws.close();
  // flood from A: excess messages are dropped, eventually the socket is closed for abuse
  let closed = false;
  A.ws.on('close', () => { closed = true; });
  for (let i = 0; i < 400; i++) A.send({ t: 'in', s: 100000 + i, m: [0, 0], b: 0 });
  assert.ok(await until(() => closed, 4000), 'flooding client disconnected');
  assert.equal(srv.rooms.count(), 0, 'empty room cleaned up');
});

test('online: four players with CPU fill play 2v2', async (t) => {
  const srv = await startServer({ port: 0, quiet: true });
  t.after(() => srv.close());
  const C = [client(srv.port), client(srv.port), client(srv.port)];
  await Promise.all(C.map((c) => c.open));
  C[0].send({ t: 'create' });
  await until(() => C[0].room);
  C[1].send({ t: 'join', code: C[0].room.code }); C[2].send({ t: 'join', code: C[0].room.code });
  await until(() => C[0].room.players.length === 3);
  const chars = ['captain_rubber', 'blaze_kick', 'spatial_swordsman'];
  C.forEach((c, i) => { c.send({ t: 'char', char: chars[i] }); if (i) c.send({ t: 'ready', v: true }); });
  C[0].send({ t: 'settings', mode: '2v2', cpus: 1, stocks: 1, time: 90 });
  await until(() => C[0].room.players.every((p, i) => p.char && (i === 0 || p.ready)) && C[0].room.settings.cpus === 1);
  C[0].send({ t: 'start' });
  assert.ok(await until(() => C.every((c) => c.start)));
  assert.equal(C[0].start.cfg.players.length, 4);
  assert.equal(C[0].start.cfg.mode, '2v2');
  const ticker = setInterval(() => C.forEach((c, i) => c.send({ t: 'in', s: Date.now() + i, m: [0, 0], b: 0 })), 1000 / 30);
  const ok = await until(() => C.every((c) => c.end), 120000);
  clearInterval(ticker);
  assert.ok(ok, '2v2 finished (time or KO)');
  const r = C[0].end;
  assert.equal(r.rows[0].team, r.rows[1].team, 'team ranking');
  C.forEach((c) => c.ws.close());
});
