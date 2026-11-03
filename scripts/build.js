// Build: bundles the browser client with esbuild and copies static files into dist/.
// Usage:
//   node scripts/build.js                 -> dist/ (production bundle)
//   node scripts/build.js --dev           -> unminified with sourcemaps
//   node scripts/build.js --entry a.js --out b.js   -> bundle an extra entry (test harnesses)
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const entryIdx = args.indexOf('--entry');
const outIdx = args.indexOf('--out');

async function main() {
  if (entryIdx >= 0) {
    const entry = resolve(args[entryIdx + 1]);
    const out = resolve(outIdx >= 0 ? args[outIdx + 1] : 'dist/harness.js');
    mkdirSync(dirname(out), { recursive: true });
    await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, sourcemap: true, target: 'es2020', logLevel: 'warning' });
    console.log('built', out);
    return;
  }
  const dist = resolve(root, 'dist');
  if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const t0 = Date.now();
  const result = await esbuild.build({
    entryPoints: [resolve(root, 'src/client/main.js')],
    bundle: true,
    format: 'esm',
    outfile: resolve(dist, 'game.js'),
    minify: !dev,
    sourcemap: dev,
    target: 'es2020',
    metafile: true,
    logLevel: 'warning',
    define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  });
  cpSync(resolve(root, 'public'), dist, { recursive: true });
  const bytes = Object.values(result.metafile.outputs).reduce((a, o) => a + o.bytes, 0);
  console.log(`GRAND BRAWL built to dist/ in ${Date.now() - t0}ms (${(bytes / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
