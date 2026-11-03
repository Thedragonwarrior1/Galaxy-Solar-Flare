// Results/rematch/pause, training panel, tournament bracket, settings — via the real UI.
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
module.exports = async (p, shot) => {
  const click = async (sel, i = 0) => { await p.locator(sel).nth(i).click(); await p.waitForTimeout(400); };
  const text = async (t) => { await p.getByText(t, { exact: false }).first().click(); await p.waitForTimeout(400); };
  const adv = (n, input) => p.evaluate(([n, input]) => window.__gb.app.advance(n, input || { mx: 0, mz: 0, b: 0 }), [n, input]);
  await p.waitForTimeout(1200);
  // ---------- 1v1 to results
  await text('Play'); await text('Duel');
  await p.locator('.rule', { hasText: 'Stocks' }).locator('.seg button', { hasText: /^1$/ }).click();
  await p.waitForTimeout(200);
  await text('CHOOSE FIGHTERS');
  await click('.cs-tile', 6); // Monster Doctor
  await text('CHOOSE ARENA');
  await click('.arena-card', 1); // Marine Fortress
  await adv(200);
  await p.evaluate(() => { const w = window.__gb.app.match.world; const b = w.fighters[1]; b.pos.x = 40; });
  await adv(5);
  await p.waitForTimeout(400);
  await shot('game-set');
  await adv(120);
  await p.waitForTimeout(1500);
  assert(await p.locator('.res-table').count() === 1, 'results table shown');
  await shot('results');
  await text('REMATCH');
  await p.waitForTimeout(500);
  assert(await p.evaluate(() => !!window.__gb.app.match), 'rematch started');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  await shot('pause');
  await text('Quit to menu');
  await p.waitForTimeout(800);
  // ---------- training
  await text('Back');
  await p.waitForTimeout(500);
  await text('Main').catch(() => {});
  await p.evaluate(() => window.__gb.app.go('main'));
  await p.waitForTimeout(500);
  await text('Training');
  await click('.cs-tile', 4); // Ember King
  await text('CHOOSE ARENA');
  await click('.arena-card', 3); // Volcanic
  await adv(190);
  await p.locator('.train input[type=range]').evaluate((el) => { el.value = 120; el.dispatchEvent(new Event('input')); });
  await text('Show hitboxes');
  await p.evaluate(() => { const w = window.__gb.app.match.world; const [a, b] = w.fighters; a.pos.x = -1; a.pos.z = 0; b.pos.x = 1.2; b.pos.z = 0; a.facing = Math.PI / 2; });
  await adv(1, { mx: 1, mz: 0, b: 4 }); await adv(13);
  await p.waitForTimeout(400);
  await shot('training-hitboxes');
  const tr = await p.evaluate(() => { const w = window.__gb.app.match.world; return { dummyPct: Math.round(w.fighters[1].pct), fdata: document.querySelector('.fdata').textContent }; });
  console.log('training', JSON.stringify(tr));
  assert(tr.dummyPct > 120, 'dummy % slider + hit applied');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await text('Quit to menu'); await p.waitForTimeout(600);
  await p.evaluate(() => window.__gb.app.go('main'));
  // ---------- settings
  await text('Settings');
  await p.locator('.set', { hasText: 'Quality' }).locator('button', { hasText: 'Medium' }).click();
  await p.waitForTimeout(300);
  await shot('settings');
  const q = await p.evaluate(() => JSON.parse(localStorage.getItem('grandbrawl.settings.v1')).quality);
  assert(q === 'medium', 'settings persisted');
  await p.locator('.set', { hasText: 'Quality' }).locator('button', { hasText: 'Low' }).click();
  await text('Back');
  // ---------- tournament
  await p.waitForTimeout(500);
  await text('Tournament');
  await p.locator('.rule', { hasText: 'Stocks' }).locator('.seg button', { hasText: /^1$/ }).click();
  await text('CHOOSE FIGHTERS');
  await click('.cs-tile', 2); // Blaze Kick
  await text('TO THE BRACKET');
  await p.waitForTimeout(800);
  await shot('bracket-start');
  await text('FIGHT');
  await adv(190);
  await p.evaluate(() => { const w = window.__gb.app.match.world; w.fighters[1].pos.x = 40; });
  await adv(130);
  await p.waitForTimeout(2500);
  await shot('tournament-results');
  await text('BRACKET');
  await p.waitForTimeout(800);
  await shot('bracket-round2');
  const t = await p.evaluate(() => ({ round: window.__gb.app.tournament.round, results: window.__gb.app.tournament.results.length }));
  console.log('tournament', JSON.stringify(t));
  assert(t.round === 1 && t.results === 4, 'quarterfinals resolved (player + 3 simulated CPU matches)');
  console.log('MODES FLOW OK');
};
