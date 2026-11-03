// GRAND BRAWL audio engine (contract: docs/ARCHITECTURE.md "Audio contract").
//
// Graph:  sfx voices ─► sfxBus ─┐
//         music tracks ─► musicDuck ─► musicBus ─┼─► master ─► compressor ─► limiter ─► destination
//         ambience beds ─► ambDuck ─► ambBus ───┘
//
// All sound is procedurally synthesised (no files). SFX are pre-rendered into AudioBuffers, each in
// its own OfflineAudioContext (browsers render those on separate threads): the ~20 most common
// sounds eagerly (in parallel) at unlock(), the rest lazily on first play() and two-at-a-time in the
// background. Music and ambience are scheduled by a 25 ms timer that looks ~0.12 s ahead.
// Importing this module is side-effect free (no AudioContext is created until unlock()).
import { SFX, SFX_NAMES, isUiSound, renderSfxBatch, renderSfxMany, renderSfx } from './sfx.js';
import { Sequencer, MUSIC_TRACKS, renderMusicOffline, trackInfo } from './music.js';
import { AmbienceBed, AMBIENCE_IDS, renderAmbienceOffline } from './ambience.js';

export { SFX_NAMES, MUSIC_TRACKS, AMBIENCE_IDS, isUiSound, renderSfx, renderSfxBatch, renderSfxMany, renderMusicOffline, renderAmbienceOffline, trackInfo };

/** Rendered eagerly at unlock(): the sounds needed in the first seconds of menus and matches. */
export const EAGER_SFX = Object.freeze([
  'ui_move', 'ui_select', 'ui_back', 'char_hover', 'countdown', 'go', 'jump', 'djump', 'land', 'run_step',
  'dodge', 'whoosh_light', 'whoosh_med', 'hit_light', 'hit_med', 'hit_heavy', 'shield_hit', 'punch_light',
  'kick_light', 'slash_light', 'grab', 'ledge_grab',
]);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const TRIM = { music: 0.75, sfx: 0.8, ambience: 0.32 }; // fixed mix balance between the buses
const PITCH_VAR = 0.04;
const LAZY_MAX_LATENCY = 0.25; // a lazily-rendered sound arriving later than this (or 25% of its length) is dropped

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.maxVoices = 40;
    this.maxPerName = 6;
    this.backgroundPrepare = true;
    this.autoSuspend = true; // suspend the AudioContext while the tab is hidden
    this.prepTimeMs = 0;
    this.bankCompleteMs = 0; // ms from unlock() until every SFX was rendered in the background
    this._ready = false;
    this._vol = { music: 0.8, sfx: 1, ambience: 1, master: 1 };
    this._bank = new Map();
    this._pending = new Map(); // name -> Promise
    this._queued = new Map(); // name -> [{vol,rate,pan,at}]
    this._voices = [];
    this._byName = new Map();
    this._warned = new Set();
    this._music = null;
    this._oldMusic = [];
    this._amb = null;
    this._oldAmb = [];
    this._wantMusic = null;
    this._wantAmb = null;
    this._duck = { level: 1, until: 0 };
    this._timer = null;
    this._prep = null;
  }

  /** true once unlocked and the eager SFX bank is rendered */
  get ready() { return this._ready; }
  get unlocked() { return !!this.ctx; }
  get volumes() { return { ...this._vol }; }
  get musicTrack() { return this._music ? this._music.id : null; }
  get ambience() { return this._amb ? this._amb.id : null; }

  /** Call from a user gesture. Creates/resumes the AudioContext. Safe to call repeatedly. Returns a Promise<boolean> (ready). */
  unlock() {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return Promise.resolve(false);
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) {
        try { this.ctx = new AC(); } catch (e2) { return Promise.resolve(false); }
      }
      this._unlockAt = now();
      this._buildGraph();
      this._timer = setInterval(() => this._tick(), 25);
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', () => this._onVisibility());
      }
      this._prep = this._prepare();
      if (this._wantMusic) { const id = this._wantMusic; this._wantMusic = null; this.playMusic(id); }
      if (this._wantAmb) { const id = this._wantAmb; this._wantAmb = null; this.setAmbience(id); }
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running' && !(this.autoSuspend && typeof document !== 'undefined' && document.hidden)) {
      // resume() may stay pending (no user activation yet): only treat it as "resuming" briefly
      this._resumeAt = now();
      try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }
    // iOS/Safari: playing a buffer inside the gesture fully unlocks output
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) { /* ignore */ }
    return this._prep.then(() => true, () => false);
  }

  _buildGraph() {
    const ctx = this.ctx;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.master = g(1);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;
    this.master.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.sfxBus = g(0);
    this.musicBus = g(0);
    this.ambBus = g(0);
    this.musicDuck = g(1);
    this.ambDuck = g(1);
    this.sfxBus.connect(this.master);
    this.musicDuck.connect(this.musicBus);
    this.musicBus.connect(this.master);
    this.ambDuck.connect(this.ambBus);
    this.ambBus.connect(this.master);
    this._canPan = typeof ctx.createStereoPanner === 'function';
    this._applyVolumes(true);
  }

  // ---------------------------------------------------------------------------------------------
  // Volumes
  // ---------------------------------------------------------------------------------------------
  /** setVolumes({ music, sfx }) — 0..1 each, any key optional (also accepts ambience, master). Perceptual (squared) taper. */
  setVolumes(v = {}) {
    for (const k of ['music', 'sfx', 'ambience', 'master']) {
      const x = v[k];
      if (typeof x === 'number' && Number.isFinite(x)) this._vol[k] = clamp(x, 0, 1);
    }
    this._applyVolumes(false);
  }

  _applyVolumes(instant) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const V = this._vol;
    const set = (param, val) => {
      param.cancelScheduledValues(t);
      if (instant) { param.setValueAtTime(val, t); return; }
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(val, t + 0.03);
    };
    const taper = (x) => x * x;
    set(this.master.gain, taper(V.master));
    set(this.sfxBus.gain, taper(V.sfx) * TRIM.sfx);
    set(this.musicBus.gain, taper(V.music) * TRIM.music);
    // ambience is part of the "sound effects" mix: it follows the sfx slider (and an optional ambience key)
    set(this.ambBus.gain, taper(V.sfx) * taper(V.ambience) * TRIM.ambience);
  }

  // ---------------------------------------------------------------------------------------------
  // SFX
  // ---------------------------------------------------------------------------------------------
  /**
   * One-shot SFX. Unknown name => warns once, no-op. Not unlocked yet => silent no-op.
   * Returns a handle { stop(fade) } or null.
   */
  play(name, { vol = 1, rate = 1, pan = 0 } = {}) {
    const def = SFX[name];
    if (!def) {
      if (!this._warned.has(name)) { this._warned.add(name); console.warn(`[audio] unknown sfx '${name}'`); }
      return null;
    }
    if (!this.ctx) return null;
    // a suspended/interrupted context would queue the sound and burst it out on resume: drop it instead
    if (this.ctx.state !== 'running' && !(now() - (this._resumeAt || -1e9) < 500)) return null;
    const buf = this._bank.get(name);
    if (!buf) {
      const q = this._queued.get(name) || [];
      if (q.length < 2) q.push({ vol, rate, pan, at: this.ctx.currentTime });
      this._queued.set(name, q);
      this._render([name]);
      return null;
    }
    return this._startVoice(name, def, buf, vol, rate, pan);
  }

  /** Pre-render specific sounds (e.g. the ultimates of the fighters in the next match). */
  prepare(names = SFX_NAMES) {
    if (!this.ctx) return Promise.resolve();
    return this._render(names.filter((n) => SFX[n]));
  }

  async _prepare() {
    const t0 = now();
    await this._render(EAGER_SFX);
    this.prepTimeMs = now() - t0;
    this._ready = true;
    if (this.backgroundPrepare) this._background();
  }

  /** Render the rest of the bank two sounds at a time, yielding to the game between renders. */
  _background() {
    const rest = SFX_NAMES.filter((n) => !this._bank.has(n) && !this._pending.has(n));
    if (!rest.length) {
      if (!this.bankCompleteMs && this._bank.size === SFX_NAMES.length) this.bankCompleteMs = now() - this._unlockAt;
      return;
    }
    this._render(rest.slice(0, 2)).then(() => setTimeout(() => this._background(), 30), () => {});
  }

  /** Each sound renders in its own OfflineAudioContext (parallel, threaded); concurrent requests coalesce. */
  _render(names) {
    const waits = [];
    for (const n of names) {
      if (this._bank.has(n)) continue;
      let p = this._pending.get(n);
      if (!p) {
        p = renderSfxBatch([n], this.ctx.sampleRate).then((bufs) => {
          this._pending.delete(n);
          if (bufs[n]) this._bank.set(n, bufs[n]);
          this._flushQueue(n);
        }, (err) => {
          this._pending.delete(n);
          console.warn(`[audio] sfx render failed: ${n}`, err);
        });
        this._pending.set(n, p);
      }
      waits.push(p);
    }
    return Promise.all(waits);
  }

  _flushQueue(name) {
    const q = this._queued.get(name);
    if (!q) return;
    this._queued.delete(name);
    const buf = this._bank.get(name);
    if (!buf) return;
    const maxLate = Math.max(LAZY_MAX_LATENCY, buf.duration * 0.25);
    for (const r of q) {
      if (this.ctx.currentTime - r.at <= maxLate) this._startVoice(name, SFX[name], buf, r.vol, r.rate, r.pan);
    }
  }

  _startVoice(name, def, buf, vol, rate, pan) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    let list = this._byName.get(name);
    if (!list) this._byName.set(name, (list = []));
    const maxN = Math.min(this.maxPerName, def.max || this.maxPerName);
    while (list.length >= maxN) this._kill(list[0]);
    while (this._voices.length >= this.maxVoices) this._kill(this._voices[0]);
    let g = Number.isFinite(vol) ? clamp(vol, 0, 4) : 1;
    // identical sounds stacked on the same frame sum to a jarring spike: attenuate them
    const last = list[list.length - 1];
    if (last && t - last.start < 0.03) g *= 0.6;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const variation = def.ui ? 1 : 1 + (Math.random() * 2 - 1) * PITCH_VAR;
    const r = clamp((Number.isFinite(rate) ? rate : 1) * variation, 0.1, 8);
    src.playbackRate.value = r;
    const gain = ctx.createGain();
    gain.gain.value = g;
    src.connect(gain);
    let out = gain;
    if (pan && this._canPan && Number.isFinite(pan)) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      gain.connect(p);
      out = p;
    }
    out.connect(this.sfxBus);
    const voice = { name, src, gain, out, start: t, dead: false };
    src.onended = () => this._release(voice);
    src.start(t);
    list.push(voice);
    this._voices.push(voice);
    return { name, stop: (fade = 0.05) => this._kill(voice, fade) };
  }

  _kill(voice, fade = 0.025) {
    if (voice.dead) return;
    this._unlist(voice);
    const t = this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
      voice.gain.gain.linearRampToValueAtTime(0, t + fade);
      voice.src.stop(t + fade + 0.01);
    } catch (e) { /* already stopped */ }
  }

  _unlist(voice) {
    voice.dead = true;
    const i = this._voices.indexOf(voice);
    if (i >= 0) this._voices.splice(i, 1);
    const list = this._byName.get(voice.name);
    if (list) { const j = list.indexOf(voice); if (j >= 0) list.splice(j, 1); }
  }

  _release(voice) {
    if (!voice.dead) this._unlist(voice);
    try { voice.out.disconnect(); voice.gain.disconnect(); } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------------------------------------
  // Music
  // ---------------------------------------------------------------------------------------------
  /** Crossfade (~1 s) to a looping procedural track. Same id again = no-op. */
  playMusic(trackId) {
    if (!MUSIC_TRACKS.includes(trackId)) {
      if (!this._warned.has('music:' + trackId)) { this._warned.add('music:' + trackId); console.warn(`[audio] unknown music track '${trackId}'`); }
      return;
    }
    if (!this.ctx) { this._wantMusic = trackId; return; }
    if (this._music && this._music.id === trackId) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const crossfade = !!this._music;
    if (this._music) this._fadeOut(this._music, 1.0, this._oldMusic);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + (crossfade ? 0.9 : 0.04));
    gain.connect(this.musicDuck);
    const seq = new Sequencer(ctx, gain, trackId);
    seq.start(t + 0.06);
    seq.schedule(t + this._lookahead());
    this._music = { id: trackId, seq, gain };
  }

  stopMusic(fadeSeconds = 1) {
    this._wantMusic = null;
    if (!this._music) return;
    this._fadeOut(this._music, Math.max(0.01, fadeSeconds), this._oldMusic);
    this._music = null;
  }

  _fadeOut(m, fade, list) {
    const t = this.ctx.currentTime;
    const p = m.gain.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(0, t + fade);
    m.stopAt = t + fade;
    list.push(m);
  }

  // ---------------------------------------------------------------------------------------------
  // Ambience
  // ---------------------------------------------------------------------------------------------
  /** 'ocean' | 'fortress' | 'sky' | 'volcano' | null (fade out) */
  setAmbience(id) {
    if (id === undefined) id = null;
    if (id !== null && !AMBIENCE_IDS.includes(id)) {
      if (!this._warned.has('amb:' + id)) { this._warned.add('amb:' + id); console.warn(`[audio] unknown ambience '${id}'`); }
      return;
    }
    if (!this.ctx) { this._wantAmb = id; return; }
    if ((this._amb ? this._amb.id : null) === id) return;
    if (this._amb) { this._fadeOut(this._amb, 1.5, this._oldAmb); this._amb = null; }
    if (!id) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 2);
    gain.connect(this.ambDuck);
    const bed = new AmbienceBed(ctx, gain, id);
    bed.start(t + 0.03);
    bed.schedule(t + this._lookahead());
    this._amb = { id, bed, gain };
  }

  // ---------------------------------------------------------------------------------------------
  // Ducking
  // ---------------------------------------------------------------------------------------------
  /** Temporarily lower music + ambience by `amount` (0..1) for `seconds`, then recover. Overlapping ducks merge. */
  duck(amount = 0.5, seconds = 1.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    let level = clamp(1 - (Number.isFinite(amount) ? amount : 0.5), 0, 1);
    let until = t + Math.max(0, Number.isFinite(seconds) ? seconds : 1.5);
    if (t < this._duck.until) {
      level = Math.min(level, this._duck.level);
      until = Math.max(until, this._duck.until);
    }
    this._duck = { level, until };
    for (const p of [this.musicDuck.gain, this.ambDuck.gain]) {
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(level, t + 0.08);
      p.setValueAtTime(level, Math.max(t + 0.08, until));
      p.linearRampToValueAtTime(1, Math.max(t + 0.08, until) + 0.7);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------------------------
  _lookahead() { return typeof document !== 'undefined' && document.hidden ? 1.5 : 0.12; }

  _tick() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const until = t + this._lookahead();
    if (this._music) this._music.seq.schedule(until);
    if (this._amb) this._amb.bed.schedule(until);
    this._oldMusic = this._oldMusic.filter((m) => {
      if (t < m.stopAt) { m.seq.schedule(Math.min(until, m.stopAt)); return true; }
      m.seq.stop();
      if (t > m.stopAt + 4) { m.seq.dispose(); try { m.gain.disconnect(); } catch (e) { /* noop */ } return false; }
      return true;
    });
    this._oldAmb = this._oldAmb.filter((a) => {
      if (t < a.stopAt) { a.bed.schedule(Math.min(until, a.stopAt)); return true; }
      if (!a.stopped) { a.bed.stop(t + 0.05); a.stopped = true; }
      if (t > a.stopAt + 3) { a.bed.dispose(); try { a.gain.disconnect(); } catch (e) { /* noop */ } return false; }
      return true;
    });
  }

  _onVisibility() {
    if (!this.ctx || !this.autoSuspend) return;
    try {
      if (document.hidden) { if (this.ctx.state === 'running') { this._suspendedByUs = true; this.ctx.suspend(); } }
      else if (this._suspendedByUs) { this._suspendedByUs = false; this.ctx.resume(); }
    } catch (e) { /* ignore */ }
  }

  /** Debug info. */
  stats() {
    let bytes = 0;
    for (const b of this._bank.values()) bytes += b.length * b.numberOfChannels * 4;
    return {
      bankMB: Math.round(bytes / 1e5) / 10,
      state: this.ctx ? this.ctx.state : 'locked', ready: this._ready, prepTimeMs: Math.round(this.prepTimeMs), bankCompleteMs: Math.round(this.bankCompleteMs),
      rendered: this._bank.size, total: SFX_NAMES.length, voices: this._voices.length,
      music: this.musicTrack, ambience: this.ambience, volumes: this.volumes,
    };
  }
}

export const audio = new AudioEngine();
