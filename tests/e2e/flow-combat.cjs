// Deterministic combat showcase: steps the real sim via app.advance() and screenshots key moments
// (heavy attack, special, ultimate cinematic + impact). Usage: CHARS=a,b ARENA=x node tests/e2e/shot.cjs ... flow-combat.cjs
module.exports = async (p, shot) => {
  const chars = (process.env.CHARS || 'threeblade,blaze_kick').split(',');
  const arena = process.env.ARENA || 'volcanic_island';
  await p.waitForTimeout(1200);
  await p.evaluate(([chars, arena]) => {
    const app = window.__gb.app;
    app.startLocalMatch({ arena, mode: '1v1', stocks: 3, time: 0, players: [{ char: chars[0] }, { char: chars[1], cpu: 9 }] }, { locals: [{ slot: 0, device: 'any' }], cpu: { 1: 3 }, onEnd() {} });
    app.match.cpus.get(1).mode = 'stand';
    app.advance(185);
    const [a, b] = app.match.world.fighters;
    a.pos.x = -1.3; a.pos.z = 0.5; b.pos.x = 1.3; b.pos.z = 0.5; a.facing = Math.PI / 2; b.facing = -Math.PI / 2; b.pct = 70;
    app.advance(2);
  }, [chars, arena]);
  const adv = (n, b = 0, mx = 0, mz = 0) => p.evaluate(([n, b, mx, mz]) => window.__gb.app.advance(n, { mx, mz, b }), [n, b, mx, mz]);
  const B = { JUMP: 1, ATTACK: 2, HEAVY: 4, SP1: 8, SP2: 16, SP3: 32, ULT: 64 };
  await adv(1, B.HEAVY, 1, 0); await adv(12, 0); await p.waitForTimeout(250); await shot('heavy-windup');
  await adv(5, 0); await p.waitForTimeout(250); await shot('heavy-impact');
  await adv(25, 0); await p.waitForTimeout(250); await shot('launch');
  await p.evaluate(() => { const app = window.__gb.app; const [a, b] = app.match.world.fighters; b.pos.x = 3.5; b.pos.y = 0; b.pos.z = 0.5; b.vel.x = b.vel.y = b.vel.z = 0; b.kb.x = b.kb.y = b.kb.z = 0; b.setState('idle'); b.grounded = true; b.groundIdx = 0; a.cd = {}; a.facing = Math.PI / 2; app.advance(1); });
  await adv(1, B.SP1, 1, 0); await adv(10, 0); await p.waitForTimeout(250); await shot('special');
  await adv(30, 0);
  await p.evaluate(() => { const app = window.__gb.app; const [a, b] = app.match.world.fighters; a.ult = 100; a.pos.x = -1.6; a.pos.y = 0; a.pos.z = 0.5; a.setState('idle'); a.grounded = true; a.groundIdx = 0; a.vel.x = a.vel.y = a.vel.z = 0; a.facing = Math.PI / 2; b.pos.x = 1.8; b.pos.y = 0; b.pos.z = 0.5; b.setState('idle'); b.grounded = true; b.groundIdx = 0; b.vel.x = b.vel.y = b.vel.z = 0; b.kb.x = b.kb.y = b.kb.z = 0; b.pct = 110; app.advance(2); });
  await adv(1, B.ULT, 1, 0); await adv(14, 0); await p.waitForTimeout(400); await shot('ult-cinematic');
  const ultTotal = await p.evaluate(() => window.__gb.app.match.world.fighters[0].mdef ? window.__gb.app.match.world.fighters[0].mdef.total : 60);
  await adv(Math.floor(ultTotal * 0.45), 0); await p.waitForTimeout(250); await shot('ult-mid');
  await adv(Math.floor(ultTotal * 0.25), 0); await p.waitForTimeout(250); await shot('ult-late');
  await adv(20, 0); await p.waitForTimeout(250); await shot('ult-after');
  const st = await p.evaluate(() => { const w = window.__gb.app.match.world; const r = window.__gb.renderer.renderer.info.render; return { calls: r.calls, tris: r.triangles, f: w.fighters.map((f) => [f.charId, f.state, Math.round(f.pct), f.stocks]) }; });
  console.log(JSON.stringify(st));
};
