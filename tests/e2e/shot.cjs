// Usage: node tests/e2e/shot.cjs <url> <outdir> [script.js]  -- loads the game, optionally runs steps, screenshots.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const [url, out, stepsFile, w, hh] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: +(w || 1280), height: +(hh || 720) } });
  const logs = [];
  if (process.env.QUALITY) await p.addInitScript((q) => { try { localStorage.setItem('grandbrawl.settings.v1', JSON.stringify({ quality: q, resolution: q === 'low' ? 0.6 : 1, music: 0, sfx: 0 })); } catch (e) {} }, process.env.QUALITY);
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await p.goto(url);
  await p.waitForFunction(() => window.__gb, null, { timeout: 120000 }).catch(() => logs.push('boot timeout'));
  const steps = stepsFile ? require(require('path').resolve(stepsFile)) : async (p, shot) => { await p.waitForTimeout(3000); await shot('menu'); };
  let n = 0;
  const shot = async (name) => { await p.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
  try { await steps(p, shot); } catch (e) { logs.push('step error: ' + e.message); }
  console.log(logs.slice(0, 25).join('\n') || 'no console errors');
  await b.close();
})();
