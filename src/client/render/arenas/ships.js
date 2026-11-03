// Procedural tall ships for arena backgrounds (lofted hull, masts, billowing sails, flags, rigging).
import * as THREE from 'three';
import { Batch, M, between, rng, lerp, vcMat, clothify, glowMat, inkOutline } from './common.js';
import { atlasRect, remapUV } from './textures.js';

/** Lofted hull geometry. Ship space: +x bow, y up (waterline 0), z beam. */
export function hullGeometry({ L, W, D, H, sheer, sternRise, segL = 26, segS = 14 }) {
  const pos = [];
  const uv = [];
  const idx = [];
  const prof = (t) => {
    const w = W * Math.pow(Math.max(Math.sin(Math.PI * (0.13 + 0.87 * t)), 0), 0.55);
    const top = H + sheer * Math.pow(2 * t - 1, 2) + (t < 0.2 ? sternRise * (1 - t / 0.2) : 0);
    const bot = -D * (1 - 0.35 * Math.pow(Math.abs(2 * t - 1), 3));
    return { w, top, bot };
  };
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    const x = (t - 0.5) * L;
    const { w, top, bot } = prof(t);
    for (let j = 0; j <= segS; j++) {
      const s = j / segS;
      const a = (s - 0.5) * Math.PI;
      const c = Math.cos(a);
      const z = Math.sin(a) * w * (1 + 0.07 * c);
      const y = top - (top - bot) * Math.pow(c, 0.65);
      pos.push(x, y, z);
      uv.push(x / 3.2, (s * (top - bot + 2 * w)) / 3.2);
    }
  }
  const row = segS + 1;
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segS; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, prof };
}

/** Deck surface inside the bulwark. */
function deckGeometry(prof, L, bulwark, segL = 26) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    const x = (t - 0.5) * L;
    const { w, top, bot } = prof(t);
    const ratio = Math.min(0.999, bulwark / Math.max(0.01, top - bot));
    const c = Math.pow(ratio, 1 / 0.65);
    const a = Math.acos(c);
    const z = Math.sin(a) * w * (1 + 0.07 * c) * 0.98;
    const y = top - bulwark;
    pos.push(x, y, -z, x, y, z);
    uv.push(x / 3, -z / 3, x / 3, z / 3);
  }
  for (let i = 0; i < segL; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Sail: trapezoid plane facing +x, top edge at y=0, hanging down by h. aWave encodes billow (world units). */
function sailGeometry(wTop, wBot, h, slot, billow) {
  const g = new THREE.PlaneGeometry(1, 1, 8, 6);
  const p = g.attributes.position;
  const aw = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i) + 0.5; // 0..1 across
    const v = 0.5 - p.getY(i); // 0 top .. 1 bottom
    const w = lerp(wTop, wBot, v);
    p.setXYZ(i, 0, -v * h, (s - 0.5) * w);
    aw[i] = Math.pow(Math.sin(Math.PI * s), 0.7) * Math.pow(v, 0.6) * billow;
  }
  // after mapping: plane spans z (across) and -y; normal should face +x
  g.setAttribute('aWave', new THREE.Float32BufferAttribute(aw, 1));
  g.computeVertexNormals();
  // ensure +x facing normal
  const n = g.attributes.normal;
  if (n.getX(0) < 0) {
    g.index.array.reverse();
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 1, 0, 0);
  }
  remapUV(g, atlasRect(slot));
  return g;
}

/** Flag: plane in XY flying toward +x from a pole at x=0; aWave = 0 at pole .. 1 at tip. */
export function flagGeometry(w, h, slot, pennant = false) {
  const g = new THREE.PlaneGeometry(w, h, 8, 3);
  const p = g.attributes.position;
  const aw = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + w / 2;
    let y = p.getY(i);
    const u = x / w;
    if (pennant) y *= 1 - u * 0.85;
    p.setXYZ(i, x, y, 0);
    aw[i] = u;
  }
  g.setAttribute('aWave', new THREE.Float32BufferAttribute(aw, 1));
  remapUV(g, atlasRect(slot));
  g.computeVertexNormals();
  return g;
}

/** Shared materials for a fleet of ships. */
export function shipMaterials({ plankTex, sailTex, flagTex }) {
  return {
    hull: vcMat({ map: plankTex, side: THREE.DoubleSide, rim: 0.25 }),
    paint: vcMat({ rim: 0.3 }),
    sail: clothify(vcMat({ map: sailTex, side: THREE.DoubleSide, rim: 0.15 }), { amp: 0.06, billow: 1.0, freq: 0.35, speed: 1.6, spatial: 0.12 }),
    flag: clothify(vcMat({ map: flagTex, side: THREE.DoubleSide, rim: 0.1 }), { amp: 0.22, billow: 0, freq: 1.3, speed: 7.5, spatial: 0.2 }),
    glow: glowMat(0xffc56b, 2.6),
  };
}

/**
 * Build one ship. opts: {
 *   L, W, D, H, masts (2|3), hull: { bottom, band, wood, trim, gun }, sails: [slot per mast] , flagSlot,
 *   seed, quality (0..2), heading (rad), pos [x,y,z], bob, rigging
 * }
 * Returns { group, update(t), muzzles: Vector3[] (ship-local), roll }
 */
export function buildShip(opts, mats) {
  const R = rng(opts.seed || 1);
  const q = opts.quality !== undefined ? opts.quality : 2;
  const L = opts.L || 24;
  const W = opts.W || 3.6;
  const D = opts.D || 3.2;
  const H = opts.H || 2.6;
  const sheer = opts.sheer !== undefined ? opts.sheer : 1.4;
  const sternRise = opts.sternRise !== undefined ? opts.sternRise : 1.8;
  const hc = Object.assign({ bottom: 0x5a2a2a, band: 0xf2c14e, wood: 0x8a5232, trim: 0xe9b949, dark: 0x2b2230, gun: 0x2a2a30, deck: 0xc9a172 }, opts.hull || {});
  const hullB = new Batch();
  const paintB = new Batch();
  const sailB = new Batch({ aWave: 1 });
  const flagB = new Batch({ aWave: 1 });
  // low quality: fold emissive bits into the painted batch and skip flags (fewer draw calls)
  const glowB = q > 0 ? new Batch() : paintB;
  const GLOW_COL = q > 0 ? 0xffffff : 0xffc56b;

  const { geo: hg, prof } = hullGeometry({ L, W, D, H, sheer, sternRise, segL: q > 0 ? 26 : 16, segS: q > 0 ? 14 : 8 });
  const cBottom = new THREE.Color(hc.bottom);
  const cBand = new THREE.Color(hc.band);
  const cWood = new THREE.Color(hc.wood);
  const cTrim = new THREE.Color(hc.trim);
  hullB.add(hg, null, (v) => {
    const t = v.x / L + 0.5;
    const top = prof(Math.min(1, Math.max(0, t))).top;
    if (v.y < 0.25) return cBottom;
    if (v.y > top - 0.22) return cTrim;
    if (v.y > top - 1.05 && v.y < top - 0.7) return cBand;
    return cWood;
  });
  hullB.add(deckGeometry(prof, L, 0.5, q > 0 ? 26 : 16), null, hc.deck);
  // transom (flat stern) — fan
  {
    const { w, top, bot } = prof(0);
    const x0 = -L / 2;
    const shape = new THREE.Shape();
    const steps = 10;
    for (let j = 0; j <= steps; j++) {
      const a = (j / steps - 0.5) * Math.PI;
      const c = Math.cos(a);
      const z = Math.sin(a) * w * (1 + 0.07 * c);
      const y = top - (top - bot) * Math.pow(c, 0.65);
      if (j === 0) shape.moveTo(z, y); else shape.lineTo(z, y);
    }
    shape.closePath();
    const tg = new THREE.ShapeGeometry(shape);
    hullB.add(tg, M(x0 + 0.02, 0, 0, 0, -Math.PI / 2, 0), (v) => (v.y < 0.25 ? cBottom : cWood));
    // stern windows (glow) + gold frame
    const wy = top - 1.4;
    const nW = 4;
    for (let k = 0; k < nW; k++) {
      const z = (k - (nW - 1) / 2) * (w * 0.42);
      glowB.add(new THREE.PlaneGeometry(w * 0.26, 0.7), M(x0 - 0.04, wy, z, 0, -Math.PI / 2, 0), GLOW_COL);
      paintB.add(new THREE.BoxGeometry(0.08, 0.95, w * 0.34), M(x0 - 0.01, wy, z), hc.trim);
    }
    paintB.add(new THREE.BoxGeometry(0.15, 0.2, w * 1.9), M(x0 - 0.02, wy + 0.6, 0), hc.trim);
    paintB.add(new THREE.BoxGeometry(0.15, 0.2, w * 1.9), M(x0 - 0.02, wy - 0.6, 0), hc.trim);
    // stern lanterns
    for (const s of [-1, 1]) {
      const lp = [x0 - 0.3, top + 0.7, s * w * 0.75];
      paintB.add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5), M(lp[0], lp[1] - 0.5, lp[2]), hc.dark);
      glowB.add(new THREE.OctahedronGeometry(0.32, 0), M(lp[0], lp[1], lp[2], 0, 0, 0, 1, 1.4, 1), GLOW_COL);
      paintB.add(new THREE.ConeGeometry(0.3, 0.3, 6), M(lp[0], lp[1] + 0.55, lp[2]), hc.trim);
    }
  }
  // stern cabin / quarterdeck rail
  {
    const { w, top } = prof(0.08);
    paintB.add(new THREE.BoxGeometry(L * 0.16, 0.18, w * 2.05), M(-L / 2 + L * 0.08, top + 0.05, 0), hc.trim);
  }
  // gun ports + cannons along both sides
  const muzzles = [];
  const nGuns = q > 0 ? Math.round(L / 3.4) : Math.round(L / 5);
  for (let k = 0; k < nGuns; k++) {
    const t = 0.18 + (k / Math.max(1, nGuns - 1)) * 0.62;
    const x = (t - 0.5) * L;
    const { w, top } = prof(t);
    const y = top - 1.75;
    for (const s of [-1, 1]) {
      paintB.add(new THREE.BoxGeometry(0.75, 0.6, 0.1), M(x, y, s * (w * 1.02 + 0.02)), hc.dark);
      paintB.add(new THREE.BoxGeometry(0.75, 0.08, 0.14), M(x, y + 0.38, s * (w * 1.03 + 0.03)), hc.trim);
      paintB.add(new THREE.CylinderGeometry(0.13, 0.17, 0.9, 6), M(x, y, s * (w * 1.02 + 0.35), Math.PI / 2, 0, 0), hc.gun);
      muzzles.push(new THREE.Vector3(x, y, s * (w * 1.02 + 0.85)));
    }
  }
  // bowsprit + figurehead
  {
    const { top } = prof(1);
    const a = [L / 2 - 1.0, top - 0.3, 0];
    const b = [L / 2 + L * 0.24, top + L * 0.12, 0];
    hullB.add(new THREE.CylinderGeometry(0.16, 0.28, 1, 6), between(a, b), hc.wood);
    paintB.add(new THREE.SphereGeometry(0.42, 8, 6), M(L / 2 + 0.1, top - 0.9, 0), hc.trim);
    paintB.add(new THREE.TorusGeometry(0.5, 0.12, 5, 10, Math.PI * 1.3), M(L / 2 - 0.1, top - 1.6, 0, 0, 0, 0.4), hc.trim);
    opts.bowTip = b;
  }
  // masts
  const nm = opts.masts || 3;
  const mastT = nm === 3 ? [0.27, 0.52, 0.76] : [0.36, 0.68];
  const mastH = nm === 3 ? [0.78, 1.0, 0.9] : [0.92, 0.82];
  const sailSlots = opts.sails || [0, 0, 0];
  const mastTops = [];
  for (let k = 0; k < nm; k++) {
    const t = mastT[k];
    const x = (t - 0.5) * L;
    const { w, top } = prof(t);
    const base = top - 0.5;
    const h = L * mastH[k] * (opts.mastScale || 1);
    const r0 = 0.32 + L * 0.006;
    hullB.add(new THREE.CylinderGeometry(r0 * 0.55, r0, h, q > 0 ? 7 : 5), M(x, base + h / 2, 0), hc.wood);
    // tops (platforms)
    paintB.add(new THREE.CylinderGeometry(1.0, 0.8, 0.25, 8), M(x, base + h * 0.56, 0), hc.dark);
    mastTops.push([x, base + h, 0]);
    // yards + sails
    const tiers = q > 0 ? 3 : 2;
    const wid = W * 2.3 * (k === 1 || nm === 2 ? 1 : 0.88);
    const tierH = [0.0, 0.33, 0.62, 0.84];
    for (let s = 0; s < tiers; s++) {
      const y0 = base + h * (tierH[s + 1] - 0.02);
      const y1 = base + h * (tierH[s] + (s === 0 ? 0.18 : 0.03));
      const ww = wid * (1 - s * 0.24);
      const sh = y0 - y1;
      hullB.add(new THREE.CylinderGeometry(0.12, 0.12, ww * 1.08, 5), M(x + 0.25, y0 + 0.1, 0, Math.PI / 2, 0, 0), hc.wood);
      const g = sailGeometry(ww * 0.92, ww * (s === 0 ? 1.04 : 1.0), sh, sailSlots[k] !== undefined ? (s === 0 || sailSlots[k] !== 2 ? sailSlots[k] : (opts.altSail !== undefined ? opts.altSail : 0)) : 0, sh * 0.14);
      sailB.add(g, M(x + 0.45, y0, 0), 0xe6dccb);
    }
    // flag
    if (q > 0) flagB.add(flagGeometry(L * 0.13, L * 0.08, opts.flagSlot !== undefined ? opts.flagSlot : 0, k !== 1), M(x, base + h - L * 0.045, 0), 0xffffff);
    paintB.add(new THREE.SphereGeometry(0.22, 6, 4), M(x, base + h + 0.1, 0), hc.trim);
    // shrouds
    if (opts.rigging !== false && q > 0) {
      for (const sgn of [-1, 1]) {
        for (let r = 0; r < 3; r++) {
          const a = [x - 0.9 + r * 0.9, top + 0.1, sgn * w * 1.0];
          const b = [x, base + h * 0.55, sgn * 0.6];
          paintB.add(new THREE.CylinderGeometry(0.035, 0.035, 1, 3), between(a, b), hc.dark);
        }
        paintB.add(new THREE.CylinderGeometry(0.03, 0.03, 1, 3), between([x, base + h * 0.57, sgn * 0.9], [x, base + h * 0.92, sgn * 0.2]), hc.dark);
      }
    }
  }
  // jib sails + stays from the bowsprit
  if (opts.bowTip) {
    const fore = mastTops[mastTops.length - 1];
    const b = opts.bowTip;
    if (q > 0) paintB.add(new THREE.CylinderGeometry(0.03, 0.03, 1, 3), between(b, [fore[0], fore[1] * 0.92, 0]), hc.dark);
    const jib = new THREE.BufferGeometry();
    const p0 = new THREE.Vector3(b[0] - 1.2, b[1] - 0.4, 0);
    const p1 = new THREE.Vector3(fore[0] + 0.6, fore[1] * 0.78, 0);
    const p2 = new THREE.Vector3(fore[0] + 1.6, prof(0.8).top + 1.4, 0);
    jib.setAttribute('position', new THREE.Float32BufferAttribute([...p0.toArray(), ...p1.toArray(), ...p2.toArray()], 3));
    const r = atlasRect(opts.jibSlot !== undefined ? opts.jibSlot : 1);
    jib.setAttribute('uv', new THREE.Float32BufferAttribute([r[0], r[1], r[0] + 0.02, r[3], r[2], r[1]], 2));
    jib.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    jib.setAttribute('aWave', new THREE.Float32BufferAttribute([0, 0, 0.5], 1));
    sailB.add(jib, null, 0xe6dccb);
    if (nm === 3) {
      const m0 = mastTops[0];
      const m1 = mastTops[1];
      if (q > 0) paintB.add(new THREE.CylinderGeometry(0.03, 0.03, 1, 3), between(m0, [m1[0], m1[1] * 0.6, 0]), hc.dark);
      if (q > 0) paintB.add(new THREE.CylinderGeometry(0.03, 0.03, 1, 3), between(m1, [fore[0], fore[1] * 0.6, 0]), hc.dark);
    }
  }

  const group = new THREE.Group();
  group.name = 'ship';
  const inner = new THREE.Group();
  group.add(inner);
  const addM = (b, m, o) => { const mesh = b.mesh(m, o); if (mesh) { inner.add(mesh); mesh.castShadow = false; } return mesh; };
  const hullMesh = addM(hullB, mats.hull, { receive: false });
  if (q > 1 && opts.outline !== false) inkOutline(hullMesh, 0.1, 0x1e1418);
  addM(paintB, mats.paint, { receive: false });
  addM(sailB, mats.sail, { receive: false });
  addM(flagB, mats.flag, { receive: false });
  if (glowB !== paintB) addM(glowB, mats.glow, { receive: false });
  const pos = opts.pos || [0, 0, 0];
  group.position.set(pos[0], pos[1], pos[2]);
  group.rotation.y = opts.heading || 0;
  const ph = R() * 6.28;
  const bob = opts.bob !== undefined ? opts.bob : 1;
  let recoil = 0;
  let recoilT = -10;
  return {
    group,
    muzzles,
    length: L,
    beam: W,
    kick(t, side = 1) { recoilT = t; recoil = side; },
    update(t) {
      const k = Math.max(0, 1 - (t - recoilT) * 1.5);
      inner.position.y = Math.sin(t * 0.8 + ph) * 0.22 * bob;
      inner.rotation.x = Math.sin(t * 0.63 + ph * 1.3) * 0.025 * bob + recoil * k * k * 0.05;
      inner.rotation.z = Math.sin(t * 0.51 + ph * 0.7) * 0.012 * bob;
    },
  };
}
