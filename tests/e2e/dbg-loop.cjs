module.exports = async (p, shot) => {
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const app = window.__gb.app;
    app.startLocalMatch({ arena: 'pirate_haven', mode: '1v1', stocks: 3, time: 0, players: [{ char: 'captain_rubber' }, { char: 'tempest', cpu: 3 }] }, { locals: [{ slot: 0, device: 'any' }], cpu: { 1: 3 }, onEnd() {} });
    window.__log = [];
    const orig = app.updateMatch.bind(app);
    app.updateMatch = (dt) => { const t0 = performance.now(); const f0 = app.match.world.frame; orig(dt); window.__log.push([dt.toFixed(3), app.match.world.frame - f0, (performance.now() - t0).toFixed(1)]); };
    const os = app.match.world.step.bind(app.match.world);
    window.__stepT = 0; window.__steps = 0;
    app.match.world.step = (i) => { const t0 = performance.now(); os(i); window.__stepT += performance.now() - t0; window.__steps++; };
  });
  await p.waitForTimeout(4000);
  console.log(JSON.stringify(await p.evaluate(() => ({ log: window.__log.slice(-15), n: window.__log.length, stepMs: window.__stepT / window.__steps, steps: window.__steps }))));
};
