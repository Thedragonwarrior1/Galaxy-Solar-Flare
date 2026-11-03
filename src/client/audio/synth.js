// GRAND BRAWL audio — low-level DSP helpers shared by the SFX recipes, the music
// instruments and the ambience beds. Everything here works on any BaseAudioContext
// (real-time AudioContext or OfflineAudioContext). No audio files are ever loaded:
// all sound is synthesised from oscillators, noise and small JS-generated buffers.

export const TAU = Math.PI * 2;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Small fast seeded PRNG (deterministic renders => reproducible tests). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** AudioBuffers built with the constructor are context-independent and can be shared. */
export function makeBuffer(ctx, channels, length, sampleRate) {
  try {
    return new AudioBuffer({ numberOfChannels: channels, length: Math.max(1, length | 0), sampleRate });
  } catch (e) {
    return ctx.createBuffer(channels, Math.max(1, length | 0), sampleRate);
  }
}

function bufferFrom(ctx, data, sampleRate) {
  const b = makeBuffer(ctx, 1, data.length, sampleRate);
  b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
  return b;
}

// ---------------------------------------------------------------------------------------------
// Cached generated buffers (keyed by sample rate so they never need resampling)
// ---------------------------------------------------------------------------------------------
const bufCache = new Map();
function cached(key, make) {
  let v = bufCache.get(key);
  if (!v) { v = make(); bufCache.set(key, v); }
  return v;
}

/** 2.5 s looping noise: 'white' | 'pink' | 'brown', normalised to RMS ~0.3. */
export function noiseBuffer(ctx, color = 'white') {
  const sr = ctx.sampleRate;
  return cached(`noise:${sr}:${color}`, () => {
    const n = Math.floor(sr * 2.5);
    const d = new Float32Array(n);
    const rand = mulberry32(hashStr(color) ^ 0x9e3779b9);
    let b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const w = rand() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = b0 + b1 + b2 + w * 0.1848;
      } else if (color === 'brown') {
        br = (br + 0.02 * w) / 1.02;
        d[i] = br;
      } else d[i] = w;
    }
    // remove DC, crossfade the loop seam, normalise
    let mean = 0;
    for (let i = 0; i < n; i++) mean += d[i];
    mean /= n;
    for (let i = 0; i < n; i++) d[i] -= mean;
    const xf = Math.floor(sr * 0.05);
    for (let i = 0; i < xf; i++) {
      const k = i / xf;
      d[i] = d[i] * k + d[n - xf + i] * (1 - k);
    }
    const out = d.subarray(0, n - xf);
    let ss = 0;
    for (let i = 0; i < out.length; i++) ss += out[i] * out[i];
    const g = 0.3 / Math.sqrt(ss / out.length);
    for (let i = 0; i < out.length; i++) out[i] *= g;
    return bufferFrom(ctx, out, sr);
  });
}

/** Smoothed random control signal in -1..1, `rate` = rough changes per second. Loops seamlessly. */
export function wobbleBuffer(ctx, rate = 2, seconds = 12, seed = 7) {
  const sr = 8000; // control-rate buffer, cheap (>= 8 kHz for broad AudioBuffer support)
  return cached(`wob:${rate}:${seconds}:${seed}`, () => {
    const n = Math.floor(sr * seconds);
    const d = new Float32Array(n);
    const rand = mulberry32(seed * 7919 + 13);
    const pts = Math.max(4, Math.round(seconds * rate));
    const ctrl = [];
    for (let i = 0; i < pts; i++) ctrl.push(rand() * 2 - 1);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * pts;
      const i0 = Math.floor(x);
      const f = x - i0;
      const p0 = ctrl[(i0 - 1 + pts) % pts], p1 = ctrl[i0 % pts], p2 = ctrl[(i0 + 1) % pts], p3 = ctrl[(i0 + 2) % pts];
      // Catmull-Rom spline => smooth & periodic
      d[i] = clamp(0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f), -1, 1);
    }
    return bufferFrom(ctx, d, sr);
  });
}

/** Sparse crackle impulses (fire, sparks, lava, vinyl-ish texture). */
export function crackleData(sr, seconds, density, seed, decayMs = 1.2) {
  const n = Math.max(1, Math.floor(sr * seconds));
  const d = new Float32Array(n);
  const rand = mulberry32(seed);
  const p = density / sr;
  const dec = Math.exp(-1 / (sr * decayMs * 0.001));
  let env = 0, sign = 1;
  for (let i = 0; i < n; i++) {
    if (rand() < p) { env = 0.3 + rand() * 0.7; sign = rand() < 0.5 ? -1 : 1; }
    d[i] = env * sign * (rand() * 0.6 + 0.4);
    env *= dec;
    if (rand() < 0.3) sign = -sign;
  }
  return d;
}

/** Karplus–Strong plucked string, tuned exactly via a returned playback-rate correction. */
export function karplusData(sr, freq, seconds, { damp = 0.996, bright = 0.5, seed = 1 } = {}) {
  const N = Math.max(2, Math.round(sr / freq));
  const n = Math.floor(sr * seconds);
  const d = new Float32Array(n);
  const rand = mulberry32(seed);
  const line = new Float32Array(N);
  // excitation: noise, low-passed according to brightness
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const w = rand() * 2 - 1;
    lp = lp + (w - lp) * (0.2 + bright * 0.8);
    line[i] = lp;
  }
  let idx = 0, prev = 0;
  const s = 0.5 + bright * 0.12; // averaging weight (brighter = less smoothing)
  for (let i = 0; i < n; i++) {
    const cur = line[idx];
    const next = damp * (s * cur + (1 - s) * prev);
    prev = cur;
    line[idx] = next;
    d[i] = cur;
    idx = (idx + 1) % N;
  }
  // de-click start + fade end
  const fi = Math.min(n, 32);
  for (let i = 0; i < fi; i++) d[i] *= i / fi;
  const fo = Math.min(n, Math.floor(sr * 0.02));
  for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
  return { data: d, rate: freq / (sr / N) };
}

export function karplusBuffer(ctx, freq, seconds = 1.5, opts = {}) {
  const sr = ctx.sampleRate;
  const key = `ks:${sr}:${freq.toFixed(2)}:${seconds}:${opts.damp || 0}:${opts.bright || 0}`;
  return cached(key, () => {
    const { data, rate } = karplusData(sr, freq, seconds, opts);
    let pk = 0;
    for (let i = 0; i < data.length; i++) pk = Math.max(pk, Math.abs(data[i]));
    if (pk > 0) for (let i = 0; i < data.length; i++) data[i] /= pk;
    return { buffer: bufferFrom(ctx, data, sr), rate };
  });
}

/** Procedural stereo reverb impulse response (decaying, darkening noise). */
export function reverbIR(ctx, seconds = 1.8, decay = 3, bright = 0.5) {
  const sr = ctx.sampleRate;
  return cached(`ir:${sr}:${seconds}:${decay}:${bright}`, () => {
    const n = Math.floor(sr * seconds);
    const b = makeBuffer(ctx, 2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      const rand = mulberry32(1234 + c * 977 + Math.round(seconds * 100));
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const x = i / n;
        const coef = 0.15 + bright * 0.85 * (1 - x * 0.85); // darker over time
        lp += ((rand() * 2 - 1) - lp) * coef;
        const env = Math.pow(1 - x, decay) * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
        d[i] = lp * env;
      }
    }
    // normalise energy so different IRs have similar loudness
    let ss = 0;
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) ss += d[i] * d[i]; }
    const g = 1 / Math.sqrt(ss / 2 + 1e-9) * 0.9;
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= g; }
    return b;
  });
}

const curveCache = new Map();
export function driveCurve(drive) {
  let c = curveCache.get(drive);
  if (!c) {
    c = new Float32Array(1024);
    const norm = Math.tanh(drive);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      c[i] = Math.tanh(x * drive) / norm;
    }
    curveCache.set(drive, c);
  }
  return c;
}

// Periodic waves are context-bound: cache per context.
const waveCache = new WeakMap();
export function periodicWave(ctx, name, harmonics) {
  let m = waveCache.get(ctx);
  if (!m) { m = new Map(); waveCache.set(ctx, m); }
  let w = m.get(name);
  if (!w) {
    const real = new Float32Array(harmonics.length + 1);
    const imag = new Float32Array(harmonics.length + 1);
    harmonics.forEach((a, i) => { imag[i + 1] = a; });
    w = ctx.createPeriodicWave(real, imag);
    m.set(name, w);
  }
  return w;
}

export const WAVES = {
  // reedy, nasal (accordion / concertina)
  reed: Array.from({ length: 24 }, (_, i) => { const n = i + 1; return (n % 2 ? 1 : 0.55) / Math.pow(n, 0.85) * (n >= 3 && n <= 6 ? 1.35 : 1); }),
  // hollow, slightly brassy
  brass: Array.from({ length: 28 }, (_, i) => 1 / Math.pow(i + 1, 1.05)),
  // soft organ / flute-ish
  soft: [1, 0.35, 0.12, 0.06, 0.03],
  // glassy (odd partials, steep)
  glass: [1, 0, 0.3, 0, 0.12, 0, 0.05],
};

// ---------------------------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------------------------
const EPS = 1e-4;

/**
 * Schedule an envelope on an AudioParam starting at absolute time t.
 *  - number                      : constant value
 *  - [[dt, v, kind?], ...]       : breakpoints; kind 'e' = exponential ramp, 'l' = linear (default `defKind`)
 *  - { a, h, d, p }              : percussive: linear attack to p, hold, exponential decay over d
 *  - { a, d, s, hold, r, p }     : ADSR with sustain s (fraction of p) held `hold` seconds
 * Returns the absolute end time of the envelope.
 */
export function applyEnv(param, t, spec, scale = 1, defKind = 'l') {
  if (typeof spec === 'number') {
    param.setValueAtTime(spec * scale, t);
    return t;
  }
  if (Array.isArray(spec)) {
    let end = t;
    spec.forEach((pt, i) => {
      const at = t + pt[0];
      let v = pt[1] * scale;
      const kind = pt[2] || defKind;
      if (i === 0) param.setValueAtTime(v, at);
      else if (kind === 'e') {
        if (Math.abs(v) < EPS) v = v < 0 ? -EPS : EPS;
        param.exponentialRampToValueAtTime(v, at);
      } else if (kind === 'h') param.setValueAtTime(v, at);
      else param.linearRampToValueAtTime(v, at);
      end = Math.max(end, at);
    });
    return end;
  }
  const p = (spec.p ?? 1) * scale;
  const a = Math.max(0.0005, spec.a ?? 0.002);
  if (spec.s !== undefined) {
    const d = spec.d ?? 0.1, s = spec.s * p, hold = spec.hold ?? 0.2, r = spec.r ?? 0.1;
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(p, t + a);
    param.setTargetAtTime(s, t + a, d / 3);
    param.setValueAtTime(s, t + a + d + hold);
    param.exponentialRampToValueAtTime(Math.max(EPS, s * 0.001), t + a + d + hold + r);
    param.linearRampToValueAtTime(0, t + a + d + hold + r + 0.005);
    return t + a + d + hold + r + 0.005;
  }
  const h = spec.h ?? 0, d = spec.d ?? 0.2;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(p, t + a);
  if (h > 0) param.setValueAtTime(p, t + a + h);
  if (spec.c === 'lin') param.linearRampToValueAtTime(0, t + a + h + d);
  else {
    param.exponentialRampToValueAtTime(Math.max(EPS * 0.1, p * 0.001), t + a + h + d);
    param.linearRampToValueAtTime(0, t + a + h + d + 0.005);
  }
  return t + a + h + d + 0.005;
}

/**
 * Chromium recomputes biquad coefficients / oscillator increments for EVERY sample when a param is
 * automated at a-rate. k-rate (once per 128-frame quantum, ~2.7 ms) is inaudible for sweeps and
 * envelopes of filters and is many times cheaper. Unsupported browsers simply ignore the property.
 */
export function kRate(param) {
  try { if (param && 'automationRate' in param) param.automationRate = 'k-rate'; } catch (e) { /* fixed-rate param */ }
  return param;
}

/** Duration (s) of an envelope spec as understood by applyEnv. */
export function envDur(spec, dur) {
  if (spec === undefined) return dur ?? 0.2;
  if (typeof spec === 'number') return dur ?? Infinity;
  if (Array.isArray(spec)) return spec.length ? spec[spec.length - 1][0] : 0;
  if (spec.s !== undefined) return (spec.a ?? 0.002) + (spec.d ?? 0.1) + (spec.hold ?? 0.2) + (spec.r ?? 0.1);
  return (spec.a ?? 0.002) + (spec.h ?? 0) + (spec.d ?? 0.2);
}

const FTYPES = { lp: 'lowpass', hp: 'highpass', bp: 'bandpass', pk: 'peaking', ls: 'lowshelf', hs: 'highshelf', notch: 'notch', ap: 'allpass' };

// ---------------------------------------------------------------------------------------------
// Builder: terse graph construction for recipes and instruments
// ---------------------------------------------------------------------------------------------
export class Builder {
  constructor(ctx, out, t0 = 0, seed = 1) {
    this.ctx = ctx;
    this.out = out;
    this.t0 = t0;
    this.rand = mulberry32(seed);
  }
  get sr() { return this.ctx.sampleRate; }
  r(a = 0, b = 1) { return a + (b - a) * this.rand(); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }

  gain(v = 1, to) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (to !== null) g.connect(to || this.out);
    return g;
  }

  /** filter(['lp', f|pts, q, gainDb]) relative time t */
  filter(spec, t = 0) {
    const [type, f, q = 0.707, gdb = 0] = spec;
    const n = this.ctx.createBiquadFilter();
    n.type = FTYPES[type] || type;
    if (typeof f === 'number') n.frequency.value = f;
    else { kRate(n.frequency); applyEnv(n.frequency, this.t0 + t, f, 1, 'e'); }
    if (typeof q === 'number') n.Q.value = q;
    else { kRate(n.Q); applyEnv(n.Q, this.t0 + t, q, 1, 'l'); }
    n.gain.value = gdb;
    return n;
  }

  /** Connect source -> filters... -> gain(env) -> [pan] -> to. Returns {gain, end}. */
  _tail(src, o, t) {
    const ctx = this.ctx;
    let node = src;
    for (const fs of o.filters || []) {
      const f = this.filter(fs, t);
      node.connect(f);
      node = f;
    }
    if (o.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(o.drive);
      ws.oversample = '2x';
      node.connect(ws);
      node = ws;
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    node.connect(g);
    let dest = o.to || this.out;
    if (o.pan !== undefined && o.pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      if (typeof o.pan === 'number') p.pan.value = o.pan;
      else applyEnv(p.pan, this.t0 + t, o.pan, 1, 'l');
      p.connect(dest);
      dest = p;
    }
    g.connect(dest);
    const tt = this.t0 + t;
    const vol = o.vol ?? 1;
    let end;
    if (typeof o.g === 'number') {
      // constant gain over `dur` with de-click ramps
      const dur = Math.max(0.01, o.dur ?? 0.2);
      const fade = Math.min(0.004, dur / 3);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(o.g * vol, tt + fade);
      g.gain.setValueAtTime(o.g * vol, tt + dur - fade);
      g.gain.linearRampToValueAtTime(0, tt + dur);
      end = tt + dur;
    } else {
      end = applyEnv(g.gain, tt, o.g ?? { a: 0.002, d: o.dur ?? 0.2 }, vol);
    }
    return { gain: g, end };
  }

  /**
   * Oscillator voice.
   * o = { type, wave, f (Hz | pts, exp ramps), t, dur, g (env), to, filters, pan, detune (cents | pts),
   *       unison:[cents...], vib:{rate,depth(cents),delay,rise}, jitter:{rate,depth(cents)},
   *       fm:{ratio,index(env, multiples of f),type} }
   */
  osc(o) {
    const ctx = this.ctx;
    const t = o.t || 0;
    const tt = this.t0 + t;
    const nyq = ctx.sampleRate * 0.49;
    let f = o.f ?? 440;
    if (typeof f === 'number') f = Math.min(f, nyq);
    else f = f.map((p) => [p[0], Math.min(p[1], nyq), p[2]]);
    const dets = o.unison || [0];
    const extra = [];
    let vibG = null, jitG = null, fmG = null;
    // a delayed vibrato on a note that ends before the vibrato starts is pure CPU cost: skip it
    if (o.vib && envDur(o.g, o.dur) > (o.vib.delay ?? 0) + 0.05) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vib.rate ?? 5.5;
      vibG = ctx.createGain();
      const dl = o.vib.delay ?? 0;
      vibG.gain.setValueAtTime(0, tt);
      vibG.gain.setValueAtTime(0, tt + dl);
      vibG.gain.linearRampToValueAtTime(o.vib.depth ?? 20, tt + dl + (o.vib.rise ?? 0.15));
      lfo.connect(vibG);
      extra.push([lfo, 0]);
    }
    if (o.jitter) {
      const s = ctx.createBufferSource();
      s.buffer = wobbleBuffer(ctx, o.jitter.rate ?? 30, 12, o.jitter.seed ?? 3);
      s.loop = true;
      jitG = ctx.createGain();
      jitG.gain.value = o.jitter.depth ?? 40;
      s.connect(jitG);
      extra.push([s, this.r(0, 11)]);
    }
    if (o.fm) {
      const m = ctx.createOscillator();
      m.type = o.fm.type || 'sine';
      const base = typeof f === 'number' ? f : f[0][1];
      const ratio = o.fm.ratio ?? 2;
      if (typeof f === 'number') m.frequency.setValueAtTime(Math.min(f * ratio, nyq), tt);
      else applyEnv(m.frequency, tt, f.map((p) => [p[0], Math.min(p[1] * ratio, nyq), p[2]]), 1, 'e');
      fmG = ctx.createGain();
      applyEnv(fmG.gain, tt, o.fm.index ?? 1, base, 'l');
      m.connect(fmG);
      extra.push([m, 0]);
    }
    const srcs = [];
    let head;
    if (dets.length > 1) {
      head = ctx.createGain();
      head.gain.value = 1 / Math.sqrt(dets.length);
    }
    const sweepLen = Array.isArray(f) ? f[f.length - 1][0] - f[0][0] : 0;
    const kFreq = !o.fm && !o.arate && sweepLen > 0.12;
    const kDet = !o.fm && !o.arate && (vibG || jitG || Array.isArray(o.detune));
    for (const dc of dets) {
      const s = ctx.createOscillator();
      if (kFreq) kRate(s.frequency);
      if (kDet) kRate(s.detune);
      if (o.wave) s.setPeriodicWave(o.wave);
      else s.type = o.type || 'sine';
      if (typeof f === 'number') s.frequency.setValueAtTime(f, tt);
      else applyEnv(s.frequency, tt, f, 1, 'e');
      if (Array.isArray(o.detune)) applyEnv(s.detune, tt, o.detune.map((p) => [p[0], p[1] + dc, p[2]]), 1, 'l');
      else if (o.detune || dc) s.detune.setValueAtTime((o.detune || 0) + dc, tt);
      if (vibG) vibG.connect(s.detune);
      if (jitG) jitG.connect(s.detune);
      if (fmG) fmG.connect(s.frequency);
      if (head) s.connect(head);
      srcs.push(s);
    }
    const { gain, end } = this._tail(head || srcs[0], o, t);
    const stopAt = end + 0.02;
    for (const s of srcs) { s.start(tt); s.stop(stopAt); }
    for (const [e, off] of extra) { if (off) e.start(tt, off); else e.start(tt); e.stop(stopAt); }
    return { src: srcs[0], srcs, gain, end };
  }

  /** Noise voice. o = { color, t, dur, g, to, filters, pan, rate, drive } */
  noise(o) {
    const ctx = this.ctx;
    const t = o.t || 0;
    const tt = this.t0 + t;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx, o.color || 'white');
    s.loop = true;
    if (o.rate) {
      if (typeof o.rate === 'number') s.playbackRate.value = o.rate;
      else applyEnv(s.playbackRate, tt, o.rate, 1, 'e');
    }
    const { gain, end } = this._tail(s, o, t);
    s.start(tt, this.r(0, 2));
    s.stop(end + 0.02);
    return { src: s, gain, end };
  }

  /** Play raw sample data (Float32Array) or an AudioBuffer. */
  buf(data, o = {}) {
    const ctx = this.ctx;
    const t = o.t || 0;
    const tt = this.t0 + t;
    const s = ctx.createBufferSource();
    s.buffer = data instanceof Float32Array ? bufferFrom(ctx, data, ctx.sampleRate) : data;
    if (o.rate) {
      if (typeof o.rate === 'number') s.playbackRate.value = o.rate;
      else applyEnv(s.playbackRate, tt, o.rate, 1, 'e');
    }
    if (o.loop) s.loop = true;
    const dur = o.dur ?? s.buffer.duration / (typeof o.rate === 'number' ? o.rate : 1);
    const { gain, end } = this._tail(s, { g: 1, dur, ...o }, t);
    s.start(tt);
    s.stop(end + 0.02);
    return { src: s, gain, end };
  }

  /** Karplus–Strong pluck. o = { f, t, dur, damp, bright, g, to, filters, bend } */
  pluck(o) {
    const len = (o.len ?? o.dur ?? 1) + 0.05;
    const { data, rate } = karplusData(this.sr, o.f, len, { damp: o.damp ?? 0.996, bright: o.bright ?? 0.5, seed: Math.floor(this.r(1, 1e6)) });
    const r = o.bend ? o.bend.map(([dt, k, kind]) => [dt, k * rate, kind]) : rate;
    return this.buf(data, { g: o.g ?? 1, dur: o.dur ?? 1, ...o, rate: r });
  }

  /** Sparse crackle. o = { t, dur, density, decay(ms), g, filters, to } */
  crackle(o) {
    const d = crackleData(this.sr, o.dur ?? 0.5, o.density ?? 60, Math.floor(this.r(1, 1e6)), o.decay ?? 1.2);
    return this.buf(d, { g: 1, ...o });
  }

  /** Modal (inharmonic partial) resonator: metal, bells, glass. parts = [[ratio, amp, decay]] */
  modal(o) {
    let dest = o.to || this.out;
    if (o.pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = o.pan;
      p.connect(dest);
      dest = p;
    }
    const out = this.gain(1, dest);
    let end = 0;
    const nyq = this.sr * 0.45;
    for (const [ratio, amp, dec, kind] of o.parts) {
      if (o.f * ratio > nyq) continue;
      const r = this.osc({
        type: kind || 'sine', f: o.f * ratio * (1 + (o.spread ? this.r(-o.spread, o.spread) : 0)), t: o.t || 0,
        g: { a: o.a ?? 0.001, d: dec, p: amp * (o.vol ?? 1) }, to: out, vib: o.vib,
      });
      end = Math.max(end, r.end);
    }
    return { gain: out, end };
  }

  shaper(drive = 2, to) {
    const ws = this.ctx.createWaveShaper();
    ws.curve = driveCurve(drive);
    ws.oversample = '2x';
    ws.connect(to || this.out);
    return ws;
  }

  /** Reverb send: returns the input node. */
  verb({ secs = 1.6, decay = 3, bright = 0.5, g = 0.5, to, hp } = {}) {
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const c = ctx.createConvolver();
    c.normalize = false;
    c.buffer = reverbIR(ctx, secs, decay, bright);
    const og = this.gain(g, to);
    if (hp) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = hp;
      inp.connect(f); f.connect(c);
    } else inp.connect(c);
    c.connect(og);
    return inp;
  }

  /** Feedback delay send. */
  delay({ time = 0.25, fb = 0.35, g = 0.4, lp = 3000, to } = {}) {
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const d = ctx.createDelay(2);
    d.delayTime.value = time;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp;
    const fbg = ctx.createGain();
    fbg.gain.value = fb;
    inp.connect(d); d.connect(f); f.connect(fbg); fbg.connect(d);
    const og = this.gain(g, to);
    f.connect(og);
    return inp;
  }

  /** Modulate an AudioParam with smoothed random wobble: param += depth * wobble(rate). */
  wobble(param, { t = 0, dur = 1, rate = 3, depth = 1, seed } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = wobbleBuffer(ctx, rate, 12, seed ?? Math.floor(this.r(1, 50)));
    s.loop = true;
    const g = ctx.createGain();
    g.gain.value = depth;
    s.connect(g);
    g.connect(param);
    s.start(this.t0 + t, this.r(0, 11));
    s.stop(this.t0 + t + dur + 0.05);
    return { src: s, gain: g };
  }

  /** Square/sine LFO on an AudioParam. */
  lfo(param, { t = 0, dur = 1, rate = 5, depth = 1, type = 'sine', rateEnv, depthEnv } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = rate;
    if (rateEnv) applyEnv(o.frequency, this.t0 + t, rateEnv, 1, 'e');
    const g = ctx.createGain();
    g.gain.value = depth;
    if (depthEnv) applyEnv(g.gain, this.t0 + t, depthEnv, 1, 'l');
    o.connect(g);
    g.connect(param);
    o.start(this.t0 + t);
    o.stop(this.t0 + t + dur + 0.05);
    return { osc: o, gain: g };
  }
}

// ---------------------------------------------------------------------------------------------
// Buffer analysis helpers (used by normalisation and tests)
// ---------------------------------------------------------------------------------------------
export function analyseBuffer(buffer) {
  const ch = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) ch.push(buffer.getChannelData(c));
  const n = buffer.length;
  const sr = buffer.sampleRate;
  let peak = 0, ss = 0, nan = false;
  for (const d of ch) {
    for (let i = 0; i < n; i++) {
      const v = d[i];
      if (v !== v) { nan = true; continue; }
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      ss += v * v;
    }
  }
  const rms = Math.sqrt(ss / (n * ch.length));
  // short-term loudness: max RMS over 100 ms windows of a high-passed (crudely weighted) signal
  const win = Math.max(1, Math.floor(sr * 0.1)), hop = Math.max(1, Math.floor(sr * 0.025));
  const a = Math.exp(-TAU * 120 / sr);
  const w = new Float32Array(n);
  for (const d of ch) {
    let x1 = 0, y1 = 0;
    for (let i = 0; i < n; i++) {
      const x = d[i] !== d[i] ? 0 : d[i];
      const y = a * (y1 + x - x1); // 1st-order high-pass @120 Hz
      x1 = x; y1 = y;
      w[i] += (y * y) / ch.length;
    }
  }
  let st = 0, acc = 0;
  for (let i = 0; i < Math.min(win, n); i++) acc += w[i];
  st = acc / win;
  for (let i = win, k = 0; i < n; i++, k++) {
    acc += w[i] - w[i - win];
    if (k % hop === 0) st = Math.max(st, acc / win);
  }
  return { peak, rms, loud: Math.sqrt(Math.max(st, 0)), nan, duration: n / sr };
}
