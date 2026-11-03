// Unified input: keyboard+mouse (rebindable), gamepads (standard mapping) and touch controls.
// Produces per-player sim input frames {mx, mz, b} in WORLD space using the camera basis.
import { BTN } from '../../shared/sim/constants.js';

export const ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'attack', 'heavy', 'sp1', 'sp2', 'sp3', 'ult', 'dodge', 'shield', 'fall', 'camLeft', 'camRight'];
export const ACTION_LABELS = {
  up: 'Move Forward', down: 'Move Back', left: 'Move Left', right: 'Move Right', jump: 'Jump', attack: 'Basic Attack', heavy: 'Heavy Attack',
  sp1: 'Special 1', sp2: 'Special 2', sp3: 'Recovery Special', ult: 'Ultimate', dodge: 'Dodge', shield: 'Block / Parry', fall: 'Fast Fall / Drop',
  camLeft: 'Rotate Camera Left', camRight: 'Rotate Camera Right',
};
export const DEFAULT_KEYS = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], jump: ['Space'], attack: ['Mouse0', 'KeyJ'], heavy: ['Mouse2', 'KeyK'],
  sp1: ['KeyQ'], sp2: ['KeyE'], sp3: ['KeyR'], ult: ['KeyF'], dodge: ['ShiftLeft', 'ShiftRight'], shield: ['KeyG', 'KeyL'], fall: ['KeyC', 'ControlLeft'],
  camLeft: ['ArrowLeft'], camRight: ['ArrowRight'],
};
// Standard gamepad mapping
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const DEFAULT_PAD = { jump: [PAD.A], attack: [PAD.X], sp1: [PAD.Y], dodge: [PAD.B], sp2: [PAD.LB], shield: [PAD.RB], sp3: [PAD.LT], heavy: [PAD.RT], ult: [PAD.R3, PAD.UP], fall: [PAD.DOWN, PAD.L3] };

const ACTION_BTN = { jump: BTN.JUMP, attack: BTN.ATTACK, heavy: BTN.HEAVY, sp1: BTN.SP1, sp2: BTN.SP2, sp3: BTN.SP3, ult: BTN.ULT, dodge: BTN.DODGE, shield: BTN.SHIELD, fall: BTN.DOWN };

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.pressedOnce = new Set(); // edges for menu navigation
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_KEYS));
    this.padBindings = JSON.parse(JSON.stringify(DEFAULT_PAD));
    this.touch = { mx: 0, my: 0, b: 0, active: false };
    this.capture = null; // rebinding callback
    this.enabled = true;
    this.padPrev = new Map();
    this.sensitivity = 1;
    this.listeners = [];
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); this.listeners.push([t, ev, fn, opt]); };
    on(window, 'keydown', (e) => {
      if (this.capture) { e.preventDefault(); this.capture(e.code); this.capture = null; return; }
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!this.keys.has(e.code)) this.pressedOnce.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    on(window, 'keyup', (e) => { this.keys.delete(e.code); });
    on(window, 'blur', () => { this.keys.clear(); });
    on(window, 'mousedown', (e) => {
      if (this.capture) { e.preventDefault(); this.capture('Mouse' + e.button); this.capture = null; return; }
      if (e.target && e.target.closest && e.target.closest('.ui-layer button, .ui-layer input, .ui-layer select, .touch-controls')) return;
      this.keys.add('Mouse' + e.button);
    });
    on(window, 'mouseup', (e) => { this.keys.delete('Mouse' + e.button); });
    on(window, 'contextmenu', (e) => { if (e.target && e.target.classList && e.target.classList.contains('game-canvas')) e.preventDefault(); });
  }

  dispose() { for (const [t, ev, fn, opt] of this.listeners) t.removeEventListener(ev, fn, opt); }

  setBindings(b) { if (b) this.bindings = { ...JSON.parse(JSON.stringify(DEFAULT_KEYS)), ...b }; }

  down(action) { const ks = this.bindings[action] || []; for (const k of ks) if (this.keys.has(k)) return true; return false; }

  pads() {
    const list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    return list.filter((p) => p.connected);
  }

  padState(index) {
    const p = this.pads()[index];
    if (!p) return null;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const btn = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
    return { lx: dz(p.axes[0] || 0), ly: dz(p.axes[1] || 0), rx: dz(p.axes[2] || 0), ry: dz(p.axes[3] || 0), btn, raw: p };
  }

  /**
   * Build a sim input for a local player.
   * device: 'kbm' | 'touch' | 'pad0'.. | 'any' (keyboard + touch + first pad)
   * basis: camera basis from renderer.inputBasis()
   */
  frame(device, basis) {
    let sx = 0, sy = 0, b = 0;
    const useKb = device === 'kbm' || device === 'any';
    const useTouch = device === 'touch' || device === 'any';
    const padIdx = device.startsWith('pad') ? +device.slice(3) : device === 'any' ? 0 : -1;
    if (this.enabled && useKb) {
      if (this.down('up')) sy += 1;
      if (this.down('down')) sy -= 1;
      if (this.down('left')) sx -= 1;
      if (this.down('right')) sx += 1;
      for (const a in ACTION_BTN) if (this.down(a)) b |= ACTION_BTN[a];
    }
    if (this.enabled && useTouch && this.touch.active) {
      sx += this.touch.mx; sy += this.touch.my; b |= this.touch.b;
    }
    if (this.enabled && padIdx >= 0) {
      const p = this.padState(padIdx);
      if (p) {
        sx += p.lx; sy -= p.ly;
        if (p.btn(PAD.LEFT)) sx -= 1;
        if (p.btn(PAD.RIGHT)) sx += 1;
        for (const a in this.padBindings) for (const i of this.padBindings[a]) if (p.btn(i)) b |= ACTION_BTN[a];
      }
    }
    const m = Math.hypot(sx, sy);
    if (m > 1) { sx /= m; sy /= m; }
    const mx = basis.fx * sy + basis.rx * sx;
    const mz = basis.fz * sy + basis.rz * sx;
    return { mx, mz, b };
  }

  /** Camera orbit input (-1..1) from arrow keys / right stick. */
  orbit(device) {
    let o = 0;
    if (device === 'kbm' || device === 'any') { if (this.down('camLeft')) o -= 1; if (this.down('camRight')) o += 1; }
    const padIdx = device.startsWith('pad') ? +device.slice(3) : device === 'any' ? 0 : -1;
    if (padIdx >= 0) { const p = this.padState(padIdx); if (p) o += p.rx; }
    return o * 1.4 * this.sensitivity;
  }

  /** Menu navigation edges: returns array of 'up'|'down'|'left'|'right'|'ok'|'back'|'pause' with source tag. */
  menuEdges() {
    const out = [];
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Enter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back', Tab: 'tab' };
    for (const k of this.pressedOnce) if (map[k]) out.push({ dir: map[k], src: 'kb' });
    this.pressedOnce.clear();
    const pads = this.pads();
    pads.forEach((p, i) => {
      const prev = this.padPrev.get(i) || {};
      const cur = {
        up: p.buttons[12]?.pressed || (p.axes[1] || 0) < -0.6, down: p.buttons[13]?.pressed || (p.axes[1] || 0) > 0.6,
        left: p.buttons[14]?.pressed || (p.axes[0] || 0) < -0.6, right: p.buttons[15]?.pressed || (p.axes[0] || 0) > 0.6,
        ok: p.buttons[0]?.pressed, back: p.buttons[1]?.pressed, pause: p.buttons[9]?.pressed, y: p.buttons[3]?.pressed, x: p.buttons[2]?.pressed,
      };
      for (const k in cur) if (cur[k] && !prev[k]) out.push({ dir: k, src: 'pad' + i });
      this.padPrev.set(i, cur);
    });
    return out;
  }

  rebind(action, slot, onDone) {
    this.capture = (code) => {
      if (code !== 'Escape') {
        const arr = this.bindings[action] ? [...this.bindings[action]] : [];
        arr[slot] = code;
        this.bindings[action] = arr.filter(Boolean);
      }
      onDone(this.bindings);
    };
  }
}

/** On-screen controls for touch devices (virtual stick + action buttons). */
export class TouchControls {
  constructor(root, input) {
    this.input = input;
    const el = document.createElement('div');
    el.className = 'touch-controls';
    el.innerHTML = `
      <div class="tc-stick"><div class="tc-knob"></div></div>
      <div class="tc-buttons">
        <button data-b="ATTACK" class="tc-btn tc-attack">ATK</button>
        <button data-b="HEAVY" class="tc-btn tc-heavy">HVY</button>
        <button data-b="JUMP" class="tc-btn tc-jump">JUMP</button>
        <button data-b="SP1" class="tc-btn tc-sp1">Q</button>
        <button data-b="SP2" class="tc-btn tc-sp2">E</button>
        <button data-b="SP3" class="tc-btn tc-sp3">R</button>
        <button data-b="ULT" class="tc-btn tc-ult">ULT</button>
        <button data-b="DODGE" class="tc-btn tc-dodge">DODGE</button>
        <button data-b="SHIELD" class="tc-btn tc-shield">GUARD</button>
        <button data-b="DOWN" class="tc-btn tc-down">▼</button>
      </div>`;
    root.appendChild(el);
    this.el = el;
    const stick = el.querySelector('.tc-stick'), knob = el.querySelector('.tc-knob');
    let stickId = null, cx = 0, cy = 0;
    const R = 55;
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; stickId = t.identifier;
      const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      input.touch.active = true; e.preventDefault();
    }, { passive: false });
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.touch.mx = dx / R; input.touch.my = -dy / R;
        e.preventDefault();
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; knob.style.transform = ''; input.touch.mx = 0; input.touch.my = 0; }
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    for (const b of el.querySelectorAll('.tc-btn')) {
      const bit = BTN[b.dataset.b];
      const press = (e) => { e.preventDefault(); input.touch.active = true; input.touch.b |= bit; b.classList.add('on'); };
      const rel = (e) => { e.preventDefault(); input.touch.b &= ~bit; b.classList.remove('on'); };
      b.addEventListener('touchstart', press, { passive: false });
      b.addEventListener('touchend', rel, { passive: false });
      b.addEventListener('touchcancel', rel, { passive: false });
    }
  }
  show(v) { this.el.style.display = v ? '' : 'none'; }
}

export function isTouchDevice() {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;
}
