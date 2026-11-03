module.exports = async (p, shot) => {
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const app = window.__gb.app; app.startLocalMatch({ arena: 'pirate_haven', mode: '1v1', stocks: 3, time: 0, players: [{ char: 'captain_rubber' }, { char: 'tempest', cpu: 3 }] }, { locals: [{ slot: 0, device: 'any' }], cpu: { 1: 3 }, onEnd() {} }); });
  const s = () => p.evaluate(() => { const m = window.__gb.app.match; const w = m.world; const f = w.fighters[0]; return { id: m.__id || (m.__id = Math.random()), frame: w.frame, el: w.elapsed, phase: w.phase, st: f.state, mv: f.move, b: f.b, ult: Math.round(f.ult), fps: Math.round(window.__gb.app.fps) }; });
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(1000); console.log(JSON.stringify(await s())); }
  await p.evaluate(() => { window.__gb.app.match.cpus.get(1).mode = 'stand'; window.__gb.app.match.world.fighters[0].ult = 100; });
  await p.keyboard.down('KeyF'); await p.waitForTimeout(300); await p.keyboard.up('KeyF');
  console.log('after F', JSON.stringify(await s()));
  await p.waitForTimeout(1500);
  console.log(JSON.stringify(await s()));
  await p.mouse.move(640, 360); await p.mouse.down({ button: 'right' }); await p.waitForTimeout(200); await p.mouse.up({ button: 'right' });
  console.log('after RMB', JSON.stringify(await s()));
  await p.keyboard.press('KeyQ');
  await p.waitForTimeout(50);
  console.log('after Q tap', JSON.stringify(await s()));
};
