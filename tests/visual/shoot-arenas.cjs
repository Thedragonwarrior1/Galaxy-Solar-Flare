// Screenshot the arena harness with Playwright (SwiftShader WebGL2).
// Usage: node tests/visual/shoot-arenas.cjs <outDir> <shot>...   where shot = name:query  (e.g. ph_high:arena=pirate_haven&quality=high)
// Requires the repo served at http://localhost:8123 and the harness bundle built.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = process.argv[2];
  const shots = process.argv.slice(3);
  fs.mkdirSync(outDir, { recursive: true });
  const base = process.env.HARNESS_URL || 'http://localhost:8123/tests/visual/arena.html';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = [];
  for (const s of shots) {
    const i = s.indexOf(':');
    const name = s.slice(0, i);
    const query = s.slice(i + 1);
    const w = parseInt((query.match(/(?:^|&)w=(\d+)/) || [0, 1280])[1], 10);
    const h = parseInt((query.match(/(?:^|&)h=(\d+)/) || [0, 720])[1], 10);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    const t0 = Date.now();
    await page.goto(`${base}?${query}`);
    try {
      await page.waitForFunction(() => window.__done === true || window.__err, null, { timeout: 600000, polling: 500 });
    } catch (e) {
      logs.push('[timeout] ' + e.message);
    }
    const stats = await page.evaluate(() => window.__stats || null);
    const after = await page.evaluate(() => window.__afterDispose || window.__check || null);
    const file = path.join(outDir, name + '.png');
    await page.screenshot({ path: file });
    results.push({ name, file, secs: (Date.now() - t0) / 1000, stats, after, logs });
    console.log(JSON.stringify({ name, secs: (Date.now() - t0) / 1000, stats, after, logs: logs.slice(0, 12) }));
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'results-' + Date.now() + '.json'), JSON.stringify(results, null, 2));
})();
