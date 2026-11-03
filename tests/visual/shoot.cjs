// Usage: node tests/visual/shoot.cjs <url> <out.png> [w h]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const [url, out, w, h] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +(w || 1600), height: +(h || 900) } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__done === true, null, { timeout: 120000 }).catch(() => errs.push('timeout'));
  await p.screenshot({ path: out });
  if (errs.length) console.log(errs.slice(0, 10).join('\n'));
  await b.close();
})();
