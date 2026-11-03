// Runs all browser end-to-end flows against a freshly started server (serves dist/).
// Requires the pre-installed Playwright Chromium. Screenshots go to tests/e2e/out/.
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
const PORT = 8097;
const url = `http://127.0.0.1:${PORT}/`;
const flows = [
  { name: 'menu → FFA match (real UI, keyboard/mouse)', args: ['shot.cjs', url, out, 'flow-ffa.cjs'], env: { QUALITY: 'low' } },
  { name: 'results / rematch / pause / training / settings / tournament', args: ['shot.cjs', url, out, 'flow-modes.cjs', '1100', '620'], env: { QUALITY: 'low' }, expect: 'MODES FLOW OK' },
  { name: 'combat + ultimate (Threeblade vs Blaze Kick)', args: ['shot.cjs', url, out, 'flow-combat.cjs', '960', '540'], env: { QUALITY: 'medium', CHARS: 'threeblade,blaze_kick' } },
  { name: 'online: two browsers through the authoritative server', args: ['online-2p.cjs', url, out], expect: 'ONLINE 2P OK' },
  { name: 'phone landscape with touch controls', args: ['mobile.cjs', url, out], expect: 'after touch attack' },
];
(async () => {
  const srv = spawn(process.execPath, [path.join(root, 'server/server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  let failed = 0;
  for (const f of flows) {
    const t0 = Date.now();
    let txt = '';
    try { txt = execFileSync(process.execPath, [path.join(__dirname, f.args[0]), ...f.args.slice(1).map((a) => (a.endsWith('.cjs') ? path.join(__dirname, a) : a))], { env: { ...process.env, ...(f.env || {}) }, timeout: 300000, encoding: 'utf8' }); }
    catch (e) { txt = (e.stdout || '') + (e.stderr || '') + '\n' + e.message; }
    const bad = /pageerror|ASSERT|FAIL|step error|Error:/.test(txt) || (f.expect && !txt.includes(f.expect));
    if (bad) failed++;
    console.log(`${bad ? 'FAIL' : 'ok  '}  ${f.name}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (bad) console.log(txt.split('\n').filter((l) => !/GPU stall/.test(l)).slice(0, 12).map((l) => '      ' + l).join('\n'));
  }
  srv.kill();
  console.log(failed ? `${failed} flow(s) failed` : 'all e2e flows passed');
  process.exit(failed ? 1 : 0);
})();
