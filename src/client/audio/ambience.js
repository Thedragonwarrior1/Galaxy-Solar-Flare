// GRAND BRAWL audio — looping environmental ambience beds, generated in real time from
// looping noise + filters + slow random modulators, plus randomly scheduled one-off events
// (gull calls, flag flaps, chimes, lava bubbles...). Works on any BaseAudioContext.
import { Builder, hashStr, noiseBuffer, wobbleBuffer, crackleData, makeBuffer, mtof } from './synth.js';
import { scheduleIncrementally } from './music.js';

export const AMBIENCE_IDS = Object.freeze(['ocean', 'fortress', 'sky', 'volcano']);

const crackleBufs = new Map();
function crackleLoop(ctx, density, seed, decay) {
  const key = `${ctx.sampleRate}:${density}:${seed}:${decay}`;
  let b = crackleBufs.get(key);
  if (!b) {
    const d = crackleData(ctx.sampleRate, 7, density, seed, decay);
    b = makeBuffer(ctx, 1, d.length, ctx.sampleRate);
    b.getChannelData(0).set(d);
    crackleBufs.set(key, b);
  }
  return b;
}

// balances the four beds to a similar loudness (~ -21 dB rms before the ambience bus trim)
const BED_TRIM = { ocean: 0.5, fortress: 2.6, sky: 1.8, volcano: 0.38 };

export class AmbienceBed {
  constructor(ctx, out, id) {
    if (!AMBIENCE_IDS.includes(id)) throw new Error(`unknown ambience '${id}'`);
    this.ctx = ctx;
    this.id = id;
    this.bus = ctx.createGain();
    this.bus.gain.value = BED_TRIM[id];
    this.bus.connect(out);
    this.B = new Builder(ctx, this.bus, 0, hashStr(id));
    this.sources = [];
    this.events = [];
    this.running = false;
  }

  // --- continuous layer helpers -----------------------------------------------------------
  _src(buffer, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    this.sources.push(s);
    return s;
  }
  /** looping noise -> filters -> gain(level) -> [pan] -> bus. Returns {filters, gain}. */
  _layer(color, filters, level, pan = 0, src) {
    const ctx = this.ctx;
    let node = src || this._src(noiseBuffer(ctx, color));
    const fl = [];
    for (const f of filters) { const n = this.B.filter(f); node.connect(n); node = n; fl.push(n); }
    const g = ctx.createGain();
    g.gain.value = level;
    node.connect(g);
    let dest = this.bus;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(this.bus); dest = p; }
    g.connect(dest);
    return { filters: fl, gain: g };
  }
  /** slow random modulation of an AudioParam: param += depth * wobble(rate) */
  _mod(param, rate, depth, seed) {
    const s = this._src(wobbleBuffer(this.ctx, rate, 24, seed));
    const g = this.ctx.createGain();
    g.gain.value = depth;
    s.connect(g);
    g.connect(param);
  }
  _verb() {
    if (!this.verbIn) this.verbIn = this.B.verb({ secs: 2.2, decay: 2.5, g: 0.6, to: this.bus, hp: 300 });
    return this.verbIn;
  }
  _every(name, min, max, fn) { this.events.push({ name, min, max, fn, next: this.t + this.B.r(min * 0.3, max * 0.6) }); }

  start(t) {
    this.t = t;
    this.running = true;
    const B = this.B;
    switch (this.id) {
      case 'ocean': {
        const wash = this._layer('brown', [['lp', 450, 0.6]], 0.55);
        this._mod(wash.filters[0].frequency, 0.15, 180, 3);
        this._mod(wash.gain.gain, 0.12, 0.2, 4);
        const hiss = this._layer('pink', [['bp', 2200, 0.4]], 0.035, 0.2);
        this._mod(hiss.gain.gain, 0.1, 0.02, 5);
        this._every('wave', 4.5, 8, (at) => this._wave(at, 1, 1400));
        this._every('gull', 6, 15, (at) => this._gulls(at));
        break;
      }
      case 'fortress': {
        const wind = this._layer('pink', [['bp', 520, 0.6]], 0.3);
        this._mod(wind.filters[0].frequency, 0.22, 240, 7);
        this._mod(wind.gain.gain, 0.18, 0.15, 8);
        const whistle = this._layer('white', [['bp', 950, 18]], 0.2, -0.2);
        this._mod(whistle.filters[0].frequency, 0.3, 280, 9);
        this._mod(whistle.gain.gain, 0.2, 0.12, 10);
        this._every('wave', 6, 10, (at) => this._wave(at, 0.5, 650));
        this._every('flag', 3, 7, (at) => this._flag(at));
        this._every('creak', 8, 16, (at) => this._creak(at));
        break;
      }
      case 'sky': {
        const hi = this._layer('white', [['bp', 2600, 0.45], ['hp', 1200]], 0.05);
        this._mod(hi.filters[0].frequency, 0.1, 900, 11);
        this._mod(hi.gain.gain, 0.15, 0.025, 12);
        const low = this._layer('pink', [['lp', 380, 0.6]], 0.16);
        this._mod(low.gain.gain, 0.12, 0.08, 13);
        const tone = this._layer('white', [['bp', 720, 25]], 0.08, 0.3);
        this._mod(tone.filters[0].frequency, 0.08, 120, 14);
        this._every('chime', 1.5, 4.5, (at) => this._chimes(at));
        this._every('gust', 7, 14, (at) => {
          B.noise({ t: at, dur: 3, to: this.bus, color: 'pink', pan: B.r(-0.5, 0.5), filters: [['bp', [[0, 500], [1.4, 1600], [3, 700]], 0.8]], g: [[0, 0], [1.3, 0.25], [3, 0]] });
        });
        break;
      }
      case 'volcano': {
        const rum = this._layer('brown', [['lp', 110, 0.8]], 0.9);
        this._mod(rum.gain.gain, 0.5, 0.35, 15);
        this._mod(rum.filters[0].frequency, 0.3, 40, 16);
        const sub = this.ctx.createOscillator();
        sub.frequency.value = 36;
        this.sources.push(sub);
        const subL = this._layer(null, [], 0.12, 0, sub);
        this._mod(subL.gain.gain, 0.25, 0.08, 17);
        this._layer(null, [['hp', 1600]], 0.5, 0.3, this._src(crackleLoop(this.ctx, 22, 101, 0.8)));
        this._layer(null, [['bp', 700, 0.9]], 0.65, -0.3, this._src(crackleLoop(this.ctx, 5, 202, 4)));
        this._every('bubble', 2, 6, (at) => this._bubbles(at));
        this._every('surge', 10, 20, (at) => {
          B.noise({ t: at, dur: 3.5, to: this.bus, color: 'brown', filters: [['lp', [[0, 120], [1.5, 260], [3.5, 100]]]], g: [[0, 0], [1.5, 0.6], [3.5, 0]] });
        });
        break;
      }
      default: break;
    }
    for (const s of this.sources) s.start(t, s.buffer ? B.r(0, Math.max(0, s.buffer.duration - 0.1)) : 0);
  }

  /** Schedule random events up to `until`. */
  schedule(until) {
    if (!this.running) return;
    for (const e of this.events) {
      while (e.next < until) {
        e.fn(e.next);
        e.next += this.B.r(e.min, e.max);
      }
    }
  }

  stop(when) {
    this.running = false;
    for (const s of this.sources) { try { s.stop(when); } catch (err) { /* not started */ } }
  }

  dispose() { try { this.bus.disconnect(); } catch (err) { /* noop */ } }

  // --- events ---------------------------------------------------------------------------------
  _wave(at, size, bright) {
    const B = this.B;
    const pan = B.r(-0.45, 0.45);
    const rise = B.r(1.6, 2.6), fall = B.r(3, 4.5);
    B.noise({ t: at, dur: rise + fall, to: this.bus, color: 'pink', pan, filters: [['lp', [[0, 250], [rise, bright], [rise + fall, 300]], 0.5]],
      g: [[0, 0], [rise * 0.8, 0.35 * size], [rise, 0.55 * size], [rise + 0.6, 0.35 * size], [rise + fall, 0]] });
    B.noise({ t: at + rise - 0.15, dur: fall, to: this.bus, pan, filters: [['bp', 3000, 0.5]], g: [[0, 0], [0.2, 0.09 * size], [fall * 0.5, 0.03 * size], [fall, 0]] });
  }
  _gulls(at) {
    const B = this.B;
    const n = Math.floor(B.r(1, 4));
    const v = this._verb();
    const pan = B.r(-0.8, 0.8);
    const base = B.r(0.85, 1.15);
    for (let i = 0; i < n; i++) {
      const t = at + i * B.r(0.3, 0.45);
      const f = [[0, 1250 * base], [0.05, 2150 * base], [0.22, 1150 * base]];
      for (const to of [this.bus, v]) {
        B.osc({ type: 'triangle', t, to, pan, f, fm: { ratio: 1.01, index: 0.2 }, filters: [['bp', 1900, 1.5]], g: [[0, 0], [0.03, to === v ? 0.05 : 0.025], [0.15, 0.02], [0.24, 0]] });
      }
    }
  }
  _flag(at) {
    const B = this.B;
    const n = Math.floor(B.r(6, 18));
    const pan = B.r(-0.6, 0.6);
    let t = at;
    for (let i = 0; i < n; i++) {
      const env = Math.sin((i / n) * Math.PI);
      B.noise({ t, to: this.bus, pan, color: 'pink', filters: [['bp', B.r(700, 1400), 0.9]], g: { a: 0.004, d: 0.06, p: (0.08 + 0.15 * env) * B.r(0.6, 1) } });
      t += B.r(0.07, 0.12);
    }
  }
  _creak(at) {
    const B = this.B;
    B.osc({ type: 'sawtooth', t: at, to: this.bus, pan: B.r(-0.7, 0.7), f: [[0, B.r(80, 110)], [0.6, B.r(120, 160)]], jitter: { rate: 30, depth: 80 }, filters: [['bp', 900, 6]], g: [[0, 0], [0.1, 0.05], [0.5, 0.04], [0.65, 0]] });
  }
  _chimes(at) {
    const B = this.B;
    const scale = [81, 83, 85, 88, 90, 93, 95]; // A5 pentatonic-ish
    const n = Math.floor(B.r(1, 4));
    const v = this._verb();
    for (let i = 0; i < n; i++) {
      const f = mtof(B.pick(scale));
      const t = at + i * B.r(0.12, 0.3);
      const pan = B.r(-0.8, 0.8);
      B.osc({ t, f, to: v, pan, fm: { ratio: 3.5, index: { a: 0.001, d: 1.2, p: 1.2 } }, g: { a: 0.003, d: 2.2, p: 0.05 } });
      B.osc({ t, f, to: this.bus, pan, fm: { ratio: 3.5, index: { a: 0.001, d: 1.0, p: 1.2 } }, g: { a: 0.003, d: 1.6, p: 0.025 } });
    }
  }
  _bubbles(at) {
    const B = this.B;
    const n = Math.floor(B.r(3, 9));
    const pan = B.r(-0.7, 0.7);
    let t = at;
    for (let i = 0; i < n; i++) {
      const f = B.r(110, 260);
      const d = B.r(0.05, 0.11);
      B.osc({ t, to: this.bus, pan, f: [[0, f], [d, f * B.r(1.8, 2.6)]], filters: [['lp', 900]], g: { a: 0.004, d, p: 0.12 } });
      t += B.r(0.06, 0.25);
    }
  }
}

function getOfflineCtor() {
  return (typeof OfflineAudioContext !== 'undefined' && OfflineAudioContext) ||
    (typeof webkitOfflineAudioContext !== 'undefined' && webkitOfflineAudioContext) || null; // eslint-disable-line no-undef
}

/** Render `seconds` of an ambience bed offline (stereo AudioBuffer), for tests/previews. */
export async function renderAmbienceOffline(id, seconds = 12, { sampleRate = 44100 } = {}) {
  const Ctor = getOfflineCtor();
  if (!Ctor) throw new Error('OfflineAudioContext unavailable');
  const ctx = new Ctor(2, Math.ceil(seconds * sampleRate), sampleRate);
  const bed = new AmbienceBed(ctx, ctx.destination, id);
  bed.start(0);
  scheduleIncrementally(ctx, seconds, (until) => bed.schedule(until));
  return ctx.startRendering();
}
