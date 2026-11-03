// Two real browser clients play an online match through the authoritative server.
// Usage: node tests/e2e/online-2p.cjs <baseUrl> <outdir>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const mk = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript((n) => { localStorage.setItem('grandbrawl.settings.v1', JSON.stringify({ quality: 'low', resolution: 0.5, music: 0, sfx: 0, name: n })); }, name);
    const p = await ctx.newPage();
    p.logs = [];
    p.on('console', (m) => { if (m.type() === 'error') p.logs.push(m.text()); });
    p.on('pageerror', (e) => p.logs.push('pageerror ' + e.message));
    await p.goto(url);
    await p.waitForFunction(() => window.__gb, null, { timeout: 120000 });
    await p.waitForTimeout(800);
    return p;
  };
  const A = await mk('Alice'), B = await mk('Bob');
  try {
    await A.getByText('Online').first().click(); await A.waitForTimeout(500);
    await A.getByText('CREATE ROOM').click();
    await A.waitForSelector('.code', { timeout: 10000 });
    const code = (await A.locator('.code').textContent()).trim();
    console.log('room', code);
    await B.getByText('Online').first().click(); await B.waitForTimeout(500);
    await B.locator('input[placeholder="ROOM CODE"]').fill(code);
    await B.getByText('Join', { exact: true }).click();
    await B.waitForSelector('.code', { timeout: 10000 });
    await A.waitForFunction(() => document.querySelectorAll('.lobby-p').length === 2);
    await A.locator('.mini-grid button').nth(1).click(); // Threeblade
    await B.locator('.mini-grid button').nth(5).click(); // Tempest
    await A.waitForTimeout(400);
    await A.locator('.rule', { hasText: 'Stocks' }).locator('button', { hasText: /^1$/ }).click();
    await A.locator('.rule', { hasText: 'Arena' }).locator('button', { hasText: 'Sky Kingdom' }).click();
    await A.waitForTimeout(400);
    await B.getByText('READY', { exact: true }).click();
    await A.waitForTimeout(600);
    await A.screenshot({ path: out + '/online-lobby-host.png' });
    await B.screenshot({ path: out + '/online-lobby-guest.png' });
    await A.getByText('START MATCH').click();
    await A.waitForFunction(() => window.__gb.app.match && window.__gb.app.match.net, null, { timeout: 10000 });
    await B.waitForFunction(() => window.__gb.app.match && window.__gb.app.match.net, null, { timeout: 10000 });
    await A.waitForTimeout(5000);
    await A.screenshot({ path: out + '/online-match-host.png' });
    await B.screenshot({ path: out + '/online-match-guest.png' });
    const sa = await A.evaluate(() => window.__gb.app.match.view.fighters.map((f) => f.charId + ':' + f.stocks));
    const sb = await B.evaluate(() => window.__gb.app.match.view.fighters.map((f) => f.charId + ':' + f.stocks));
    console.log('host view', sa, 'guest view', sb);
    assert(JSON.stringify(sa) === JSON.stringify(sb), 'both clients see the same fighters');
    // Bob runs off the stage to lose his only stock -> server decides the result
    await B.keyboard.down('KeyA');
    await B.keyboard.down('KeyS');
    await A.waitForFunction(() => document.querySelector('.res-table'), null, { timeout: 90000 });
    await B.keyboard.up('KeyA'); await B.keyboard.up('KeyS');
    await B.waitForFunction(() => document.querySelector('.res-table'), null, { timeout: 30000 });
    await A.waitForTimeout(800);
    await A.screenshot({ path: out + '/online-results-host.png' });
    const wa = await A.locator('.res-win .w2').textContent(), wb = await B.locator('.res-win .w2').textContent();
    console.log('winner host:', wa, 'guest:', wb);
    assert(wa === wb && /THREEBLADE/.test(wa), 'server-decided winner identical on both clients');
    console.log('ONLINE 2P OK');
  } catch (e) { console.log('FAIL', e.message); }
  console.log('errors A', A.logs.slice(0, 5), 'errors B', B.logs.slice(0, 5));
  await b.close();
})();
