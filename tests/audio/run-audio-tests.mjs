// Headless-Chromium test runner for the procedural audio system.
// Usage: node tests/audio/run-audio-tests.mjs [--wav <dir>] [--only sfx,music,ambience,engine] [--no-build]
// Builds tests/audio/audio-harness.js, serves the repo over http, drives the harness with Playwright,
// prints a summary, writes tests/audio/out/report.json and exits non-zero on any failure.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'tests/audio/out');
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const wavDir = argVal('--wav');
const only = (argVal('--only') || 'sfx,music,ambience,engine').split(',');
const port = +(process.env.AUDIO_TEST_PORT || 8124);

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* try next */ }
  }
  throw new Error('playwright not found');
}

if (!args.includes('--no-build')) {
  const r = spawnSync(process.execPath, ['scripts/build.js', '--entry', 'tests/audio/audio-harness.js', '--out', 'tests/audio/out/audio-harness.js'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.map': 'application/json', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const consoleErrors = [];
const warnings = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/tests/audio/audio-harness.html`);
await page.waitForFunction(() => !!window.audioTests, null, { timeout: 15000 });

const report = {};
let failures = [];
const run = async (key, fn, arg) => {
  const t0 = Date.now();
  const r = await page.evaluate(([f, a]) => window.audioTests[f](a), [fn, arg]);
  r.wallMs = Date.now() - t0;
  report[key] = r;
  failures = failures.concat((r.failures || []).map((f) => `[${key}] ${f}`));
  return r;
};

const pad = (s, n) => String(s).padEnd(n);
if (only.includes('sfx')) {
  const r = await run('sfx', 'sfxTests', { sampleRate: 48000 });
  console.log('\n=== SFX bank (%d sounds @ %d Hz) ===', Object.keys(r.sounds).length, r.sampleRate);
  console.log('timing:', JSON.stringify(r.timing), 'deterministic:', r.deterministic);
  console.log(pad('name', 18), pad('dur', 6), pad('ch', 3), pad('peak', 6), pad('rms', 6), pad('loudDb', 7), pad('centroid', 9), pad('low<200', 8), pad('hi>4k', 7), 'flatness');
  for (const [n, s] of Object.entries(r.sounds)) console.log(pad(n, 18), pad(s.dur, 6), pad(s.ch, 3), pad(s.peak, 6), pad(s.rms, 6), pad(s.loudDb, 7), pad(s.centroid, 9), pad(s.lowRatio, 8), pad(s.highRatio, 7), s.flat);
  console.log('loudness median %s dB; outliers (>6 dB from median, full-level sounds):', r.loudnessMedianDb, r.outliers.length ? r.outliers : 'none');
  console.log('peak-limited >4 dB below their loudness target:', r.peakLimited.length ? r.peakLimited : 'none');
  console.log('very similar pairs:', r.similar.length ? r.similar : 'none');
  if (!r.deterministic) failures.push(`[sfx] renders are not deterministic (max diff ${r.determinismMaxDiff})`);
  for (const o of r.outliers) failures.push(`[sfx] loudness outlier ${o}`);
}
if (only.includes('music')) {
  const r = await run('music', 'musicTests', { seconds: 14 });
  console.log('\n=== Music (14 s offline renders + loop-point renders) ===');
  for (const [id, t] of Object.entries(r.tracks)) console.log(pad(id, 16), JSON.stringify(t));
}
if (only.includes('ambience')) {
  const r = await run('ambience', 'ambienceTests', { seconds: 14 });
  console.log('\n=== Ambience (14 s offline renders) ===');
  for (const [id, t] of Object.entries(r.beds)) console.log(pad(id, 10), JSON.stringify(t));
}
if (only.includes('engine')) {
  const r = await run('engine', 'engineTests');
  console.log('\n=== Real-time AudioEngine ===');
  console.log('unlock->ready %d ms (eager prep %d ms); full bank rendered in background %d ms after unlock (while music/ambience/tests ran); stats %s', r.unlockToReadyMs, r.prepTimeMs, r.backgroundBankMs, JSON.stringify(r.stats));
  for (const c of r.checks) console.log(c.pass ? '  ok  ' : '  FAIL', c.name, c.info !== undefined ? JSON.stringify(c.info) : '');
  const unknownWarns = warnings.filter((w) => w.includes("unknown sfx 'nope_not_a_sound'")).length;
  console.log('  unknown-name warnings (expect 1):', unknownWarns);
  if (unknownWarns !== 1) failures.push(`[engine] expected exactly one warning for an unknown sfx name, got ${unknownWarns}`);
}

if (wavDir) {
  const names = ['thunder', 'parry', 'hit_deadly', 'ko_blast', 'victory_fanfare', 'game_set', 'ult_rubber', 'ult_tempest', 'monster_roar', 'sling_twang', 'shield_break', 'crowd_cheer', 'gatling', 'rubber_boing', 'domain_open'];
  const wavs = await page.evaluate(([n, m, a]) => window.audioTests.exportWavs(n, { music: m, ambience: a }), [names, ['menu', 'pirate_haven', 'volcanic_island'], ['ocean', 'volcano']]);
  await mkdir(wavDir, { recursive: true });
  for (const [f, b64] of Object.entries(wavs)) await writeFile(join(wavDir, f), Buffer.from(b64, 'base64'));
  console.log(`\nwrote ${Object.keys(wavs).length} WAVs to ${wavDir}`);
}

report.consoleErrors = consoleErrors;
if (consoleErrors.length) failures.push(...consoleErrors.map((e) => `[console] ${e}`));
report.failures = failures;
if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} FAILURE(S):\n  ${failures.join('\n  ')}` : '\nALL AUDIO TESTS PASSED');
process.exit(failures.length ? 1 : 0);
