// Core combat simulation tests (node:test). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/shared/sim/world.js';
import { CpuController } from '../src/shared/sim/ai.js';
import { BTN, RULES, SHIELD } from '../src/shared/sim/constants.js';
import { computeKnockback } from '../src/shared/sim/knockback.js';
import { CHARACTER_IDS, CHARACTERS, ROSTER } from '../src/shared/characters/index.js';
import { ARENA_IDS, ARENAS } from '../src/shared/sim/arenas.js';

const N = { mx: 0, mz: 0, b: 0 };
function duel(a = 'captain_rubber', b = 'threeblade', extra = {}) {
  const w = new World({ arena: 'pirate_haven', mode: '1v1', stocks: 3, players: [{ char: a }, { char: b }], skipCountdown: true, ...extra });
  return w;
}
function place(w, f, x, y, z, facing = 0) { f.spawnAt([x, y, z], facing); w.settle(f); }
function run(w, n, inputs = []) { const ev = []; for (let i = 0; i < n; i++) { w.step(typeof inputs === 'function' ? inputs(i) : inputs); ev.push(...w.events); } return ev; }

test('roster: 8 fighters, all selectable, each with a unique full moveset', () => {
  assert.equal(ROSTER.length, 8);
  const required = ['jab1', 'dash', 'upHeavy', 'fwdHeavy', 'nair', 'fair', 'dair', 'sp1', 'sp2', 'sp3', 'ult'];
  const sigs = new Set();
  for (const c of ROSTER) {
    for (const k of required) assert.ok(c.moves[k], `${c.id} missing ${k}`);
    assert.ok(c.moves.ult.ult, `${c.id} ult flagged`);
    assert.ok(c.moves.ult.cinematic > 0 && c.moves.ult.cinematic <= 50, `${c.id} ult cinematic is short`);
    assert.ok(c.moves.ult.total <= 130, `${c.id} ult not excessively long`);
    sigs.add(required.map((k) => c.moves[k].name).join('|'));
    assert.ok(c.stats.weight > 0 && c.stats.runSpeed > 0);
  }
  assert.equal(sigs.size, 8, 'movesets are not recolours of each other');
  const speeds = new Set(ROSTER.map((c) => c.stats.runSpeed + ':' + c.stats.weight + ':' + c.stats.gravity));
  assert.equal(speeds.size, 8, 'each fighter has distinct movement characteristics');
});

test('knockback grows with percent and shrinks with weight', () => {
  const k0 = computeKnockback(10, 10, 100, 30, 100);
  const k1 = computeKnockback(100, 10, 100, 30, 100);
  const kHeavy = computeKnockback(100, 10, 130, 30, 100);
  assert.ok(k1 > k0 * 2, 'higher percent launches much further');
  assert.ok(kHeavy < k1, 'heavier fighters fly less');
});

test('hits add percent and launch further at high percent', () => {
  const dist = (pct) => {
    const w = duel('monster_doctor', 'tempest');
    const [A, D] = w.fighters;
    place(w, A, 0, 0, 0, 0); place(w, D, 0, 0, 1.2, Math.PI);
    D.pct = pct;
    A.startMove('fwdHeavy');
    let maxD = 0;
    for (let i = 0; i < 200; i++) { w.step([]); maxD = Math.max(maxD, Math.hypot(D.pos.x, D.pos.z - 1.2)); if (D.state === 'dead') { maxD = 99; break; } }
    return { maxD, pct: D.pct };
  };
  const lo = dist(0), hi = dist(110);
  assert.ok(lo.pct > 15, 'damage applied');
  assert.ok(hi.maxD > lo.maxD * 2.5, `high-percent launch (${hi.maxD.toFixed(1)}) >> low (${lo.maxD.toFixed(1)})`);
});

test('a single attack cannot register more than once on the same target', () => {
  const w = duel('threeblade', 'tempest');
  const [A, D] = w.fighters;
  place(w, A, 0, 0, 0, 0); place(w, D, 0, 0, 1.0, Math.PI);
  D.pinned = true;
  A.startMove('fwdHeavy'); // two blades (two hitboxes) both overlap the target
  const ev = run(w, 60);
  const hits = ev.filter((e) => e.type === 'hit' && e.t === 1);
  assert.equal(hits.length, 1, 'only one hit from a two-hitbox move');
});

test('multi-hit moves hit repeatedly only by design (rehit) and finish with a launcher', () => {
  const w = duel('captain_rubber', 'threeblade');
  const [A, D] = w.fighters;
  place(w, A, 0, 0, 0, 0); place(w, D, 0, 0, 1.4, Math.PI);
  A.startMove('sp2');
  const ev = run(w, 90);
  const hits = ev.filter((e) => e.type === 'hit' && e.t === 1);
  assert.ok(hits.length >= 6 && hits.length <= 14, `gatling multi-hit count ${hits.length}`);
  assert.ok(hits[hits.length - 1].kb > 40, 'finisher launches');
});

test('simultaneous attacks trade (both get hit) or clank, never one-sided by processing order', () => {
  const w = duel('ember_king', 'ember_king');
  const [A, B] = w.fighters;
  place(w, A, 0, 0, 0, 0); place(w, B, 0, 0, 2.6, Math.PI);
  A.startMove('jab3'); B.startMove('jab3');
  const ev = run(w, 40);
  const clank = ev.some((e) => e.type === 'clank');
  const hitA = ev.some((e) => e.type === 'hit' && e.t === 0), hitB = ev.some((e) => e.type === 'hit' && e.t === 1);
  assert.ok(clank || (hitA && hitB), 'symmetric outcome');
  assert.equal(hitA, hitB, 'outcome identical for both sides');
});

test('shield blocks damage; parry window punishes the attacker', () => {
  // block
  let w = duel('threeblade', 'captain_rubber');
  let [A, D] = w.fighters;
  place(w, A, 0, 0, 0, 0); place(w, D, 0, 0, 1.4, Math.PI);
  run(w, 10, [N, { mx: 0, mz: 0, b: BTN.SHIELD }]);
  assert.equal(D.state, 'shield');
  A.startMove('jab1');
  let ev = run(w, 30, [N, { mx: 0, mz: 0, b: BTN.SHIELD }]);
  assert.equal(D.pct, 0, 'no damage through shield');
  assert.ok(ev.some((e) => e.type === 'shieldHit'));
  assert.ok(D.shieldHP < SHIELD.MAX);
  // parry: raise shield right before the hit lands
  w = duel('threeblade', 'captain_rubber');
  [A, D] = w.fighters;
  place(w, A, 0, 0, 0, 0); place(w, D, 0, 0, 1.4, Math.PI);
  A.startMove('jab1'); // hitbox active from frame 5
  ev = run(w, 30, (i) => [N, i >= 2 ? { mx: 0, mz: 0, b: BTN.SHIELD } : N]);
  assert.ok(ev.some((e) => e.type === 'parry'), 'parry registered');
  assert.equal(D.pct, 0);
  assert.ok(ev.some(() => true) && (A.state === 'parried' || ev.some((e) => e.type === 'parry' && e.a === 0)));
});

test('ring-out removes a stock, credits the attacker, respawns with invulnerability', () => {
  const w = duel();
  const [A, D] = w.fighters;
  place(w, D, 0, 0, 0);
  D.lastHitBy = 0; D.lastHitFrame = w.frame;
  D.pos.x = 40; // beyond the blast zone
  const ev = run(w, 1);
  assert.ok(ev.some((e) => e.type === 'ko' && e.id === 1 && e.by === 0));
  assert.equal(D.stocks, RULES.DEFAULT_STOCKS - 1);
  assert.equal(A.stats.kos, 1);
  run(w, RULES.RESPAWN_DELAY + 2);
  assert.equal(D.state, 'respawn');
  assert.equal(D.pct, 0);
  assert.ok(D.intangible(), 'invulnerable on the respawn platform');
  run(w, 30, [N, { mx: 1, mz: 0, b: 0 }]);
  assert.equal(D.state === 'air' || D.state === 'idle' || D.state === 'land', true);
  assert.ok(D.invTimer > 0, 'post-respawn invulnerability');
});

test('falling below the stage is a ring-out (no getting stuck under the arena)', () => {
  for (const id of ARENA_IDS) {
    const w = new World({ arena: id, mode: '1v1', players: [{ char: 'tempest' }, { char: 'tempest' }], skipCountdown: true });
    const D = w.fighters[1];
    // start inside/under the main platform: anti-stuck must resolve it
    D.spawnAt([0, -1.5, 0], 0); D.setState('air');
    run(w, 5);
    assert.ok(D.pos.y >= -0.01 || D.pos.y < -1.5, `${id}: not left inside solid geometry`);
    D.spawnAt([ARENAS[id].blast.maxX - 2, -3, 0], 0); D.setState('air');
    const ev = run(w, 400);
    assert.ok(ev.some((e) => e.type === 'ko' && e.id === 1), `${id}: falling off-stage ends in a ring-out`);
  }
});

test('double jump, fast fall, landing and platform drop-through', () => {
  const w = new World({ arena: 'pirate_haven', mode: '1v1', players: [{ char: 'blaze_kick' }, { char: 'tempest' }], skipCountdown: true });
  const A = w.fighters[0];
  place(w, A, -6.5, 4.6, 0.5); // on the left soft platform
  assert.ok(A.grounded);
  run(w, 3, [{ mx: 0, mz: 0, b: BTN.DOWN }]);
  run(w, 20);
  assert.ok(!A.grounded || A.pos.y < 4.5, 'dropped through soft platform');
  run(w, 120);
  assert.ok(A.grounded && Math.abs(A.pos.y) < 1e-6, 'landed on main stage');
  // jumps: blaze kick has a triple jump
  run(w, 5, [{ mx: 0, mz: 0, b: BTN.JUMP }]);
  run(w, 12);
  const jumps = A.jumpsLeft;
  run(w, 2, [{ mx: 0, mz: 0, b: BTN.JUMP }]); run(w, 2);
  assert.equal(A.jumpsLeft, jumps - 1, 'double jump consumed');
  assert.equal(CHARACTERS.blaze_kick.stats.airJumps, 2);
});

test('recovery special can only be used once per airtime; specials obey cooldowns', () => {
  const w = duel('ember_king', 'tempest');
  const A = w.fighters[0];
  A.spawnAt([0, 12, 0], 0); A.setState('air');
  assert.ok(A.startMove('sp3'));
  run(w, 50);
  assert.equal(A.startMove('sp3'), false, 'no second recovery before landing');
  run(w, 200);
  assert.ok(A.grounded);
  A.setState('idle');
  assert.ok(A.startMove('sp1'));
  run(w, 40);
  A.setState('idle');
  assert.equal(A.startMove('sp1'), false, 'fireball on cooldown');
});

test('ledge grab and climb', () => {
  const w = duel('threeblade', 'tempest');
  const A = w.fighters[0];
  // fall just outside the right edge of the main dock
  A.spawnAt([12.4, 0.2, 0], -Math.PI / 2); A.setState('air');
  let grabbed = false;
  for (let i = 0; i < 60 && !grabbed; i++) { w.step([]); if (A.state === 'ledge') grabbed = true; }
  assert.ok(grabbed, 'grabbed ledge');
  assert.ok(A.intangible(), 'ledge intangibility');
  run(w, 10, [{ mx: -1, mz: 0, b: 0 }]);
  run(w, 30);
  assert.ok(A.grounded && A.pos.x < 12, 'climbed onto stage');
});

test('every move of every character connects with its hitboxes (alignment sanity)', () => {
  const misses = [];
  for (const id of CHARACTER_IDS) {
    const c = CHARACTERS[id];
    for (const key of ['jab1', 'dash', 'upHeavy', 'fwdHeavy', 'nair', 'fair', 'dair', 'sp1', 'sp2', 'sp3', 'ult']) {
      const m = c.moves[key];
      const hasHit = m.hb.length || m.events || m.tick;
      if (!hasHit) continue;
      if (id === 'spatial_swordsman' && (key === 'sp1' || key === 'sp3')) continue; // domain / teleport: no damage by design
      let hit = false;
      for (const dist of [0.9, 1.5, 2.5, 3.6, 5, 7, 9]) {
        for (const dy of key === 'upHeavy' ? [0, 1.8] : key === 'dair' ? [-1.6, 0] : [0]) {
          const w = new World({ arena: 'marine_fortress', mode: 'training', players: [{ char: id }, { char: 'monster_doctor' }], skipCountdown: true });
          const [A, D] = w.fighters;
          const air = m.kind === 'air';
          A.spawnAt([0, air ? 4 : 0, -3], 0); D.spawnAt([0, (air ? 4 : 0) + dy, -3 + dist], Math.PI);
          if (!air) { w.settle(A); } else A.setState('air');
          if (!air && !dy) w.settle(D); else D.setState('air');
          D.pinned = true; A.ult = 100;
          if (!A.startMove(key)) continue;
          for (let i = 0; i < 180 && !hit; i++) { w.step([]); if (w.events.some((e) => e.type === 'hit' && e.t === 1)) hit = true; }
          if (hit) break;
        }
        if (hit) break;
      }
      if (!hit) misses.push(`${id}.${key}`);
    }
  }
  assert.deepEqual(misses, []);
});

test('ultimates need a full meter, consume it, and freeze others briefly', () => {
  const w = duel('tempest', 'threeblade');
  const [A, B] = w.fighters;
  place(w, A, 0, 0, 0, 0); place(w, B, 0, 0, 5, Math.PI);
  A.ult = 50;
  assert.equal(A.startMove('ult'), false);
  A.ult = 100;
  assert.ok(A.startMove('ult'));
  assert.equal(A.ult, 0);
  assert.ok(w.cine);
  const bx = B.pos.x, bz = B.pos.z;
  run(w, 20, [N, { mx: 1, mz: 0, b: 0 }]);
  assert.equal(B.pos.x, bx, 'opponents frozen during the short cinematic');
  assert.equal(B.pos.z, bz);
  const ev = run(w, 120);
  assert.ok(ev.some((e) => e.type === 'hit' && e.t === 1), 'storm strikes the marked foe');
});

test('monster transformation makes Monster Doctor bigger, heavier and armored, then wears off', () => {
  const w = duel('monster_doctor', 'tempest');
  const A = w.fighters[0];
  place(w, A, 0, 0, 0);
  A.ult = 100;
  assert.ok(A.startMove('ult'));
  run(w, 80);
  assert.ok(A.transform > 0 && A.scale > 1.3 && A.weight > A.st.weight);
  run(w, 760);
  assert.equal(A.transform, 0);
  assert.equal(A.scale, 1);
});

test('full CPU matches finish cleanly on every arena and mode (FFA, 1v1, 2v2)', () => {
  const configs = [
    { mode: '1v1', players: [{ char: 'captain_rubber' }, { char: 'slingshot_sniper' }] },
    { mode: 'ffa', players: ROSTER.slice(0, 4).map((c) => ({ char: c.id })) },
    { mode: '2v2', players: ROSTER.slice(4, 8).map((c, i) => ({ char: c.id, team: i % 2 })) },
  ];
  ARENA_IDS.forEach((arena, ai) => {
    for (const cfg of configs) {
      const w = new World({ arena, stocks: 2, time: 240, hazards: ai % 2 === 0, seed: ai + 3, skipCountdown: true, ...cfg });
      const cpus = w.fighters.map((f) => new CpuController(w, f.id, 8, 'cpu', ai));
      let guard = 0;
      while (w.phase !== 'ended' && guard++ < 60 * 260) w.step(cpus.map((c) => c.think()));
      assert.equal(w.phase, 'ended', `${arena} ${cfg.mode} ended`);
      const res = w.results;
      assert.equal(res.rows.length, cfg.players.length);
      assert.equal(res.rows[0].place, 1);
      for (const f of w.fighters) assert.ok(Number.isFinite(f.pos.x + f.pos.y + f.pos.z), 'no NaN positions');
      if (cfg.mode === '2v2') assert.equal(res.rows[0].team, res.rows[1].team, 'winning team listed first');
    }
  });
});

test('friendly fire is off in 2v2 by default', () => {
  const w = new World({ arena: 'pirate_haven', mode: '2v2', players: [{ char: 'threeblade', team: 0 }, { char: 'tempest', team: 0 }, { char: 'tempest', team: 1 }, { char: 'tempest', team: 1 }], skipCountdown: true });
  const [A, T] = w.fighters;
  place(w, A, 0, 0, 0, 0); place(w, T, 0, 0, 1.2, Math.PI);
  A.startMove('fwdHeavy');
  run(w, 60);
  assert.equal(T.pct, 0);
});

test('time-out ranks by stocks, then percent', () => {
  const w = new World({ arena: 'pirate_haven', mode: 'ffa', time: 1, players: [{ char: 'tempest' }, { char: 'tempest' }, { char: 'tempest' }], skipCountdown: true });
  w.fighters[0].pct = 80; w.fighters[1].pct = 20; w.fighters[2].stocks = 1;
  run(w, 70);
  assert.ok(w.phase === 'ending' || w.phase === 'ended');
  assert.deepEqual(w.results.rows.map((r) => r.id), [1, 0, 2]);
});
