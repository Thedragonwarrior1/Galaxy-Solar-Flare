// Canvas-painted textures shared by several arenas (wood, rope, sails, flags, stone).
// Neutral-toned textures are meant to be tinted by vertex colours.
import * as THREE from 'three';
import { canvasTexture, rng } from '../toon.js';

const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function wavyLine(g, x0, x1, y0, amp, f, ph, step = 8) {
  g.beginPath();
  for (let x = x0; x <= x1; x += step) {
    const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph * 1.3) * amp * 0.3;
    if (x === x0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
}

/** Single board (grain along U). Neutral light tone; tint with vertex colours. */
export function boardTexture(seed = 1, { nails = true } = {}) {
  return canvasTexture(512, 128, (g, w, h) => {
    const R = rng(seed);
    g.fillStyle = '#f1e4d0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = rgba(205 + R() * 40, 175 + R() * 35, 140 + R() * 30, 0.22);
      g.fillRect(0, R() * h, w, 6 + R() * 26);
    }
    g.lineWidth = 1.4;
    for (let i = 0; i < 36; i++) {
      g.strokeStyle = R() < 0.72 ? rgba(125, 82, 50, 0.14 + R() * 0.24) : rgba(255, 250, 240, 0.3);
      wavyLine(g, 0, w, R() * h, 1.5 + R() * 4, 0.004 + R() * 0.012, R() * 6);
    }
    for (let k = 0; k < 2; k++) {
      const kx = 70 + R() * (w - 140);
      const ky = 24 + R() * (h - 48);
      for (let r = 11; r > 1; r -= 2.6) {
        g.strokeStyle = rgba(110, 68, 38, 0.28);
        g.beginPath(); g.ellipse(kx, ky, r * 2.3, r, 0, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = rgba(88, 52, 28, 0.55);
      g.beginPath(); g.ellipse(kx, ky, 5, 2.4, 0, 0, Math.PI * 2); g.fill();
    }
    // cel bevel: light top edge, dark bottom edge, dark ends
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, 0, w, 6);
    g.fillStyle = rgba(70, 40, 22, 0.6);
    g.fillRect(0, h - 8, w, 8);
    g.fillStyle = rgba(70, 40, 22, 0.45);
    g.fillRect(0, 0, 5, h);
    g.fillRect(w - 5, 0, 5, h);
    if (nails) {
      for (const x of [18, w - 18]) for (const y of [h * 0.32, h * 0.68]) {
        g.fillStyle = '#4b3b33';
        g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.65)';
        g.beginPath(); g.arc(x - 1.2, y - 1.2, 1.6, 0, Math.PI * 2); g.fill();
      }
    }
  });
}

/** Repeating multi-plank texture (rows along U), for hulls and big wooden walls. */
export function plankTexture(seed = 2, { rows = 8, size = 512 } = {}) {
  const t = canvasTexture(size, size, (g, w, h) => {
    const R = rng(seed);
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      const tone = 225 + R() * 25;
      g.fillStyle = rgba(tone, tone * 0.9, tone * 0.78, 1);
      g.fillRect(0, y, w, rh);
      g.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = R() < 0.75 ? rgba(120, 80, 50, 0.12 + R() * 0.2) : rgba(255, 255, 255, 0.25);
        const yy = y + 4 + R() * (rh - 8);
        // wrap-safe: grain lines span full width with integer frequency
        const k = (1 + Math.floor(R() * 3)) * (Math.PI * 2) / w;
        wavyLine(g, 0, w, yy, 1 + R() * 2.5, k, R() * 6, 4);
      }
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(0, y, w, 3);
      g.fillStyle = rgba(60, 34, 18, 0.65);
      g.fillRect(0, y + rh - 4, w, 4);
      // butt joints
      const nj = 1 + Math.floor(R() * 2);
      for (let j = 0; j < nj; j++) {
        const x = Math.floor(R() * w);
        g.fillStyle = rgba(60, 34, 18, 0.7);
        g.fillRect(x, y, 3, rh);
        g.fillStyle = '#4b3b33';
        for (const dx of [-8, 11]) {
          g.beginPath(); g.arc((x + dx + w) % w, y + rh * 0.5, 3, 0, Math.PI * 2); g.fill();
        }
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Twisted rope strands (repeat along U). */
export function ropeTexture() {
  const t = canvasTexture(128, 32, (g, w, h) => {
    g.fillStyle = '#e8cf9c';
    g.fillRect(0, 0, w, h);
    for (let i = -2; i < 10; i++) {
      const x = i * 16;
      g.fillStyle = 'rgba(140,96,52,0.55)';
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + 6, 0); g.lineTo(x + 6 + 16, h); g.lineTo(x + 16, h);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,248,225,0.6)';
      g.beginPath();
      g.moveTo(x + 9, 0); g.lineTo(x + 11, 0); g.lineTo(x + 27, h); g.lineTo(x + 25, h);
      g.closePath(); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function drawSkull(g, cx, cy, s, fg = '#f6f1e4', bg = '#15121a', bandana = null) {
  // crossed bones
  g.strokeStyle = fg;
  g.lineCap = 'round';
  g.lineWidth = s * 0.16;
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx - s * 0.95, cy + sgn * s * 0.15 + s * 0.55 * -sgn + s * 0.25);
    g.lineTo(cx + s * 0.95, cy - sgn * s * 0.15 + s * 0.55 * sgn + s * 0.25);
    g.stroke();
    for (const ex of [-1, 1]) {
      const bx = cx + ex * s * 0.95;
      const by = cy + s * 0.25 + (ex * sgn) * s * 0.4;
      g.fillStyle = fg;
      g.beginPath(); g.arc(bx, by - s * 0.07, s * 0.11, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(bx, by + s * 0.07, s * 0.11, 0, Math.PI * 2); g.fill();
    }
  }
  // cranium
  g.fillStyle = fg;
  g.beginPath(); g.ellipse(cx, cy - s * 0.12, s * 0.5, s * 0.46, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.roundRect ? g.roundRect(cx - s * 0.3, cy + s * 0.12, s * 0.6, s * 0.34, s * 0.08) : g.rect(cx - s * 0.3, cy + s * 0.12, s * 0.6, s * 0.34); g.fill();
  if (bandana) {
    g.fillStyle = bandana;
    g.beginPath();
    g.ellipse(cx, cy - s * 0.3, s * 0.53, s * 0.32, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(cx - s * 0.53, cy - s * 0.32, s * 1.06, s * 0.1);
    g.beginPath();
    g.moveTo(cx + s * 0.45, cy - s * 0.3); g.lineTo(cx + s * 0.8, cy - s * 0.5); g.lineTo(cx + s * 0.75, cy - s * 0.2); g.closePath(); g.fill();
    g.fillStyle = fg;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(cx - s * 0.3 + i * s * 0.2, cy - s * 0.42, s * 0.035, 0, Math.PI * 2); g.fill(); }
  }
  g.fillStyle = bg;
  for (const ex of [-1, 1]) { g.beginPath(); g.ellipse(cx + ex * s * 0.2, cy - s * 0.06, s * 0.14, s * 0.12, 0, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.moveTo(cx, cy + s * 0.04); g.lineTo(cx - s * 0.06, cy + s * 0.16); g.lineTo(cx + s * 0.06, cy + s * 0.16); g.closePath(); g.fill();
  g.lineWidth = s * 0.03;
  g.strokeStyle = bg;
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * s * 0.1, cy + s * 0.27); g.lineTo(cx + i * s * 0.1, cy + s * 0.44); g.stroke(); }
}

function clothBase(g, x, y, w, h, base, seamCol, R) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  // vertical cloth panels
  const panels = 7;
  for (let i = 0; i < panels; i++) {
    g.fillStyle = i % 2 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)';
    g.fillRect(x + (i * w) / panels, y, w / panels, h);
    g.fillStyle = seamCol;
    g.fillRect(x + (i * w) / panels, y, 2, h);
  }
  // reinforcement bands
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(x, y, w, h * 0.06);
  g.fillRect(x, y + h * 0.94, w, h * 0.06);
  g.fillRect(x, y, w * 0.03, h);
  g.fillRect(x + w * 0.97, y, w * 0.03, h);
  // reef points
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 1; i < 12; i++) { g.beginPath(); g.arc(x + (i * w) / 12, y + h * 0.16, 2.5, 0, Math.PI * 2); g.fill(); }
  // weathering
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(120,90,60,${0.03 + R() * 0.05})`;
    g.beginPath(); g.ellipse(x + R() * w, y + R() * h, 10 + R() * 40, 6 + R() * 26, R() * 3, 0, Math.PI * 2); g.fill();
  }
}

/**
 * Sail atlas (2x2): 0 cream + red stripes, 1 patched cream, 2 black jolly roger, 3 marine white + blue stripe & gold star.
 * UV rect for slot i: u0 = (i%2)*0.5, v0 = (i<2 ? 0.5 : 0)
 */
export function sailAtlas(seed = 11) {
  return canvasTexture(1024, 1024, (g) => {
    const R = rng(seed);
    const S = 512;
    // 0: cream with red stripes
    clothBase(g, 0, 0, S, S, '#f5ead2', 'rgba(150,120,90,0.25)', R);
    g.fillStyle = '#d8423a';
    for (let i = 0; i < 3; i++) g.fillRect(S * (0.14 + i * 0.29), 0, S * 0.13, S);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 0, S, S * 0.06);
    // 1: patched cream
    clothBase(g, S, 0, S, S, '#efe3c6', 'rgba(150,120,90,0.3)', R);
    for (let i = 0; i < 4; i++) {
      const px = S + 40 + R() * (S - 140);
      const py = 60 + R() * (S - 160);
      const pw = 50 + R() * 60;
      const ph = 40 + R() * 50;
      g.fillStyle = ['#e2cfa4', '#d9c39a', '#cdb68c', '#e8d6b0'][i];
      g.fillRect(px, py, pw, ph);
      g.strokeStyle = 'rgba(110,80,50,0.6)';
      g.setLineDash([5, 4]);
      g.lineWidth = 2;
      g.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
      g.setLineDash([]);
    }
    // 2: black jolly roger
    clothBase(g, 0, S, S, S, '#22202a', 'rgba(255,255,255,0.06)', R);
    drawSkull(g, S * 0.5, S * 1.47, S * 0.3, '#f4efe2', '#22202a', '#c8323a');
    // 3: marine white with blue stripe + gold star
    clothBase(g, S, S, S, S, '#f8f8f6', 'rgba(80,100,140,0.18)', R);
    g.fillStyle = '#2f5fae';
    g.fillRect(S, S + S * 0.7, S, S * 0.12);
    g.fillStyle = '#e3b23c';
    g.fillRect(S, S + S * 0.84, S, S * 0.03);
    star(g, S * 1.5, S * 1.38, S * 0.17, S * 0.07, 8, '#2f5fae');
    star(g, S * 1.5, S * 1.38, S * 0.12, S * 0.05, 8, '#e3b23c');
  });
}

export function star(g, cx, cy, ro, ri, n, fill) {
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? ri : ro;
    if (i) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

/** Flag atlas (2x2): 0 jolly roger, 1 red/gold pirate, 2 marine blue/white star, 3 harbour teal/yellow. */
export function flagAtlas() {
  return canvasTexture(512, 512, (g) => {
    const S = 256;
    g.fillStyle = '#1d1a22'; g.fillRect(0, 0, S, S);
    drawSkull(g, S * 0.5, S * 0.47, S * 0.3, '#f4efe2', '#1d1a22', null);
    g.fillStyle = '#d23c35'; g.fillRect(S, 0, S, S);
    g.fillStyle = '#f2c14e'; g.fillRect(S, S * 0.4, S, S * 0.2);
    drawSkull(g, S * 1.5, S * 0.5, S * 0.16, '#fff6e0', '#d23c35', null);
    g.fillStyle = '#f7f7f4'; g.fillRect(0, S, S, S);
    g.fillStyle = '#2f5fae'; g.fillRect(0, S, S, S * 0.22); g.fillRect(0, S * 1.78, S, S * 0.22);
    star(g, S * 0.5, S * 1.5, S * 0.22, S * 0.09, 8, '#e3b23c');
    g.fillStyle = '#1aa39a'; g.fillRect(S, S, S, S);
    g.fillStyle = '#ffd34d';
    for (let i = 0; i < 4; i++) g.fillRect(S, S + i * S * 0.25 + S * 0.08, S, S * 0.08);
    // a darker edge on all flags
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 6;
    for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) g.strokeRect(x + 3, y + 3, S - 6, S - 6);
  });
}

/** UV rectangle helper for 2x2 atlases. Returns [u0, v0, u1, v1]. Slot 0,1 top row; 2,3 bottom row. */
export function atlasRect(i) {
  const u0 = (i % 2) * 0.5;
  const v0 = i < 2 ? 0.5 : 0;
  return [u0, v0, u0 + 0.5, v0 + 0.5];
}

/** Remap a geometry's UVs (0..1) into an atlas rect (in place). */
export function remapUV(geo, rect) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Cut-stone ashlar (repeating). opts: { base: [r,g,b], var, mortar, rows, w, h, highlight }
 */
export function stoneBrickTexture(seed = 3, { base = [200, 196, 188], vari = 18, mortar = '#8e8a86', rows = 6, size = 512, moss = 0 } = {}) {
  const t = canvasTexture(size, size, (g, w, h) => {
    const R = rng(seed);
    g.fillStyle = mortar;
    g.fillRect(0, 0, w, h);
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -R() * 60;
      while (x < w) {
        const bw = 60 + R() * 80;
        const k = (R() - 0.5) * 2 * vari;
        const draw = (ox) => {
          const x0 = x + ox + 3;
          const y0 = r * rh + 3;
          const ww = bw - 6;
          const hh = rh - 6;
          g.fillStyle = rgba(base[0] + k, base[1] + k, base[2] + k * 0.9, 1);
          g.fillRect(x0, y0, ww, hh);
          // bevel highlight / shadow (cel)
          g.fillStyle = 'rgba(255,255,255,0.28)';
          g.fillRect(x0, y0, ww, 4);
          g.fillRect(x0, y0, 4, hh);
          g.fillStyle = 'rgba(0,0,0,0.18)';
          g.fillRect(x0, y0 + hh - 5, ww, 5);
          g.fillRect(x0 + ww - 4, y0, 4, hh);
          // speckles
          for (let i = 0; i < 10; i++) {
            g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';
            g.beginPath(); g.arc(x0 + R() * ww, y0 + R() * hh, 2 + R() * 6, 0, Math.PI * 2); g.fill();
          }
          if (R() < 0.12) {
            g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 1.5;
            g.beginPath();
            let cx = x0 + R() * ww; let cy = y0;
            g.moveTo(cx, cy);
            for (let s = 0; s < 4; s++) { cx += (R() - 0.5) * 18; cy += hh / 4; g.lineTo(cx, cy); }
            g.stroke();
          }
          if (moss && R() < moss) {
            g.fillStyle = 'rgba(90,140,70,0.35)';
            g.beginPath(); g.ellipse(x0 + R() * ww, y0 + hh - 4, 10 + R() * 20, 4 + R() * 6, 0, 0, Math.PI * 2); g.fill();
          }
        };
        draw(0);
        if (x + bw > w) draw(-w);
        if (x < 0) draw(w);
        x += bw;
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
