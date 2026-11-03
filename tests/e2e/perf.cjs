// Measures draw calls / triangles / JS frame cost for a 4-fighter match on each arena (renderer.info, autoReset off).
module.exports = async (p, shot) => {
  await p.waitForTimeout(1200);
  const res = await p.evaluate(async () => {
    const app = window.__gb.app, R = window.__gb.renderer;
    const out = {};
    for (const arena of ['pirate_haven', 'marine_fortress', 'sky_kingdom', 'volcanic_island']) {
      app.startLocalMatch({ arena, mode: 'ffa', stocks: 3, time: 0, players: ['captain_rubber', 'threeblade', 'tempest', 'monster_doctor'].map((c, i) => ({ char: c, cpu: i ? 7 : 0 })) }, { locals: [{ slot: 0, device: 'any' }], cpu: { 1: 7, 2: 7, 3: 7 }, onEnd() {} });
      app.advance(400);
      R.renderer.info.autoReset = false;
      R.renderer.info.reset();
      const t0 = performance.now();
      R.renderMatch(1 / 60, 1, app.match.world, {});
      const cpu = performance.now() - t0;
      const i = R.renderer.info;
      out[arena] = { calls: i.render.calls, tris: i.render.triangles, jsMs: +cpu.toFixed(1), geos: i.memory.geometries, tex: i.memory.textures };
      R.renderer.info.autoReset = true;
      let simT = performance.now(); app.advance(600); simT = (performance.now() - simT) / 600;
      out[arena].simMsPerFrame = +simT.toFixed(3);
      app.endMatch();
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
};
