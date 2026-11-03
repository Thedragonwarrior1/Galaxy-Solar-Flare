// Simulated standard-mapping gamepad: menu navigation with the D-pad/A, then in-match stick + buttons.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.addInitScript(() => {
    localStorage.setItem('grandbrawl.settings.v1', JSON.stringify({ quality: 'low', resolution: 0.5, music: 0, sfx: 0 }));
    const pad = { id: 'Virtual Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 0 };
    window.__pad = pad;
    window.__press = (i, v = true) => { pad.buttons[i] = { pressed: v, value: v ? 1 : 0 }; };
    navigator.getGamepads = () => [pad];
  });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__gb, null, { timeout: 120000 });
  await p.waitForTimeout(1000);
  const tapBtn = async (i) => { await p.evaluate((i) => window.__press(i, true), i); await p.waitForTimeout(700); await p.evaluate((i) => window.__press(i, false), i); await p.waitForTimeout(700); };
  // D-pad down x3 -> Training, A
  for (let k = 0; k < 3; k++) await tapBtn(13);
  const focused = await p.evaluate(() => document.querySelector('.menu-btn.focus')?.textContent);
  console.log('focused after 3x down:', focused);
  await tapBtn(0);
  await p.waitForTimeout(800);
  console.log('screen:', await p.evaluate(() => window.__gb.app.screenName));
  await tapBtn(0); // pick focused fighter
  await p.waitForTimeout(400);
  await p.getByText('CHOOSE ARENA').click();
  await p.waitForTimeout(500);
  await p.locator('.arena-card').nth(0).click();
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__gb.app.advance(190));
  // stick right + X (attack) through the real input path
  const r = await p.evaluate(() => {
    const app = window.__gb.app; const w = app.match.world; const f = w.fighters[0];
    const x0 = f.pos.x;
    window.__pad.axes[0] = 1;
    for (let i = 0; i < 30; i++) app.advance(1, app.input.frame('any', app.renderer.inputBasis()));
    const moved = f.pos.x - x0;
    window.__pad.axes[0] = 0;
    window.__press(2, true);
    app.advance(1, app.input.frame('any', app.renderer.inputBasis()));
    window.__press(2, false);
    app.advance(3, app.input.frame('any', app.renderer.inputBasis()));
    return { moved: +moved.toFixed(2), state: f.state, move: f.move };
  });
  console.log('in match:', JSON.stringify(r));
  console.log(r.moved > 1 && r.move === 'jab1' && /Training/.test(focused || '') ? 'GAMEPAD OK' : 'GAMEPAD FAIL', errs.join('; '));
  await b.close();
})();
