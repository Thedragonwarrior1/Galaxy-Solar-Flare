// Persistent player settings (localStorage, failure-tolerant).
const KEY = 'grandbrawl.settings.v1';

export const DEFAULT_SETTINGS = {
  music: 0.6,
  sfx: 0.8,
  quality: 'high', // low | medium | high
  resolution: 1, // render scale 0.5..1
  vfx: 1, // VFX intensity 0.25..1
  screenShake: true,
  cameraSensitivity: 1,
  touch: 'auto', // auto | on | off
  keys: null, // keyboard rebinding overrides
  name: 'Captain',
  server: '',
  lastChars: {},
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { s = {}; }
  const out = { ...DEFAULT_SETTINGS, ...s };
  // pick a sensible default quality for weak / mobile devices on first run
  if (!s.quality && typeof navigator !== 'undefined') {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    if (mobile) { out.quality = 'medium'; out.resolution = 0.85; }
  }
  return out;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: settings last for this session */ }
}
