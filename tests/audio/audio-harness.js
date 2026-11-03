// GRAND BRAWL audio test harness (runs in a real browser; bundled by scripts/build.js).
// Exposes window.audioTests used by tests/audio/run-audio-tests.mjs (Playwright), and a small
// manual audition UI.
import {
  AudioEngine, audio, SFX_NAMES, MUSIC_TRACKS, AMBIENCE_IDS, EAGER_SFX, isUiSound,
  renderSfx, renderSfxBatch, renderSfxMany, renderMusicOffline, renderAmbienceOffline, trackInfo,
} from '../../src/client/audio/audio.js';
import { createSimAudio } from '../../src/client/audio/simEvents.js';
import { analyseBuffer } from '../../src/client/audio/synth.js';
import { SFX, TARGET_LOUDNESS } from '../../src/client/audio/sfx.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r3 = (x) => Math.round(x * 1000) / 1000;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);

// ---------------------------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------------------------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function mono(buf) {
  const n = buf.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels;
  }
  return out;
}

/** Average power spectrum -> centroid, low/high energy ratios and 24 log bands (for similarity). */
function spectrum(buf) {
  const x = mono(buf);
  const N = 2048, hop = 1024, sr = buf.sampleRate;
  const pow = new Float64Array(N / 2);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  let frames = 0;
  for (let s = 0; s + N <= Math.max(N, x.length); s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[s + i] || 0) * win[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
    if (s + N >= x.length) break;
  }
  let tot = 0, cen = 0, low = 0, high = 0;
  const bands = new Float64Array(24);
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    tot += pow[k]; cen += f * pow[k];
    if (f < 200) low += pow[k];
    if (f > 4000) high += pow[k];
    const b = Math.min(23, Math.max(0, Math.floor((Math.log2(f / 40)) * 2.4)));
    bands[b] += pow[k];
  }
  const lb = Array.from(bands, (v) => Math.log10(v / (tot || 1) + 1e-9));
  // spectral flatness (geometric / arithmetic mean of power, 100 Hz..10 kHz): ~0 tonal, ~1 noise-like
  let lg = 0, ar = 0, cnt = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    if (f < 100 || f > 10000) continue;
    lg += Math.log(pow[k] + 1e-20); ar += pow[k]; cnt++;
  }
  const flatness = Math.exp(lg / cnt) / (ar / cnt + 1e-20);
  return { centroid: Math.round(cen / (tot || 1)), lowRatio: r3(low / (tot || 1)), highRatio: r3(high / (tot || 1)), flatness: r3(flatness), bands: lb, frames };
}

/** amplitude envelope (20 ms RMS) — used for similarity + loop checks */
function envelope(x, sr, winSec = 0.02) {
  const w = Math.max(1, Math.floor(sr * winSec));
  const out = [];
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0;
    for (let j = 0; j < w; j++) s += x[i + j] * x[i + j];
    out.push(Math.sqrt(s / w));
  }
  return out;
}

/** High-frequency "click" energy: RMS of the 2nd difference in 2 ms windows. */
function clickProfile(x, sr) {
  const w = Math.max(8, Math.floor(sr * 0.002));
  const out = [];
  for (let i = 2; i + w <= x.length; i += w) {
    let s = 0;
    for (let j = 0; j < w; j++) { const d = x[i + j] - 2 * x[i + j - 1] + x[i + j - 2]; s += d * d; }
    out.push(Math.sqrt(s / w));
  }
  return out;
}

function cosine(a, b) {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return ab / Math.sqrt(aa * bb + 1e-12);
}

function wavBase64(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const bytes = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(bytes);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { v.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 32767, true); o += 2; }
  let s = '';
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------
async function sfxTests({ sampleRate = 48000 } = {}) {
  const res = { sampleRate, timing: {}, sounds: {}, failures: [], outliers: [], similar: [] };
  // 1) eager unlock-time preparation, exactly as the engine does it (one context per sound, in parallel)
  let t0 = performance.now();
  await renderSfxMany(EAGER_SFX, sampleRate, { concurrency: EAGER_SFX.length });
  res.timing.eagerMs = Math.round(performance.now() - t0);
  res.timing.eagerCount = EAGER_SFX.length;
  // 2) whole bank, all in parallel
  t0 = performance.now();
  const all = await renderSfxMany(SFX_NAMES, sampleRate, { concurrency: SFX_NAMES.length });
  res.timing.fullBankParallelMs = Math.round(performance.now() - t0);
  // 3) whole bank, 2 at a time (the engine's background pace, minus its 30 ms yields)
  t0 = performance.now();
  await renderSfxMany(SFX_NAMES, sampleRate, { concurrency: 2 });
  res.timing.fullBankTwoAtATimeMs = Math.round(performance.now() - t0);
  // 4) the old single-context batching strategy, for comparison (small batch only: it is O(n^2))
  t0 = performance.now();
  await renderSfxBatch(EAGER_SFX, sampleRate);
  res.timing.eagerOneBatchMs = Math.round(performance.now() - t0);
  // 5) slowest single sounds rendered alone (lazy first-use latency)
  const singles = [];
  for (const n of ['ult_spatial', 'crowd_cheer', 'ult_threeblade', 'hit_light', 'victory_fanfare']) {
    t0 = performance.now();
    await renderSfx(n, sampleRate);
    singles.push([n, Math.round(performance.now() - t0)]);
  }
  res.timing.singleMs = Object.fromEntries(singles);
  // 6) determinism: same render twice is identical (to float rounding: SIMD/summation order may differ by 1 ulp)
  let maxDiff = 0, sameLen = true;
  for (const n of ['hit_heavy', 'thunder', 'crowd_cheer']) {
    const a = await renderSfx(n, sampleRate), b = await renderSfx(n, sampleRate);
    if (a.length !== b.length) { sameLen = false; continue; }
    for (let c = 0; c < a.numberOfChannels; c++) {
      const x = a.getChannelData(c), y = b.getChannelData(c);
      for (let i = 0; i < x.length; i++) maxDiff = Math.max(maxDiff, Math.abs(x[i] - y[i]));
    }
  }
  res.deterministic = sameLen && maxDiff < 1e-5;
  res.determinismMaxDiff = maxDiff;

  const louds = [];
  for (const name of SFX_NAMES) {
    const buf = all[name];
    if (!buf) { res.failures.push(`${name}: not rendered`); continue; }
    const an = analyseBuffer(buf);
    const sp = spectrum(buf);
    const env = envelope(mono(buf), buf.sampleRate);
    const s = {
      dur: r3(an.duration), ch: buf.numberOfChannels, peak: r3(an.peak), rms: r3(an.rms), loud: r3(an.loud),
      loudDb: Math.round(db(an.loud) * 10) / 10, centroid: sp.centroid, lowRatio: sp.lowRatio, highRatio: sp.highRatio, flat: sp.flatness, ui: isUiSound(name),
    };
    res.sounds[name] = s;
    s._bands = sp.bands;
    s._env = env;
    if (!(an.duration > 0)) res.failures.push(`${name}: zero duration`);
    if (an.nan) res.failures.push(`${name}: NaN samples`);
    if (!(an.peak > 0.05 && an.peak <= 0.95)) res.failures.push(`${name}: peak ${an.peak.toFixed(4)} outside (0.05, 0.95]`);
    louds.push(s.loudDb);
  }
  // loudness: (a) raw outliers vs the median among full-level sounds (level >= 0.5; run_step etc. are
  // deliberately quiet), (b) sounds whose normaliser could not reach its own target because of the peak limit
  const sorted = [...louds].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  res.loudnessMedianDb = median;
  res.peakLimited = [];
  for (const [n, s] of Object.entries(res.sounds)) {
    const level = SFX[n].level;
    if (level >= 0.5 && Math.abs(s.loudDb - median) > 6) res.outliers.push(`${n}: ${s.loudDb} dB (median ${median} dB)`);
    const target = db(TARGET_LOUDNESS * level);
    if (target - s.loudDb > 4) res.peakLimited.push(`${n}: ${s.loudDb} dB vs target ${target.toFixed(1)} dB`);
  }
  // distinctness: spectral-band + envelope similarity between all pairs
  const names = Object.keys(res.sounds);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const A = res.sounds[names[i]], B = res.sounds[names[j]];
      const spec = cosine(A._bands.map((v) => v + 9), B._bands.map((v) => v + 9));
      const L = Math.min(A._env.length, B._env.length, 100);
      const envSim = L > 2 ? cosine(A._env.slice(0, L), B._env.slice(0, L)) : 0;
      const durSim = Math.min(A.dur, B.dur) / Math.max(A.dur, B.dur);
      const flatSim = 1 - Math.min(1, Math.abs(Math.log10((A.flat + 1e-4) / (B.flat + 1e-4))));
      const sim = spec * 0.4 + envSim * 0.25 + durSim * 0.15 + flatSim * 0.2;
      if (sim > 0.985) res.similar.push(`${names[i]} ~ ${names[j]} (${sim.toFixed(3)})`);
    }
  }
  for (const s of Object.values(res.sounds)) { delete s._bands; delete s._env; }
  return res;
}

async function musicTests({ seconds = 14, sampleRate = 44100 } = {}) {
  const res = { tracks: {}, failures: [] };
  for (const id of MUSIC_TRACKS) {
    const info = trackInfo(id);
    let t0 = performance.now();
    const buf = await renderMusicOffline(id, seconds, { sampleRate });
    const ms = Math.round(performance.now() - t0);
    const an = analyseBuffer(buf);
    const sp = spectrum(buf);
    // silence gaps: any 0.5 s window with RMS < 1% of overall RMS (after the first 0.3 s)
    const env = envelope(mono(buf), sampleRate, 0.5);
    const minWin = Math.min(...env.slice(1));
    // loop point: start a few bars before the end of the form, so the wrap happens ~5 s in
    const barSec = info.secondsPerBar;
    const k = Math.max(1, Math.ceil(5 / barSec));
    const startBar = info.bars - k;
    const loopAt = 0.02 + k * barSec;
    const lbuf = await renderMusicOffline(id, loopAt + 5, { sampleRate, startBar });
    const lx = mono(lbuf);
    // loop seam continuity: the seam's transient ("click") energy vs. the SAME downbeat rendered from a
    // fresh start at the loop bar. A wrap glitch would stand out; musical transients/tails would not.
    const fresh = mono(await renderMusicOffline(id, 2, { sampleRate, startBar: info.loopStartBar }));
    const win = (x, at) => { const c = clickProfile(x.subarray(Math.max(0, Math.floor((at - 0.02) * sampleRate)), Math.floor((at + 0.05) * sampleRate)), sampleRate); return Math.max(...c); };
    const maxAround = win(lx, loopAt);
    const freshMax = win(fresh, 0.02);
    const lenv = envelope(lx, sampleRate, 0.5);
    const li = Math.floor(loopAt / 0.5);
    const before = lenv.slice(Math.max(0, li - 4), li), after = lenv.slice(li, li + 4);
    const avg = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const la = analyseBuffer(lbuf);
    const t = {
      bpm: info.bpm, bars: info.bars, loopBars: info.bars - info.loopStartBar, loopSec: r3(info.loopSeconds), sections: info.sections.join(' '),
      renderMs: ms, peak: r3(Math.max(an.peak, la.peak)), rms: r3(an.rms), rmsDb: Math.round(db(an.rms) * 10) / 10, centroid: sp.centroid,
      lowRatio: sp.lowRatio, minHalfSecRms: r3(minWin), loopClickRatio: r3(maxAround / (freshMax || 1e-9)),
      loopLevelBeforeAfter: [r3(avg(before)), r3(avg(after))],
    };
    res.tracks[id] = t;
    if (an.nan || la.nan) res.failures.push(`${id}: NaN`);
    if (!(an.rms > 0.01)) res.failures.push(`${id}: (near) silent rms ${an.rms}`);
    if (!(t.peak <= 1)) res.failures.push(`${id}: clipping peak ${t.peak}`);
    if (minWin < an.rms * 0.05) res.failures.push(`${id}: silence gap (min 0.5 s rms ${minWin})`);
    if (t.loopClickRatio > 1.5) res.failures.push(`${id}: possible click at loop point (ratio ${t.loopClickRatio})`);
    if (avg(after) < avg(before) * 0.3) res.failures.push(`${id}: level drop after loop point`);
  }
  return res;
}

async function ambienceTests({ seconds = 14, sampleRate = 44100 } = {}) {
  const res = { beds: {}, failures: [] };
  for (const id of AMBIENCE_IDS) {
    const t0 = performance.now();
    const buf = await renderAmbienceOffline(id, seconds, { sampleRate });
    const an = analyseBuffer(buf);
    const sp = spectrum(buf);
    const env = envelope(mono(buf), sampleRate, 1);
    const cl = clickProfile(mono(buf), sampleRate);
    const sortedC = [...cl].sort((x, y) => x - y);
    res.beds[id] = {
      renderMs: Math.round(performance.now() - t0), peak: r3(an.peak), rms: r3(an.rms), rmsDb: Math.round(db(an.rms) * 10) / 10,
      centroid: sp.centroid, lowRatio: sp.lowRatio, highRatio: sp.highRatio,
      rmsPerSec: env.map(r3), clickMaxOverP99: r3(sortedC[sortedC.length - 1] / (sortedC[Math.floor(sortedC.length * 0.99)] || 1e-9)),
    };
    if (an.nan) res.failures.push(`${id}: NaN`);
    if (!(an.rms > 0.005)) res.failures.push(`${id}: silent`);
    if (!(an.peak <= 1)) res.failures.push(`${id}: clipping ${an.peak}`);
    if (Math.min(...env.slice(1)) < an.rms * 0.15) res.failures.push(`${id}: dropout`);
  }
  return res;
}

/** Measures the RMS of a node's output over `ms` using an AnalyserNode. */
async function measure(ctx, node, ms) {
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  node.connect(an);
  const buf = new Float32Array(an.fftSize);
  let sum = 0, n = 0, peak = 0;
  const end = performance.now() + ms;
  while (performance.now() < end) {
    an.getFloatTimeDomainData(buf);
    for (const v of buf) { sum += v * v; n++; peak = Math.max(peak, Math.abs(v)); }
    await sleep(20);
  }
  node.disconnect(an);
  return { rms: Math.sqrt(sum / Math.max(1, n)), peak };
}

async function engineTests() {
  const res = { checks: [], failures: [] };
  const ok = (name, cond, info) => { res.checks.push({ name, pass: !!cond, info }); if (!cond) res.failures.push(`${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`); };

  // before unlock: everything is a silent no-op
  const fresh = new AudioEngine();
  ok('play before unlock returns null', fresh.play('hit_light') === null);
  fresh.playMusic('menu'); fresh.setAmbience('ocean'); fresh.duck(); fresh.setVolumes({ music: 0.3 }); fresh.stopMusic();
  ok('not ready before unlock', fresh.ready === false);

  const e = audio;
  const t0 = performance.now();
  const p = e.unlock();
  e.unlock(); // repeated calls are safe
  const readyResult = await p;
  res.unlockToReadyMs = Math.round(performance.now() - t0);
  res.prepTimeMs = Math.round(e.prepTimeMs);
  ok('unlock resolves ready', readyResult === true && e.ready === true, { state: e.ctx.state });
  ok('context running', e.ctx.state === 'running', e.ctx.state);
  ok('eager bank prepared', EAGER_SFX.every((n) => e._bank.has(n)), e._bank.size);
  ok('eager prep < 1500 ms', e.prepTimeMs < 1500, Math.round(e.prepTimeMs));
  const ctx = e.ctx;

  // sfx playback reaches the output
  const h = e.play('hit_heavy', { vol: 1, pan: -0.5 });
  ok('play returns handle', h && typeof h.stop === 'function');
  const m1 = await measure(ctx, e.limiter, 250);
  ok('sfx audible at output', m1.rms > 0.005, m1);
  e.play('nope_not_a_sound');
  e.play('nope_not_a_sound');
  // lazily rendered sound (not in eager set) plays shortly after first request
  const lazyName = SFX_NAMES.find((n) => !e._bank.has(n) && !e._pending.has(n));
  if (lazyName) {
    const tl = performance.now();
    e.play(lazyName);
    while (!e._bank.has(lazyName) && performance.now() - tl < 2000) await sleep(10);
    const lat = Math.round(performance.now() - tl);
    ok(`lazy render of ${lazyName} on first play()`, e._bank.has(lazyName), { latencyMs: lat });
    ok('late lazy sound still started (within 25% of its length)', e._voices.some((v) => v.name === lazyName) || lat > (SFX[lazyName].dur * 250), { latencyMs: lat });
  }
  // voice limiting
  for (let i = 0; i < 20; i++) e.play('hit_light');
  ok('per-name voice cap (<=6)', (e._byName.get('hit_light') || []).length <= 6, (e._byName.get('hit_light') || []).length);
  for (const n of EAGER_SFX) for (let i = 0; i < 3; i++) e.play(n);
  ok('total voice cap (<=40)', e._voices.length <= 40, e._voices.length);
  await sleep(800);
  ok('voices are released when finished', e._voices.length < 40, e._voices.length);

  // music
  e.playMusic('menu');
  await sleep(1500);
  const mm = await measure(ctx, e.musicBus, 700);
  ok('music audible', mm.rms > 0.01, mm);
  ok('musicTrack = menu', e.musicTrack === 'menu');
  const seqBefore = e._music.seq;
  e.playMusic('menu');
  ok('same track again is a no-op', e._music.seq === seqBefore);
  e.playMusic('pirate_haven');
  await sleep(400);
  ok('crossfade keeps old track fading', e._oldMusic.length >= 1 && e.musicTrack === 'pirate_haven', e._oldMusic.length);
  await sleep(1200);
  const mx = await measure(ctx, e.musicBus, 600);
  ok('new track audible after crossfade', mx.rms > 0.01, mx);
  e.playMusic('nope');

  // ducking
  const pre = await measure(ctx, e.musicBus, 500);
  e.duck(0.8, 1.2);
  await sleep(150);
  const during = await measure(ctx, e.musicBus, 600);
  ok('duck lowers music', during.rms < pre.rms * 0.5, { pre: r3(pre.rms), during: r3(during.rms) });
  await sleep(1400);
  const post = await measure(ctx, e.musicBus, 500);
  ok('duck recovers', post.rms > during.rms * 1.5, { during: r3(during.rms), post: r3(post.rms) });

  // ambience
  e.setAmbience('ocean');
  await sleep(2200);
  const amb = await measure(ctx, e.ambBus, 600);
  ok('ambience audible', amb.rms > 0.002, amb);
  e.setAmbience('volcano');
  await sleep(300);
  ok('ambience switches', e.ambience === 'volcano' && e._oldAmb.length >= 1);
  e.setAmbience('nope');

  // volumes -> silence
  e.setVolumes({ music: 0, sfx: 0 });
  e.play('explosion_big');
  await sleep(200);
  const sil = await measure(ctx, e.limiter, 600);
  ok('setVolumes(0) => silence', sil.peak < 1e-4, sil);
  e.setVolumes({ music: 0.8, sfx: 1 });
  await sleep(200);
  const back = await measure(ctx, e.limiter, 400);
  ok('volumes restore', back.rms > 0.005, back);

  // stopping
  e.setAmbience(null);
  e.stopMusic(0.5);
  await sleep(3000);
  const quiet = await measure(ctx, e.limiter, 500);
  ok('stopMusic + setAmbience(null) => quiet', quiet.peak < 0.01, quiet);
  ok('old tracks cleaned up', e._oldMusic.length <= 1, e._oldMusic.length);

  // background preparation eventually completes the bank
  const tb = performance.now();
  while (!e.bankCompleteMs && performance.now() - tb < 15000) await sleep(100);
  res.backgroundBankMs = Math.round(e.bankCompleteMs);
  ok('background prepares full bank', e._bank.size === SFX_NAMES.length, e._bank.size);
  // every sound can be played through the engine without throwing
  let threw = null;
  for (const n of SFX_NAMES) { try { const v = e.play(n, { vol: 0.2, rate: 1.1, pan: 0.3 }); if (v) v.stop(0.01); } catch (err) { threw = `${n}: ${err.message}`; break; } }
  ok('every sfx playable', !threw, threw);
  // sim-event glue drives the real engine without errors
  let simErr = null;
  try {
    const sa = createSimAudio(e);
    sa.enterArena('pirate_haven');
    sa.handle([{ type: 'hit', x: 3, dmg: 14, el: 'kick', heavy: true }, { type: 'ko', x: -5, style: 'water' }, { type: 'ultStart', id: 0, char: 'captain_rubber' }, { type: 'countdown', n: 3 }], { cameraX: 0, halfWidth: 14 });
    await sleep(600);
    ok('sim glue starts arena music + ambience', e.musicTrack === 'pirate_haven' && e.ambience === 'ocean');
  } catch (err) { simErr = err.message; }
  ok('sim glue runs', !simErr, simErr);
  e.stopMusic(0.2); e.setAmbience(null);
  res.stats = e.stats();
  return res;
}

async function exportWavs(names, { music = [], ambience = [], sampleRate = 44100 } = {}) {
  const out = {};
  for (const n of names) out[`sfx_${n}.wav`] = wavBase64(await renderSfx(n, sampleRate));
  for (const id of music) out[`music_${id}.wav`] = wavBase64(await renderMusicOffline(id, 16, { sampleRate }));
  for (const id of ambience) out[`amb_${id}.wav`] = wavBase64(await renderAmbienceOffline(id, 12, { sampleRate }));
  return out;
}

window.audioLib = { SFX, renderSfx, renderSfxBatch, renderMusicOffline, renderAmbienceOffline, analyseBuffer, spectrum, audio };
window.audioTests = { sfxTests, musicTests, ambienceTests, engineTests, exportWavs, SFX_NAMES, MUSIC_TRACKS, AMBIENCE_IDS };

// ---------------------------------------------------------------------------------------------
// Manual audition UI
// ---------------------------------------------------------------------------------------------
function ui() {
  const c = document.getElementById('controls');
  if (!c) return;
  const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; c.appendChild(b); return b; };
  btn('Unlock', () => audio.unlock());
  c.appendChild(document.createElement('hr'));
  for (const n of SFX_NAMES) btn(n, () => { audio.unlock(); audio.play(n); });
  c.appendChild(document.createElement('hr'));
  for (const id of MUSIC_TRACKS) btn('♪ ' + id, () => { audio.unlock(); audio.playMusic(id); });
  btn('stop music', () => audio.stopMusic());
  c.appendChild(document.createElement('hr'));
  for (const id of AMBIENCE_IDS) btn('~ ' + id, () => { audio.unlock(); audio.setAmbience(id); });
  btn('no ambience', () => audio.setAmbience(null));
  btn('duck', () => audio.duck());
}
ui();
