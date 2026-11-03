// Tiny DOM helpers + spatial focus navigation (keyboard / gamepad menu control).

/** h('div.cls#id', {attrs}, ...children) */
export function h(tag, attrs, ...kids) {
  const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) { if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1); }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'vars') for (const n in v) el.style.setProperty('--' + n, v[n]);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className += ' ' + v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function hex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }

/** Spatial focus navigation over .focusable elements within a root. */
export class FocusNav {
  constructor(root, { onBack, onMove } = {}) {
    this.root = root;
    this.onBack = onBack;
    this.onMove = onMove;
    this.cur = null;
    root.addEventListener('mouseover', (e) => {
      const t = e.target.closest && e.target.closest('.focusable');
      if (t && root.contains(t)) this.set(t, true);
    });
  }
  items() { return [...this.root.querySelectorAll('.focusable')].filter((e) => !e.disabled && e.offsetParent !== null); }
  set(el, fromMouse = false) {
    if (this.cur === el) return;
    if (this.cur) this.cur.classList.remove('focus');
    this.cur = el;
    if (el) {
      el.classList.add('focus');
      if (!fromMouse && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (this.onMove) this.onMove(el, fromMouse);
      el.dispatchEvent(new CustomEvent('focusnav'));
    }
  }
  first() { const it = this.items(); if (it.length) this.set(it.find((e) => e.dataset.autofocus !== undefined) || it[0]); }
  move(dir) {
    const items = this.items();
    if (!items.length) return;
    if (!this.cur || !items.includes(this.cur)) { this.set(items[0]); return; }
    const r0 = this.cur.getBoundingClientRect();
    const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    let best = null, bd = Infinity;
    for (const el of items) {
      if (el === this.cur) continue;
      const r = el.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const dx = c.x - c0.x, dy = c.y - c0.y;
      let ok = false, primary = 0, secondary = 0;
      if (dir === 'up') { ok = dy < -4; primary = -dy; secondary = Math.abs(dx); }
      if (dir === 'down') { ok = dy > 4; primary = dy; secondary = Math.abs(dx); }
      if (dir === 'left') { ok = dx < -4; primary = -dx; secondary = Math.abs(dy); }
      if (dir === 'right') { ok = dx > 4; primary = dx; secondary = Math.abs(dy); }
      if (!ok) continue;
      const d = primary + secondary * 2.2;
      if (d < bd) { bd = d; best = el; }
    }
    if (best) this.set(best);
  }
  handle(edge) {
    if (['up', 'down', 'left', 'right'].includes(edge)) { this.move(edge); return true; }
    if (edge === 'ok' && this.cur) { this.cur.click(); return true; }
    if (edge === 'back' && this.onBack) { this.onBack(); return true; }
    return false;
  }
}

export function fmtTime(frames) {
  const s = Math.max(0, Math.ceil(frames / 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
