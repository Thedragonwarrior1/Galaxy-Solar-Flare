// Menu flow -> FFA match vs 3 CPUs on Pirate Haven, with keyboard input.
module.exports = async (p, shot) => {
  const click = async (text) => { const el = p.getByText(text, { exact: false }).first(); await el.click(); await p.waitForTimeout(500); };
  await p.waitForTimeout(1500);
  await click('Play');
  await shot('modes');
  await click('Free for All');
  await shot('setup');
  await click('CHOOSE FIGHTERS');
  await p.waitForTimeout(1200);
  await p.locator('.cs-tile').nth(0).hover();
  await p.waitForTimeout(600);
  await shot('select-hover');
  await p.locator('.cs-tile').nth(0).click();
  await p.waitForTimeout(1500);
  await shot('select-picked');
  await click('CHOOSE ARENA');
  await p.waitForTimeout(1500);
  await shot('arena');
  await p.locator('.arena-card').nth(0).click();
  await p.waitForTimeout(1200);
  await shot('countdown');
  await p.waitForTimeout(2600);
  // move toward centre and attack
  await p.keyboard.down('KeyD');
  await p.waitForTimeout(900);
  await p.keyboard.up('KeyD');
  for (let i = 0; i < 6; i++) { await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up(); await p.waitForTimeout(150); }
  await shot('fight1');
  await p.keyboard.press('Space');
  await p.waitForTimeout(200);
  await p.keyboard.press('KeyQ');
  await p.waitForTimeout(400);
  await shot('fight2');
  await p.waitForTimeout(6000);
  await shot('fight3');
  const st = await p.evaluate(() => { const w = window.__gb.app.match && window.__gb.app.match.world; return w ? { frame: w.frame, phase: w.phase, f: w.fighters.map((f) => [f.charId, f.state, Math.round(f.pct), f.stocks]) , fps: window.__gb.app.fps } : null; });
  console.log(JSON.stringify(st));
};
