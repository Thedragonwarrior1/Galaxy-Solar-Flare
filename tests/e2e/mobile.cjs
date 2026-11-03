// Phone-sized touch device: menu layout + in-match touch controls driving the fighter.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ ...devices['iPhone 13 landscape'], deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { localStorage.setItem('grandbrawl.settings.v1', JSON.stringify({ quality: 'low', resolution: 0.5, music: 0, sfx: 0 })); });
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__gb, null, { timeout: 120000 });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: out + '/m-menu.png' });
  console.log('isTouch', await p.evaluate(() => window.__gb.app.isTouch));
  await p.locator('.menu-btn', { hasText: 'Training' }).tap();
  await p.waitForTimeout(600);
  await p.screenshot({ path: out + '/m-select.png' });
  await p.locator('.cs-tile').nth(0).tap();
  await p.getByText('CHOOSE ARENA').tap(); await p.waitForTimeout(600);
  await p.locator('.arena-card').nth(0).tap(); await p.waitForTimeout(600);
  await p.evaluate(() => window.__gb.app.advance(190));
  const visible = await p.evaluate(() => getComputedStyle(document.querySelector('.touch-controls')).display !== 'none');
  console.log('touch controls visible', visible);
  // hold the attack button and step the sim
  const btn = await p.locator('.tc-attack').boundingBox();
  await p.touchscreen.tap(btn.x + btn.width / 2, btn.y + btn.height / 2);
  const st = await p.evaluate(() => { window.__gb.app.manualStep = false; return null; });
  await p.waitForTimeout(1500);
  const moved = await p.evaluate(() => { const f = window.__gb.app.match.world.fighters[0]; return { state: f.state, last: f.lastMoveInfo && f.lastMoveInfo.key }; });
  console.log('after touch attack', JSON.stringify(moved));
  await p.screenshot({ path: out + '/m-match.png' });
  console.log(logs.join('\n') || 'no page errors');
  await b.close();
})();
