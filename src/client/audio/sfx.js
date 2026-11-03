// GRAND BRAWL audio — procedural SFX bank.
// Every sound is an original recipe built from oscillators / noise / tiny generated buffers and
// pre-rendered into an AudioBuffer with an OfflineAudioContext (see renderSfxBatch). Recipes are
// deterministic (seeded by name) so renders are reproducible and testable.
import { Builder, hashStr, analyseBuffer, makeBuffer, mtof } from './synth.js';

/** name -> { name, dur, fn(B), level, stereo, ui, max } */
export const SFX = Object.create(null);

function def(name, dur, fn, opts = {}) {
  SFX[name] = { name, dur, fn, level: opts.level ?? 1, stereo: !!opts.stereo, ui: !!opts.ui, max: opts.max ?? 6, clip: opts.clip || 0 };
}

// ---------------------------------------------------------------------------------------------
// small helpers / macros
// ---------------------------------------------------------------------------------------------
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'Bb4' -> Hz */
export function hz(n) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  const midi = 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return mtof(midi);
}
const swell = (dur, pk, p = 1) => [[0, 0], [pk * 0.6, p * 0.45], [pk, p], [pk + (dur - pk) * 0.35, p * 0.35], [dur, 0]];
const ramp = (dur, p = 1, a = 0.01) => [[0, 0], [a, p * 0.2], [dur * 0.85, p], [dur, 0]];

function am(B, to, { t = 0, dur = 1, rate = 6, depth = 0.5, kind = 'wobble', base = 1 } = {}) {
  const g = B.gain(base, to);
  if (kind === 'wobble') B.wobble(g.gain, { t, dur, rate, depth });
  else B.lfo(g.gain, { t, dur, rate, depth, type: kind });
  return g;
}

/** A bus feeding the dry output AND a reverb send (avoids duplicating voices for reverb). */
function wet(B, v, amt = 0.5, to) {
  const g = B.gain(1, to || B.out);
  const s = B.gain(amt, v);
  g.connect(s);
  return g;
}

function panner(B, pan, to) {
  if (!B.ctx.createStereoPanner) return to || B.out;
  const p = B.ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(to || B.out);
  return p;
}

function formantBank(B, to, formants, t = 0) {
  const inp = B.ctx.createGain();
  for (const [f, q, a] of formants) {
    const flt = B.filter(['bp', f, q], t);
    const g = B.gain(a, to);
    inp.connect(flt);
    flt.connect(g);
  }
  return inp;
}

function whoosh(B, { t = 0, dur = 0.25, f0 = 600, f1 = 2400, f2, q = 1.2, p = 0.7, color = 'pink', peak = 0.45, to, pan }) {
  const pk = dur * peak;
  B.noise({ color, t, dur, to, pan, filters: [['bp', [[0, f0], [pk, f1], [dur, f2 ?? f1 * 0.55]], q]], g: swell(dur, pk, p) });
}

function thump(B, { t = 0, f0 = 160, f1 = 50, dur = 0.25, p = 0.9, drive, to, type = 'sine', bend = 0.5 }) {
  return B.osc({ type, t, to, drive, f: [[0, f0], [dur * bend, f1]], g: { a: 0.0015, d: dur, p } });
}

function click(B, { t = 0, f = 3000, d = 0.015, p = 0.6, to, type = 'hp', q = 0.7 }) {
  return B.noise({ t, to, filters: [[type, f, q]], g: { a: 0.0003, d, p } });
}

/** Generic punchy impact, size ~0.1 (tap) .. 1.2 (colossal) */
function impact(B, { t = 0, size = 0.5, p = 1, to, bright = 1, body = 1 }) {
  const s = size;
  click(B, { t, f: 3600 - 1400 * Math.min(1, s), d: 0.012 + 0.03 * s, p: 0.6 * p * bright, to });
  B.noise({ t, to, drive: 2 + 3 * s, filters: [['bp', [[0, 2600 - 1200 * Math.min(1, s)], [0.08 + 0.15 * s, 900 - 300 * Math.min(1, s)]], 0.9]], g: { a: 0.001, d: 0.05 + 0.2 * s, p: 0.5 * p * bright } });
  thump(B, { t, f0: 190 - 70 * Math.min(1, s), f1: 58 - 18 * Math.min(1, s), dur: 0.09 + 0.35 * s, p: 0.9 * p * body, drive: 1.5 + s, to });
  if (s > 0.55) thump(B, { t: t + 0.004, f0: 75, f1: 30, dur: 0.3 + 0.7 * s, p: 0.7 * p * (s - 0.35) * body, to });
}

function boom(B, { t = 0, size = 0.5, p = 1, to }) {
  const d = 0.45 + 1.4 * size;
  B.noise({ t, to, color: 'brown', drive: 3, filters: [['lp', [[0, 4500], [0.08, 1600], [d, 110]], 0.7]], g: { a: 0.003, d, p } });
  B.noise({ t, to, filters: [['lp', [[0, 7000], [0.15, 700]], 0.5]], g: { a: 0.001, d: 0.2 + 0.35 * size, p: 0.45 * p } });
  thump(B, { t, f0: 115, f1: 30, dur: 0.35 + 0.9 * size, p: p, drive: 2.5, to });
  B.crackle({ t: t + 0.02, dur: 0.3 + 1.0 * size, density: 90, decay: 1.6, to, filters: [['hp', 1200]], g: { a: 0.01, d: 0.3 + 1.0 * size, p: 0.7 * p } });
}

function thunderStrike(B, { t = 0, p = 1, to, len = 2.3, crack = 1 }) {
  B.noise({ t, to, filters: [['hp', 1400]], drive: 3, g: { a: 0.0005, d: 0.14, p: 0.85 * p * crack } });
  B.crackle({ t, dur: 0.4, density: 450, decay: 2, to, filters: [['bp', 2300, 0.6]], g: { a: 0.002, d: 0.4, p: 1.2 * p * crack } });
  const rum = am(B, to, { t, dur: len, rate: 7, depth: 0.45 });
  B.noise({ t: t + 0.02, to: rum, color: 'brown', drive: 1.6, filters: [['lp', [[0, 1100], [0.3, 240], [len, 80]], 0.9]], g: [[0, 0], [0.05, p], [0.45, 0.6 * p], [0.9, 0.75 * p], [len, 0]] });
  thump(B, { t: t + 0.01, f0: 85, f1: 33, dur: 1.3, p: 0.9 * p, to, drive: 1.5 });
}

function bell(B, { t = 0, f = 880, d = 1.0, p = 0.5, to, ratio = 3.5, index = 2, pan }) {
  B.osc({ t, f, to, pan, fm: { ratio, index: { a: 0.001, d: d * 0.6, p: index } }, g: { a: 0.002, d, p } });
  B.osc({ t, f: f * 2, to, pan, g: { a: 0.001, d: d * 0.35, p: p * 0.2 } });
}

function sparkle(B, { t = 0, dur = 0.6, n = 12, f0 = 2500, f1 = 7000, p = 0.25, to, rise = false }) {
  for (let i = 0; i < n; i++) {
    const tt = t + (i / n) * dur * 0.7 + B.r(0, dur * 0.25);
    const f = f0 * Math.pow(f1 / f0, rise ? i / n : B.r());
    B.osc({ t: tt, f, to, pan: B.r(-0.7, 0.7), g: { a: 0.001, d: B.r(0.06, 0.2), p: p * B.r(0.5, 1) } });
  }
}

function shards(B, { t = 0, dur = 0.6, n = 30, p = 0.3, f0 = 1800, f1 = 7500, to }) {
  for (let i = 0; i < n; i++) {
    const tt = t + dur * Math.pow(B.r(), 1.8);
    B.modal({ t: tt, f: B.r(f0, f1), to, pan: B.r(-0.8, 0.8), vol: p * B.r(0.35, 1), parts: [[1, 1, B.r(0.05, 0.22)], [2.32, 0.5, B.r(0.03, 0.12)], [4.25, 0.3, 0.05]] });
  }
}

function brass(B, { t = 0, f, dur = 0.4, p = 0.4, to, bright = 1, pan, scoop = 40 }) {
  return B.osc({
    type: 'sawtooth', t, f, to, pan, unison: [-8, 0, 7], detune: [[0, -scoop], [0.05, 0]],
    vib: { rate: 5.2, depth: 9, delay: 0.25, rise: 0.3 },
    filters: [['lp', [[0, f * 1.3], [0.06, Math.min(14000, f * 8 * bright)], [Math.max(0.15, dur), f * 3.5 * bright]], 1.1]],
    g: { a: 0.022, d: 0.12, s: 0.75, hold: Math.max(0, dur - 0.14), r: 0.18, p },
  });
}

function strings(B, { t = 0, f, dur = 0.5, p = 0.3, to, pan }) {
  return B.osc({ type: 'sawtooth', t, f, to, pan, unison: [-11, -3, 4, 12], vib: { rate: 5.6, depth: 7, delay: 0.15 }, filters: [['lp', f * 5 + 800, 0.6]], g: { a: 0.06, d: 0.2, s: 0.8, hold: Math.max(0, dur - 0.26), r: 0.35, p } });
}

function timpani(B, { t = 0, f = 73, d = 1.4, p = 0.8, to }) {
  B.osc({ t, to, f: [[0, f * 1.04], [0.08, f]], g: { a: 0.002, d, p } });
  B.osc({ t, to, f: f * 1.5, g: { a: 0.002, d: d * 0.5, p: p * 0.3 } });
  B.noise({ t, to, color: 'brown', filters: [['lp', 600]], g: { a: 0.001, d: 0.15, p: p * 0.6 } });
}

function cymbal(B, { t = 0, d = 1.8, p = 0.3, to }) {
  B.noise({ t, to, filters: [['hp', 4500], ['pk', 8000, 1, 6]], g: { a: 0.003, d, p } });
  B.noise({ t, to, filters: [['bp', 3200, 1.5]], g: { a: 0.002, d: d * 0.4, p: p * 0.5 } });
}

function zip(B, { t = 0, f0 = 300, f1 = 3000, dur = 0.25, p = 0.4, to, type = 'sawtooth' }) {
  B.osc({ type, t, to, f: [[0, f0], [dur, f1]], filters: [['lp', 7000]], fm: { ratio: 1.5, index: 0.5 }, g: [[0, 0], [0.01, p], [dur * 0.8, p * 0.6], [dur, 0]] });
}

function fireRoar(B, { t = 0, dur = 1, p = 0.8, f0 = 400, f1 = 900, to, crack = 1, peak = 0.3 }) {
  const amp = am(B, to, { t, dur, rate: 14, depth: 0.35 });
  B.noise({ t, dur, to: amp, color: 'brown', drive: 2.2, filters: [['lp', [[0, f0], [dur * 0.4, f1], [dur, f0 * 0.7]], 0.8]], g: swell(dur, dur * peak, p) });
  B.noise({ t, dur, to: amp, color: 'pink', filters: [['bp', [[0, f0 * 2], [dur * 0.4, f1 * 2.2], [dur, f0 * 1.5]], 0.7]], g: swell(dur, dur * (peak + 0.05), p * 0.45) });
  if (crack) B.crackle({ t, dur, density: 70 * crack, decay: 1, to, filters: [['hp', 1800]], g: swell(dur, dur * 0.4, 0.55 * p) });
}

function monsterVoice(B, { t = 0, dur = 1.3, f0 = 80, fp = 112, f1 = 62, p = 0.9, to, open = 1 }) {
  const fb = formantBank(B, to, [
    [[[0, 420], [dur * 0.3, 700 * open], [dur, 480]], 4, 1.0],
    [[[0, 850], [dur * 0.3, 1150 * open], [dur, 900]], 5, 0.6],
    [2500, 7, 0.22],
    [200, 1.2, 0.7],
  ], t);
  const growl = am(B, fb, { t, dur, rate: 31, depth: 0.45, kind: 'sine' });
  const env = [[0, 0], [0.12, p], [dur * 0.55, p * 0.9], [dur * 0.85, p * 0.5], [dur, 0]];
  B.osc({ type: 'sawtooth', t, to: growl, unison: [-18, 0, 14], f: [[0, f0], [dur * 0.3, fp], [dur, f1]], jitter: { rate: 25, depth: 70 }, drive: 3, g: env });
  B.noise({ t, to: growl, color: 'pink', drive: 2, dur, g: env.map(([a, b]) => [a, b * 0.5]) });
  B.osc({ t, to, f: [[0, f0 / 2], [dur * 0.3, fp / 2], [dur, f1 / 2]], g: env.map(([a, b]) => [a, b * 0.5]) });
}

function slash(B, { t = 0, size = 0.5, p = 1, to, pan, ring = 1 }) {
  const d = 0.12 + 0.25 * size;
  B.noise({ t, to, pan, filters: [['bp', [[0, 2500 - 900 * size], [d * 0.5, 7500 - 1500 * size], [d, 4000]], 1.8 - size * 0.5], ['hp', 1200]], g: swell(d, d * 0.3, 0.9 * p) });
  B.noise({ t, to, pan, color: 'pink', filters: [['bp', [[0, 700], [d * 0.4, 1800], [d, 900]], 1]], g: swell(d, d * 0.35, 0.4 * p * size) });
  if (ring) B.modal({ t: t + d * 0.25, f: 2900 - 900 * size + B.r(-80, 80), to, pan, vol: 0.18 * p * ring, parts: [[1, 1, 0.25 + 0.4 * size], [2.04, 0.6, 0.18], [3.01, 0.35, 0.12], [4.13, 0.25, 0.08]] });
}

function crowdVoices(B, { t = 0, dur = 2.5, n = 14, f0 = 140, f1 = 330, formants, p = 0.5, contour, to }) {
  const fb = formantBank(B, to, formants, t);
  const groups = [-0.65, 0, 0.65].map((pan) => am(B, panner(B, pan, fb), { t, dur, rate: B.r(4, 7), depth: 0.45 }));
  for (let i = 0; i < n; i++) {
    const f = B.r(f0, f1);
    const st = t + B.r(0, 0.25);
    const d = dur - (st - t) - B.r(0, 0.4);
    const c = contour ? contour(f, d, B) : [[0, f * 0.92], [d * 0.3, f * 1.08], [d, f * 0.95]];
    B.osc({ type: 'sawtooth', t: st, f: c, to: groups[i % 3], jitter: { rate: 8, depth: 35, seed: (i % 5) + 1 }, g: swell(d, d * B.r(0.3, 0.5), p / Math.sqrt(n)) });
  }
}

// ---------------------------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------------------------
const UI = { ui: true };
def('ui_move', 0.07, (B) => {
  B.osc({ type: 'triangle', f: 1320, g: { a: 0.001, d: 0.045, p: 0.6 } });
  B.osc({ f: 2640, g: { a: 0.001, d: 0.022, p: 0.25 } });
}, { ...UI, level: 0.5 });

def('ui_select', 0.26, (B) => {
  B.osc({ type: 'square', f: 880, filters: [['lp', 3200]], g: { a: 0.002, d: 0.07, p: 0.35 } });
  B.osc({ type: 'square', t: 0.065, f: 1320, filters: [['lp', 4000]], g: { a: 0.002, d: 0.14, p: 0.35 } });
  B.osc({ t: 0.065, f: 2640, g: { a: 0.002, d: 0.16, p: 0.15 } });
}, { ...UI, level: 0.68 });

def('ui_back', 0.24, (B) => {
  B.osc({ type: 'triangle', f: 990, g: { a: 0.002, d: 0.07, p: 0.5 } });
  B.osc({ type: 'triangle', t: 0.07, f: 660, g: { a: 0.002, d: 0.14, p: 0.5 } });
  B.noise({ t: 0, filters: [['bp', [[0, 2500], [0.12, 900]], 1.5]], g: { a: 0.005, d: 0.1, p: 0.12 } });
}, { ...UI, level: 0.62 });

def('ui_start', 1.2, (B) => {
  const v = B.verb({ secs: 1.0, decay: 3, g: 0.35 });
  const W = wet(B, v, 0.7);
  const notes = ['C5', 'E5', 'G5', 'C6', 'E6'];
  notes.forEach((n, i) => bell(B, { t: i * 0.05, f: hz(n), d: 0.7, p: 0.3, to: W, pan: -0.4 + i * 0.2 }));
  whoosh(B, { t: 0, dur: 0.3, f0: 800, f1: 5000, p: 0.35, color: 'white' });
  for (const n of ['C4', 'G4', 'C5', 'E5']) brass(B, { t: 0.25, f: hz(n), dur: 0.45, p: 0.14, to: W, bright: 1.3 });
  sparkle(B, { t: 0.25, dur: 0.7, n: 10, p: 0.12, to: v });
}, { ...UI, stereo: true, level: 0.85 });

def('ui_error', 0.32, (B) => {
  for (const t of [0, 0.13]) B.osc({ type: 'square', t, f: 140, unison: [0, 25], filters: [['lp', 1400]], g: { a: 0.003, h: 0.07, d: 0.04, p: 0.45 } });
}, { ...UI, level: 0.62 });

def('char_hover', 0.09, (B) => {
  B.modal({ f: 940, parts: [[1, 0.8, 0.05], [2.3, 0.4, 0.025], [4.1, 0.2, 0.012]] });
  click(B, { f: 4000, d: 0.006, p: 0.25 });
}, { ...UI, level: 0.5 });

def('char_pick', 0.75, (B) => {
  const v = B.verb({ secs: 0.9, decay: 3, g: 0.3 });
  whoosh(B, { t: 0, dur: 0.12, f0: 1500, f1: 5000, p: 0.35, color: 'white' });
  impact(B, { t: 0.08, size: 0.35, p: 0.6 });
  const W = wet(B, v, 0.5);
  for (const n of ['G3', 'D4', 'G4', 'B4', 'D5']) brass(B, { t: 0.08, f: hz(n), dur: 0.22, p: 0.12, bright: 1.4, to: W });
  sparkle(B, { t: 0.1, dur: 0.45, n: 10, p: 0.12, to: v });
}, { ...UI, stereo: true, level: 0.85 });

def('ready', 0.7, (B) => {
  const v = B.verb({ secs: 0.8, decay: 3, g: 0.3 });
  const W = wet(B, v, 0.6);
  bell(B, { t: 0, f: hz('G5'), d: 0.4, p: 0.35, index: 1.4, to: W });
  bell(B, { t: 0.11, f: hz('D6'), d: 0.55, p: 0.35, index: 1.4, to: W });
  B.osc({ type: 'triangle', t: 0.11, f: hz('G4'), g: { a: 0.01, d: 0.45, p: 0.25 } });
}, { ...UI, stereo: true, level: 0.75 });

def('countdown', 0.26, (B) => {
  B.osc({ type: 'square', f: 880, filters: [['lp', 4500]], g: { a: 0.002, h: 0.11, d: 0.12, p: 0.4 } });
  B.osc({ f: 1760, g: { a: 0.002, h: 0.08, d: 0.1, p: 0.12 } });
}, { ...UI, level: 0.72 });

def('go', 1.3, (B) => {
  const v = B.verb({ secs: 1.1, decay: 2.5, g: 0.35 });
  const W = wet(B, v, 0.6);
  for (const n of ['A5', 'E6', 'A6', 'C#6']) B.osc({ type: 'square', f: hz(n), to: W, filters: [['lp', [[0, 9000], [0.3, 2500]]]], g: { a: 0.002, h: 0.12, d: 0.45, p: 0.12 } });
  for (const n of ['A3', 'E4', 'A4', 'C#5']) brass(B, { f: hz(n), dur: 0.35, p: 0.15, bright: 1.5, to: W });
  impact(B, { size: 0.6, p: 0.8 });
  cymbal(B, { d: 1.1, p: 0.25, to: W });
}, { ...UI, stereo: true, level: 1.0 });

def('game_set', 3.2, (B) => {
  const v = B.verb({ secs: 2.8, decay: 2.5, g: 0.5 });
  const W = wet(B, v, 0.5);
  const chord = ['D3', 'A3', 'D4', 'F4', 'A4', 'D5'];
  for (const n of chord) brass(B, { f: hz(n), dur: 1.2, p: 0.14, bright: 1.2, to: W });
  for (const n of ['D5', 'F5', 'A5']) strings(B, { f: hz(n), dur: 1.4, p: 0.09, to: W });
  timpani(B, { f: hz('D2'), d: 2.0, p: 0.9, to: W });
  impact(B, { size: 0.6, p: 0.6 });
  cymbal(B, { d: 2.6, p: 0.3, to: W });
  // orchestral swell-off: strings sustain into the tail
  for (const n of ['A5', 'D6']) strings(B, { t: 0.05, f: hz(n), dur: 2.0, p: 0.05, to: W });
}, { ...UI, stereo: true, level: 1.15, max: 1 });

def('time_up', 1.7, (B) => {
  const v = B.verb({ secs: 1.4, decay: 3, g: 0.35 });
  const bellParts = [[0.5, 0.5, 1.2], [1, 1, 1.0], [1.19, 0.5, 0.8], [1.56, 0.4, 0.6], [2.0, 0.35, 0.5], [2.66, 0.25, 0.3], [3.01, 0.2, 0.25]];
  const W = wet(B, v, 0.55);
  for (const t of [0, 0.32]) {
    B.modal({ t, f: 700, parts: bellParts, vol: 0.34, to: W });
    click(B, { t, f: 3000, d: 0.01, p: 0.3 });
  }
  brass(B, { t: 0.62, f: hz('G3'), dur: 0.22, p: 0.25, to: W });
  brass(B, { t: 0.62, f: hz('D3'), dur: 0.22, p: 0.2, to: W });
  brass(B, { t: 0.9, f: hz('C3'), dur: 0.6, p: 0.28, to: W });
  brass(B, { t: 0.9, f: hz('G2'), dur: 0.6, p: 0.2, to: W });
  timpani(B, { t: 0.9, f: hz('C2'), d: 0.8, p: 0.6 });
}, { ...UI, stereo: true, level: 0.95, max: 1 });

def('crowd_cheer', 3.0, (B) => {
  const v = B.verb({ secs: 1.5, decay: 2, g: 0.4 });
  const formants = [[[[0, 650], [1.5, 800]], 3.5, 1], [[[0, 1100], [1.5, 1300]], 4, 0.7], [2600, 5, 0.3]];
  crowdVoices(B, { dur: 2.8, n: 16, f0: 150, f1: 360, formants, p: 1.3, to: wet(B, v, 1.2), contour: (f, d, B) => [[0, f * 0.85], [d * 0.25, f * 1.15], [d * 0.6, f * B.r(0.95, 1.1)], [d, f * 0.9]] });
  const bed = am(B, v, { dur: 2.9, rate: 9, depth: 0.35 });
  B.noise({ color: 'pink', dur: 2.9, to: bed, filters: [['bp', 1500, 0.6], ['hs', 3000, 0.7, -6]], g: [[0, 0], [0.5, 0.35], [1.6, 0.4], [2.9, 0]] });
  B.noise({ color: 'pink', dur: 2.9, filters: [['bp', 1500, 0.6]], g: [[0, 0], [0.5, 0.2], [1.6, 0.25], [2.9, 0]] });
  for (let i = 0; i < 3; i++) {
    const t = B.r(0.4, 1.6);
    B.osc({ t, to: v, pan: B.r(-0.8, 0.8), f: [[0, 1800], [0.15, 3000], [0.5, 2600]], g: [[0, 0], [0.05, 0.05], [0.4, 0.04], [0.55, 0]] });
  }
  // claps (three panned groups share a filter each)
  const clapBus = [-0.7, 0, 0.7].map((pan) => { const f = B.filter(['bp', 1600, 1]); f.connect(panner(B, pan, v)); return f; });
  for (let i = 0; i < 30; i++) {
    const t = 0.3 + Math.pow(B.r(), 0.8) * 2.3;
    B.noise({ t, to: clapBus[i % 3], g: { a: 0.001, d: 0.03, p: 0.3 * (1 - (t - 0.3) / 3) } });
  }
}, { ...UI, stereo: true, level: 0.8, max: 2 });

def('crowd_ooh', 1.9, (B) => {
  const v = B.verb({ secs: 1.3, decay: 2, g: 0.45 });
  const formants = [[[[0, 330], [1, 380]], 5, 1], [[[0, 820], [1, 900]], 6, 0.45], [2400, 6, 0.1]];
  const contour = (f, d) => [[0, f * 0.92], [d * 0.3, f * 1.12], [d, f * 0.82]];
  crowdVoices(B, { dur: 1.75, n: 16, f0: 160, f1: 320, formants, p: 1.6, contour, to: wet(B, v, 1.0) });
  B.noise({ color: 'pink', dur: 1.8, to: v, filters: [['bp', 600, 1]], g: swell(1.8, 0.5, 0.12) });
}, { ...UI, stereo: true, level: 0.75, max: 2 });

def('victory_fanfare', 3.4, (B) => {
  const v = B.verb({ secs: 2.2, decay: 2.6, g: 0.45 });
  const mel = [[0, 'F4', 0.1], [0.11, 'Bb4', 0.1], [0.22, 'D5', 0.1], [0.33, 'F5', 0.42], [0.8, 'Eb5', 0.13], [0.95, 'F5', 0.13], [1.1, 'G5', 0.2], [1.32, 'A5', 0.2], [1.55, 'Bb5', 1.35]];
  const har = [[0.33, 'D5', 0.42], [0.8, 'C5', 0.13], [0.95, 'D5', 0.13], [1.1, 'Eb5', 0.2], [1.32, 'F5', 0.2], [1.55, 'F5', 1.35], [1.55, 'D5', 1.35], [1.55, 'Bb4', 1.35]];
  const bass = [[0.33, 'Bb2', 0.42], [0.8, 'F2', 0.28], [1.1, 'Eb3', 0.2], [1.32, 'F3', 0.2], [1.55, 'Bb2', 1.35], [1.55, 'F3', 1.35]];
  const W = wet(B, v, 0.5);
  for (const [t, n, d] of mel) brass(B, { t, f: hz(n), dur: d, p: 0.27, bright: 1.3, to: W });
  for (const [t, n, d] of har) brass(B, { t, f: hz(n), dur: d, p: 0.15, pan: -0.25, to: W });
  for (const [t, n, d] of bass) brass(B, { t, f: hz(n), dur: d, p: 0.2, pan: 0.2, bright: 0.8 });
  for (const n of ['Bb4', 'D5', 'F5']) strings(B, { t: 1.55, f: hz(n), dur: 1.4, p: 0.07, to: v });
  for (const t of [0.33, 1.1, 1.32]) timpani(B, { t, f: hz(t > 1 ? 'F2' : 'Bb1'), d: 0.5, p: 0.55 });
  for (let i = 0; i < 6; i++) timpani(B, { t: 1.36 + i * 0.03, f: hz('F2'), d: 0.15, p: 0.2 + i * 0.05 });
  timpani(B, { t: 1.55, f: hz('Bb1'), d: 1.6, p: 0.85 });
  cymbal(B, { t: 1.55, d: 1.8, p: 0.28, to: W });
  for (let i = 0; i < 8; i++) B.noise({ t: 1.3 + i * 0.03, filters: [['bp', 3000, 1]], g: { a: 0.001, d: 0.05, p: 0.08 + i * 0.015 } });
}, { ...UI, stereo: true, level: 1.0, max: 1 });

def('defeat_sting', 2.3, (B) => {
  const v = B.verb({ secs: 2.0, decay: 2.5, g: 0.5 });
  const mel = [[0, 'A4', 0.32], [0.34, 'G4', 0.32], [0.68, 'F4', 0.32], [1.02, 'E4', 1.0]];
  const W = wet(B, v, 0.55);
  for (const [t, n, d] of mel) brass(B, { t, f: hz(n), dur: d, p: 0.22, bright: 0.55, scoop: 15, to: W });
  for (const n of ['D3', 'A3', 'F4']) strings(B, { t: 0, f: hz(n), dur: 0.95, p: 0.07, to: v });
  for (const n of ['Bb2', 'F3', 'D4']) strings(B, { t: 1.02, f: hz(n), dur: 1.0, p: 0.08, to: v });
  timpani(B, { t: 1.02, f: hz('D2'), d: 1.2, p: 0.45 });
}, { ...UI, stereo: true, level: 0.75, max: 1 });

// ---------------------------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------------------------
def('jump', 0.22, (B) => {
  B.osc({ type: 'triangle', f: [[0, 250], [0.12, 720]], g: { a: 0.004, d: 0.15, p: 0.35 } });
  B.noise({ filters: [['bp', [[0, 1000], [0.1, 2600]], 0.9]], g: { a: 0.004, d: 0.1, p: 0.35 } });
  thump(B, { f0: 150, f1: 90, dur: 0.06, p: 0.4 });
}, { level: 0.62 });

def('djump', 0.38, (B) => {
  B.osc({ type: 'triangle', f: [[0, 420], [0.15, 1150]], g: { a: 0.004, d: 0.18, p: 0.25 } });
  B.osc({ f: [[0, 840], [0.15, 2300]], g: { a: 0.004, d: 0.14, p: 0.1 } });
  whoosh(B, { dur: 0.34, f0: 700, f1: 3200, f2: 1800, q: 0.9, p: 0.55, peak: 0.35 });
  B.osc({ t: 0.06, f: 3300, g: { a: 0.002, d: 0.12, p: 0.05 } });
}, { level: 0.62 });

def('land', 0.2, (B) => {
  thump(B, { f0: 130, f1: 55, dur: 0.12, p: 0.8 });
  B.noise({ color: 'pink', filters: [['lp', 900]], g: { a: 0.002, d: 0.09, p: 0.5 } });
  click(B, { f: 2000, d: 0.01, p: 0.15 });
}, { level: 0.62 });

def('land_hard', 0.5, (B) => {
  thump(B, { f0: 115, f1: 38, dur: 0.32, p: 1, drive: 2.5 });
  B.noise({ color: 'brown', drive: 2, filters: [['lp', [[0, 2500], [0.15, 400]]]], g: { a: 0.002, d: 0.2, p: 0.8 } });
  B.crackle({ t: 0.01, dur: 0.3, density: 120, filters: [['hp', 1500]], g: { a: 0.005, d: 0.3, p: 0.5 } });
  click(B, { f: 1500, d: 0.02, p: 0.3 });
}, { level: 0.85 });

def('dodge', 0.26, (B) => {
  whoosh(B, { dur: 0.24, f0: 500, f1: 2300, f2: 900, q: 1.6, p: 0.8, peak: 0.4 });
  B.noise({ filters: [['hp', 5000]], g: swell(0.2, 0.08, 0.08) });
}, { level: 0.62 });

def('airdodge', 0.42, (B) => {
  whoosh(B, { dur: 0.3, f0: 700, f1: 3600, f2: 1600, q: 1.3, p: 0.7, peak: 0.35 });
  B.modal({ t: 0.03, f: 2200, parts: [[1, 0.5, 0.3], [1.5, 0.4, 0.25], [2.02, 0.3, 0.2], [3.03, 0.15, 0.12]], vol: 0.18, vib: { rate: 9, depth: 15 } });
}, { level: 0.62 });

def('run_step', 0.07, (B) => {
  B.noise({ color: 'pink', filters: [['bp', 500, 0.9], ['lp', 1800]], g: { a: 0.001, d: 0.04, p: 0.6 } });
  thump(B, { f0: 120, f1: 80, dur: 0.035, p: 0.35 });
  click(B, { f: 3500, d: 0.004, p: 0.08 });
}, { level: 0.28, max: 4 });

def('ledge_grab', 0.26, (B) => {
  B.noise({ filters: [['bp', 1700, 1]], g: { a: 0.001, d: 0.04, p: 0.6 } });
  B.modal({ f: 230, parts: [[1, 1, 0.09], [2.6, 0.5, 0.05], [4.4, 0.25, 0.03]], vol: 0.6 });
  B.noise({ t: 0.03, filters: [['bp', 3200, 0.8]], g: swell(0.15, 0.05, 0.12) });
}, { level: 0.62 });

def('respawn', 1.5, (B) => {
  const v = B.verb({ secs: 1.4, decay: 2.5, g: 0.45 });
  const notes = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6'];
  const W = wet(B, v, 0.8);
  notes.forEach((n, i) => bell(B, { t: i * 0.055, f: hz(n), d: 0.5, p: 0.15, pan: Math.sin(i) * 0.6, index: 1.2, to: W }));
  const trem = am(B, v, { dur: 1.3, rate: 7, depth: 0.4, kind: 'sine' });
  for (const n of ['C5', 'E5', 'G5', 'C6']) B.osc({ f: hz(n), to: trem, unison: [-6, 6], g: swell(1.3, 0.55, 0.08) });
  const sh = am(B, B.out, { dur: 1.1, rate: 18, depth: 0.7, kind: 'square' });
  B.noise({ dur: 1.1, to: sh, filters: [['hp', 6500]], g: swell(1.1, 0.4, 0.12) });
  sparkle(B, { t: 0.3, dur: 0.8, n: 12, p: 0.1, to: v, f0: 3000, f1: 9000 });
}, { stereo: true, level: 0.8 });

def('tech', 0.3, (B) => {
  B.modal({ f: 2400, parts: [[1, 1, 0.12], [2.7, 0.5, 0.06], [5.1, 0.25, 0.03]], vol: 0.5 });
  whoosh(B, { dur: 0.15, f0: 1500, f1: 5000, p: 0.45, color: 'white' });
  click(B, { f: 3000, d: 0.012, p: 0.4 });
  thump(B, { f0: 200, f1: 100, dur: 0.06, p: 0.4 });
}, { level: 0.7 });

// ---------------------------------------------------------------------------------------------
// Combat generic
// ---------------------------------------------------------------------------------------------
def('whoosh_light', 0.18, (B) => whoosh(B, { dur: 0.17, f0: 900, f1: 3400, f2: 1600, q: 1.8, p: 0.8, peak: 0.4 }), { level: 0.55 });
def('whoosh_med', 0.28, (B) => {
  whoosh(B, { dur: 0.26, f0: 600, f1: 2500, f2: 1100, q: 1.4, p: 0.75 });
  whoosh(B, { dur: 0.26, f0: 250, f1: 800, f2: 400, q: 1, p: 0.35, color: 'brown' });
}, { level: 0.65 });
def('whoosh_heavy', 0.48, (B) => {
  whoosh(B, { dur: 0.45, f0: 280, f1: 1700, f2: 600, q: 1, p: 0.7, peak: 0.5 });
  whoosh(B, { dur: 0.45, f0: 120, f1: 500, f2: 200, q: 0.8, p: 0.6, color: 'brown', peak: 0.5 });
  B.osc({ f: [[0, 60], [0.22, 90], [0.45, 50]], g: swell(0.45, 0.22, 0.25) });
}, { level: 0.78 });

def('hit_light', 0.2, (B) => {
  impact(B, { size: 0.15, p: 1 });
  B.osc({ type: 'square', f: [[0, 1400], [0.03, 700]], filters: [['lp', 4000]], g: { a: 0.001, d: 0.03, p: 0.12 } });
}, { level: 0.78 });
def('hit_med', 0.32, (B) => {
  impact(B, { size: 0.45, p: 1 });
  B.noise({ t: 0.005, filters: [['bp', 1200, 1.2]], drive: 3, g: { a: 0.001, d: 0.08, p: 0.3 } });
}, { level: 0.88 });
def('hit_heavy', 0.7, (B) => {
  const v = B.verb({ secs: 0.6, decay: 3, g: 0.3 });
  impact(B, { size: 0.78, p: 1, to: wet(B, v, 0.35) });
  B.crackle({ t: 0.01, dur: 0.25, density: 150, filters: [['hp', 2500]], g: { a: 0.002, d: 0.25, p: 0.4 } });
}, { stereo: true, level: 0.98 });
def('hit_deadly', 2.0, (B) => {
  const v = B.verb({ secs: 1.7, decay: 2.4, g: 0.5, bright: 0.7 });
  const W = wet(B, v, 0.55);
  impact(B, { size: 1.1, p: 1, to: W });
  // whip-crack transient + bright smear: the "this one is going to KO" signature
  B.noise({ filters: [['hp', 3000]], drive: 4, g: { a: 0.0005, d: 0.06, p: 0.8 }, to: W });
  B.noise({ filters: [['bp', [[0, 5000], [0.4, 1200]], 1.2]], g: { a: 0.001, d: 0.45, p: 0.35 }, to: W });
  // heroic metallic ring
  B.modal({ t: 0.01, f: 1750, parts: [[1, 1, 1.2], [1.51, 0.6, 0.9], [2.27, 0.45, 0.7], [3.4, 0.3, 0.5]], vol: 0.24, to: W });
  // bass drop
  B.osc({ f: [[0, 90], [0.9, 30]], drive: 1.5, g: { a: 0.003, d: 1.1, p: 0.6 } });
  whoosh(B, { t: 0.02, dur: 0.9, f0: 5000, f1: 1200, f2: 300, q: 0.7, p: 0.25, peak: 0.08, to: v });
}, { stereo: true, level: 1.15, max: 3 });

def('shield_on', 0.38, (B) => {
  B.osc({ f: [[0, 300], [0.25, 620]], fm: { ratio: 2.01, index: [[0, 0.8], [0.3, 0.3]] }, g: [[0, 0], [0.05, 0.35], [0.25, 0.25], [0.36, 0]] });
  B.noise({ filters: [['hp', 3500]], g: swell(0.3, 0.15, 0.1) });
}, { level: 0.55 });
def('shield_hit', 0.32, (B) => {
  B.modal({ f: 420, parts: [[1, 1, 0.22], [1.5, 0.6, 0.15], [2.23, 0.4, 0.1]], vol: 0.6 });
  B.osc({ f: 900, fm: { ratio: 1.41, index: { a: 0.001, d: 0.2, p: 2 } }, g: { a: 0.001, d: 0.2, p: 0.2 } });
  B.noise({ color: 'pink', filters: [['lp', 1800]], g: { a: 0.001, d: 0.04, p: 0.5 } });
}, { level: 0.72 });
def('shield_break', 1.3, (B) => {
  const v = B.verb({ secs: 1.0, decay: 3, g: 0.35 });
  B.noise({ filters: [['hp', 1800]], drive: 3, g: { a: 0.0005, d: 0.1, p: 0.8 } });
  thump(B, { f0: 140, f1: 45, dur: 0.35, p: 0.8, drive: 2 });
  shards(B, { t: 0.005, dur: 0.7, n: 30, p: 0.32, to: wet(B, v, 0.45) });
  B.noise({ filters: [['hp', 4500]], g: { a: 0.002, d: 0.6, p: 0.25 } });
  B.osc({ f: [[0, 400], [0.5, 120]], fm: { ratio: 1.5, index: 1 }, g: { a: 0.002, d: 0.5, p: 0.15 } });
}, { stereo: true, level: 0.95 });
def('parry', 0.95, (B) => {
  const v = B.verb({ secs: 0.9, decay: 3, g: 0.3 });
  const parts = [[1, 1, 0.85], [2.76, 0.6, 0.55], [5.4, 0.4, 0.35], [8.93, 0.25, 0.2]];
  B.modal({ f: 1480, parts, vol: 0.36, to: wet(B, v, 0.55) });
  click(B, { f: 5000, d: 0.01, p: 0.5 });
  B.osc({ f: 3750, fm: { ratio: 1.003, index: 0.5 }, g: { a: 0.001, d: 0.5, p: 0.08 } });
}, { stereo: true, level: 0.85 });
def('clank', 0.5, (B) => {
  B.modal({ f: 520, parts: [[1, 1, 0.3], [2.31, 0.7, 0.22], [3.92, 0.5, 0.15], [5.63, 0.3, 0.1]], vol: 0.45, spread: 0.01 });
  B.noise({ filters: [['bp', 2500, 1.2]], drive: 2, g: { a: 0.001, d: 0.05, p: 0.6 } });
  thump(B, { f0: 220, f1: 120, dur: 0.06, p: 0.35 });
}, { level: 0.82 });
def('grab', 0.22, (B) => {
  B.noise({ filters: [['bp', 1500, 1]], g: { a: 0.001, d: 0.06, p: 0.6 } });
  thump(B, { f0: 160, f1: 100, dur: 0.05, p: 0.5 });
  B.noise({ t: 0.02, color: 'pink', filters: [['bp', 2800, 0.8]], g: swell(0.15, 0.04, 0.15) });
}, { level: 0.62 });
def('throw', 0.42, (B) => {
  thump(B, { f0: 180, f1: 80, dur: 0.07, p: 0.5 });
  whoosh(B, { t: 0.03, dur: 0.36, f0: 400, f1: 2100, f2: 700, q: 1.2, p: 0.75, peak: 0.45 });
}, { level: 0.7 });
def('ko_blast', 3.2, (B) => {
  const v = B.verb({ secs: 2.8, decay: 2, g: 0.55 });
  boom(B, { size: 1.0, p: 1, to: wet(B, v, 0.55) });
  B.osc({ f: [[0, 55], [2, 26]], g: { a: 0.005, d: 2.6, p: 0.6 } });
  whoosh(B, { t: 0.0, dur: 1.6, f0: 6000, f1: 1500, f2: 300, q: 0.6, p: 0.3, peak: 0.05, color: 'white', to: v });
  B.modal({ t: 0.01, f: 1100, parts: [[1, 1, 1.4], [1.5, 0.5, 1.0], [2.0, 0.3, 0.7]], vol: 0.07, to: v });
}, { stereo: true, level: 1.15, max: 3 });
def('ko_star', 1.25, (B) => {
  const v = B.verb({ secs: 1.0, decay: 2.5, g: 0.45 });
  B.osc({ f: [[0, 1500], [0.9, 5200]], g: [[0, 0], [0.02, 0.15], [0.9, 0.02], [1.0, 0]] });
  const W = wet(B, v, 1.2);
  ['E6', 'B6', 'G#6', 'E7'].forEach((n, i) => bell(B, { t: 0.05 + i * 0.12, f: hz(n), d: 0.45, p: 0.2, to: W, index: 1 }));
  sparkle(B, { t: 0.1, dur: 0.9, n: 14, p: 0.1, f0: 4000, f1: 10000, to: v });
}, { stereo: true, level: 0.72 });
def('charge', 1.15, (B) => {
  B.osc({ type: 'sawtooth', unison: [-10, 10], f: [[0, 110], [1.05, 440]], vib: { rate: 7, depth: 15, delay: 0.1, rise: 0.9 }, filters: [['lp', [[0, 400], [1.05, 4500]], 6]], g: [[0, 0], [0.05, 0.15], [1.0, 0.35], [1.12, 0]] });
  B.osc({ f: [[0, 220], [1.05, 880]], g: [[0, 0], [0.1, 0.1], [1.0, 0.2], [1.12, 0]] });
  B.noise({ filters: [['hp', [[0, 1500], [1.05, 7000]]]], g: [[0, 0], [0.2, 0.02], [1.0, 0.12], [1.12, 0]] });
}, { level: 0.75, max: 4 });
def('ult_ready', 1.1, (B) => {
  const v = B.verb({ secs: 1.2, decay: 2.5, g: 0.45 });
  const W = wet(B, v, 0.7);
  ['E5', 'B5', 'E6', 'G#6', 'B6'].forEach((n, i) => bell(B, { t: i * 0.07, f: hz(n), d: 0.7, p: 0.17, index: 1.3, pan: -0.5 + i * 0.25, to: W }));
  const trem = am(B, v, { dur: 1.0, rate: 11, depth: 0.5, kind: 'sine' });
  for (const n of ['E6', 'B6']) B.osc({ f: hz(n), to: trem, unison: [-8, 8], g: swell(1.0, 0.45, 0.06) });
  whoosh(B, { dur: 0.4, f0: 1500, f1: 6000, p: 0.2, color: 'white', to: v });
}, { stereo: true, level: 0.78, max: 2 });
def('ult_activate', 1.45, (B) => {
  const v = B.verb({ secs: 1.4, decay: 2.2, g: 0.5 });
  B.noise({ dur: 1.0, filters: [['hp', [[0, 300], [1.0, 6000]]], ['pk', [[0, 600], [1.0, 8000]], 2, 8]], g: ramp(1.0, 0.35) });
  for (const [n, d] of [['A2', 0], ['E3', 0], ['A3', 0], ['C#4', 0]]) B.osc({ type: 'sawtooth', unison: [-12, 0, 12], f: [[0, hz(n) * 0.5], [0.98, hz(n)]], filters: [['lp', [[0, 300], [0.98, 6000]], 2]], g: ramp(1.0, 0.11), detune: d });
  impact(B, { t: 1.0, size: 0.9, p: 1, to: wet(B, v, 0.5) });
  for (const n of ['A3', 'E4', 'A4', 'C#5']) brass(B, { t: 1.0, f: hz(n), dur: 0.3, p: 0.12, to: v, bright: 1.4 });
  cymbal(B, { t: 1.0, d: 0.45, p: 0.3 });
}, { stereo: true, level: 1.05, max: 2 });
def('explosion_small', 0.85, (B) => boom(B, { size: 0.25, p: 1 }), { level: 0.9 });
def('explosion_big', 2.4, (B) => {
  const v = B.verb({ secs: 2.2, decay: 2.2, g: 0.5 });
  boom(B, { size: 0.9, p: 1, to: wet(B, v, 0.5) });
  B.crackle({ t: 0.2, dur: 1.6, density: 40, decay: 3, filters: [['bp', 1500, 0.8]], g: { a: 0.05, d: 1.6, p: 0.5 }, to: v });
}, { stereo: true, level: 1.1, max: 3 });
def('hazard_warn', 1.1, (B) => {
  for (let i = 0; i < 3; i++) {
    const t = i * 0.34;
    B.osc({ type: 'square', t, f: 960, filters: [['lp', 3500]], g: { a: 0.003, h: 0.11, d: 0.03, p: 0.3 } });
    B.osc({ type: 'square', t: t + 0.15, f: 720, filters: [['lp', 3500]], g: { a: 0.003, h: 0.11, d: 0.04, p: 0.3 } });
  }
}, { level: 0.78, max: 2 });
def('cannon_fire', 1.7, (B) => {
  const v = B.verb({ secs: 1.5, decay: 2.5, g: 0.45 });
  thump(B, { f0: 95, f1: 32, dur: 0.7, p: 1, drive: 4 });
  B.noise({ filters: [['hp', 900]], drive: 3, g: { a: 0.0005, d: 0.08, p: 0.9 } });
  B.noise({ color: 'brown', drive: 2, filters: [['lp', [[0, 2500], [0.2, 500], [1.4, 120]]]], g: { a: 0.002, d: 1.4, p: 0.8 } });
  B.noise({ color: 'brown', filters: [['lp', 800]], g: { a: 0.01, d: 1.2, p: 0.5 }, to: v });
  B.crackle({ t: 0.01, dur: 0.4, density: 200, filters: [['hp', 2000]], g: { a: 0.002, d: 0.4, p: 0.4 } });
}, { stereo: true, level: 1.05 });
def('wind_gust', 1.6, (B) => {
  B.noise({ dur: 1.6, color: 'pink', filters: [['bp', [[0, 400], [0.7, 1200], [1.6, 500]], 0.9]], g: swell(1.6, 0.65, 0.8) });
  B.osc({ f: [[0, 800], [0.7, 1400], [1.6, 900]], filters: [['bp', 1000, 2]], jitter: { rate: 4, depth: 60 }, g: swell(1.6, 0.7, 0.03) });
  B.noise({ dur: 1.6, filters: [['bp', [[0, 900], [0.7, 1400], [1.6, 1000]], 14]], g: swell(1.6, 0.7, 0.5) });
}, { level: 0.72, max: 3 });
def('geyser', 2.1, (B) => {
  B.noise({ color: 'brown', dur: 1.0, filters: [['lp', 220]], drive: 2, g: swell(1.0, 0.55, 0.9) });
  thump(B, { t: 0.5, f0: 90, f1: 40, dur: 0.6, p: 0.7, drive: 2 });
  B.noise({ t: 0.5, dur: 1.55, filters: [['bp', [[0, 1500], [0.4, 3500], [1.5, 2500]], 0.5]], g: [[0, 0], [0.08, 0.7], [0.6, 0.5], [1.55, 0]], pan: [[0, -0.2], [1.5, 0.2]] });
  B.noise({ t: 0.5, dur: 1.55, filters: [['hp', 6000]], g: [[0, 0], [0.1, 0.25], [1.55, 0]] });
  B.crackle({ t: 0.5, dur: 1.4, density: 120, decay: 3, filters: [['lp', 1600]], g: [[0, 0], [0.1, 0.6], [1.4, 0]] });
}, { stereo: true, level: 0.88, max: 3 });

function bubbles(B, { t = 0, dur = 0.5, n = 10, f0 = 400, f1 = 1400, p = 0.2, to }) {
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(B.r(), 1.4) * dur;
    const f = B.r(f0, f1);
    const d = B.r(0.025, 0.07);
    B.osc({ t: tt, to, f: [[0, f], [d, f * B.r(1.6, 2.4)]], g: { a: 0.002, d, p: p * B.r(0.5, 1) } });
  }
}
def('splash', 0.75, (B) => {
  B.noise({ filters: [['bp', 900, 0.7]], g: { a: 0.001, d: 0.14, p: 0.9 } });
  B.noise({ color: 'pink', filters: [['bp', [[0, 2500], [0.4, 1200]], 0.8]], g: [[0, 0], [0.02, 0.5], [0.15, 0.3], [0.6, 0]] });
  B.noise({ filters: [['hp', 4000]], g: [[0, 0], [0.02, 0.15], [0.15, 0.08], [0.5, 0]] });
  thump(B, { f0: 160, f1: 70, dur: 0.1, p: 0.5 });
  bubbles(B, { t: 0.04, dur: 0.5, n: 14, p: 0.35 });
}, { level: 0.78 });
def('lava_splash', 1.05, (B) => {
  B.noise({ color: 'brown', drive: 2, filters: [['lp', 700]], g: { a: 0.002, d: 0.25, p: 0.9 } });
  thump(B, { f0: 110, f1: 45, dur: 0.25, p: 0.6 });
  bubbles(B, { t: 0.05, dur: 0.6, n: 10, f0: 140, f1: 480, p: 0.4 });
  B.crackle({ t: 0.03, dur: 0.95, density: 300, decay: 0.6, filters: [['hp', 4500]], g: [[0, 0], [0.05, 0.5], [0.95, 0]] });
  B.noise({ t: 0.05, dur: 0.9, filters: [['hp', 6000]], g: [[0, 0], [0.05, 0.12], [0.9, 0]] });
}, { level: 0.85 });

// ---------------------------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------------------------
def('punch_light', 0.17, (B) => {
  B.noise({ filters: [['bp', 1100, 1]], drive: 2, g: { a: 0.001, d: 0.05, p: 0.6 } });
  thump(B, { f0: 170, f1: 85, dur: 0.08, p: 0.85, drive: 1.5 });
  click(B, { f: 3000, d: 0.008, p: 0.3 });
}, { level: 0.72 });
def('punch_heavy', 0.45, (B) => {
  thump(B, { f0: 125, f1: 42, dur: 0.28, p: 1, drive: 3 });
  B.noise({ color: 'pink', filters: [['bp', 700, 0.9]], drive: 3, g: { a: 0.001, d: 0.13, p: 0.7 } });
  click(B, { f: 2500, d: 0.015, p: 0.4 });
  B.noise({ t: 0.004, filters: [['bp', 2200, 1]], g: { a: 0.001, d: 0.05, p: 0.3 } });
}, { level: 0.92 });
def('kick_light', 0.2, (B) => {
  whoosh(B, { dur: 0.06, f0: 1500, f1: 3500, p: 0.35, peak: 0.8 });
  B.noise({ t: 0.04, filters: [['bp', 2300, 1.2]], drive: 2, g: { a: 0.001, d: 0.05, p: 0.6 } });
  thump(B, { t: 0.04, f0: 210, f1: 100, dur: 0.07, p: 0.7 });
}, { level: 0.72 });
def('kick_heavy', 0.5, (B) => {
  whoosh(B, { dur: 0.1, f0: 800, f1: 2800, p: 0.4, peak: 0.8 });
  B.noise({ t: 0.08, filters: [['bp', 1600, 1]], drive: 3, g: { a: 0.001, d: 0.09, p: 0.7 } });
  thump(B, { t: 0.08, f0: 145, f1: 48, dur: 0.3, p: 1, drive: 2.5 });
  B.noise({ t: 0.08, color: 'brown', filters: [['lp', 1500]], drive: 2, g: { a: 0.001, d: 0.15, p: 0.5 } });
}, { level: 0.92 });
def('slash_light', 0.32, (B) => slash(B, { size: 0.25, p: 1 }), { level: 0.68 });
def('slash_heavy', 0.6, (B) => {
  slash(B, { size: 0.85, p: 1, ring: 1.4 });
  impact(B, { t: 0.12, size: 0.3, p: 0.4, bright: 1.2 });
}, { level: 0.88 });
def('sword_ring', 1.4, (B) => {
  const v = B.verb({ secs: 1.2, decay: 3, g: 0.3 });
  const parts = [[1, 1, 1.25], [1.0016, 0.7, 1.2], [2.03, 0.5, 0.9], [2.97, 0.35, 0.7], [4.11, 0.25, 0.5], [5.43, 0.15, 0.35]];
  B.modal({ t: 0.05, f: 985, parts, vol: 0.32, to: wet(B, v, 0.5) });
  B.noise({ dur: 0.12, filters: [['bp', [[0, 3000], [0.12, 8000]], 3]], g: swell(0.12, 0.05, 0.4) });
  click(B, { t: 0.05, f: 4000, d: 0.008, p: 0.3 });
}, { stereo: true, level: 0.8 });
def('fire_whoosh', 0.65, (B) => {
  fireRoar(B, { dur: 0.6, p: 0.8, f0: 300, f1: 1500, peak: 0.4 });
  whoosh(B, { dur: 0.5, f0: 500, f1: 2000, p: 0.35, color: 'pink' });
}, { level: 0.78 });
def('fire_burst', 0.85, (B) => {
  B.noise({ color: 'pink', drive: 3, filters: [['lp', [[0, 5000], [0.6, 600]]]], g: { a: 0.004, d: 0.6, p: 0.9 } });
  thump(B, { f0: 100, f1: 50, dur: 0.3, p: 0.7 });
  fireRoar(B, { t: 0.02, dur: 0.75, p: 0.6, f0: 500, f1: 1200, peak: 0.12, crack: 2 });
}, { level: 0.92 });
def('fireball', 0.9, (B) => {
  whoosh(B, { dur: 0.25, f0: 600, f1: 2500, p: 0.5, peak: 0.5 });
  fireRoar(B, { t: 0.03, dur: 0.85, p: 0.8, f0: 350, f1: 1100, peak: 0.25 });
  B.osc({ type: 'sawtooth', f: [[0, 220], [0.6, 90]], filters: [['lp', 900]], g: swell(0.7, 0.1, 0.08) });
}, { level: 0.82 });
def('flame_roar', 1.45, (B) => {
  fireRoar(B, { dur: 1.4, p: 0.9, f0: 450, f1: 1000, peak: 0.3, crack: 1.5 });
  B.osc({ f: [[0, 55], [0.5, 70], [1.4, 50]], g: swell(1.4, 0.4, 0.3) });
  fireRoar(B, { dur: 1.4, p: 0.4, f0: 800, f1: 2400, peak: 0.35, crack: 0 });
}, { level: 0.88, max: 3 });
def('lightning_zap', 0.55, (B) => {
  B.osc({ type: 'sawtooth', f: [[0, 95], [0.5, 70]], unison: [0, 700], jitter: { rate: 60, depth: 900 }, filters: [['bp', 2200, 0.9]], drive: 3, g: { a: 0.002, h: 0.12, d: 0.35, p: 0.6 } });
  B.crackle({ dur: 0.45, density: 600, decay: 0.5, filters: [['hp', 3000]], g: { a: 0.001, d: 0.45, p: 0.8 } });
  B.noise({ filters: [['hp', 4000]], g: { a: 0.001, d: 0.12, p: 0.5 } });
}, { level: 0.82 });
def('thunder', 3.0, (B) => {
  const v = B.verb({ secs: 2.4, decay: 2, g: 0.45, bright: 0.3 });
  thunderStrike(B, { p: 1, len: 2.7, to: wet(B, v, 0.45) });
}, { stereo: true, level: 1.1, max: 3 });
def('spark', 0.22, (B) => {
  B.crackle({ dur: 0.18, density: 1400, decay: 0.6, drive: 3, filters: [['hp', 3000]], g: { a: 0.001, d: 0.18, p: 0.9 } });
  B.noise({ filters: [['bp', 6000, 2]], g: { a: 0.001, d: 0.08, p: 0.35 } });
  B.osc({ f: [[0, 3000], [0.05, 5200]], g: { a: 0.001, d: 0.06, p: 0.15 } });
}, { level: 0.58 });

// ---------------------------------------------------------------------------------------------
// Character palettes
// ---------------------------------------------------------------------------------------------
// Captain Rubber
function stretchVoice(B, { t = 0, dur = 0.55, f0 = 110, f1 = 330, p = 0.6, to }) {
  B.osc({ type: 'sawtooth', t, to, f: [[0, f0], [dur * 0.9, f1]], vib: { rate: 17, depth: 50, rise: 0.05 }, filters: [['bp', [[0, 700], [dur, 1500]], 3], ['lp', 3000]], g: [[0, 0], [0.04, p * 0.6], [dur * 0.8, p], [dur, 0]] });
  B.osc({ type: 'triangle', t, to, f: [[0, f0 * 5], [dur * 0.9, f1 * 4.2]], vib: { rate: 23, depth: 30 }, g: [[0, 0], [0.05, p * 0.08], [dur * 0.8, p * 0.12], [dur, 0]] });
}
def('rubber_stretch', 0.6, (B) => stretchVoice(B, { dur: 0.58 }), { level: 0.72 });
def('rubber_snap', 0.32, (B) => {
  B.osc({ type: 'triangle', f: [[0, 1400], [0.08, 200]], g: { a: 0.001, d: 0.1, p: 0.6 } });
  B.noise({ t: 0.06, filters: [['bp', 2000, 1.2]], g: { a: 0.001, d: 0.04, p: 0.7 } });
  thump(B, { t: 0.06, f0: 210, f1: 90, dur: 0.1, p: 0.7 });
}, { level: 0.82 });
def('rubber_boing', 0.75, (B) => {
  const o = B.osc({ type: 'triangle', f: [[0, 170], [0.7, 260]], g: { a: 0.003, d: 0.7, p: 0.6 } });
  B.lfo(o.src.detune, { dur: 0.72, rate: 15, depth: 1, depthEnv: [[0, 700], [0.7, 0]] });
  const o2 = B.osc({ f: [[0, 340], [0.7, 520]], g: { a: 0.003, d: 0.5, p: 0.15 } });
  B.lfo(o2.src.detune, { dur: 0.72, rate: 15, depth: 1, depthEnv: [[0, 700], [0.7, 0]] });
  thump(B, { f0: 200, f1: 100, dur: 0.06, p: 0.4 });
}, { level: 0.78 });
def('gatling', 0.78, (B) => {
  const whir = am(B, B.out, { dur: 0.62, rate: 23, depth: 0.6, kind: 'square', base: 0.6 });
  B.noise({ dur: 0.62, to: whir, filters: [['bp', 1500, 1.1]], g: [[0, 0], [0.05, 0.3], [0.55, 0.3], [0.62, 0]] });
  for (let i = 0; i < 14; i++) {
    const t = i * 0.043 + B.r(-0.004, 0.004);
    const pan = (i % 2 ? 0.35 : -0.35) + B.r(-0.15, 0.15);
    const to = panner(B, pan);
    B.noise({ t, to, filters: [['bp', B.r(1100, 1900), 1.1]], drive: 2, g: { a: 0.001, d: 0.035, p: 0.5 } });
    thump(B, { t, f0: B.r(170, 200), f1: 80, dur: 0.05, p: 0.6, to });
  }
  impact(B, { t: 0.63, size: 0.5, p: 0.9 });
}, { stereo: true, level: 0.92, max: 3 });

// Spatial Swordsman
def('spatial_hum', 1.25, (B) => {
  const trem = am(B, B.out, { dur: 1.2, rate: 6.5, depth: 0.3, kind: 'sine' });
  for (const [f, a] of [[330, 1], [495.6, 0.6], [660.8, 0.5], [991, 0.3], [1320, 0.2]]) {
    B.osc({ f, to: trem, wave: undefined, unison: [-5, 5], pan: B.r(-0.5, 0.5), g: swell(1.2, 0.35, 0.12 * a) });
  }
  const sh = am(B, B.out, { dur: 1.2, rate: 13, depth: 0.6 });
  B.noise({ dur: 1.2, to: sh, filters: [['hp', 6500]], g: swell(1.2, 0.4, 0.06) });
}, { stereo: true, level: 0.58, max: 2 });
function crystalCut(B, { t = 0, p = 1, to, pan = 0 }) {
  const dst = panner(B, pan, to);
  B.noise({ t, to: dst, filters: [['bp', [[0, 6500], [0.18, 1500]], 8], ['hp', 900]], g: { a: 0.003, d: 0.2, p: 0.9 * p } });
  B.modal({ t: t + 0.02, f: 2600 + B.r(-150, 150), to: dst, vol: 0.25 * p, parts: [[1, 1, 0.35], [2.32, 0.6, 0.25], [4.25, 0.4, 0.15], [6.63, 0.2, 0.08]] });
  B.noise({ t, to: dst, filters: [['hp', 3000]], g: swell(0.12, 0.08, 0.3 * p) });
}
def('spatial_cut', 0.55, (B) => {
  const v = B.verb({ secs: 0.5, decay: 3, g: 0.3, bright: 0.8 });
  crystalCut(B, { p: 1, to: wet(B, v, 0.4) });
}, { stereo: true, level: 0.82 });
def('teleport_out', 0.5, (B) => {
  zip(B, { f0: 300, f1: 3200, dur: 0.28, p: 0.3 });
  B.noise({ dur: 0.3, filters: [['hp', [[0, 1000], [0.3, 7000]]]], g: ramp(0.3, 0.25) });
  sparkle(B, { t: 0.18, dur: 0.25, n: 6, p: 0.12, f0: 4000, f1: 8000, rise: true });
  B.osc({ t: 0.28, f: [[0, 1800], [0.04, 3600]], g: { a: 0.001, d: 0.05, p: 0.25 } });
}, { level: 0.72 });
def('teleport_in', 0.48, (B) => {
  zip(B, { f0: 3200, f1: 250, dur: 0.22, p: 0.3 });
  B.noise({ dur: 0.22, filters: [['hp', [[0, 7000], [0.22, 1000]]]], g: [[0, 0], [0.02, 0.25], [0.22, 0.05], [0.24, 0]] });
  thump(B, { t: 0.22, f0: 220, f1: 80, dur: 0.12, p: 0.7 });
  click(B, { t: 0.22, f: 2500, d: 0.015, p: 0.4 });
  B.modal({ t: 0.22, f: 2100, parts: [[1, 1, 0.2], [2.32, 0.5, 0.12]], vol: 0.2 });
}, { level: 0.76 });
function dome(B, { t = 0, dur = 2.0, p = 1, to, v }) {
  B.osc({ t, to, f: [[0, 50], [dur, 62]], g: swell(dur, dur * 0.55, 0.2 * p) });
  [110, 165, 220, 330, 440, 660].forEach((f, i) => {
    B.osc({ t: t + i * 0.08, to: v || to, f: [[0, f * 0.97], [dur, f * 1.03]], unison: [-4, 4], pan: (i % 2 ? 0.5 : -0.5), g: swell(dur - i * 0.08, (dur - i * 0.08) * 0.6, 0.17 * p / (1 + i * 0.25)) });
  });
  B.noise({ t, to, dur, color: 'pink', filters: [['bp', [[0, 200], [dur * 0.7, 2200], [dur, 1400]], 6]], g: swell(dur, dur * 0.65, 0.5 * p) });
  B.noise({ t, to: v || to, dur, filters: [['hp', 6000]], g: swell(dur, dur * 0.7, 0.1 * p) });
}
def('domain_open', 2.3, (B) => {
  const v = B.verb({ secs: 1.8, decay: 1.8, g: 0.6 });
  dome(B, { dur: 1.9, to: B.out, v });
  B.modal({ t: 1.2, f: 1320, parts: [[1, 1, 0.9], [2.32, 0.5, 0.6], [4.25, 0.3, 0.4]], vol: 0.12, to: v });
}, { stereo: true, level: 0.9, max: 2 });

// Monster Doctor
def('monster_roar', 1.55, (B) => {
  const v = B.verb({ secs: 1.0, decay: 2.5, g: 0.3 });
  monsterVoice(B, { dur: 1.45, p: 0.95, to: wet(B, v, 0.4) });
}, { stereo: true, level: 0.98, max: 2 });
def('monster_thud', 0.85, (B) => {
  thump(B, { f0: 85, f1: 28, dur: 0.65, p: 1, drive: 4 });
  B.noise({ color: 'brown', drive: 2, filters: [['lp', 420]], g: { a: 0.002, d: 0.3, p: 0.9 } });
  B.crackle({ t: 0.01, dur: 0.35, density: 90, filters: [['bp', 1200, 0.8]], g: { a: 0.002, d: 0.35, p: 0.5 } });
  click(B, { f: 1200, d: 0.02, p: 0.3 });
}, { level: 1.0 });
function transformLayer(B, { t = 0, dur = 1.5, p = 1, to }) {
  B.crackle({ t, dur, density: 25, decay: 4, to, filters: [['bp', 800, 4]], g: ramp(dur, 1.3 * p, 0.05) });
  B.crackle({ t, dur, density: 12, decay: 8, to, filters: [['bp', 350, 3]], g: ramp(dur, 1.0 * p, 0.05) });
  B.osc({ type: 'sawtooth', t, to, unison: [-15, 15], f: [[0, 45], [dur, 120]], jitter: { rate: 20, depth: 60 }, filters: [['lp', [[0, 200], [dur, 1600]], 3]], drive: 2.5, g: ramp(dur, 0.5 * p) });
  B.noise({ t, to, dur, color: 'brown', filters: [['lp', [[0, 300], [dur, 2000]]]], g: ramp(dur, 0.4 * p) });
  [0, 0.42, 0.75, 1.0, 1.18].forEach((h) => { if (h * dur < dur - 0.05) thump(B, { t: t + h * dur, f0: 70, f1: 35, dur: 0.18, p: 0.7 * p, to }); });
}
def('transform', 1.7, (B) => {
  const v = B.verb({ secs: 1.2, decay: 2.5, g: 0.35 });
  transformLayer(B, { dur: 1.4, p: 1, to: wet(B, v, 0.4) });
  impact(B, { t: 1.4, size: 0.6, p: 0.8 });
}, { stereo: true, level: 0.92, max: 2 });

// Slingshot Sniper
def('sling_twang', 0.55, (B) => {
  B.pluck({ f: 196, dur: 0.5, damp: 0.994, bright: 0.8, g: { a: 0.001, d: 0.5, p: 0.8 }, bend: [[0, 0.88], [0.04, 1.06], [0.12, 1.0]] });
  B.pluck({ f: 392, dur: 0.3, damp: 0.99, bright: 0.6, g: { a: 0.001, d: 0.3, p: 0.25 } });
  whoosh(B, { t: 0.01, dur: 0.12, f0: 1500, f1: 4000, p: 0.3, color: 'white' });
}, { level: 0.75 });
def('pellet_pop', 0.15, (B) => {
  B.osc({ f: [[0, 900], [0.04, 300]], g: { a: 0.001, d: 0.05, p: 0.7 } });
  click(B, { f: 3000, d: 0.01, p: 0.5 });
  B.noise({ filters: [['bp', 2500, 1]], g: { a: 0.001, d: 0.02, p: 0.4 } });
}, { level: 0.68 });
function mechClick(B, { t = 0, f = 1800, p = 1, to }) {
  B.modal({ t, f, to, vol: 0.5 * p, parts: [[1, 1, 0.035], [2.7, 0.6, 0.02], [4.4, 0.3, 0.012]] });
  click(B, { t, f: 3000, d: 0.008, p: 0.6 * p, to });
  B.modal({ t, f: 310, to, vol: 0.3 * p, parts: [[1, 1, 0.05], [2.1, 0.4, 0.03]] });
}
def('trap_set', 0.45, (B) => {
  mechClick(B, { f: 1700, p: 1.2 });
  const ratchet = am(B, B.out, { t: 0.05, dur: 0.14, rate: 55, depth: 0.9, kind: 'square', base: 0.1 });
  B.noise({ t: 0.05, dur: 0.13, to: ratchet, filters: [['bp', 2600, 2]], g: [[0, 0], [0.01, 0.35], [0.12, 0.35], [0.13, 0]] });
  mechClick(B, { t: 0.2, f: 1400, p: 1.3 });
  B.modal({ t: 0.2, f: 520, parts: [[1, 1, 0.12], [2.2, 0.5, 0.06]], vol: 0.35 });
}, { level: 0.68, clip: 3 });
def('trap_snap', 0.55, (B) => {
  B.modal({ f: 1150, parts: [[1, 1, 0.12], [2.4, 0.7, 0.08], [3.9, 0.4, 0.05]], vol: 0.55 });
  B.noise({ filters: [['bp', 2600, 1]], drive: 2, g: { a: 0.0005, d: 0.05, p: 0.8 } });
  thump(B, { f0: 200, f1: 90, dur: 0.1, p: 0.6 });
  const o = B.osc({ type: 'triangle', t: 0.01, f: 420, g: { a: 0.002, d: 0.45, p: 0.25 } });
  B.lfo(o.src.detune, { t: 0.01, dur: 0.46, rate: 26, depth: 1, depthEnv: [[0, 300], [0.45, 10]] });
}, { level: 0.88 });
def('grapple_fire', 0.65, (B) => {
  thump(B, { f0: 150, f1: 60, dur: 0.12, p: 0.7 });
  B.noise({ filters: [['bp', 900, 1]], drive: 2, g: { a: 0.001, d: 0.08, p: 0.6 } });
  whoosh(B, { t: 0.02, dur: 0.4, f0: 800, f1: 3000, f2: 2000, p: 0.45, peak: 0.3 });
  B.crackle({ t: 0.05, dur: 0.55, density: 140, decay: 2, filters: [['bp', 4200, 3]], g: [[0, 0], [0.05, 0.9], [0.55, 0]] });
}, { level: 0.82 });
def('grapple_reel', 0.9, (B) => {
  let t = 0;
  for (let i = 0; t < 0.82; i++) {
    mechClick(B, { t, f: 2200 + B.r(-100, 100), p: 0.45 });
    t += 0.05 - i * 0.0012;
  }
  B.osc({ type: 'sawtooth', f: [[0, 140], [0.85, 230]], filters: [['lp', 800]], g: [[0, 0], [0.05, 0.08], [0.8, 0.08], [0.88, 0]] });
}, { level: 0.68 });

// Tempest
def('storm_wind', 1.85, (B) => {
  B.noise({ dur: 1.8, color: 'pink', filters: [['bp', [[0, 300], [0.8, 1500], [1.8, 600]], 1]], pan: [[0, -0.8], [0.6, 0.8], [1.2, -0.6], [1.8, 0.4]], g: swell(1.8, 0.7, 0.8) });
  B.noise({ dur: 1.8, filters: [['bp', [[0, 700], [0.8, 1300], [1.8, 800]], 15]], pan: [[0, 0.6], [0.9, -0.7], [1.8, 0.5]], g: swell(1.8, 0.8, 0.6) });
  B.noise({ dur: 1.8, color: 'brown', filters: [['lp', 160]], g: swell(1.8, 0.8, 0.5) });
}, { stereo: true, level: 0.82, max: 3 });

// ---------------------------------------------------------------------------------------------
// Ultimates — layered, 1.5–2.5 s, the biggest sounds in the game
// ---------------------------------------------------------------------------------------------
const ULT = { stereo: true, level: 1.15, max: 2 };

def('ult_rubber', 2.4, (B) => {
  const v = B.verb({ secs: 1.8, decay: 2, g: 0.5 });
  stretchVoice(B, { dur: 1.25, f0: 55, f1: 240, p: 1.4, to: wet(B, v, 0.4) });
  stretchVoice(B, { dur: 1.25, f0: 82, f1: 330, p: 0.6 });
  B.noise({ dur: 1.25, filters: [['bp', [[0, 400], [1.25, 3200]], 2]], g: ramp(1.25, 0.6) });
  B.crackle({ dur: 1.2, density: 18, decay: 6, filters: [['bp', 600, 3]], g: ramp(1.2, 1.6) });
  whoosh(B, { t: 1.08, dur: 0.24, f0: 400, f1: 2500, p: 0.6, peak: 0.85 });
  impact(B, { t: 1.3, size: 1.25, p: 1, to: wet(B, v, 0.5) });
  boom(B, { t: 1.3, size: 0.5, p: 0.5, to: v });
  B.osc({ t: 1.3, f: [[0, 60], [1, 26]], g: { a: 0.003, d: 1.05, p: 0.6 } });
}, ULT);

def('ult_threeblade', 2.3, (B) => {
  const v = B.verb({ secs: 1.5, decay: 2.5, g: 0.45 });
  B.noise({ dur: 0.35, filters: [['bp', [[0, 2000], [0.35, 7000]], 4]], g: ramp(0.35, 0.4) });
  const parts = [[1, 1, 1.0], [1.0016, 0.7, 1.0], [2.03, 0.5, 0.8], [2.97, 0.35, 0.6], [4.11, 0.25, 0.4]];
  B.modal({ t: 0.33, f: 985, parts, vol: 0.27, to: wet(B, v, 0.5) });
  for (let i = 0; i < 10; i++) {
    const t = 0.55 + i * 0.09 + B.r(-0.01, 0.01);
    const pan = (i % 2 ? 0.6 : -0.6) * B.r(0.5, 1);
    const dst = panner(B, pan);
    slash(B, { t, size: B.r(0.3, 0.55), p: 1.3, to: dst, ring: 0.8 });
    impact(B, { t: t + 0.04, size: 0.2, p: 0.6, to: dst });
  }
  whoosh(B, { t: 1.42, dur: 0.15, f0: 2000, f1: 500, p: 0.3, color: 'white', peak: 0.2 });
  slash(B, { t: 1.6, size: 1.0, p: 1.1, ring: 1.6 });
  impact(B, { t: 1.66, size: 1.0, p: 0.9, to: wet(B, v, 0.5) });
  B.modal({ t: 1.66, f: 740, parts, vol: 0.18, to: v });
}, ULT);

def('ult_blaze', 2.5, (B) => {
  const v = B.verb({ secs: 1.8, decay: 2, g: 0.45 });
  const spin = panner(B, 0);
  if (spin.pan) B.lfo(spin.pan, { dur: 1.7, rate: 3, depth: 0.8, rateEnv: [[0, 2], [1.6, 9]] });
  fireRoar(B, { dur: 1.7, p: 1.2, f0: 300, f1: 1800, peak: 0.85, crack: 1.5, to: spin });
  B.osc({ type: 'sawtooth', dur: 1.7, f: [[0, 200], [1.65, 900]], filters: [['bp', [[0, 600], [1.65, 3000]], 3]], to: spin, g: ramp(1.7, 0.12) });
  whoosh(B, { dur: 1.7, f0: 300, f1: 4000, f2: 3000, p: 0.35, peak: 0.95, to: spin });
  boom(B, { t: 1.7, size: 0.8, p: 1, to: wet(B, v, 0.5) });
  fireRoar(B, { t: 1.72, dur: 0.75, p: 0.6, f0: 600, f1: 1200, peak: 0.1, crack: 2, to: v });
}, ULT);

def('ult_spatial', 2.4, (B) => {
  const v = B.verb({ secs: 1.6, decay: 2, g: 0.55, bright: 0.8 });
  dome(B, { dur: 1.25, p: 1.2, to: B.out, v });
  for (let i = 0; i < 7; i++) crystalCut(B, { t: 1.15 + i * 0.085, p: 1.5, pan: (i % 2 ? 0.7 : -0.7) * B.r(0.4, 1), to: i % 3 === 0 ? v : B.out });
  B.noise({ t: 1.8, filters: [['hp', 1500]], drive: 3, g: { a: 0.001, d: 0.15, p: 0.6 } });
  shards(B, { t: 1.8, dur: 0.5, n: 26, p: 0.3, to: wet(B, v, 0.45) });
  thump(B, { t: 1.8, f0: 120, f1: 35, dur: 0.5, p: 0.8, drive: 2 });
}, ULT);

def('ult_ember', 2.5, (B) => {
  const v = B.verb({ secs: 2.0, decay: 2, g: 0.5 });
  const sun = ['D3', 'A3', 'D4', 'F#4', 'A4'];
  const W = wet(B, v, 0.7);
  for (const n of sun) B.osc({ type: 'sawtooth', dur: 1.6, unison: [-10, 0, 10], f: [[0, hz(n) * 0.75], [1.5, hz(n)]], filters: [['lp', [[0, 300], [1.5, 5000]], 1.5]], g: ramp(1.6, 0.09), to: W });
  fireRoar(B, { dur: 1.6, p: 0.8, f0: 250, f1: 1400, peak: 0.9, crack: 1 });
  boom(B, { t: 1.6, size: 1.1, p: 1, to: wet(B, v, 0.55) });
  B.noise({ t: 1.6, color: 'pink', drive: 3, filters: [['lp', [[0, 6000], [0.8, 500]]]], g: { a: 0.003, d: 0.85, p: 0.6 } });
  B.crackle({ t: 1.65, dur: 0.85, density: 120, filters: [['hp', 1800]], g: { a: 0.01, d: 0.85, p: 0.6 }, to: v });
}, ULT);

def('ult_tempest', 2.6, (B) => {
  const v = B.verb({ secs: 2.0, decay: 2, g: 0.45, bright: 0.35 });
  B.noise({ dur: 1.2, color: 'pink', filters: [['bp', [[0, 300], [1.0, 1600]], 1]], pan: [[0, -0.7], [0.5, 0.7], [1.0, -0.5]], g: ramp(1.2, 0.6) });
  B.noise({ dur: 1.2, filters: [['bp', [[0, 600], [1.0, 1400]], 14]], g: ramp(1.2, 0.5) });
  B.noise({ dur: 2.5, color: 'brown', filters: [['lp', 140]], g: [[0, 0], [0.9, 0.6], [2.5, 0]] });
  [[0.85, -0.5, 0.8], [1.35, 0.6, 0.9], [1.85, 0, 1.0]].forEach(([t, pan, p]) => {
    const dst = panner(B, pan);
    thunderStrike(B, { t, p, len: Math.min(1.4, 2.55 - t), to: wet(B, v, 0.4, dst) });
    B.crackle({ t: t - 0.12, dur: 0.14, density: 900, decay: 0.4, to: dst, filters: [['hp', 3500]], g: ramp(0.14, 0.6) });
  });
}, ULT);

def('ult_monster', 2.4, (B) => {
  const v = B.verb({ secs: 1.5, decay: 2.2, g: 0.4 });
  const W = wet(B, v, 0.45);
  transformLayer(B, { dur: 0.95, p: 0.9, to: W });
  monsterVoice(B, { t: 0.95, dur: 1.4, p: 1, f0: 62, fp: 92, f1: 50, open: 1.1, to: W });
  monsterVoice(B, { t: 0.97, dur: 1.38, p: 0.6, f0: 93, fp: 140, f1: 75 });
  impact(B, { t: 0.95, size: 1.0, p: 0.8 });
}, ULT);

def('ult_sniper', 2.4, (B) => {
  const v = B.verb({ secs: 1.6, decay: 2.2, g: 0.45 });
  for (let i = 0; i < 8; i++) {
    const t = i * 0.1;
    const dst = panner(B, (i % 2 ? 0.55 : -0.55));
    B.pluck({ t, f: 196 * (1 + i * 0.04), dur: 0.3, damp: 0.99, bright: 0.8, to: dst, g: { a: 0.001, d: 0.3, p: 1.0 }, bend: [[0, 0.9], [0.04, 1.05], [0.1, 1]] });
    whoosh(B, { t: t + 0.01, dur: 0.18, f0: 1500, f1: 5000, p: 0.45, color: 'white', to: dst });
  }
  for (let i = 0; i < 12; i++) {
    const t = 1.0 + i * 0.085 + B.r(-0.02, 0.02);
    const dst = panner(B, B.r(-0.9, 0.9));
    if (i % 4 === 3) {
      boom(B, { t, size: 0.22, p: 0.7, to: dst });
      boom(B, { t, size: 0.2, p: 0.3, to: v });
    } else {
      B.osc({ t, to: dst, f: [[0, B.r(700, 1100)], [0.05, 260]], g: { a: 0.001, d: 0.06, p: 0.6 } });
      click(B, { t, f: 2500, d: 0.015, p: 0.5, to: dst });
      B.noise({ t, to: v, filters: [['bp', 1800, 1]], g: { a: 0.001, d: 0.05, p: 0.3 } });
    }
  }
}, ULT);

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------
export const SFX_NAMES = Object.freeze(Object.keys(SFX));
export const isUiSound = (name) => !!(SFX[name] && SFX[name].ui);

/** Target short-term loudness (see analyseBuffer) for a level-1.0 sound. */
export const TARGET_LOUDNESS = 0.2;
export const PEAK_LIMIT = 0.94;

function getOfflineCtor() {
  return (typeof OfflineAudioContext !== 'undefined' && OfflineAudioContext) ||
    (typeof webkitOfflineAudioContext !== 'undefined' && webkitOfflineAudioContext) || null; // eslint-disable-line no-undef
}

/**
 * Render several SFX in ONE OfflineAudioContext (laid out back to back, each gated to its own
 * slot so tails never bleed), then slice, trim and loudness-normalise them.
 * Returns { [name]: AudioBuffer } (mono for mono recipes, stereo for stereo ones).
 */
export async function renderSfxBatch(names, sampleRate = 44100) {
  const Ctor = getOfflineCtor();
  if (!Ctor) throw new Error('OfflineAudioContext unavailable');
  const GAP = 0.03;
  const slots = [];
  let t = 0.005;
  for (const name of names) {
    const r = SFX[name];
    if (!r) continue;
    slots.push({ name, t0: t, dur: r.dur });
    t += r.dur + GAP;
  }
  if (!slots.length) return {};
  const len = Math.ceil(t * sampleRate);
  const ctx = new Ctor(2, len, sampleRate);
  for (const s of slots) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(1, s.t0);
    out.gain.setValueAtTime(1, s.t0 + s.dur - 0.006);
    out.gain.linearRampToValueAtTime(0, s.t0 + s.dur);
    out.connect(ctx.destination);
    const B = new Builder(ctx, out, s.t0, hashStr(s.name));
    SFX[s.name].fn(B);
  }
  const rendered = await ctx.startRendering();
  const L = rendered.getChannelData(0), R = rendered.getChannelData(1);
  const result = {};
  for (const s of slots) {
    const r = SFX[s.name];
    const start = Math.floor(s.t0 * sampleRate);
    let n = Math.min(Math.floor(s.dur * sampleRate), len - start);
    // trim trailing near-silence (-64 dB re peak: inaudible in a game mix, saves memory)
    let pk = 0;
    for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[start + i]), Math.abs(R[start + i]));
    const thr = pk * 6e-4;
    let last = n - 1;
    while (last > 0 && Math.abs(L[start + last]) < thr && Math.abs(R[start + last]) < thr) last--;
    n = Math.min(n, last + Math.floor(sampleRate * 0.01) + 1);
    const ch = r.stereo ? 2 : 1;
    const buf = makeBuffer(ctx, ch, n, sampleRate);
    if (ch === 2) {
      buf.getChannelData(0).set(L.subarray(start, start + n));
      buf.getChannelData(1).set(R.subarray(start, start + n));
    } else {
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = 0.5 * (L[start + i] + R[start + i]);
    }
    if (r.clip) softClip(buf, r.clip);
    normalise(buf, r.level);
    result[s.name] = buf;
  }
  return result;
}

/** Post-render tanh saturation: densifies very spiky transients so they can reach their loudness target. */
function softClip(buf, drive) {
  const a = analyseBuffer(buf);
  if (!(a.peak > 0)) return;
  const k = drive / a.peak, norm = Math.tanh(drive);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * k) / norm;
  }
}

function normalise(buf, level) {
  const a = analyseBuffer(buf);
  if (!(a.peak > 0) || a.nan) return a;
  const g = Math.min((TARGET_LOUDNESS * level) / Math.max(a.loud, 1e-6), PEAK_LIMIT / a.peak);
  const n = buf.length;
  const fade = Math.min(n, Math.floor(buf.sampleRate * 0.006));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] *= g;
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
  }
  return a;
}

/**
 * Render many SFX, each in its OWN OfflineAudioContext, `concurrency` at a time. Browsers render
 * offline contexts on separate threads, so this is much faster than one big batch (whose every node
 * is processed for the whole batch length). Resolves to { [name]: AudioBuffer }.
 */
export async function renderSfxMany(names, sampleRate = 44100, { concurrency = 8, onEach } = {}) {
  const out = {};
  const queue = names.filter((n) => SFX[n]);
  const worker = async () => {
    while (queue.length) {
      const n = queue.shift();
      const r = await renderSfxBatch([n], sampleRate);
      out[n] = r[n];
      if (onEach) onEach(n, r[n]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
  return out;
}

/** Render a single SFX by name into a (normalised) AudioBuffer. */
export async function renderSfx(name, sampleRate = 44100) {
  if (!SFX[name]) throw new Error(`unknown sfx '${name}'`);
  const r = await renderSfxBatch([name], sampleRate);
  return r[name];
}
