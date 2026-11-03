// GRAND BRAWL audio — procedural music: synthesized instruments, a tiny pattern language,
// a track compiler and a lookahead sequencer that schedules into any BaseAudioContext
// (real-time AudioContext or OfflineAudioContext for tests / previews).
import { Builder, mtof, karplusBuffer, periodicWave, WAVES, hashStr } from './synth.js';
import { TRACKS } from './tracks.js';

// ---------------------------------------------------------------------------------------------
// Theory: notes, chords, melodies
// ---------------------------------------------------------------------------------------------
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteToMidi(n) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note '${n}'`);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], aug: [0, 4, 8], '5': [0, 7], add9: [0, 4, 7, 14],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '7sus4': [0, 5, 7, 10],
};
export function parseChord(sym) {
  const m = /^([A-G])([#b]?)(maj7|m7|m6|7sus4|sus4|sus2|dim|aug|add9|m|7|5|6)?(?:\/([A-G])([#b]?))?$/.exec(sym);
  if (!m) throw new Error(`bad chord '${sym}'`);
  const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const iv = QUAL[m[3] || ''];
  const bass = m[4] ? (PC[m[4]] + (m[5] === '#' ? 1 : m[5] === 'b' ? -1 : 0) + 12) % 12 : root;
  return { sym, root, bass, iv, pcs: iv.map((i) => (root + i) % 12), third: iv[1], fifth: iv.includes(7) ? 7 : iv[2] ?? 7 };
}

/** "Dm | Bb | Gm A7 | Dm" -> per-step chord array of length bars*spb */
export function parseChords(line, bars, spb, where = '') {
  const barStrs = line.split('|').map((s) => s.trim()).filter(Boolean);
  if (barStrs.length !== bars) throw new Error(`${where}: ${barStrs.length} chord bars, expected ${bars}`);
  const out = [];
  for (const b of barStrs) {
    const syms = b.split(/\s+/);
    const per = spb / syms.length;
    if (per !== Math.floor(per)) throw new Error(`${where}: can't split bar '${b}'`);
    for (const s of syms) { const c = parseChord(s); for (let i = 0; i < per; i++) out.push(c); }
  }
  return out;
}

/**
 * Melody notation: whitespace separated tokens, one step each unless `*n`:
 *   C5  F#4*2  Bb3*4!   (note, optional length, '!' accent, '~' soft)
 *   .   .*4             (rest)
 *   _   _*2             (extend previous note)
 *   |                   (bar line - validated against the bar length)
 */
export function parseMelody(str, bars, spb, where = '') {
  const notes = [];
  let step = 0;
  let last = null;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') {
      if (step % spb !== 0) throw new Error(`${where}: bar line at step ${step} (not a multiple of ${spb})`);
      continue;
    }
    const m = /^([^*!~]+)(?:\*(\d+))?([!~]?)$/.exec(tok);
    if (!m) throw new Error(`${where}: bad token '${tok}'`);
    const len = m[2] ? +m[2] : 1;
    if (m[1] === '.') { last = null; step += len; continue; }
    if (m[1] === '_') { if (last) last.len += len; step += len; continue; }
    last = { step, midi: noteToMidi(m[1]), len, vel: m[3] === '!' ? 1 : m[3] === '~' ? 0.55 : 0.8 };
    notes.push(last);
    step += len;
  }
  if (step !== bars * spb) throw new Error(`${where}: melody has ${step} steps, expected ${bars * spb}`);
  return notes;
}

function voicing(chord, low) {
  const v = chord.iv.map((i) => { let m = low + ((chord.root + i - low) % 12 + 12) % 12; return m; });
  return [...new Set(v)].sort((a, b) => a - b);
}
const bassNote = (pc, low = 33) => low + ((pc - low) % 12 + 12) % 12; // A1..G#2

// ---------------------------------------------------------------------------------------------
// Instruments (each schedules one note into the Builder at absolute time t)
// ---------------------------------------------------------------------------------------------
const hold = (dur, used) => Math.max(0, dur - used);

export const INSTR = {
  lead(B, to, t, f, dur, vel) {
    B.osc({ type: 'square', t, f, to, unison: [-7, 7], vib: { rate: 5.6, depth: 14, delay: 0.16, rise: 0.2 },
      filters: [['lp', [[0, f * 2.5], [0.025, Math.min(10000, f * 8)], [0.25, Math.min(8000, f * 4)]], 1.5]],
      g: { a: 0.006, d: 0.12, s: 0.7, hold: hold(dur, 0.13), r: 0.08, p: 0.22 * vel } });
  },
  saw(B, to, t, f, dur, vel) {
    B.osc({ type: 'sawtooth', t, f, to, unison: [-9, 0, 9], vib: { rate: 5.8, depth: 12, delay: 0.15, rise: 0.2 },
      filters: [['lp', [[0, f * 2], [0.03, Math.min(11000, f * 9)], [0.3, Math.min(7000, f * 4)]], 2]],
      g: { a: 0.006, d: 0.15, s: 0.7, hold: hold(dur, 0.16), r: 0.1, p: 0.2 * vel } });
  },
  accordion(B, to, t, f, dur, vel) {
    B.osc({ wave: periodicWave(B.ctx, 'reed', WAVES.reed), t, f, to, unison: [-9, 11], // two reeds, musette tuning
      filters: [['lp', Math.min(5200, f * 9 + 900), 0.7], ['pk', 1400, 1.4, 4]],
      g: { a: 0.022, d: 0.08, s: 0.85, hold: hold(dur, 0.1), r: 0.06, p: 0.13 * vel } });
  },
  fiddle(B, to, t, f, dur, vel) {
    B.osc({ type: 'sawtooth', t, f, to, unison: [-4, 4], detune: [[0, -25], [0.04, 0]], vib: { rate: 6.2, depth: 18, delay: 0.1, rise: 0.15 },
      filters: [['pk', 520, 2, 6], ['pk', 1750, 2, 5], ['pk', 3200, 3, 3], ['lp', 6500, 0.7]],
      g: { a: 0.03, d: 0.1, s: 0.85, hold: hold(dur, 0.12), r: 0.1, p: 0.12 * vel } });
  },
  flute(B, to, t, f, dur, vel) {
    B.osc({ type: 'triangle', t, f, to, vib: { rate: 5, depth: 12, delay: 0.2, rise: 0.25 }, filters: [['lp', 5000]],
      g: { a: 0.04, d: 0.1, s: 0.85, hold: hold(dur, 0.12), r: 0.1, p: 0.3 * vel } });
    B.osc({ t, f: f * 2, to, g: { a: 0.04, d: 0.1, s: 0.8, hold: hold(dur, 0.12), r: 0.08, p: 0.06 * vel } });
    B.noise({ t, to, filters: [['bp', f * 2, 2]], g: { a: 0.03, d: 0.08, s: 0.4, hold: hold(dur, 0.1), r: 0.06, p: 0.08 * vel } });
  },
  brass(B, to, t, f, dur, vel) {
    B.osc({ type: 'sawtooth', t, f, to, unison: [-8, 0, 7], detune: [[0, -35], [0.05, 0]], vib: { rate: 5.2, depth: 8, delay: 0.3, rise: 0.3 },
      filters: [['lp', [[0, f * 1.3], [0.05, Math.min(12000, f * 7)], [Math.max(0.15, dur * 0.8), f * 3.2]], 1]],
      g: { a: 0.02, d: 0.12, s: 0.75, hold: hold(dur, 0.14), r: 0.12, p: 0.17 * vel } });
  },
  stab(B, to, t, f, dur, vel) { // short punchy brass for chord stabs
    B.osc({ type: 'sawtooth', t, f, to, unison: [-10, 0, 9], detune: [[0, -30], [0.03, 0]],
      filters: [['lp', [[0, f * 1.5], [0.03, Math.min(10000, f * 7)], [0.2, f * 2.5]], 1]],
      g: { a: 0.012, d: Math.max(0.12, dur), p: 0.13 * vel } });
  },
  lowbrass(B, to, t, f, dur, vel) {
    B.osc({ type: 'sawtooth', t, f, to, unison: [-6, 6], detune: [[0, -40], [0.06, 0]],
      filters: [['lp', [[0, f * 1.5], [0.06, Math.min(4500, f * 12)], [Math.max(0.2, dur), f * 5]], 1.6]],
      g: { a: 0.03, d: 0.15, s: 0.8, hold: hold(dur, 0.18), r: 0.15, p: 0.2 * vel } });
  },
  pluck(B, to, t, f, dur, vel) {
    const { buffer, rate } = karplusBuffer(B.ctx, f, 1.6, { damp: 0.995, bright: 0.55 });
    const len = Math.min(buffer.duration / rate - 0.05, dur + 0.25);
    B.buf(buffer, { t, rate, to, dur: len, filters: [['lp', 4500]], g: [[0, 0], [0.002, 0.42 * vel], [Math.max(0.01, len - 0.12), 0.42 * vel], [len, 0]] });
  },
  bell(B, to, t, f, dur, vel) {
    const d = Math.max(0.6, Math.min(1.6, dur + 0.6));
    B.osc({ t, f, to, fm: { ratio: 3.5, index: { a: 0.001, d: d * 0.5, p: 1.6 } }, g: { a: 0.002, d, p: 0.16 * vel } });
    B.osc({ t, f: f * 2, to, g: { a: 0.001, d: d * 0.4, p: 0.05 * vel } });
  },
  marimba(B, to, t, f, dur, vel) {
    B.osc({ t, f, to, g: { a: 0.001, d: 0.35, p: 0.3 * vel } });
    B.osc({ t, f: f * 4, to, g: { a: 0.001, d: 0.06, p: 0.12 * vel } });
  },
  pad(B, to, t, f, dur, vel) {
    B.osc({ type: 'sawtooth', t, f, to, unison: [-12, 0, 12], filters: [['lp', Math.min(2200, f * 4 + 400), 0.6]],
      g: { a: 0.3, d: 0.3, s: 0.8, hold: hold(dur, 0.6), r: 0.5, p: 0.07 * vel } });
  },
  choir(B, to, t, f, dur, vel) {
    const fb = B.ctx.createGain();
    for (const [ff, q, a] of [[700, 5, 1], [1150, 6, 0.6], [2600, 7, 0.2]]) {
      const fl = B.filter(['bp', ff, q]);
      const g = B.gain(a * 2.2, to);
      fb.connect(fl); fl.connect(g);
    }
    B.osc({ type: 'sawtooth', t, f, to: fb, unison: [-12, 1, 13], vib: { rate: 5, depth: 10, delay: 0.3 },
      g: { a: 0.25, d: 0.3, s: 0.85, hold: hold(dur, 0.55), r: 0.45, p: 0.12 * vel } });
  },
  strings(B, to, t, f, dur, vel) {
    B.osc({ type: 'sawtooth', t, f, to, unison: [-8, 8], filters: [['lp', Math.min(4000, f * 6), 0.8]],
      g: { a: 0.012, d: 0.08, s: 0.6, hold: hold(dur, 0.09), r: 0.08, p: 0.12 * vel } });
  },
  bass(B, to, t, f, dur, vel) {
    B.osc({ type: 'sawtooth', t, f, to, filters: [['lp', [[0, f * 2.5], [0.008, f * 11], [0.18, f * 4]], 3]],
      g: { a: 0.004, d: 0.1, s: 0.7, hold: hold(dur, 0.1), r: 0.05, p: 0.34 * vel } });
    B.osc({ t, f, to, g: { a: 0.004, d: 0.1, s: 0.85, hold: hold(dur, 0.1), r: 0.05, p: 0.16 * vel } });
  },
  timpani(B, to, t, f, dur, vel) {
    B.osc({ t, to, f: [[0, f * 1.03], [0.08, f]], g: { a: 0.002, d: 1.1, p: 0.5 * vel } });
    B.osc({ t, to, f: f * 1.5, g: { a: 0.002, d: 0.5, p: 0.12 * vel } });
    B.noise({ t, to, color: 'brown', filters: [['lp', 500]], g: { a: 0.001, d: 0.12, p: 0.4 * vel } });
  },
};

export const DRUMS = {
  k(B, to, t, v) {
    B.osc({ t, to, f: [[0, 160], [0.045, 64], [0.2, 46]], g: { a: 0.001, d: 0.24, p: 0.75 * v } });
    B.noise({ t, to, filters: [['hp', 2500]], g: { a: 0.0005, d: 0.012, p: 0.25 * v } });
  },
  s(B, to, t, v) {
    B.noise({ t, to, filters: [['hp', 1000], ['pk', 3200, 1, 4]], g: { a: 0.001, d: 0.17, p: 0.42 * v } });
    B.osc({ type: 'triangle', t, to, f: [[0, 230], [0.05, 175]], g: { a: 0.001, d: 0.08, p: 0.38 * v } });
  },
  h(B, to, t, v) { B.noise({ t, to, filters: [['hp', 7000], ['pk', 10000, 1, 3]], g: { a: 0.0005, d: 0.035, p: 0.22 * v } }); },
  o(B, to, t, v) { B.noise({ t, to, filters: [['hp', 6500], ['pk', 9500, 1, 3]], g: { a: 0.001, d: 0.3, p: 0.18 * v } }); },
  t1(B, to, t, v) { tom(B, to, t, v, 210); },
  t2(B, to, t, v) { tom(B, to, t, v, 150); },
  t3(B, to, t, v) { tom(B, to, t, v, 100); },
  sh(B, to, t, v) { B.noise({ t, to, filters: [['bp', 6500, 1.2]], g: [[0, 0], [0.012, 0.2 * v], [0.07, 0]] }); },
  tb(B, to, t, v) {
    B.noise({ t, to, filters: [['hp', 7000], ['bp', 9000, 2]], g: { a: 0.001, d: 0.11, p: 0.3 * v } });
    B.noise({ t: t + 0.012, to, filters: [['bp', 7500, 4]], g: { a: 0.001, d: 0.06, p: 0.2 * v } });
  },
  c(B, to, t, v) {
    B.noise({ t, to, filters: [['hp', 4500], ['pk', 8000, 1, 5]], g: { a: 0.002, d: 1.7, p: 0.2 * v } });
    B.noise({ t, to, filters: [['bp', 3300, 1.2]], g: { a: 0.002, d: 0.6, p: 0.08 * v } });
  },
  cl(B, to, t, v) {
    for (const d of [0, 0.011, 0.022]) B.noise({ t: t + d, to, filters: [['bp', 1300, 1.3]], g: { a: 0.0005, d: d === 0.022 ? 0.13 : 0.012, p: 0.4 * v } });
  },
  r(B, to, t, v) {
    B.modal({ t, to, f: 1650, parts: [[1, 1, 0.04], [2.4, 0.4, 0.02]], vol: 0.3 * v });
    B.noise({ t, to, filters: [['bp', 3000, 1]], g: { a: 0.0005, d: 0.01, p: 0.25 * v } });
  },
  b(B, to, t, v) { // bodhrán / frame drum
    B.osc({ t, to, f: [[0, 120], [0.04, 82], [0.25, 72]], g: { a: 0.001, d: 0.28, p: 0.7 * v } });
    B.noise({ t, to, color: 'pink', filters: [['lp', 900]], g: { a: 0.001, d: 0.05, p: 0.3 * v } });
  },
};
function tom(B, to, t, v, f) {
  B.osc({ t, to, f: [[0, f * 1.5], [0.04, f], [0.3, f * 0.8]], g: { a: 0.001, d: 0.38, p: 0.72 * v } });
  B.noise({ t, to, color: 'pink', filters: [['lp', 1400]], g: { a: 0.001, d: 0.05, p: 0.22 * v } });
}

// Per-instrument channel defaults: volume, reverb send, delay send, stereo pan
const CHANNELS = {
  lead: { vol: 0.9, rev: 0.22, dly: 0.18, pan: 0 },
  saw: { vol: 0.85, rev: 0.22, dly: 0.18, pan: 0 },
  accordion: { vol: 1.25, rev: 0.18, dly: 0, pan: -0.15 },
  fiddle: { vol: 1.0, rev: 0.25, dly: 0.08, pan: 0.15 },
  flute: { vol: 0.85, rev: 0.3, dly: 0.2, pan: 0.1 },
  brass: { vol: 0.9, rev: 0.25, dly: 0, pan: 0 },
  stab: { vol: 0.9, rev: 0.2, dly: 0, pan: -0.1 },
  lowbrass: { vol: 0.6, rev: 0.15, dly: 0, pan: 0 },
  pluck: { vol: 0.65, rev: 0.2, dly: 0.1, pan: 0.25 },
  bell: { vol: 0.75, rev: 0.35, dly: 0.25, pan: -0.25 },
  marimba: { vol: 0.6, rev: 0.2, dly: 0.1, pan: 0.2 },
  pad: { vol: 1.1, rev: 0.4, dly: 0, pan: 0 },
  choir: { vol: 1.0, rev: 0.45, dly: 0, pan: 0 },
  strings: { vol: 1.1, rev: 0.25, dly: 0, pan: -0.2 },
  bass: { vol: 0.55, rev: 0.03, dly: 0, pan: 0 },
  timpani: { vol: 0.5, rev: 0.3, dly: 0, pan: 0 },
  drums: { vol: 0.6, rev: 0.1, dly: 0, pan: 0 },
  hats: { vol: 1.3, rev: 0.06, dly: 0, pan: 0.2 },
};
const HATS = new Set(['h', 'o', 'sh', 'tb']);

// ---------------------------------------------------------------------------------------------
// Track compiler
// ---------------------------------------------------------------------------------------------
const BASS_STYLES = {
  root8: [[0, 'r', 2], [2, 'r', 2], [4, '8', 2], [6, 'r', 2], [8, 'r', 2], [10, 'r', 2], [12, '8', 2], [14, '5', 2]],
  rootFifth: [[0, 'r', 4], [4, '5', 4], [8, 'r', 4], [12, '5l', 4]],
  march: [[0, 'r', 3], [4, '5l', 3], [8, 'r', 3], [12, '5l', 2], [14, 'a', 2]],
  drive16: Array.from({ length: 16 }, (_, i) => [i, i === 6 || i === 14 ? '8' : 'r', 1]),
  gallop: [[0, 'r', 2], [2, 'r', 1], [3, 'r', 1], [4, 'r', 2], [6, 'r', 1], [7, 'r', 1], [8, 'r', 2], [10, 'r', 1], [11, 'r', 1], [12, '8', 2], [14, '5', 1], [15, '5', 1]],
  syncop: [[0, 'r', 3], [3, 'r', 3], [6, '5', 2], [8, '8', 2], [10, 'r', 3], [13, '5', 3]],
  walk: [[0, 'r', 4], [4, '3', 4], [8, '5', 4], [12, 'a', 4]],
  half: [[0, 'r', 8], [8, '5l', 8]],
  pedal: [[0, 'r', 16]],
  pulse8: [[0, 'r', 1], [2, 'r', 1], [4, 'r', 1], [6, 'r', 1], [8, 'r', 1], [10, 'r', 1], [12, 'r', 1], [14, '5l', 1]],
  jig: [[0, 'r', 2], [3, '5l', 2]],
  jigwalk: [[0, 'r', 2], [2, '5l', 1], [3, '5l', 2], [5, '3', 1]],
};

function degreeNote(deg, chord, nextChord) {
  const r = bassNote(chord.bass);
  switch (deg) {
    case '5': return r + chord.fifth;
    case '5l': return r + chord.fifth - 12 < 31 ? r + chord.fifth : r + chord.fifth - 12;
    case '8': return r + 12;
    case '3': return r + chord.third;
    case 'a': { const nr = bassNote(nextChord.bass); return nr - 1 >= 33 ? nr - 1 : nr + 1; }
    default: return r;
  }
}

function drumHits(ch) {
  switch (ch) {
    case 'X': return [[0, 1]];
    case 'x': return [[0, 0.75]];
    case 'o': return [[0, 0.4]];
    case 'r': return [[0, 0.6], [0.5, 0.45]];
    case 'R': return [[0, 0.9], [0.5, 0.7]];
    default: return null;
  }
}

const FILLS = {
  // fill for the last half bar (4/4 16ths -> 8 steps); value strings per drum
  tom: { t1: 'XxXx....', t2: '....Xx..', t3: '......XX', k: 'x.......' },
  snare: { s: 'xxxxXXXX', k: 'x...x...' },
  build: { s: 'rrrrRRRR', k: 'x.x.x.x.' },
  big: { t1: 'XX......', t2: '..XX....', t3: '....XX..', s: '......RR', k: 'X...X.X.' },
  // 6/8 (3 steps)
  jig: { b: 'XxX', tb: 'xxX' },
};

function cleanPat(p) { return p.replace(/\s+/g, ''); }

export function compileTrack(def) {
  const [beatsPerBar, stepsPerBeat] = def.meter || [4, 4];
  const spb = beatsPerBar * stepsPerBeat;
  const stepDur = 60 / def.bpm / stepsPerBeat;
  const events = [];
  const sectionStarts = [];
  let base = 0;
  const push = (step, e) => { (events[step] || (events[step] = [])).push(e); };

  def.form.forEach((secName, formIdx) => {
    const sec = def.sections[secName];
    if (!sec) throw new Error(`${def.id}: missing section ${secName}`);
    const where = `${def.id}/${secName}`;
    const bars = sec.bars;
    const n = bars * spb;
    const chords = parseChords(sec.chords, bars, spb, where);
    sectionStarts.push({ name: secName, step: base, bar: base / spb, formIdx });

    // melodic lines
    const lines = [];
    if (sec.melody) lines.push({ notes: parseMelody(sec.melody, bars, spb, where), inst: sec.lead || 'lead', oct: sec.leadOct || 0, vel: sec.leadVel ?? 1, harmony: sec.harmony, double: sec.double });
    if (sec.counter) lines.push({ notes: parseMelody(sec.counter, bars, spb, where + ' counter'), inst: sec.counterInst || 'bell', oct: sec.counterOct || 0, vel: sec.counterVel ?? 0.9 });
    for (const L of lines) {
      for (const nt of L.notes) {
        const midi = nt.midi + 12 * L.oct;
        push(base + nt.step, { inst: L.inst, midi, len: nt.len, vel: nt.vel * L.vel });
        if (L.double) push(base + nt.step, { inst: L.double[0], midi: midi + 12 * (L.double[1] || 0), len: nt.len, vel: nt.vel * L.vel * (L.double[2] ?? 0.7) });
        if (L.harmony) {
          const c = chords[nt.step];
          let best = null;
          for (let m = midi - 3; m >= midi - 9; m--) if (c.pcs.includes(((m % 12) + 12) % 12)) { best = m; break; }
          if (best !== null) push(base + nt.step, { inst: L.harmony, midi: best, len: nt.len, vel: nt.vel * L.vel * 0.7 });
        }
      }
    }

    // accompaniment parts
    for (const part of sec.parts || []) {
      const [inst, style, opt = {}] = part;
      const vel = opt.vel ?? 0.8;
      if (inst === 'bass' || opt.bass) {
        const tpl = BASS_STYLES[style];
        if (!tpl) throw new Error(`${where}: unknown bass style ${style}`);
        const tplLen = style.startsWith('jig') ? 6 : 16;
        const scale = spb / tplLen;
        for (let bar = 0; bar < bars; bar++) {
          for (const [st, deg, len] of tpl) {
            const s = bar * spb + Math.round(st * scale);
            if (s >= n) continue;
            const c = chords[s];
            const nc = chords[Math.min(n - 1, (bar + 1) * spb)] || c;
            const nxt = bar === bars - 1 ? c : nc;
            push(base + s, { inst: opt.inst || inst, midi: degreeNote(deg, c, nxt) + 12 * (opt.oct || 0), len: Math.max(1, Math.round(len * scale)) * (opt.legato ?? 0.9), vel: vel * (st === 0 ? 1 : 0.85) });
          }
        }
        continue;
      }
      const low = opt.low ?? 55;
      if (style === 'pad' || style === 'sustain') {
        let s = 0;
        while (s < n) {
          let e = s + 1;
          while (e < n && chords[e] === chords[s] && (e % spb !== 0 || opt.tie)) e++;
          for (const m of voicing(chords[s], low)) push(base + s, { inst, midi: m, len: e - s, vel });
          s = e;
        }
      } else if (style === 'stabs' || style === 'oompah' || style === 'offbeat' || style === 'strum') {
        const pat = cleanPat(opt.pat || (style === 'oompah' ? (spb === 6 ? '.xx.xx' : '....x.......x...') : style === 'offbeat' ? '..x...x...x...x.' : 'x.....x...x.....'));
        for (let s = 0; s < n; s++) {
          const ch = pat[s % pat.length];
          if (ch === '.' || ch === undefined) continue;
          const v = vel * (ch === 'X' ? 1.15 : ch === 'o' ? 0.6 : 1);
          voicing(chords[s], low).forEach((m, i) => push(base + s, { inst, midi: m, len: opt.len ?? (style === 'strum' ? 4 : 1.6), vel: v, off: style === 'strum' ? i * 0.014 : 0 }));
        }
      } else if (style.startsWith('arp')) {
        const every = opt.every ?? (style === 'arp16' ? 1 : 2);
        const shape = opt.shape || [0, 1, 2, 3, 2, 1];
        let k = 0;
        for (let s = 0; s < n; s += every) {
          const v = voicing(chords[s], low);
          const ext = [...v, ...v.map((m) => m + 12), ...v.map((m) => m + 24)];
          const m = ext[shape[k % shape.length] % ext.length];
          k++;
          push(base + s, { inst, midi: m, len: opt.len ?? every * 1.5, vel: vel * (s % spb === 0 ? 1 : 0.8) });
        }
      } else if (style === 'ostinato') {
        const pat = opt.pat || ['r', '5', 'r', '8', 'r', '5', 'r', '5'];
        let k = 0;
        for (let s = 0; s < n; s += 2) {
          const c = chords[s];
          const r = low + ((c.root - low) % 12 + 12) % 12;
          const d = pat[k++ % pat.length];
          const m = d === '5' ? r + c.fifth : d === '8' ? r + 12 : d === '3' ? r + c.third : r;
          push(base + s, { inst, midi: m, len: 1.2, vel: vel * (s % spb === 0 ? 1.1 : 0.85) });
        }
      } else if (style === 'roots') {
        const pat = cleanPat(opt.pat || 'x...............');
        for (let s = 0; s < n; s++) {
          const ch = pat[s % pat.length];
          if (ch === '.' || ch === undefined) continue;
          const r = bassNote(chords[s].root, opt.low ?? 33) + 12 * (opt.oct || 0);
          push(base + s, { inst, midi: r, len: opt.len ?? 4, vel: vel * (ch === 'X' ? 1.15 : 1) });
        }
      } else throw new Error(`${where}: unknown style ${style}`);
    }

    // drums
    const kit = sec.drums ? (typeof sec.drums === 'string' ? def.patterns[sec.drums] : sec.drums) : null;
    if (sec.drums && !kit) throw new Error(`${where}: unknown drum pattern ${sec.drums}`);
    const fill = sec.fill ? FILLS[sec.fill] : null;
    const fillLen = fill ? cleanPat(Object.values(fill)[0]).length : 0;
    for (let bar = 0; bar < bars; bar++) {
      const isFillBar = fill && bar === bars - 1;
      for (const [drum, raw] of Object.entries(kit || {})) {
        const p = cleanPat(raw);
        if (p.length % spb !== 0) throw new Error(`${where}: drum '${drum}' pattern length ${p.length} not a multiple of ${spb}`);
        const off = (bar * spb) % p.length;
        for (let s = 0; s < spb; s++) {
          if (isFillBar && s >= spb - fillLen) continue;
          const hits = drumHits(p[off + s]);
          if (hits) for (const [frac, v] of hits) push(base + bar * spb + s, { drum, vel: v, frac });
        }
      }
      if (isFillBar) {
        for (const [drum, raw] of Object.entries(fill)) {
          const p = cleanPat(raw);
          for (let i = 0; i < p.length; i++) {
            const hits = drumHits(p[i]);
            if (hits) for (const [frac, v] of hits) push(base + bar * spb + spb - fillLen + i, { drum, vel: v * (0.75 + 0.35 * (i / p.length)), frac });
          }
        }
      }
    }
    if (sec.crash) push(base, { drum: 'c', vel: 0.9, frac: 0 });
    base += n;
  });

  const loopTo = def.loopTo ?? 0;
  const loopStep = sectionStarts[loopTo].step;
  return {
    id: def.id, bpm: def.bpm, spb, stepDur, swing: def.swing || 0, events, totalSteps: base,
    loopStep, sections: sectionStarts, bars: base / spb, master: def.master ?? 0.8, mix: def.mix || {},
    reverb: def.reverb || {}, delay: def.delay || null,
  };
}

const compiled = new Map();
export function getTrack(id) {
  let c = compiled.get(id);
  if (!c) {
    const def = TRACKS[id];
    if (!def) return null;
    c = compileTrack(def);
    compiled.set(id, c);
  }
  return c;
}

export const MUSIC_TRACKS = Object.freeze(Object.keys(TRACKS));

export function trackInfo(id) {
  const c = getTrack(id);
  if (!c) return null;
  const barSec = c.stepDur * c.spb;
  return {
    id, bpm: c.bpm, bars: c.bars, stepsPerBar: c.spb, secondsPerBar: barSec,
    loopStartBar: c.loopStep / c.spb, totalSeconds: c.totalSteps * c.stepDur,
    loopSeconds: (c.totalSteps - c.loopStep) * c.stepDur, sections: c.sections.map((s) => s.name),
  };
}

// ---------------------------------------------------------------------------------------------
// Sequencer
// ---------------------------------------------------------------------------------------------
let kneeCurve = null;
function softKneeCurve() {
  if (kneeCurve) return kneeCurve;
  const n = 2048;
  kneeCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2; // the shaper sees input * 0.5
    const a = Math.abs(u);
    const y = a < 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4);
    kneeCurve[i] = Math.sign(u) * y;
  }
  return kneeCurve;
}

export class Sequencer {
  /** out: node the track mix feeds (the engine's crossfade gain, or ctx.destination offline) */
  constructor(ctx, out, trackId, { startBar = 0, solo = null } = {}) {
    const T = getTrack(trackId);
    if (!T) throw new Error(`unknown track '${trackId}'`);
    this.T = T;
    this.ctx = ctx;
    this.id = trackId;
    this.B = new Builder(ctx, null, 0, hashStr(trackId));
    this.bus = ctx.createGain();
    this.bus.gain.value = T.master;
    // transparent soft-knee peak limiter: linear below 0.6, smoothly saturating above (input range ±2)
    this.pre = ctx.createGain();
    this.pre.gain.value = 0.5;
    this.lim = ctx.createWaveShaper();
    this.lim.curve = softKneeCurve();
    this.bus.connect(this.pre);
    this.pre.connect(this.lim);
    this.lim.connect(out);
    this.B.out = this.bus;
    const rv = T.reverb;
    this.rev = this.B.verb({ secs: rv.secs ?? 2.2, decay: rv.decay ?? 2.6, bright: rv.bright ?? 0.45, g: rv.g ?? 0.55, to: this.bus, hp: 200 });
    if (T.delay) {
      const beat = 60 / T.bpm;
      this.dly = this.B.delay({ time: beat * (T.delay.beats ?? 0.75), fb: T.delay.fb ?? 0.3, g: T.delay.g ?? 0.5, lp: 3500, to: this.bus });
    }
    this.chans = {};
    this.solo = solo ? new Set(solo) : null; // debug/test: only play these channels
    this.step = Math.min(T.totalSteps - 1, Math.max(0, Math.round(startBar * T.spb)));
    this.nextTime = 0;
    this.running = false;
  }

  chan(name) {
    let c = this.chans[name];
    if (c) return c;
    const d = { ...(CHANNELS[name] || { vol: 0.7, rev: 0.2, dly: 0, pan: 0 }), ...(this.T.mix[name] || {}) };
    if (typeof this.T.mix[name] === 'number') d.vol = this.T.mix[name];
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = d.vol;
    let dest = this.bus;
    if (d.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = d.pan;
      p.connect(this.bus);
      dest = p;
    }
    g.connect(dest);
    if (d.rev) { const s = ctx.createGain(); s.gain.value = d.rev; g.connect(s); s.connect(this.rev); }
    if (d.dly && this.dly) { const s = ctx.createGain(); s.gain.value = d.dly; g.connect(s); s.connect(this.dly); }
    c = this.chans[name] = g;
    return c;
  }

  start(when) {
    this.nextTime = when;
    this.running = true;
  }

  stop() { this.running = false; }

  /** Schedule every step whose time is < until. */
  schedule(until) {
    if (!this.running) return;
    const T = this.T;
    // fell far behind (tab was throttled / suspended): resync instead of bursting notes
    if (this.ctx.currentTime - this.nextTime > 0.25) {
      const skip = Math.ceil((this.ctx.currentTime - this.nextTime) / T.stepDur);
      for (let i = 0; i < skip; i++) this._advance();
      this.nextTime += skip * T.stepDur;
    }
    while (this.nextTime < until) {
      const evs = T.events[this.step];
      if (evs) {
        const swing = (this.step % 2 === 1 && T.spb % 4 === 0) ? T.swing * T.stepDur : 0;
        const t0 = this.nextTime + swing;
        for (const e of evs) this._play(e, t0);
      }
      this._advance();
      this.nextTime += T.stepDur;
    }
  }

  _advance() {
    this.step++;
    if (this.step >= this.T.totalSteps) this.step = this.T.loopStep;
  }

  _play(e, t0) {
    const T = this.T;
    const B = this.B;
    if (this.solo && !this.solo.has(e.drum ? (HATS.has(e.drum) ? 'hats' : 'drums') : e.inst)) return;
    if (e.drum) {
      const fn = DRUMS[e.drum];
      if (!fn) return;
      const ch = this.chan(HATS.has(e.drum) ? 'hats' : 'drums');
      fn(B, ch, t0 + e.frac * T.stepDur, e.vel);
      return;
    }
    const fn = INSTR[e.inst];
    if (!fn) return;
    fn(B, this.chan(e.inst), t0 + (e.off || 0), mtof(e.midi), e.len * T.stepDur, e.vel);
  }

  dispose() {
    for (const n of [this.bus, this.pre, this.lim]) { try { n.disconnect(); } catch (err) { /* already disconnected */ } }
  }
}

function getOfflineCtor() {
  return (typeof OfflineAudioContext !== 'undefined' && OfflineAudioContext) ||
    (typeof webkitOfflineAudioContext !== 'undefined' && webkitOfflineAudioContext) || null; // eslint-disable-line no-undef
}

/**
 * Render `seconds` of a music track offline. opts.startBar lets tests straddle the loop point.
 * Resolves to a stereo AudioBuffer of the raw music mix (before the master compressor).
 */
export async function renderMusicOffline(trackId, seconds = 16, { sampleRate = 44100, startBar = 0, solo = null } = {}) {
  const Ctor = getOfflineCtor();
  if (!Ctor) throw new Error('OfflineAudioContext unavailable');
  const ctx = new Ctor(2, Math.ceil(seconds * sampleRate), sampleRate);
  const seq = new Sequencer(ctx, ctx.destination, trackId, { startBar, solo });
  seq.start(0.02);
  scheduleIncrementally(ctx, seconds, (until) => seq.schedule(until));
  return ctx.startRendering();
}

/**
 * Offline equivalent of the real-time lookahead timer: suspend the render every `win` seconds and
 * schedule only the next window, so (as in real time) only a handful of nodes exist at once.
 * Falls back to scheduling everything up front where suspend() is unsupported.
 */
export function scheduleIncrementally(ctx, seconds, schedule, win = 0.2, ahead = 0.3) {
  if (typeof ctx.suspend !== 'function') { schedule(seconds); return; }
  schedule(Math.min(seconds, ahead));
  const q = 128 / ctx.sampleRate;
  let last = 0;
  for (let t = win; t < seconds; t += win) {
    const at = Math.round(t / q) * q;
    if (at >= seconds || at <= last) continue;
    last = at;
    ctx.suspend(at).then(() => { schedule(Math.min(seconds, at + ahead)); ctx.resume(); });
  }
}
