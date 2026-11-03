// Procedural anime-style fighter models. Every fighter is built from sculpted primitives (lathe-turned torsos,
// tapered limbs, painted face textures, layered hair, outfits and weapons) with cel shading + ink outlines.
// The rig is driven each frame by animator.js (IK limbs + body pose).
import * as THREE from 'three';
import { toonMat, addOutline, canvasTexture } from './toon.js';
import { BODY } from '../../shared/characters/common.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const OUTLINE = 0x1a1124;

// ---------------------------------------------------------------- per-character art direction
export const LOOKS = {
  captain_rubber: {
    skin: 0xf2c096, hair: 0x1d2f4a, hairStyle: 'messy', eye: '#3b2412', brow: 'raised', mouth: 'grin',
    top: 0x1f8a9e, topStyle: 'openJacket', inner: 0xfaf3e0, sash: 0xffb627, pants: 0x22315a, pantsShort: true,
    shoe: 0x8a5a33, shoeStyle: 'sandal', sleeve: 'short', glove: null, hat: 'tricorn', hatColor: 0xffb627, hatBand: 0xe8443a,
    trail: 0xffc94a, outline: 0x1a1124, build: { chest: 1.0, waist: 0.92, limb: 1.0 }, stance: 'bouncy', run: 'sprint',
  },
  threeblade: {
    skin: 0xe8b88f, hair: 0xe9eef2, hairStyle: 'topknot', eye: '#b8860b', brow: 'angry', mouth: 'flat',
    top: 0x2e5c4f, topStyle: 'longCoat', inner: 0x1b1b1b, sash: 0xc0392b, pants: 0x1f2a2a, shoe: 0x2a1f1a, shoeStyle: 'boot',
    sleeve: 'long', glove: null, weapons: 'threeSwords', blade: 0xdfe7ef, hilt: 0x2b2b2b, guard: 0xd4a017,
    trail: 0x9fffe0, build: { chest: 1.12, waist: 1.0, limb: 1.08 }, stance: 'guard', run: 'ninja',
  },
  blaze_kick: {
    skin: 0xf4c9a3, hair: 0xff7b00, hairStyle: 'ponytail', eye: '#2b6cb0', brow: 'smug', mouth: 'smirk',
    top: 0x7b2cbf, topStyle: 'tailcoat', inner: 0xf4f1de, sash: 0xffd166, pants: 0x1b1325, shoe: 0x111111, shoeStyle: 'flameBoot',
    sleeve: 'long', glove: null, trail: 0xff7b00, build: { chest: 0.95, waist: 0.86, limb: 1.05 }, stance: 'pockets', run: 'sprint',
  },
  spatial_swordsman: {
    skin: 0xe7c4a5, hair: 0x3a2d5c, hairStyle: 'hood', eye: '#3ee0d0', brow: 'flat', mouth: 'flat', eyeShape: 'half',
    top: 0x26304a, topStyle: 'cloak', inner: 0xe9ecef, sash: 0x3ee0d0, pants: 0x1b2133, shoe: 0x14161f, shoeStyle: 'boot',
    sleeve: 'long', glove: 0xe9ecef, weapons: 'nodachi', blade: 0xbff8ff, hilt: 0x1b1b2b, guard: 0x3ee0d0, glowLines: 0x3ee0d0,
    trail: 0x3ee0d0, build: { chest: 1.0, waist: 0.9, limb: 1.04 }, stance: 'calm', run: 'glide',
  },
  ember_king: {
    skin: 0xe9b48a, hair: 0x8b0d2c, hairTip: 0x1b0a10, hairStyle: 'flame', eye: '#ff5400', brow: 'angry', mouth: 'grin',
    top: 0x1b1b1e, topStyle: 'vestCape', inner: 0x1b1b1e, sash: 0xd4a017, cape: 0xb5179e, pants: 0x2b1b24, shoe: 0x3a1a10, shoeStyle: 'boot',
    sleeve: 'none', glove: 0xff5400, gloveGlow: true, hat: 'crown', hatColor: 0xffc300,
    trail: 0xff5400, build: { chest: 1.1, waist: 0.95, limb: 1.03 }, stance: 'proud', run: 'sprint',
  },
  tempest: {
    skin: 0xf5d0b5, hair: 0xa9c6ff, hairStyle: 'buns', eye: '#6a4c93', brow: 'raised', mouth: 'smile', lashes: true,
    top: 0x4361ee, topStyle: 'weatherCoat', inner: 0xf8f9fa, sash: 0xffd60a, pants: 0x222b5c, shoe: 0xf8f9fa, shoeStyle: 'boot',
    sleeve: 'long', glove: null, weapons: 'staff', staff: 0x30343f, orb: 0xffd60a, hat: 'goggles', hatColor: 0x8d99ae,
    trail: 0xffe14d, build: { chest: 0.9, waist: 0.8, limb: 0.96 }, stance: 'jaunty', run: 'sprint', slim: true,
  },
  monster_doctor: {
    skin: 0xf2c4a0, hair: 0x52b788, hairStyle: 'curly', eye: '#2d6a4f', brow: 'soft', mouth: 'smile', glasses: true,
    top: 0xf1faee, topStyle: 'labCoat', inner: 0x2d6a4f, sash: 0xe76f51, pants: 0x3d405b, shoe: 0x5c3d2e, shoeStyle: 'boot',
    sleeve: 'long', glove: null, trail: 0x95d5b2, build: { chest: 1.25, waist: 1.3, limb: 1.18 }, stance: 'friendly', run: 'stomp',
    monster: { skin: 0x7fb069, horn: 0xf1e3c8, eyeGlow: 0xff3b3b },
  },
  slingshot_sniper: {
    skin: 0xc68e5e, hair: 0x3e2723, hairStyle: 'curly', eye: '#1b1b1b', brow: 'raised', mouth: 'grin',
    top: 0x2a9d8f, topStyle: 'overalls', inner: 0x2a9d8f, sash: 0xbc6c25, overalls: 0xbc6c25, pants: 0xbc6c25, shoe: 0x6d4c41, shoeStyle: 'boot',
    sleeve: 'short', glove: 0xe9c46a, weapons: 'slingshot', hat: 'goggles', hatColor: 0xe9c46a, backpack: true,
    trail: 0xe9c46a, build: { chest: 0.95, waist: 0.92, limb: 0.98 }, stance: 'nervous', run: 'flail',
  },
};

// ---------------------------------------------------------------- geometry helpers
const geoCache = new Map();
function cached(key, fn) { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); }

/** Unit-length tapered limb along +Y (0..1), radius r0 at bottom, r1 at top. */
function limbGeometry(r0, r1) {
  return cached(`limb:${r0}:${r1}`, () => {
    const pts = [];
    pts.push(new THREE.Vector2(0.0001, -0.05));
    pts.push(new THREE.Vector2(r0 * 0.75, -0.035));
    pts.push(new THREE.Vector2(r0, 0.02));
    pts.push(new THREE.Vector2((r0 + r1) * 0.52, 0.5));
    pts.push(new THREE.Vector2(r1, 0.95));
    pts.push(new THREE.Vector2(r1 * 0.75, 1.035));
    pts.push(new THREE.Vector2(0.0001, 1.05));
    const g = new THREE.LatheGeometry(pts, 14);
    g.computeVertexNormals();
    return g;
  });
}

function torsoGeometry(w, chest, waist, h, depth) {
  return cached(`torso:${w}:${chest}:${waist}:${h}:${depth}`, () => {
    const pts = [
      new THREE.Vector2(0.0001, 0), new THREE.Vector2(waist * 0.9, 0.02), new THREE.Vector2(waist, 0.12 * h),
      new THREE.Vector2(waist * 1.02, 0.35 * h), new THREE.Vector2(chest, 0.68 * h), new THREE.Vector2(chest * 1.02, 0.85 * h),
      new THREE.Vector2(chest * 0.8, 0.97 * h), new THREE.Vector2(0.06, h), new THREE.Vector2(0.0001, h),
    ];
    const g = new THREE.LatheGeometry(pts, 20);
    g.scale(w, 1, depth);
    g.computeVertexNormals();
    return g;
  });
}

function sphere(r, ws = 18, hs = 14) { return cached(`sph:${r}:${ws}`, () => new THREE.SphereGeometry(r, ws, hs)); }

function mesh(geo, mat, outline = 0.012, oc = OUTLINE, mode) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  if (outline > 0) addOutline(m, outline, oc, mode);
  return m;
}

// ---------------------------------------------------------------- faces
function drawEye(g, cx, cy, look, expr, flip) {
  const sharp = look.eyeShape === 'half' || look.brow === 'angry';
  if (expr === 'blink' || expr === 'hurt') {
    g.strokeStyle = '#1a1124'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath();
    if (expr === 'hurt') { g.moveTo(cx - 14, cy - 8); g.lineTo(cx + 2 * flip, cy); g.lineTo(cx - 14, cy + 8); }
    else { g.moveTo(cx - 15, cy + 2); g.quadraticCurveTo(cx, cy + 8, cx + 15, cy + 2); }
    g.stroke();
    return;
  }
  const h = look.eyeShape === 'half' ? 15 : expr === 'attack' ? 19 : 22;
  g.save();
  g.translate(cx, cy);
  // sclera
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(0, 0, 13, h, 0, 0, Math.PI * 2); g.fill();
  // iris with gradient
  const grd = g.createLinearGradient(0, -h, 0, h);
  grd.addColorStop(0, '#1a1124'); grd.addColorStop(0.35, look.eye); grd.addColorStop(1, lighten(look.eye, 0.45));
  g.fillStyle = grd;
  g.beginPath(); g.ellipse(flip * 1.5, 2, 9.5, h * 0.78, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#120a18';
  g.beginPath(); g.ellipse(flip * 1.5, 3, 4.5, h * 0.4, 0, 0, Math.PI * 2); g.fill();
  // highlights
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(flip * -3, -h * 0.35, 3.6, 4.6, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(flip * 4, h * 0.3, 1.8, 2.2, 0, 0, Math.PI * 2); g.fill();
  // upper lid line
  g.strokeStyle = '#1a1124'; g.lineWidth = sharp ? 6 : 5; g.lineCap = 'round';
  g.beginPath();
  if (sharp) { g.moveTo(-15 * flip, -h * 0.55); g.quadraticCurveTo(0, -h * 1.15, 15 * flip, -h * 0.85); }
  else g.ellipse(0, 0, 13.5, h, 0, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();
  if (look.lashes) { g.lineWidth = 3; g.beginPath(); g.moveTo(14 * flip, -h * 0.75); g.lineTo(20 * flip, -h * 1.05); g.stroke(); }
  if (look.eyeShape === 'half') { g.fillStyle = hex(look.skin); g.fillRect(-16, -h - 4, 32, h * 0.7); g.strokeStyle = '#1a1124'; g.lineWidth = 5; g.beginPath(); g.moveTo(-15, -h * 0.32); g.lineTo(15, -h * 0.32); g.stroke(); }
  g.restore();
}

function lighten(c, t) {
  const n = parseInt(c.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(v + (255 - v) * t);
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}
function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

function faceTexture(look, expr) {
  return canvasTexture(256, 128, (g, W) => {
    g.clearRect(0, 0, W, 128);
    const ey = 54, dx = 40;
    // brows
    g.strokeStyle = hex(look.hair === 0xe9eef2 ? 0x9aa4ad : look.hair); g.lineWidth = 7; g.lineCap = 'round';
    const browY = ey - 34;
    for (const s of [-1, 1]) {
      g.beginPath();
      const x = W / 2 + s * dx;
      if (look.brow === 'angry' || expr === 'attack') { g.moveTo(x - s * 18, browY - 4); g.lineTo(x + s * 14, browY + 6); }
      else if (look.brow === 'raised') { g.moveTo(x - s * 16, browY + 2); g.quadraticCurveTo(x, browY - 8, x + s * 16, browY); }
      else if (look.brow === 'smug') { g.moveTo(x - s * 16, browY + (s > 0 ? -4 : 2)); g.lineTo(x + s * 16, browY + (s > 0 ? 2 : -4)); }
      else if (look.brow === 'soft') { g.moveTo(x - s * 16, browY + 4); g.quadraticCurveTo(x, browY - 2, x + s * 16, browY + 6); }
      else { g.moveTo(x - s * 16, browY); g.lineTo(x + s * 16, browY); }
      g.stroke();
    }
    drawEye(g, W / 2 - dx, ey, look, expr, -1);
    drawEye(g, W / 2 + dx, ey, look, expr, 1);
    // blush
    g.fillStyle = 'rgba(255,120,120,0.28)';
    g.beginPath(); g.ellipse(W / 2 - 62, ey + 26, 12, 6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(W / 2 + 62, ey + 26, 12, 6, 0, 0, Math.PI * 2); g.fill();
    // mouth
    const my = 104;
    g.strokeStyle = '#1a1124'; g.lineWidth = 4.5; g.lineCap = 'round';
    const m = expr === 'attack' ? 'shout' : expr === 'hurt' ? 'ouch' : look.mouth;
    g.beginPath();
    if (m === 'grin') {
      g.fillStyle = '#ffffff'; g.moveTo(W / 2 - 22, my - 6); g.quadraticCurveTo(W / 2, my + 16, W / 2 + 22, my - 6); g.closePath(); g.fill(); g.stroke();
    } else if (m === 'smirk') { g.moveTo(W / 2 - 14, my); g.quadraticCurveTo(W / 2 + 6, my + 6, W / 2 + 18, my - 6); g.stroke(); }
    else if (m === 'smile') { g.moveTo(W / 2 - 14, my - 2); g.quadraticCurveTo(W / 2, my + 9, W / 2 + 14, my - 2); g.stroke(); }
    else if (m === 'shout') { g.fillStyle = '#5a1020'; g.ellipse(W / 2, my, 11, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    else if (m === 'ouch') { g.moveTo(W / 2 - 12, my + 2); g.lineTo(W / 2 - 4, my - 4); g.lineTo(W / 2 + 4, my + 2); g.lineTo(W / 2 + 12, my - 4); g.stroke(); }
    else { g.moveTo(W / 2 - 11, my); g.lineTo(W / 2 + 11, my); g.stroke(); }
  });
}

// ---------------------------------------------------------------- hair & headwear
function buildHair(look, headR, mats) {
  const grp = new THREE.Group();
  const hm = mats.hair;
  const cap = new THREE.SphereGeometry(headR * 1.08, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const capMesh = mesh(cap, hm, 0.012);
  capMesh.rotation.x = -0.25;
  capMesh.position.set(0, 0.01, -0.015);
  grp.add(capMesh);
  const spike = (len, rad, x, y, z, rx, ry, rz) => {
    const c = new THREE.Mesh(cached(`cone:${rad}:${len}`, () => new THREE.ConeGeometry(rad, len, 7)), hm);
    c.position.set(x, y, z); c.rotation.set(rx, ry, rz);
    return c;
  };
  const parts = [];
  const style = look.hairStyle;
  if (style === 'messy' || style === 'flame') {
    const n = style === 'flame' ? 11 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const up = style === 'flame' ? 0.9 : 0.55;
      parts.push(spike(style === 'flame' ? 0.26 : 0.17, 0.07, Math.sin(a) * headR * 0.7, headR * (0.55 + Math.cos(a) * 0.05), Math.cos(a) * headR * 0.55 - 0.03,
        Math.cos(a) * up - 0.3, 0, -Math.sin(a) * up));
    }
    // bangs
    for (let i = -2; i <= 2; i++) parts.push(spike(0.13, 0.05, i * 0.055, headR * 0.6, headR * 0.82, 2.0, 0, i * 0.15));
  } else if (style === 'topknot') {
    const bun = new THREE.Mesh(sphere(0.075, 12, 10), hm); bun.position.set(0, headR * 1.12, -0.04); parts.push(bun);
    parts.push(spike(0.22, 0.05, 0, headR * 1.25, -0.1, -2.4, 0, 0));
    for (let i = -1; i <= 1; i += 2) parts.push(spike(0.18, 0.04, i * 0.11, headR * 0.35, headR * 0.86, 2.9, 0, i * 0.2));
  } else if (style === 'ponytail') {
    const tail = new THREE.Mesh(cached('tail', () => new THREE.ConeGeometry(0.075, 0.55, 8)), hm);
    tail.position.set(0, headR * 0.3, -headR * 1.15); tail.rotation.x = -2.6; parts.push(tail);
    const tie = new THREE.Mesh(sphere(0.045, 10, 8), mats.sash); tie.position.set(0, headR * 0.45, -headR * 0.95); parts.push(tie);
    for (let i = -2; i <= 2; i++) parts.push(spike(0.16, 0.05, i * 0.05, headR * 0.62, headR * 0.8, 2.1, 0, i * 0.18));
    parts.push(spike(0.24, 0.06, headR * 0.45, headR * 0.15, headR * 0.75, 2.8, 0, 0.35));
  } else if (style === 'buns') {
    for (const s of [-1, 1]) {
      const bun = new THREE.Mesh(sphere(0.085, 12, 10), hm); bun.position.set(s * headR * 0.75, headR * 0.85, -0.02); parts.push(bun);
      parts.push(spike(0.3, 0.05, s * headR * 0.95, headR * -0.1, -0.02, 3.1, 0, s * 0.15));
    }
    for (let i = -2; i <= 2; i++) parts.push(spike(0.12, 0.05, i * 0.055, headR * 0.62, headR * 0.82, 2.0, 0, i * 0.14));
  } else if (style === 'curly') {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, b = 0.25 + (i % 3) * 0.25;
      const c = new THREE.Mesh(sphere(0.065, 10, 8), hm);
      c.position.set(Math.sin(a) * headR * 0.85 * Math.cos(b), headR * (0.35 + Math.sin(b) * 0.65), Math.cos(a) * headR * 0.8 * Math.cos(b) - 0.03);
      if (c.position.z > headR * 0.5 && c.position.y < headR * 0.6) continue;
      parts.push(c);
    }
  } else if (style === 'hood') {
    const hood = new THREE.SphereGeometry(headR * 1.3, 20, 14, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, 0, Math.PI * 0.74);
    const hoodMat = toonMat(look.top, { side: THREE.DoubleSide, rim: 0.3 });
    const hm2 = mesh(hood, hoodMat, 0.014);
    hm2.position.set(0, 0.02, -0.03);
    grp.add(hm2);
    for (let i = -2; i <= 2; i++) parts.push(spike(0.17, 0.05, i * 0.05, headR * 0.55, headR * 0.82, 2.25, 0, i * 0.2));
  }
  if (parts.length) {
    const geos = parts.map((p) => { p.updateMatrix(); const g = p.geometry.clone(); g.applyMatrix4(p.matrix); return g.index ? g.toNonIndexed() : g; });
    const merged = mergeGeometries(geos, false);
    merged.computeVertexNormals();
    grp.add(mesh(merged, hm, 0.01));
  }
  return grp;
}

function buildHat(look, headR, mats) {
  const g = new THREE.Group();
  if (look.hat === 'tricorn') {
    const crown = mesh(new THREE.CylinderGeometry(headR * 0.82, headR * 1.0, 0.16, 18), mats.hat, 0.012);
    crown.position.y = headR * 0.95; g.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(headR * 1.01, headR * 1.02, 0.05, 18), mats.hatBand);
    band.position.y = headR * 0.86; g.add(band);
    const brimGeo = new THREE.TorusGeometry(headR * 1.2, 0.06, 6, 3);
    const brim = mesh(brimGeo, mats.hat, 0.012);
    brim.rotation.x = Math.PI / 2; brim.rotation.z = Math.PI / 2; brim.position.y = headR * 0.82; brim.scale.set(1, 1, 1.6);
    g.add(brim);
    const feather = mesh(new THREE.ConeGeometry(0.035, 0.4, 6), mats.hatBand, 0.008);
    feather.position.set(headR * 0.7, headR * 1.15, -0.05); feather.rotation.set(-0.6, 0, -0.7); g.add(feather);
  } else if (look.hat === 'crown') {
    const ring = mesh(new THREE.CylinderGeometry(headR * 0.95, headR * 0.98, 0.06, 20, 1, true), mats.hat, 0.008);
    ring.position.y = headR * 0.72; g.add(ring);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), mats.hat);
      p.position.set(Math.sin(a) * headR * 0.96, headR * 0.82, Math.cos(a) * headR * 0.96); g.add(p);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), mats.gem); gem.position.set(0, headR * 0.73, headR * 0.98); g.add(gem);
  } else if (look.hat === 'goggles') {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(headR * 1.04, 0.022, 6, 24), mats.strap);
    strap.rotation.x = Math.PI / 2 - 0.35; strap.position.y = headR * 0.55; g.add(strap);
    for (const s of [-1, 1]) {
      const lens = mesh(new THREE.TorusGeometry(0.055, 0.02, 8, 16), mats.hat, 0.008);
      lens.position.set(s * 0.07, headR * 0.78, headR * 0.82); lens.rotation.x = -0.5; g.add(lens);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), mats.lens);
      glass.position.copy(lens.position); glass.rotation.x = -0.5; glass.translateZ(0.005); g.add(glass);
    }
  }
  if (look.glasses) {
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.01, 6, 18), mats.strap);
      rim.position.set(s * 0.075, -0.005, headR * 0.98); g.add(rim);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), mats.lens); glass.position.copy(rim.position); glass.position.z += 0.002; g.add(glass);
    }
  }
  return g;
}

// ---------------------------------------------------------------- weapons
function buildSword(look, len = 1.2, curve = 0.06) {
  const g = new THREE.Group();
  const bladeMat = toonMat(look.blade || 0xe0e6ee, { rim: 0.7, emissive: look.glowLines ? look.blade : 0x000000, emissiveIntensity: look.glowLines ? 0.35 : 0 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.022, 0); shape.lineTo(0.022, 0);
  shape.quadraticCurveTo(0.028 + curve, len * 0.6, 0.004, len);
  shape.quadraticCurveTo(-0.02 + curve * 0.6, len * 0.6, -0.022, 0);
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  bg.translate(0, 0.0, -0.004);
  const blade = mesh(bg, bladeMat, 0.006);
  blade.position.y = 0.06;
  g.add(blade);
  const guard = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10), toonMat(look.guard || 0xd4a017), 0.006);
  guard.position.y = 0.055; g.add(guard);
  const hilt = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.2, 8), toonMat(look.hilt || 0x222222), 0.006);
  hilt.position.y = -0.04; g.add(hilt);
  g.userData.length = len + 0.06;
  return g;
}

function buildStaff(look) {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), toonMat(look.staff), 0.008);
  pole.position.y = 0.45; g.add(pole);
  for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.01, 6, 12), toonMat(0xd4a017)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.1 + i * 0.5; g.add(ring); }
  const orb = new THREE.Mesh(sphere(0.085, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.orb).multiplyScalar(2.2) }));
  orb.position.y = 1.3; g.add(orb);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), toonMat(0xd4a017)); cage.position.y = 1.3; g.add(cage);
  g.userData.length = 1.3; g.userData.orb = orb;
  return g;
}

function buildSlingshot(look) {
  const g = new THREE.Group();
  const wood = toonMat(0x8d5524);
  const stem = mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.22, 8), wood, 0.006); stem.position.y = 0.0; g.add(stem);
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.24, 8), wood, 0.006);
    arm.position.set(s * 0.07, 0.19, 0); arm.rotation.z = -s * 0.45; g.add(arm);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 12, Math.PI), toonMat(0xd62828));
  band.position.y = 0.3; band.rotation.z = Math.PI; g.add(band);
  g.userData.length = 0.3;
  return g;
}

function buildMallet() {
  const g = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), toonMat(0x8d5524), 0.008); handle.position.y = 0.5; g.add(handle);
  const head = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 16), toonMat(0xe63946, { rim: 0.5 }), 0.014);
  head.rotation.z = Math.PI / 2; head.position.y = 1.1; g.add(head);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 16), toonMat(0xffd166)); band.rotation.z = Math.PI / 2; band.position.y = 1.1; g.add(band);
  g.userData.length = 1.1;
  return g;
}

// ---------------------------------------------------------------- the model
export class FighterModel {
  constructor(charDef, quality = 'high', teamColor = null) {
    this.def = charDef;
    this.look = LOOKS[charDef.id];
    const L = this.look;
    const s = (charDef.stats.height || 1.8) / 1.8;
    this.s = s;
    const B = L.build;
    const oc = L.outline || OUTLINE;
    const outl = quality === 'low' ? 0 : 0.012;
    this.outlineOn = outl > 0;

    const mats = this.mats = {
      skin: toonMat(L.skin, { rim: 0.25, rimColor: 0xfff0e0 }),
      hair: toonMat(L.hair, { rim: 0.45 }),
      top: toonMat(L.top, { rim: 0.3 }),
      inner: toonMat(L.inner, { rim: 0.2 }),
      sash: toonMat(L.sash, { rim: 0.3 }),
      pants: toonMat(L.pants, { rim: 0.2 }),
      shoe: toonMat(L.shoe, { rim: 0.3 }),
      glove: L.glove ? toonMat(L.glove, { rim: 0.3, emissive: L.gloveGlow ? L.glove : 0x000000, emissiveIntensity: L.gloveGlow ? 0.6 : 0 }) : null,
      hat: toonMat(L.hatColor || 0xffffff, { rim: 0.45 }),
      hatBand: toonMat(L.hatBand || 0xe8443a),
      gem: new THREE.MeshBasicMaterial({ color: 0xff2a6d }),
      strap: toonMat(0x3a2a20),
      lens: new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.55 }),
      cape: L.cape ? toonMat(L.cape, { side: THREE.DoubleSide, rim: 0.3 }) : null,
      overalls: L.overalls ? toonMat(L.overalls, { rim: 0.25 }) : null,
    };
    this.allMats = Object.values(mats).filter(Boolean);

    // ---- hierarchy
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // lift/spin/flip/tilt about pivot
    this.root.add(this.body);
    this.pivot = new THREE.Group();
    this.pivot.position.y = -0.9 * s;
    this.body.position.y = 0.9 * s;
    this.body.add(this.pivot);
    this.hips = new THREE.Group();
    this.hips.position.y = BODY.hipH * s;
    this.pivot.add(this.hips);
    this.spine = new THREE.Group();
    this.hips.add(this.spine);

    const torsoH = (BODY.shoulderH - BODY.hipH + 0.1) * s;
    const torso = mesh(torsoGeometry(1.25 * B.chest, 0.17 * s, 0.135 * s * B.waist, torsoH, 0.78), mats.top, outl, oc);
    torso.position.y = -0.04 * s;
    this.spine.add(torso);
    this.torso = torso;
    this.addOutfit(L, s, torsoH, mats, outl, oc);

    const pelvis = mesh(sphere(0.15 * s * B.waist), mats.pants, outl, oc);
    pelvis.scale.set(1.15, 0.7, 0.85);
    this.hips.add(pelvis);
    if (L.sash) {
      const sash = new THREE.Mesh(new THREE.TorusGeometry(0.155 * s * B.waist, 0.035 * s, 8, 20), mats.sash);
      sash.rotation.x = Math.PI / 2; sash.position.y = 0.06 * s; sash.scale.set(1.12, 0.8, 1);
      this.hips.add(sash);
    }

    // neck + head
    this.neck = new THREE.Group();
    this.neck.position.y = (BODY.shoulderH - BODY.hipH + 0.04) * s;
    this.spine.add(this.neck);
    const neckMesh = mesh(limbGeometry(0.055 * s, 0.05 * s), mats.skin, 0);
    neckMesh.scale.y = 0.12 * s; this.neck.add(neckMesh);
    this.head = new THREE.Group();
    this.head.position.y = 0.2 * s;
    this.neck.add(this.head);
    const headR = 0.178 * s * (L.slim ? 0.97 : 1);
    this.headR = headR;
    const headMesh = mesh(sphere(headR, 24, 18), mats.skin, outl, oc);
    headMesh.scale.set(1, 1.05, 1);
    this.head.add(headMesh);
    // jaw / chin
    const chin = new THREE.Mesh(sphere(headR * 0.62, 14, 10), mats.skin); chin.position.set(0, -headR * 0.45, headR * 0.32); chin.scale.set(1, 0.7, 0.9); this.head.add(chin);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(sphere(headR * 0.22, 8, 6), mats.skin); ear.position.set(sx * headR * 0.98, -headR * 0.05, 0); ear.scale.set(0.5, 1, 0.8); this.head.add(ear); }
    // face decal
    this.faceTex = { normal: faceTexture(L, 'normal'), blink: faceTexture(L, 'blink'), attack: faceTexture(L, 'attack'), hurt: faceTexture(L, 'hurt') };
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.faceTex.normal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const faceGeo = new THREE.SphereGeometry(headR * 1.012, 24, 12, Math.PI / 2 - 0.95, 1.9, 1.02, 1.22);
    const face = new THREE.Mesh(faceGeo, this.faceMat);
    face.scale.set(1, 1.05, 1);
    face.renderOrder = 2;
    this.head.add(face);
    this.face = face;
    const hair = buildHair(L, headR, mats);
    this.head.add(hair);
    this.hat = buildHat(L, headR, mats);
    this.head.add(this.hat);

    // shoulder & hip anchors (world positions read by the animator)
    this.anchors = {
      shoulderR: new THREE.Object3D(), shoulderL: new THREE.Object3D(), hipR: new THREE.Object3D(), hipL: new THREE.Object3D(),
    };
    this.anchors.shoulderR.position.set(-BODY.shoulderW * s * B.chest, (BODY.shoulderH - BODY.hipH) * s, 0);
    this.anchors.shoulderL.position.set(BODY.shoulderW * s * B.chest, (BODY.shoulderH - BODY.hipH) * s, 0);
    this.anchors.hipR.position.set(-BODY.hipW * s, -0.02, 0);
    this.anchors.hipL.position.set(BODY.hipW * s, -0.02, 0);
    this.spine.add(this.anchors.shoulderR, this.anchors.shoulderL);
    this.hips.add(this.anchors.hipR, this.anchors.hipL);
    for (const k of ['shoulderR', 'shoulderL']) {
      const pad = mesh(sphere(0.064 * s * B.limb), L.sleeve === 'none' ? mats.skin : mats.top, outl, oc);
      this.anchors[k].add(pad);
    }

    // ---- limbs live in world space (scene-level group), positioned by IK each frame
    this.limbGroup = new THREE.Group();
    const lr = B.limb * s;
    const armUpperMat = L.sleeve === 'none' ? mats.skin : mats.top;
    const armLowerMat = L.sleeve === 'long' ? mats.top : mats.skin;
    const handMat = mats.glove || mats.skin;
    this.limbs = {
      R: this.makeLimb(0.07 * lr, 0.06 * lr, 0.057 * lr, 0.046 * lr, armUpperMat, armLowerMat, handMat, 'hand', outl, oc),
      L: this.makeLimb(0.07 * lr, 0.06 * lr, 0.057 * lr, 0.046 * lr, armUpperMat, armLowerMat, handMat, 'hand', outl, oc),
      FR: this.makeLimb(0.095 * lr, 0.075 * lr, 0.07 * lr, 0.052 * lr, mats.pants, L.pantsShort ? mats.skin : mats.pants, mats.shoe, 'foot', outl, oc),
      FL: this.makeLimb(0.095 * lr, 0.075 * lr, 0.07 * lr, 0.052 * lr, mats.pants, L.pantsShort ? mats.skin : mats.pants, mats.shoe, 'foot', outl, oc),
    };
    this.armLen = { upper: 0.34 * s, lower: 0.32 * s };
    this.legLen = { upper: 0.45 * s, lower: 0.45 * s };

    // ---- weapons
    this.weapons = {};
    if (L.weapons === 'threeSwords') {
      this.weapons.R = buildSword(L, 1.15, 0.03); this.weapons.L = buildSword(L, 1.15, 0.03);
      this.backSword = buildSword(L, 1.15, 0.0); this.backSword.position.set(-0.12, 0.62 * s, -0.19 * s); this.backSword.rotation.set(-0.12, 0, Math.PI - 0.55); this.spine.add(this.backSword);
      this.weapons.B = buildSword({ ...L, blade: 0xffe9a8, guard: 0xff4d6d }, 1.2, 0.04); this.weapons.B.visible = false;
    } else if (L.weapons === 'nodachi') {
      this.weapons.R = buildSword(L, 1.5, 0.09);
    } else if (L.weapons === 'staff') {
      this.weapons.R = buildStaff(L);
    } else if (L.weapons === 'slingshot') {
      this.weapons.L = buildSlingshot(L);
      this.mallet = buildMallet(); this.mallet.visible = false; this.limbGroup.add(this.mallet);
    }
    for (const k in this.weapons) this.limbGroup.add(this.weapons[k]);

    if (L.monster) this.buildMonsterBits(L, s, outl, oc);

    // team ring under the fighter (also used for player colour)
    this.indicatorColor = new THREE.Color(teamColor || 0xffffff);

    // only meaningful parts cast shadows (keeps the shadow pass cheap)
    const caster = (o) => {
      if (!o.isMesh || o.userData.isOutline) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.castShadow = o.geometry.boundingSphere.radius > 0.09 && !o.material.transparent;
    };
    this.root.traverse(caster);
    this.limbGroup.traverse((o) => { if (o.isMesh && !o.userData.isOutline) o.castShadow = o.parent === this.limbGroup; });
    this.expr = 'normal';
    this.blinkT = 2 + Math.random() * 3;
  }

  makeLimb(r0, r1, r2, r3, upperMat, lowerMat, endMat, endKind, outl, oc) {
    const upper = mesh(limbGeometry(r1, r0), upperMat, outl, oc);
    const lower = mesh(limbGeometry(r3, r2), lowerMat, outl, oc);
    const joint = mesh(sphere(r1 * 1.02, 12, 10), lowerMat === upperMat ? upperMat : lowerMat, 0);
    let end;
    if (endKind === 'hand') {
      end = new THREE.Group();
      const palm = mesh(sphere(r2 * 1.35, 12, 10), endMat, outl, oc); palm.scale.set(1, 1.15, 0.85); end.add(palm);
      const thumb = new THREE.Mesh(sphere(r2 * 0.55, 8, 6), endMat); thumb.position.set(r2 * 0.9, r2 * 0.4, r2 * 0.5); end.add(thumb);
    } else {
      end = new THREE.Group();
      const L = this.look;
      const boot = mesh(sphere(r3 * 1.5, 12, 10), endMat, outl, oc);
      boot.scale.set(1, 0.75, 1.9); boot.position.z = r3 * 1.1; end.add(boot);
      if (L.shoeStyle === 'boot' || L.shoeStyle === 'flameBoot') {
        const cuff = mesh(new THREE.CylinderGeometry(r3 * 1.45, r3 * 1.35, r3 * 3.2, 10), endMat, outl, oc); cuff.position.y = r3 * 1.6; end.add(cuff);
      }
      if (L.shoeStyle === 'flameBoot') {
        const sole = new THREE.Mesh(new THREE.BoxGeometry(r3 * 2.6, r3 * 0.5, r3 * 5.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7b00).multiplyScalar(1.8) }));
        sole.position.set(0, -r3 * 0.95, r3 * 1.1); end.add(sole);
        this.flameSoles = this.flameSoles || []; this.flameSoles.push(sole);
      }
      if (L.shoeStyle === 'sandal') {
        const strap = new THREE.Mesh(new THREE.TorusGeometry(r3 * 1.2, r3 * 0.25, 6, 12), this.mats.sash); strap.rotation.x = Math.PI / 2; strap.position.set(0, r3 * 0.4, r3 * 0.8); end.add(strap);
      }
    }
    this.limbGroup.add(upper, lower, joint, end);
    return { upper, lower, joint, end };
  }

  addOutfit(L, s, torsoH, mats, outl, oc) {
    const sp = this.spine;
    const chestY = (BODY.shoulderH - BODY.hipH) * s;
    const style = L.topStyle;
    // inner shirt panel (front V)
    if (style === 'openJacket' || style === 'longCoat' || style === 'tailcoat' || style === 'labCoat' || style === 'weatherCoat' || style === 'cloak') {
      const panel = new THREE.Mesh(new THREE.CylinderGeometry(0.105 * s, 0.01 * s, torsoH * 0.5, 3, 1, false, -0.6, 1.2), mats.inner);
      panel.position.set(0, torsoH * 0.66, 0.045 * s); panel.scale.set(1, 1, 0.95);
      sp.add(panel);
    }
    const coatLen = { longCoat: 0.75, labCoat: 0.62, cloak: 0.85, tailcoat: 0.62, weatherCoat: 0.55 }[style];
    if (coatLen) {
      const pts = [new THREE.Vector2(0.18 * s, 0), new THREE.Vector2(0.21 * s, -coatLen * 0.4 * s), new THREE.Vector2(0.27 * s, -coatLen * s)];
      // phi = 0 is the front (+Z): coats open at the front, tailcoats only have back tails
      const skirt = new THREE.LatheGeometry(pts, 18, style === 'tailcoat' ? Math.PI * 0.55 : Math.PI * 0.16, style === 'tailcoat' ? Math.PI * 0.9 : Math.PI * 1.68);
      const mat = style === 'cloak' ? toonMat(L.top, { side: THREE.DoubleSide, rim: 0.3 }) : toonMat(L.top, { side: THREE.DoubleSide, rim: 0.3 });
      this.allMats.push(mat);
      const coat = new THREE.Mesh(skirt, mat);
      coat.castShadow = true;
      coat.scale.set(1.15, 1, 0.85);
      this.coat = new THREE.Group();
      this.coat.add(coat);
      this.hips.add(this.coat);
      this.coat.position.y = 0.08 * s;
      if (L.glowLines) {
        const glow = new THREE.Mesh(new THREE.TorusGeometry(0.255 * s, 0.008, 4, 32, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.glowLines).multiplyScalar(1.6) }));
        glow.rotation.x = Math.PI / 2; glow.rotation.z = Math.PI * 0.7; glow.position.y = -coatLen * s * 0.95; glow.scale.set(1.15, 0.85, 1);
        this.coat.add(glow);
      }
    }
    if (style === 'labCoat') {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.07 * s, 0.07 * s), mats.sash); cross.position.set(-0.11 * s, chestY * 0.78, 0.155 * s); sp.add(cross);
      const bag = mesh(new THREE.BoxGeometry(0.34 * s, 0.26 * s, 0.16 * s), toonMat(0x8c5e3c), outl, oc, 'scale'); bag.position.set(0, chestY * 0.55, -0.2 * s); sp.add(bag);
    }
    if (style === 'vestCape' && mats.cape) {
      const capeGeo = new THREE.CylinderGeometry(0.2 * s, 0.34 * s, 0.95 * s, 16, 4, true, Math.PI * 0.62, Math.PI * 0.76);
      capeGeo.translate(0, -0.47 * s, 0);
      this.cape = new THREE.Mesh(capeGeo, mats.cape);
      this.cape.position.set(0, chestY + 0.02, -0.04 * s);
      this.cape.castShadow = true;
      sp.add(this.cape);
      const collar = mesh(new THREE.TorusGeometry(0.15 * s, 0.035 * s, 8, 18), mats.sash, outl, oc); collar.rotation.x = Math.PI / 2; collar.position.y = chestY + 0.02; sp.add(collar);
    }
    if (style === 'overalls' && mats.overalls) {
      const bib = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.24 * s, 0.05), mats.overalls); bib.position.set(0, chestY * 0.45, 0.13 * s); sp.add(bib);
      for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42 * s, 0.03), mats.overalls); st.position.set(sx * 0.09 * s, chestY * 0.62, 0.0); st.rotation.x = 0.0; st.scale.z = 9; sp.add(st); }
      const pouch = mesh(new THREE.BoxGeometry(0.1 * s, 0.08 * s, 0.06 * s), toonMat(0x7f5539), outl, oc, 'scale'); pouch.position.set(0.17 * s, 0.02, 0.1 * s); this.hips.add(pouch);
    }
    if (L.backpack) {
      const pack = mesh(new THREE.BoxGeometry(0.32 * s, 0.38 * s, 0.2 * s), toonMat(0x6d4c41), outl, oc, 'scale'); pack.position.set(0, chestY * 0.55, -0.22 * s); sp.add(pack);
      const roll = mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.36 * s, 10), toonMat(0x2a9d8f), outl, oc); roll.rotation.z = Math.PI / 2; roll.position.set(0, chestY * 0.85, -0.22 * s); sp.add(roll);
    }
    if (style === 'openJacket') {
      const collar = mesh(new THREE.TorusGeometry(0.14 * s, 0.03 * s, 8, 18, Math.PI * 1.3), mats.top, outl, oc);
      collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.85); collar.position.y = chestY + 0.01; sp.add(collar);
    }
  }

  buildMonsterBits(L, s, outl, oc) {
    this.monsterBits = new THREE.Group();
    const hornMat = toonMat(L.monster.horn, { rim: 0.4 });
    for (const sx of [-1, 1]) {
      const horn = mesh(new THREE.ConeGeometry(0.045 * s, 0.24 * s, 8), hornMat, outl, oc);
      horn.position.set(sx * this.headR * 0.7, this.headR * 0.85, -0.02); horn.rotation.z = -sx * 0.5; horn.rotation.x = -0.3;
      this.monsterBits.add(horn);
    }
    const eyeGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.monster.eyeGlow).multiplyScalar(2.5) });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(sphere(0.022, 8, 6), eyeGlow); e.position.set(sx * 0.068, 0.015, this.headR * 0.99); this.monsterBits.add(e); }
    this.monsterBits.visible = false;
    this.head.add(this.monsterBits);
    this.monsterSkin = new THREE.Color(L.monster.skin);
    this.normalSkin = new THREE.Color(L.skin);
  }

  setMonster(on) {
    if (!this.monsterBits) return;
    this.monsterBits.visible = on;
    this.mats.skin.color.copy(on ? this.monsterSkin : this.normalSkin);
    this.torso.scale.set(on ? 1.18 : 1, 1, on ? 1.15 : 1);
    this.monster = on;
  }

  setExpression(e) {
    if (e === this.expr) return;
    this.expr = e;
    this.faceMat.map = this.faceTex[e] || this.faceTex.normal;
    this.faceMat.needsUpdate = true;
  }

  addTo(scene) { scene.add(this.root); scene.add(this.limbGroup); }
  removeFrom(scene) { scene.remove(this.root); scene.remove(this.limbGroup); }

  setVisible(v) { this.root.visible = v; this.limbGroup.visible = v; }

  setOpacity(a) {
    const t = a < 0.999;
    for (const m of this.allMats) { m.transparent = t || m === this.mats.lens; m.opacity = m === this.mats.lens ? 0.55 * a : a; }
    this.faceMat.opacity = a;
  }

  setRim(color, strength) {
    for (const m of this.allMats) if (m.userData && m.userData.rimStrength) { m.userData.rimColor.copy(color); m.userData.rimStrength.value = strength; }
  }

  dispose() {
    const seen = new Set();
    const disp = (o) => o.traverse((c) => {
      if (c.material && !seen.has(c.material)) { seen.add(c.material); if (c.material.map && Object.values(this.faceTex).includes(c.material.map)) {} c.material.dispose && c.material.dispose(); }
    });
    disp(this.root); disp(this.limbGroup);
    for (const t of Object.values(this.faceTex)) t.dispose();
  }
}
