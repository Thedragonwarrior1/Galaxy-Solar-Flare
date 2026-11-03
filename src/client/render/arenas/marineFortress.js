// MARINE FORTRESS — granite courtyard on a sea bastion, raised stone blocks, a chain-hung iron bridge under a great
// gate arch, round towers with blue conical roofs, ramparts bristling with cannon, searchlights and a busy sea.
import * as THREE from 'three';
import {
  Batch, M, between, rng, qLevel, vcMat, glowMat, toonMat, makeLights, makeSky, makeGlows, makeParticles,
  rockGeo, jitter, makeNoise2, terrainGeo, prismGeo, clothify, canvasTexture, smooth, smokeTexture,
  makeFlashPool, disposeGroup, makeGulls, makeBeam, inkOutline,
} from './common.js';
import { makeOcean, makeFoamRings } from './surfaces.js';
import { plankTexture, sailAtlas, flagAtlas, stoneBrickTexture, star } from './textures.js';
import { buildShip, shipMaterials, flagGeometry } from './ships.js';

const C = {
  stone: 0xf2eee6,
  stoneDark: 0xc9c4bb,
  cope: 0xdcd4c2,
  gold: 0xe3b23c,
  navy: 0x1f3a6e,
  blue: 0x3566b8,
  roof: 0x2f62b8,
  wall: 0xddd6c6,
  iron: 0x39424f,
  wet: 0x7d8a86,
  algae: 0x557a5a,
};

function drawAnchor(g, cx, cy, s, col) {
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineCap = 'round';
  g.lineWidth = s * 0.12;
  g.beginPath(); g.arc(cx, cy - s * 0.78, s * 0.16, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx, cy - s * 0.62); g.lineTo(cx, cy + s * 0.8); g.stroke();
  g.beginPath(); g.moveTo(cx - s * 0.42, cy - s * 0.36); g.lineTo(cx + s * 0.42, cy - s * 0.36); g.stroke();
  g.beginPath(); g.arc(cx, cy + s * 0.2, s * 0.62, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
  for (const sx of [-1, 1]) {
    const x = cx + sx * s * 0.62 * Math.cos(Math.PI * 0.12);
    const y = cy + s * 0.2 + s * 0.62 * Math.sin(Math.PI * 0.12);
    g.beginPath(); g.moveTo(x, y - s * 0.22); g.lineTo(x + sx * s * 0.16, y + s * 0.02); g.lineTo(x - sx * s * 0.12, y + s * 0.04); g.closePath(); g.fill();
  }
}

/** Flagstone paving painted in world units onto a non-repeating canvas. */
function pavingTexture(seed, wUnits, hUnits, pxPerUnit, decorate) {
  const W = Math.min(2048, Math.round(wUnits * pxPerUnit));
  const H = Math.min(2048, Math.round(hUnits * pxPerUnit));
  return canvasTexture(W, H, (g, w, h) => {
    const R = rng(seed);
    const sx = w / wUnits;
    const sy = h / hUnits;
    g.fillStyle = '#8b8780';
    g.fillRect(0, 0, w, h);
    const rowH = 1.6;
    const rows = Math.ceil(hUnits / rowH);
    for (let r = 0; r < rows; r++) {
      let x = -R() * 1.5;
      while (x < wUnits) {
        const bw = 1.4 + R() * 1.6;
        const k = (R() - 0.5) * 24;
        const blue = ((r + Math.floor(x / 2.2)) % 3 === 0) ? 1 : 0;
        const x0 = x * sx + 2;
        const y0 = r * rowH * sy + 2;
        const ww = bw * sx - 4;
        const hh = rowH * sy - 4;
        g.fillStyle = blue ? `rgb(${(172 + k) | 0},${(178 + k) | 0},${(184 + k * 0.8) | 0})` : `rgb(${(198 + k) | 0},${(190 + k) | 0},${(176 + k * 0.8) | 0})`;
        g.fillRect(x0, y0, ww, hh);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(x0, y0, ww, 3);
        g.fillRect(x0, y0, 3, hh);
        g.fillStyle = 'rgba(0,0,0,0.13)';
        g.fillRect(x0, y0 + hh - 4, ww, 4);
        g.fillRect(x0 + ww - 3, y0, 3, hh);
        for (let i = 0; i < 8; i++) {
          g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
          g.beginPath(); g.arc(x0 + R() * ww, y0 + R() * hh, 3 + R() * 9, 0, Math.PI * 2); g.fill();
        }
        if (R() < 0.08) {
          g.strokeStyle = 'rgba(60,60,60,0.35)'; g.lineWidth = 2;
          g.beginPath(); let cx = x0 + R() * ww; let cy = y0; g.moveTo(cx, cy);
          for (let s2 = 0; s2 < 4; s2++) { cx += (R() - 0.5) * 30; cy += hh / 4; g.lineTo(cx, cy); }
          g.stroke();
        }
        x += bw;
      }
    }
    if (decorate) decorate(g, w, h, sx, sy);
  });
}

function bannerTexture() {
  return canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#1f3a6e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e3b23c';
    g.fillRect(0, 0, w, 26);
    g.fillRect(14, 26, 10, h - 90);
    g.fillRect(w - 24, 26, 10, h - 90);
    // swallowtail bottom
    g.clearRect(0, h - 64, w, 64);
    g.fillStyle = '#1f3a6e';
    g.beginPath(); g.moveTo(0, h - 64); g.lineTo(w, h - 64); g.lineTo(w, h); g.lineTo(w / 2, h - 50); g.lineTo(0, h); g.closePath(); g.fill();
    g.fillStyle = '#e3b23c';
    g.beginPath(); g.moveTo(0, h - 70); g.lineTo(w, h - 70); g.lineTo(w, h - 62); g.lineTo(0, h - 62); g.fill();
    star(g, w / 2, h * 0.38, w * 0.34, w * 0.14, 8, '#e3b23c');
    star(g, w / 2, h * 0.38, w * 0.18, w * 0.08, 8, '#f6f2e6');
    g.fillStyle = '#f6f2e6';
    g.fillRect(w * 0.2, h * 0.66, w * 0.6, 10);
    g.fillRect(w * 0.28, h * 0.7, w * 0.44, 6);
  });
}

export function buildMarineFortress(ctx) {
  const q = qLevel(ctx.quality);
  const A = ctx.arena;
  const group = new THREE.Group();
  group.name = 'arena:marine_fortress';
  const updaters = [];
  const clothMats = [];
  const R = rng(777);
  const WATER = A.blast.minY + 3;
  const P = Object.fromEntries(A.platforms.map((p) => [p.id, p]));
  const platformObjects = {};

  // ------------------------------------------------------------------ lights / sky / fog
  const HORIZON = 0xd3e6f2;
  const { sun, sunDir } = makeLights(group, {
    sunColor: 0xfffaf0, sunIntensity: 2.55, dir: [-0.45, 1.0, 0.55],
    hemiSky: 0xc4ddff, hemiGround: 0x7d8796, hemiIntensity: 1.25,
  });
  const sky = makeSky({
    top: 0x2a6fd6, mid: 0x6aaef0, horizon: HORIZON, below: HORIZON,
    sunDir: new THREE.Vector3(-0.45, 0.55, -0.5), sunColor: 0xfff6dd, sunGlow: 0.6,
    clouds: { seed: 44, count: 16, lit: '#ffffff', shade: '#c3d2ea', rim: '#ffffff', low: 12 },
  });
  group.add(sky.mesh);
  updaters.push(sky.update);
  const fog = new THREE.Fog(HORIZON, 70, 430);
  const background = new THREE.Color(HORIZON);

  // ------------------------------------------------------------------ textures / materials
  const brickTex = stoneBrickTexture(3, { base: [205, 200, 191], vari: 16, mortar: '#9a958d', rows: 6 });
  const brickTex2 = stoneBrickTexture(9, { base: [188, 186, 182], vari: 20, mortar: '#7e7a74', rows: 5, moss: 0.08 });
  const plankTex = plankTexture(14);
  const sailTex = sailAtlas(23);
  const flagTex = flagAtlas();
  const banTex = bannerTexture();
  const stoneMat = vcMat({ map: brickTex, rim: 0.2 });
  const stoneMat2 = vcMat({ map: brickTex2, rim: 0.15 });
  const plainMat = vcMat({ rim: 0.25 });
  const lampGlow = glowMat(0xffd27a, 3.0);
  const bannerMat = clothify(vcMat({ map: banTex, side: THREE.DoubleSide, rim: 0.1 }), { amp: 0.06, billow: 0, freq: 0.5, speed: 2.2, spatial: 0.5 });
  clothMats.push(bannerMat);
  const shipMats = shipMaterials({ plankTex, sailTex, flagTex });
  clothMats.push(shipMats.sail, shipMats.flag);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const glowPoints = [];
  const chimneys = [];
  const OVER = 0.08;

  const courtTex = pavingTexture(5, 2 * P.main.hx, 2 * P.main.hz, 64, (g, w, h, sx, sy) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = 3.4 * sy;
    g.fillStyle = 'rgba(31,58,110,0.92)';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(227,178,60,0.95)'; g.lineWidth = 0.22 * sy;
    g.beginPath(); g.arc(cx, cy, r * 0.88, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 0.08 * sy;
    g.beginPath(); g.arc(cx, cy, r * 1.08, 0, Math.PI * 2); g.stroke();
    star(g, cx, cy, r * 0.8, r * 0.3, 8, 'rgba(227,178,60,0.97)');
    star(g, cx, cy, r * 0.42, r * 0.17, 8, 'rgba(206,196,176,0.97)');
    // painted parade lines
    g.fillStyle = 'rgba(31,58,110,0.55)';
    for (const sgn of [-1, 1]) {
      g.fillRect(cx + sgn * 6.2 * sx - 0.09 * sx, h * 0.12, 0.18 * sx, h * 0.76);
      for (let i = 0; i < 6; i++) g.fillRect(cx + sgn * (7.4 + i * 0.9) * sx, cy - 0.06 * sy, 0.5 * sx, 0.12 * sy);
    }
    // bronze drain grates near the front/back edges
    for (const gx of [-11, -3.2, 3.2, 11]) for (const gz of [-6.2, 6.2]) {
      const x0 = cx + gx * sx - 0.6 * sx;
      const y0 = cy + gz * sy - 0.32 * sy;
      g.fillStyle = 'rgba(70,52,30,0.95)';
      g.fillRect(x0, y0, 1.2 * sx, 0.64 * sy);
      g.fillStyle = 'rgba(196,150,70,0.95)';
      for (let i = 0; i <= 6; i++) g.fillRect(x0 + (i * 1.2 * sx) / 6 - 2, y0, 4, 0.64 * sy);
      g.strokeStyle = 'rgba(214,170,80,1)'; g.lineWidth = 4;
      g.strokeRect(x0, y0, 1.2 * sx, 0.64 * sy);
    }
    // small compass stars in the corners
    for (const [gx, gz] of [[-12.6, -5.6], [12.6, -5.6], [-12.6, 5.6], [12.6, 5.6]]) {
      star(g, cx + gx * sx, cy + gz * sy, 0.7 * sy, 0.25 * sy, 4, 'rgba(31,58,110,0.75)');
      star(g, cx + gx * sx, cy + gz * sy, 0.45 * sy, 0.16 * sy, 4, 'rgba(227,178,60,0.9)');
    }
  });
  const bastionTex = pavingTexture(12, 2 * P.blockL.hx, 2 * P.blockL.hz, 80, (g, w, h, sx, sy) => {
    const cx = w / 2;
    const cy = h / 2;
    g.fillStyle = 'rgba(227,178,60,0.93)';
    g.beginPath(); g.arc(cx, cy, 1.9 * sy, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(31,58,110,0.95)';
    g.beginPath(); g.arc(cx, cy, 1.6 * sy, 0, Math.PI * 2); g.fill();
    drawAnchor(g, cx, cy, 1.15 * sy, 'rgba(227,178,60,0.98)');
  });
  const courtMat = toonMat(0xffffff, { map: courtTex, rim: 0.1 });
  const bastionMat = toonMat(0xffffff, { map: bastionTex, rim: 0.1 });

  // ------------------------------------------------------------------ shared builders
  function lamp(b, glowB, x, y, z, nx, nz, off = [0, 0, 0]) {
    b.add(unit, M(x + nx * 0.2, y + 0.45, z + nz * 0.2, 0, 0, 0, nx ? 0.4 : 0.12, 0.1, nz ? 0.4 : 0.12), C.iron);
    const lx = x + nx * 0.42;
    const lz = z + nz * 0.42;
    b.add(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 6), M(lx, y - 0.28, lz), C.iron);
    b.add(new THREE.ConeGeometry(0.24, 0.22, 6), M(lx, y + 0.3, lz), C.navy);
    b.add(new THREE.SphereGeometry(0.06, 5, 4), M(lx, y + 0.45, lz), C.gold);
    if (q > 0) glowB.add(new THREE.CylinderGeometry(0.14, 0.14, 0.46, 6), M(lx, y, lz));
    else b.add(new THREE.CylinderGeometry(0.14, 0.14, 0.46, 6), M(lx, y, lz), 0xffd27a);
    glowPoints.push([lx + off[0], y + off[1], lz + off[2], 0.8]);
  }

  /** Coping + gold band around a box-top of half extents hx,hz (root-local, top at y=0). */
  function coping(b, hx, hz, cope, h = 0.45) {
    const segs = (len) => Math.max(1, Math.round(len / 1.6));
    for (const s of [-1, 1]) {
      const n = segs(2 * hx + 2 * OVER);
      const L = (2 * hx + 2 * OVER) / n;
      for (let i = 0; i < n; i++) {
        b.add(unit, M(-hx - OVER + L * (i + 0.5), -h / 2, s * (hz - cope / 2 + OVER / 2), 0, 0, 0, L - 0.04, h, cope + OVER), jitter(C.cope, R, 0.05), {}, { worldUV: 3 });
      }
      const m = segs(2 * hz - 2 * cope);
      const L2 = (2 * hz - 2 * cope) / m;
      for (let i = 0; i < m; i++) {
        b.add(unit, M(s * (hx - cope / 2 + OVER / 2), -h / 2, -hz + cope + L2 * (i + 0.5), 0, 0, 0, cope + OVER, h, L2 - 0.04), jitter(C.cope, R, 0.05), {}, { worldUV: 3 });
      }
    }
  }
  function goldBand(b, hx, hz, y, t = 0.14, out = 0.1) {
    for (const s of [-1, 1]) {
      b.add(unit, M(0, y, s * (hz + out / 2), 0, 0, 0, 2 * hx + 2 * out, t, out), C.gold);
      b.add(unit, M(s * (hx + out / 2), y, 0, 0, 0, 0, out, t, 2 * hz), C.gold);
    }
  }
  function merlons(b, a, bb, y, h, depth, step = 2.4, w = 1.4, col = C.wall) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...bb);
    const len = va.distanceTo(vb);
    const n = Math.max(1, Math.floor(len / step));
    const ang = Math.atan2(vb.z - va.z, vb.x - va.x);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = va.clone().lerp(vb, t);
      b.add(unit, M(p.x, y + h / 2, p.z, 0, -ang, 0, w, h, depth), jitter(col, R, 0.04), {}, { worldUV: 3 });
    }
  }

  // ================================================================== MAIN COURTYARD
  {
    const p = P.main;
    const root = new THREE.Group();
    root.name = 'platform:main';
    root.position.set(p.x, p.top, p.z);
    const stone = new Batch();
    const stone2 = new Batch();
    const plain = new Batch();
    const glowB = new Batch();
    const ban = new Batch({ aWave: 1 });
    const hx = p.hx;
    const hz = p.hz;
    const th = p.thick;
    const cope = 0.75;
    const water = WATER - p.top;
    coping(stone, hx, hz, cope, 0.5);
    goldBand(plain, hx, hz, -0.62, 0.14, 0.1);
    // walls of the slab
    stone.add(unit, M(0, -0.5 - (th - 0.5) / 2, 0, 0, 0, 0, 2 * hx, th - 0.5, 2 * hz), C.stone, {}, { worldUV: 4 });
    // corbels (machicolation) under the slab
    const inset = 1.5;
    // (x,z) is a point on the slab face line, (nx,nz) its outward normal
    const corbel = (x, z, nx, nz) => {
      for (let k = 0; k < 3; k++) {
        const d = inset - k * 0.45;
        const c = -inset + d / 2; // offset along the normal from the slab face
        const y = -th - 0.2 - k * 0.4;
        plain.add(unit, M(x + nx * c, y, z + nz * c, 0, 0, 0, nx ? d : 0.7, 0.4, nz ? d : 0.7), C.stoneDark);
      }
    };
    for (let x = -hx + 1.6; x <= hx - 1.5; x += 2.2) { corbel(x, hz, 0, 1); corbel(x, -hz, 0, -1); }
    for (let z = -hz + 1.6; z <= hz - 1.5; z += 2.2) { corbel(hx, z, 1, 0); corbel(-hx, z, -1, 0); }
    // massive foundation down into the sea (inset so falling fighters clear it)
    const fx = hx - inset;
    const fz = hz - inset;
    const fTop = -th;
    const fBot = water - 3;
    stone2.add(unit, M(0, (fTop + fBot) / 2, 0, 0, 0, 0, 2 * fx, fTop - fBot, 2 * fz), (v) => {
      if (v.y < water + 1.2) return new THREE.Color(C.algae).lerp(new THREE.Color(0x3a4a48), smooth(water + 1.2, water - 1, v.y));
      return new THREE.Color(0xe6e2da).lerp(new THREE.Color(C.wet), smooth(fTop, water + 1.2, v.y));
    }, {}, { worldUV: 5 });
    // buttresses
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      stone2.add(unit, M(sx * (fx - 0.2), (fTop + fBot) / 2, sz * (fz - 0.2), 0, Math.PI / 4, 0, 2.4, fTop - fBot, 2.4), 0xd9d5cc, {}, { worldUV: 5 });
    }
    // sea gates (dark arches) on the foundation faces
    const archShape = (w, h) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0); s.closePath();
      return s;
    };
    const archDark = new THREE.ShapeGeometry(archShape(3.2, 5.4), 8);
    const archRim = new THREE.ShapeGeometry((() => { const s = archShape(4.0, 5.9); s.holes.push(archShape(3.2, 5.4)); return s; })(), 8);
    const gateY = water + 0.2;
    for (const x of [-7.5, 0, 7.5]) {
      for (const s of [-1, 1]) {
        plain.add(archDark, M(x, gateY, s * (fz + 0.03), 0, s > 0 ? 0 : Math.PI, 0), 0x16202c);
        plain.add(archRim, M(x, gateY, s * (fz + 0.05), 0, s > 0 ? 0 : Math.PI, 0), 0xe8e2d4);
        plain.add(unit, M(x, gateY + 5.7, s * (fz + 0.12), 0, 0, 0, 0.7, 0.9, 0.2), C.gold);
        // portcullis bars
        for (let k = -2; k <= 2; k++) plain.add(unit, M(x + k * 0.55, gateY + 1.8, s * (fz + 0.08), 0, 0, 0, 0.09, 3.6, 0.06), C.iron);
      }
    }
    for (const z of [-3.2, 3.2]) {
      for (const s of [-1, 1]) {
        plain.add(archDark, M(s * (fx + 0.03), gateY, z, 0, s * Math.PI / 2, 0), 0x16202c);
        plain.add(archRim, M(s * (fx + 0.05), gateY, z, 0, s * Math.PI / 2, 0), 0xe8e2d4);
      }
    }
    // wall lamps on the slab faces + banners
    const lampXs = q > 0 ? [-12.5, -4.5, 4.5, 12.5] : [-8, 8];
    for (const x of lampXs) { lamp(plain, glowB, x, -1.9, hz, 0, 1); lamp(plain, glowB, x, -1.9, -hz, 0, -1); }
    for (const z of [-4, 4]) { lamp(plain, glowB, hx, -1.9, z, 1, 0); lamp(plain, glowB, -hx, -1.9, z, -1, 0); }
    const banner = (x, y, z, ry, w = 1.5, h = 2.6) => {
      const g = new THREE.PlaneGeometry(w, h, 2, 6);
      const pa = g.attributes.position;
      const aw = new Float32Array(pa.count);
      for (let i = 0; i < pa.count; i++) aw[i] = Math.pow((h / 2 - pa.getY(i)) / h, 1.3);
      g.setAttribute('aWave', new THREE.BufferAttribute(aw, 1));
      ban.add(g, M(x, y - h / 2, z, 0, ry, 0), 0xd8d8d8);
      plain.add(new THREE.CylinderGeometry(0.06, 0.06, w + 0.4, 5), M(x, y + 0.02, z, 0, ry, Math.PI / 2), C.gold);
    };
    for (const x of [-8.5, 0.0, 8.5]) banner(x, -0.85, hz + 0.08, 0);
    if (q > 0) for (const x of [-8.5, 8.5]) banner(x, -0.85, -hz - 0.08, Math.PI);
    banner(hx + 0.08, -0.85, 0, Math.PI / 2);
    banner(-hx - 0.08, -0.85, 0, -Math.PI / 2);

    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * (hx - cope), 2 * (hz - cope)).rotateX(-Math.PI / 2), courtMat);
    // map the paving texture to the inner area (texture was painted for the full footprint; crop UVs)
    {
      const uv = top.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (cope + uv.getX(i) * 2 * (hx - cope)) / (2 * hx), (cope + uv.getY(i) * 2 * (hz - cope)) / (2 * hz));
      }
    }
    top.receiveShadow = true;
    top.name = 'courtyard';
    root.add(top);
    for (const [b, m, o] of [[stone, stoneMat, { cast: true, receive: true }], [stone2, stoneMat2, { cast: true, receive: true }], [plain, plainMat, { cast: true, receive: true }], [glowB, lampGlow, {}], [ban, bannerMat, {}]]) {
      const mesh = b.mesh(m, o);
      if (mesh) root.add(mesh);
      if (mesh && b === stone && q > 0) inkOutline(mesh, 0.05, 0x1c2433);
    }
    platformObjects.main = root;
    group.add(root);
  }

  // ================================================================== BASTION BLOCKS (solid, sit on the courtyard)
  for (const id of ['blockL', 'blockR']) {
    const p = P[id];
    const root = new THREE.Group();
    root.name = 'platform:' + id;
    root.position.set(p.x, p.top, p.z);
    const stone = new Batch();
    const plain = new Batch();
    const glowB = new Batch();
    const ban = new Batch({ aWave: 1 });
    const hx = p.hx;
    const hz = p.hz;
    const th = p.thick;
    const cope = 0.6;
    const off = [p.x, p.top, p.z];
    coping(stone, hx, hz, cope, 0.42);
    goldBand(plain, hx, hz, -0.52, 0.12, 0.08);
    stone.add(unit, M(0, -0.42 - (th - 0.42) / 2, 0, 0, 0, 0, 2 * hx, th - 0.42, 2 * hz), 0xe4ded2, {}, { worldUV: 4, uvOffset: [0.37, 0.21] });
    // corner pilasters + base course (flat on faces, within the overhang budget)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      stone.add(unit, M(sx * (hx - 0.3), -th / 2 - 0.3, sz * (hz + 0.05), 0, 0, 0, 0.7, th - 0.6, 0.1), 0xf3eee4, {}, { worldUV: 3 });
      stone.add(unit, M(sx * (hx + 0.05), -th / 2 - 0.3, sz * (hz - 0.3), 0, 0, 0, 0.1, th - 0.6, 0.7), 0xf3eee4, {}, { worldUV: 3 });
    }
    for (const s of [-1, 1]) {
      plain.add(unit, M(0, -th + 0.18, s * (hz + 0.05), 0, 0, 0, 2 * hx, 0.36, 0.1), 0xb8b2a6);
      plain.add(unit, M(s * (hx + 0.05), -th + 0.18, 0, 0, 0, 0, 0.1, 0.36, 2 * hz), 0xb8b2a6);
    }
    // arrow slits
    for (const s of [-1, 1]) for (const x of [-1.6, 1.6]) {
      plain.add(unit, M(x, -1.7, s * (hz + 0.02), 0, 0, 0, 0.18, 0.9, 0.04), 0x1a2230);
      plain.add(unit, M(s * (hx + 0.02), -1.7, x, 0, 0, 0, 0.04, 0.9, 0.18), 0x1a2230);
    }
    // banner on the camera-facing face and the outer face; lamps on the inner face
    const sxOut = Math.sign(p.x);
    const mkBanner = (x, y, z, ry, w = 1.6, h = 2.1) => {
      const g = new THREE.PlaneGeometry(w, h, 2, 6);
      const pa = g.attributes.position;
      const aw = new Float32Array(pa.count);
      for (let i = 0; i < pa.count; i++) aw[i] = Math.pow((h / 2 - pa.getY(i)) / h, 1.3);
      g.setAttribute('aWave', new THREE.BufferAttribute(aw, 1));
      ban.add(g, M(x, y - h / 2, z, 0, ry, 0), 0xd8d8d8);
      plain.add(new THREE.CylinderGeometry(0.05, 0.05, w + 0.3, 5), M(x, y + 0.02, z, 0, ry, Math.PI / 2), C.gold);
    };
    mkBanner(0, -0.7, hz + 0.06, 0);
    mkBanner(sxOut * (hx + 0.06), -0.7, 0, sxOut * Math.PI / 2);
    lamp(plain, glowB, -sxOut * hx, -1.3, -1.6, -sxOut, 0, off);
    lamp(plain, glowB, -sxOut * hx, -1.3, 1.6, -sxOut, 0, off);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * (hx - cope), 2 * (hz - cope)).rotateX(-Math.PI / 2), bastionMat);
    {
      const uv = top.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (cope + uv.getX(i) * 2 * (hx - cope)) / (2 * hx), (cope + uv.getY(i) * 2 * (hz - cope)) / (2 * hz));
    }
    top.receiveShadow = true;
    root.add(top);
    for (const [b, m, o] of [[stone, stoneMat, { cast: true, receive: true }], [plain, plainMat, { cast: true, receive: true }], [glowB, lampGlow, {}], [ban, bannerMat, {}]]) {
      const mesh = b.mesh(m, o);
      if (mesh) root.add(mesh);
      if (mesh && b === stone && q > 0) inkOutline(mesh, 0.045, 0x1c2433);
    }
    platformObjects[id] = root;
    group.add(root);
  }

  // ================================================================== tower builder + bridge supports
  const gate = new Batch();
  const gatePlain = new Batch();
  const gateGlow = new Batch();
  const flags = new Batch({ aWave: 1 });
  function roundTower(b, pl, x, z, r, y0, y1, roofH, opts = {}) {
    const h = y1 - y0;
    const segs = q > 0 ? 16 : 10;
    b.add(new THREE.CylinderGeometry(r, r * 1.04, h, segs, 1, true), M(x, (y0 + y1) / 2, z), (v) => (v.y < WATER + 1 ? new THREE.Color(C.algae) : new THREE.Color(opts.col || 0xf4f0e8)), {}, { uvScale: [(2 * Math.PI * r) / 4, h / 4] });
    // corbelled parapet ring + merlons
    b.add(new THREE.CylinderGeometry(r + 0.5, r, 0.9, segs, 1, true), M(x, y1 + 0.45, z), 0xe8e2d6, {}, { uvScale: [(2 * Math.PI * r) / 4, 0.25] });
    pl.add(new THREE.CylinderGeometry(r + 0.52, r + 0.52, 0.18, segs), M(x, y1 + 0.9, z), C.gold);
    const nm = Math.round((2 * Math.PI * (r + 0.3)) / 1.6);
    for (let k = 0; k < nm; k += 1) {
      const a = (k / nm) * Math.PI * 2;
      b.add(unit, M(x + Math.cos(a) * (r + 0.25), y1 + 1.5, z + Math.sin(a) * (r + 0.25), 0, -a, 0, 0.6, 1.1, 0.9), 0xeee8dc, {}, { worldUV: 3 });
    }
    if (roofH > 0) {
      pl.add(new THREE.ConeGeometry(r + 0.35, roofH, segs), M(x, y1 + 1.0 + roofH / 2, z), opts.roof || C.roof);
      pl.add(new THREE.CylinderGeometry(r + 0.4, r + 0.4, 0.25, segs), M(x, y1 + 1.05, z), C.navy);
      pl.add(new THREE.SphereGeometry(0.35, 8, 6), M(x, y1 + 1.0 + roofH + 0.2, z), C.gold);
      pl.add(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 4), M(x, y1 + 1.0 + roofH + 1.8, z), C.iron);
      flags.add(flagGeometry(3.2, 2.0, opts.flag !== undefined ? opts.flag : 2, opts.pennant), M(x, y1 + 1.0 + roofH + 2.4, z, 0, opts.flagRot || 0.4, 0), 0xdcdcdc);
    }
    // windows
    if (opts.windows !== false) {
      for (let k = 0; k < (opts.nWin || 3); k++) {
        const wy = y0 + h * (0.35 + 0.18 * k);
        if (wy > y1 - 1.5) continue;
        const a = opts.winA !== undefined ? opts.winA : Math.PI / 2;
        pl.add(unit, M(x + Math.cos(a) * (r + 0.02), wy, z + Math.sin(a) * (r + 0.02), 0, -a, 0, 0.1, 1.1, 0.4), 0x1a2230);
      }
    }
  }
  // ================================================================== IRON BRIDGE (soft)
  {
    const p = P.bridge;
    const root = new THREE.Group();
    root.name = 'platform:bridge';
    root.position.set(p.x, p.top, p.z);
    const stone = new Batch();
    const plain = new Batch();
    const glowB = new Batch();
    const hx = p.hx;
    const hz = p.hz;
    const th = p.thick;
    const n = Math.round((2 * hx) / 1.0);
    for (let i = 0; i < n; i++) {
      const x = -hx + ((2 * hx) / n) * (i + 0.5);
      stone.add(unit, M(x, -0.11, 0, 0, 0, 0, (2 * hx) / n - 0.05, 0.22, 2 * hz - 0.3), jitter(0xe9ecef, R, 0.04), {}, { worldUV: 2 });
    }
    plain.add(unit, M(0, -0.16, 0, 0, 0, 0, 2 * hx - 0.1, 0.1, 2 * hz - 0.32), 0x2a313c);
    // painted gold-trimmed iron edge rails (flush, mark the edge)
    for (const s of [-1, 1]) {
      plain.add(unit, M(0, -0.08, s * (hz - 0.08), 0, 0, 0, 2 * hx + 0.1, 0.16, 0.26), C.gold);
      plain.add(unit, M(0, -th / 2 - 0.08, s * (hz - 0.04), 0, 0, 0, 2 * hx, th - 0.16, 0.12), C.iron);
      plain.add(unit, M(s * (hx + 0.02), -th / 2, 0, 0, 0, 0, 0.12, th, 2 * hz), C.iron);
      plain.add(unit, M(s * (hx + 0.06), -0.06, 0, 0, 0, 0, 0.12, 0.12, 2 * hz), C.gold);
    }
    // truss under the deck
    for (let i = 0; i <= 4; i++) {
      const x = -hx + 0.3 + ((2 * hx - 0.6) * i) / 4;
      plain.add(unit, M(x, -th + 0.02, 0, 0, 0, 0, 0.18, 0.18, 2 * hz - 0.2), C.iron);
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const xa = -hx + 0.3 + ((2 * hx - 0.6) * i) / 4;
        const xb = -hx + 0.3 + ((2 * hx - 0.6) * (i + 1)) / 4;
        plain.add(unit, between([xa, -th - 0.55, s * (hz - 0.3)], [xb, -th + 0.05, s * (hz - 0.3)]).multiply(M(0, 0, 0, 0, 0, 0, 0.12, 1, 0.12)), C.iron);
        plain.add(unit, between([xa, -th + 0.05, s * (hz - 0.3)], [xb, -th - 0.55, s * (hz - 0.3)]).multiply(M(0, 0, 0, 0, 0, 0, 0.12, 1, 0.12)), C.iron);
      }
      plain.add(unit, M(0, -th - 0.6, s * (hz - 0.3), 0, 0, 0, 2 * hx - 0.4, 0.14, 0.14), C.iron);
      if (q > 1) for (let i = 0; i < 16; i++) plain.add(new THREE.SphereGeometry(0.05, 4, 3), M(-hx + 0.3 + i * ((2 * hx - 0.6) / 15), -0.3, s * (hz + 0.03)), 0x8a95a6);
    }
    // lanterns hanging below the ends
    for (const x of [-hx + 0.6, hx - 0.6]) lamp(plain, glowB, x, -th - 1.1, hz - 0.3, 0, 0.0001, [p.x, p.top, p.z]);
    for (const [b, m, o] of [[stone, stoneMat, { cast: true, receive: true }], [plain, plainMat, { cast: true, receive: true }], [glowB, lampGlow, {}]]) {
      const mesh = b.mesh(m, o);
      if (mesh) root.add(mesh);
      if (mesh && b === stone && q > 0) inkOutline(mesh, 0.035, 0x1c2433);
    }
    platformObjects.bridge = root;
    group.add(root);
    // two slender sea pillars behind the courtyard carry the bridge on cantilevered iron girders
    const pz = P.main.z - P.main.hz - 2.2;
    for (const sx of [-1, 1]) {
      const px = p.x + sx * (hx - 1.2);
      const pTop = p.top - 1.9;
      gate.add(new THREE.CylinderGeometry(0.85, 1.15, pTop - (WATER - 2), q > 0 ? 12 : 8), M(px, (pTop + WATER - 2) / 2, pz), (v) => (v.y < WATER + 1 ? new THREE.Color(C.algae) : new THREE.Color(0xf0ece4)), {}, { uvScale: [1.5, (pTop - WATER) / 4] });
      for (const yy of [WATER + 4, 0.5, pTop - 0.2]) gatePlain.add(new THREE.CylinderGeometry(1.25, 1.25, 0.35, q > 0 ? 12 : 8), M(px, yy, pz), yy > pTop - 1 ? C.gold : 0xd8d2c4);
      gatePlain.add(new THREE.CylinderGeometry(1.0, 1.0, 0.7, 10), M(px, pTop + 0.35, pz), C.navy);
      // girders: horizontal under the deck + diagonal brace
      const zf = p.z + hz - 0.4;
      const zb = p.z - hz + 0.4;
      gatePlain.add(unit, M(px, p.top - th - 0.32, (pz + zf) / 2, 0, 0, 0, 0.32, 0.36, zf - pz), C.iron);
      gatePlain.add(unit, between([px, 1.6, pz + 0.7], [px, p.top - th - 0.45, (zb + zf) / 2]).multiply(M(0, 0, 0, 0, 0, 0, 0.26, 1, 0.26)), C.iron);
      gatePlain.add(unit, between([px, pTop - 0.2, pz + 0.7], [px, p.top - th - 0.45, zb]).multiply(M(0, 0, 0, 0, 0, 0, 0.24, 1, 0.24)), C.iron);
      // pillar lamp
      lamp(gatePlain, gateGlow, px, pTop - 1.4, pz + 1.15, 0, 1);
    }
  }
  group.add(gate.mesh(stoneMat, { cast: true, receive: true, name: 'gate' }));
  group.add(gatePlain.mesh(plainMat, { cast: true, receive: true, name: 'gateTrim' }));
  if (!gateGlow.empty) group.add(gateGlow.mesh(lampGlow));

  // ================================================================== OCEAN
  const hDrop = P.main.top - WATER;
  const ocean = makeOcean({
    y: WATER, deep: 0x0f4a8a, mid: 0x1c76bf, shallow: 0x2fb0c8, foam: 0xd6e9f0, sky: 0xc9e0ee,
    sunDir, sunColor: 0xfff6e0, stage: [P.main.x, P.main.z, P.main.hx - 1.5, P.main.hz - 1.5], stageRound: 0.6,
    shadowOffset: [(sunDir.x / sunDir.y) * hDrop, (sunDir.z / sunDir.y) * hDrop], amp: 0.65, chop: 1.3, sparkle: 2.2,
    rings: q > 0 ? 72 : 48, segs: q > 0 ? 128 : 72, cheap: q === 0,
  });
  group.add(ocean.mesh);
  updaters.push(ocean.update);

  // ================================================================== OUTER FORTRESS (ramparts, towers, city)
  const fort = new Batch();
  const fortPlain = new Batch();
  const wallBanners = new Batch({ aWave: 1 });
  const fortGlow = new Batch();
  const foamItems = [];
  const cannonMuzzles = [];
  const towerTops = [];
  const wallPts = [[-190, -14], [-140, -56], [-88, -88], [-30, -104], [30, -104], [88, -88], [140, -56], [190, -14]];
  const wallTop = 1.5;
  const wallTh = 5;
  for (let i = 0; i < wallPts.length - 1; i++) {
    const [xa, za] = wallPts[i];
    const [xb, zb] = wallPts[i + 1];
    const gap = i === 3; // the sea gate in the centre
    const len = Math.hypot(xb - xa, zb - za);
    const ang = Math.atan2(zb - za, xb - xa);
    const mx = (xa + xb) / 2;
    const mz = (za + zb) / 2;
    const nx = Math.sin(ang);
    const nz = -Math.cos(ang);
    const sgn = nz > 0 ? 1 : -1; // outward normal toward the stage (+z-ish)
    const ox = nx * sgn;
    const oz = nz * sgn;
    if (gap) {
      // gatehouse: arch over the water passage
      const hw = len / 2 - 8;
      fort.add(unit, M(mx, wallTop + 1.5, mz, 0, -ang, 0, len - 6, 4, wallTh), C.wall, {}, { worldUV: 5 });
      const sh = new THREE.Shape();
      sh.moveTo(-len / 2 + 3, WATER - 2); sh.lineTo(len / 2 - 3, WATER - 2); sh.lineTo(len / 2 - 3, wallTop - 0.5); sh.lineTo(-len / 2 + 3, wallTop - 0.5); sh.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-hw, WATER - 2); hole.lineTo(-hw, WATER + 8); hole.absarc(0, WATER + 8, hw, Math.PI, 0, true); hole.lineTo(hw, WATER - 2); hole.closePath();
      sh.holes.push(hole);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: wallTh, bevelEnabled: false, curveSegments: 10 });
      eg.translate(0, 0, -wallTh / 2);
      fort.add(eg, M(mx, 0, mz, 0, -ang, 0), (v) => (v.y < WATER + 1 ? new THREE.Color(C.algae) : new THREE.Color(C.wall)), {}, { worldUV: 5 });
      fortPlain.add(new THREE.CylinderGeometry(2.2, 2.2, 0.4, 20), M(mx + ox * 2.7, WATER + 8 + hw + 1.3, mz + oz * 2.7, Math.PI / 2, -ang, 0), C.gold);
      fortPlain.add(new THREE.CylinderGeometry(1.8, 1.8, 0.45, 20), M(mx + ox * 2.75, WATER + 8 + hw + 1.3, mz + oz * 2.75, Math.PI / 2, -ang, 0), C.navy);
      merlons(fort, [xa + (xb - xa) * 0.08 + ox * 2, 0, za + (zb - za) * 0.08 + oz * 2], [xb - (xb - xa) * 0.08 + ox * 2, 0, zb - (zb - za) * 0.08 + oz * 2], wallTop + 3.5, 1.2, 0.9);
      continue;
    }
    fort.add(unit, M(mx, (wallTop + WATER - 3) / 2, mz, 0, -ang, 0, len, wallTop - WATER + 3, wallTh), (v) => (v.y < WATER + 1 ? new THREE.Color(C.algae) : new THREE.Color(C.wall)), {}, { worldUV: 5 });
    fortPlain.add(unit, M(mx + ox * (wallTh / 2 + 0.05), wallTop - 0.6, mz + oz * (wallTh / 2 + 0.05), 0, -ang, 0, len, 0.3, 0.12), C.gold);
    merlons(fort, [xa + ox * 2, 0, za + oz * 2], [xb + ox * 2, 0, zb + oz * 2], wallTop, 1.3, 0.9);
    // big hanging banners on the face toward the stage
    for (const t of [0.3, 0.7]) {
      const bw = 4.2;
      const bh = 9;
      const g = new THREE.PlaneGeometry(bw, bh, 2, 6);
      const pa = g.attributes.position;
      const aw = new Float32Array(pa.count);
      for (let i = 0; i < pa.count; i++) aw[i] = Math.pow((bh / 2 - pa.getY(i)) / bh, 1.3) * 2.2;
      g.setAttribute('aWave', new THREE.BufferAttribute(aw, 1));
      const bx = xa + (xb - xa) * t + ox * (wallTh / 2 + 0.12);
      const bz = za + (zb - za) * t + oz * (wallTh / 2 + 0.12);
      wallBanners.add(g, M(bx, wallTop - 0.9 - bh / 2, bz, 0, Math.atan2(ox, oz), 0), 0xd0d0d0);
      fortPlain.add(new THREE.CylinderGeometry(0.15, 0.15, bw + 0.8, 6), M(bx, wallTop - 0.85, bz, 0, Math.atan2(ox, oz), Math.PI / 2), C.gold);
    }
    // cannons in the embrasures
    const nc = [2, 4, 6][q];
    for (let k = 0; k < nc; k++) {
      const t = (k + 0.5) / nc;
      const cx = xa + (xb - xa) * t + ox * 2.4;
      const cz = za + (zb - za) * t + oz * 2.4;
      const yaw = Math.atan2(ox, oz);
      fortPlain.add(new THREE.CylinderGeometry(0.28, 0.42, 2.8, 8), M(cx + ox * 0.5, wallTop + 0.9, cz + oz * 0.5, Math.PI / 2 - 0.12, yaw, 0), 0x2b2f38);
      fortPlain.add(unit, M(cx - ox * 0.6, wallTop + 0.4, cz - oz * 0.6, 0, yaw, 0, 1.2, 0.6, 1.6), 0x6b4a2e);
      cannonMuzzles.push(new THREE.Vector3(cx + ox * 2.0, wallTop + 1.1, cz + oz * 2.0));
    }
    foamItems.push({ x: mx + ox * 2.6, z: mz + oz * 2.6, rx: len / 2 + 2, rz: 2.2, rot: -ang });
  }
  // wall towers
  wallPts.forEach(([x, z], i) => {
    const big = i === 3 || i === 4;
    const r = big ? 7 : 5.6;
    const top = big ? 11 : 7.5;
    const roof = i % 2 === 1 || big ? (big ? 12 : 9) : 0;
    roundTower(fort, fortPlain, x, z, r, WATER - 2, top, roof, { flag: 2, winA: Math.atan2(-z, -x), nWin: 3, flagRot: 0.5 });
    foamItems.push({ x, z, rx: r + 0.3 });
    towerTops.push(new THREE.Vector3(x, top + 1.6, z));
    if (!roof) {
      // battery platform: two big cannons
      for (const da of [-0.3, 0.3]) {
        const a = Math.atan2(-z, -x) + da;
        fortPlain.add(new THREE.CylinderGeometry(0.35, 0.5, 3.2, 8), M(x + Math.cos(a) * (r - 1), top + 2.1, z + Math.sin(a) * (r - 1), Math.PI / 2 - 0.1, Math.atan2(Math.cos(a), Math.sin(a)), 0), 0x2b2f38);
        cannonMuzzles.push(new THREE.Vector3(x + Math.cos(a) * (r + 0.6), top + 2.2, z + Math.sin(a) * (r + 0.6)));
      }
    }
  });
  // breakwater rocks around the stage foundation + scattered
  const rocks = new Batch();
  const rockCol = (v, n) => (v.y < WATER + 0.3 ? new THREE.Color(0x3d4a50) : n.y > 0.6 ? new THREE.Color(0x8f9a9c) : new THREE.Color(0x77818a).lerp(new THREE.Color(0x9aa2a8), R()));
  for (let i = 0; i < (q > 0 ? 18 : 8); i++) {
    const a = (i / (q > 0 ? 18 : 8)) * Math.PI * 2 + R() * 0.2;
    const x = Math.cos(a) * (P.main.hx - 0.5) * (0.9 + R() * 0.2);
    const z = Math.sin(a) * (P.main.hz - 0.5) * (0.9 + R() * 0.25);
    const r = 1.6 + R() * 1.8;
    rocks.add(rockGeo(r, 400 + i, 1, 0.7), M(x, WATER - r * 0.35, z, 0, R() * 6, 0), rockCol);
  }
  for (const [x, z, r] of [[-40, -30, 3], [44, -26, 2.6], [-30, -45, 2], [36, -48, 2.4], [-60, -20, 3.5], [62, -14, 3]]) {
    rocks.add(rockGeo(r, 500 + x, 1, 0.9), M(x, WATER - r * 0.2, z, 0, R() * 6, 0), rockCol);
    foamItems.push({ x, z, rx: r * 0.95 });
  }
  group.add(rocks.mesh(plainMat, { cast: false, receive: true, name: 'breakwater' }));

  // city on the hills behind the walls + HQ keep
  {
    const nz = makeNoise2(77);
    const height = (x, z) => {
      const d = -100 - z; // distance behind the wall line
      const base = WATER + 2 + smooth(-20, 40, d - Math.abs(x) * 0.1) * (8 + 6 * (nz(x * 0.02, z * 0.02) * 0.5 + 0.5));
      return base + smooth(40, 120, d) * 18 + nz(x * 0.1, z * 0.1) * 0.4;
    };
    const terr = terrainGeo({
      x0: -300, x1: 300, z0: -95, z1: -270, nx: q > 0 ? 70 : 40, nz: q > 0 ? 24 : 12, height,
      color: (x, y, z, ny) => (ny < 0.75 ? new THREE.Color(0xa7a49c) : new THREE.Color(0x7fb36a).lerp(new THREE.Color(0x5e9a5e), (nz(x * 0.05, z * 0.05) + 1) / 2)),
    });
    const land = new Batch();
    land.add(terr, null, (v, n, i) => new THREE.Color(terr.attributes.color.getX(i), terr.attributes.color.getY(i), terr.attributes.color.getZ(i)));
    group.add(land.mesh(plainMat, { receive: false, name: 'hills' }));
    const city = new Batch();
    const nB = [30, 70, 120][q];
    let placed = 0;
    for (let k = 0; k < nB * 4 && placed < nB; k++) {
      const x = -150 + R() * 300;
      const z = -112 - R() * 50;
      if (Math.abs(x) < 30 && z > -118) continue;
      const y = height(x, z);
      placed++;
      const w = 3 + R() * 4;
      const d = 3 + R() * 3;
      const h = 3 + R() * 5;
      const m0 = M(x, y, z, 0, (R() - 0.5) * 0.3, 0);
      city.add(unit, m0.clone().multiply(M(0, h / 2 - 1, 0, 0, 0, 0, w, h + 2, d)), jitter(R() < 0.7 ? 0xe2ddd2 : 0xd4dbe6, R, 0.04));
      if (R() < 0.75) city.add(prismGeo(w + 0.4, 1.6 + R(), d + 0.4), m0.clone().multiply(M(0, h, 0)), R() < 0.8 ? C.roof : 0x4d7fd0);
      else city.add(unit, m0.clone().multiply(M(0, h + 0.2, 0, 0, 0, 0, w + 0.3, 0.4, d + 0.3)), 0xc9c2b4);
      for (let wi = 0; wi < Math.floor(w / 1.3); wi++) city.add(unit, m0.clone().multiply(M(-w / 2 + 0.8 + wi * 1.3, h * 0.6, d / 2 + 0.02, 0, 0, 0, 0.5, 0.8, 0.06)), 0x2c4a72);
      if (q > 0 && R() < 0.12) chimneys.push([x + w * 0.3, y + h + 1.5, z]);
    }
    // HQ keep
    const kx = 0;
    const kz = -168;
    const ky = height(kx, kz);
    city.add(unit, M(kx, ky + 9, kz, 0, 0, 0, 26, 18, 14), 0xe6e1d6);
    roundTower(city, city, kx, kz, 5.5, ky, ky + 30, 12, { flag: 2, nWin: 6, winA: Math.PI / 2 });
    for (const s of [-1, 1]) roundTower(city, city, kx + s * 14, kz, 3.4, ky, ky + 20, 8, { flag: 2, nWin: 3, winA: Math.PI / 2 });
    city.add(new THREE.CylinderGeometry(3.6, 3.6, 0.5, 24), M(kx, ky + 22, kz + 5.6, Math.PI / 2, 0, 0), C.gold);
    city.add(new THREE.CylinderGeometry(3.0, 3.0, 0.55, 24), M(kx, ky + 22, kz + 5.65, Math.PI / 2, 0, 0), C.navy);
    city.add(new THREE.OctahedronGeometry(2.0, 0), M(kx, ky + 22, kz + 6.0, 0, 0, Math.PI / 4, 1, 1, 0.25), C.gold);
    group.add(city.mesh(plainMat, { receive: false, name: 'city' }));
  }
  group.add(fort.mesh(stoneMat, { receive: false, name: 'ramparts' }));
  if (!wallBanners.empty) group.add(wallBanners.mesh(bannerMat, { receive: false, name: 'wallBanners' }));
  group.add(fortPlain.mesh(plainMat, { receive: false, name: 'rampartTrim' }));
  if (!fortGlow.empty) group.add(fortGlow.mesh(lampGlow));
  {
    const m = flags.mesh(shipMats.flag, { receive: false, name: 'flags' });
    if (m) group.add(m);
  }

  // foam around towers/walls/rocks
  if (q > 0) group.add(makeFoamRings(foamItems, ocean, { y: WATER, opacity: 0.85 }));

  // ================================================================== SHIPS (navy)
  const ships = [];
  const navyHull = { bottom: 0x2a3c5a, band: 0xe3b23c, wood: 0xeae6dc, trim: 0x2f5fae, deck: 0xc9a172, dark: 0x2a3140 };
  const shipDefs = [
    { pos: [-44, WATER, -52], heading: 0.12, L: 24, sails: [3, 3, 3], altSail: 3, jibSlot: 3, flagSlot: 2, hull: navyHull, seed: 11 },
    { pos: [48, WATER, -58], heading: Math.PI - 0.15, L: 22, sails: [3, 3, 3], jibSlot: 3, flagSlot: 2, hull: navyHull, seed: 12 },
    { pos: [-78, WATER, -10], heading: Math.PI / 2 + 0.6, L: 21, sails: [3, 3, 3], jibSlot: 3, flagSlot: 2, hull: navyHull, seed: 13 },
    { pos: [76, WATER, -6], heading: -Math.PI / 2 - 0.5, L: 23, sails: [3, 3, 3], jibSlot: 3, flagSlot: 2, hull: navyHull, seed: 14 },
  ];
  const nShips = [1, 2, 4][q];
  for (let i = 0; i < nShips; i++) {
    const s = buildShip({ ...shipDefs[i], quality: q }, shipMats);
    group.add(s.group);
    ships.push(s);
  }
  if (q > 0) group.add(makeFoamRings(ships.map((s, i) => ({ x: shipDefs[i].pos[0], z: shipDefs[i].pos[2], rx: s.length * 0.52, rz: s.beam * 1.2, rot: -shipDefs[i].heading })), ocean, { y: WATER, opacity: 0.7 }));

  // ================================================================== ANIMATED EXTRAS
  // searchlights sweeping from two towers
  if (q > 0) {
    const tops = [towerTops[2], towerTops[5]];
    tops.forEach((tp, i) => {
      const beam = makeBeam({ length: 70, r0: 0.6, r1: 6, color: 0xfff4d0, strength: 0.16 });
      beam.position.copy(tp).add(new THREE.Vector3(0, 0.8, 0));
      group.add(beam);
      const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.1, 10), glowMat(0xfff4d0, 3.2));
      lampHead.position.copy(beam.position);
      group.add(lampHead);
      updaters.push((t) => {
        beam.rotation.set(0, (i ? Math.PI : 0) + (i ? -1 : 1) * (0.9 + Math.sin(t * 0.35 + i * 2) * 0.7), 0.12 + Math.sin(t * 0.5 + i) * 0.06, 'YXZ');
      });
    });
  }
  // gulls
  if (q > 0) {
    const g = makeGulls({ n: q > 1 ? 12 : 7, seed: 19, area: [[-60, 60], [-60, -30]], height: [4, 14] });
    group.add(g.mesh);
    updaters.push(g.update);
  }
  // spray where waves hit the foundation and walls
  if (q > 0) {
    const fx = P.main.hx - 1.5;
    const fz = P.main.hz - 1.5;
    const spray = makeParticles({
      count: q > 1 ? 90 : 45, seed: 5, life: 1.6, size: 1.1, grow: 2.4, sizeVar: 0.5, accel: [0, -9, 0],
      spawn: (r) => {
        const side = Math.floor(r() * 4);
        const t = r() * 2 - 1;
        const x = side < 2 ? t * fx : (side === 2 ? 1 : -1) * (fx + 0.3);
        const z = side >= 2 ? t * fz : (side === 0 ? 1 : -1) * (fz + 0.3);
        return [x, WATER + 0.2, z];
      },
      vel: (r) => [(r() - 0.5) * 2, 5 + r() * 4, (r() - 0.5) * 2],
      colorA: 0xeef6fa, colorB: 0xd8e8f0, opacity: 0.8, map: smokeTexture(), fadeIn: 0.05, fadeOut: 0.5, name: 'spray',
    });
    group.add(spray.mesh);
    updaters.push(spray.update);
  }
  // chimney smoke from the city
  if (q > 0 && chimneys.length) {
    const ch = chimneys.slice(0, q > 1 ? 10 : 5);
    const smoke = makeParticles({
      count: ch.length * (q > 1 ? 7 : 5), seed: 8, life: 7, size: 2.2, grow: 3.5, sizeVar: 0.3,
      spawn: (r, i) => { const c = ch[i % ch.length]; return [c[0], c[1], c[2]]; },
      vel: (r) => [0.6 + r() * 0.5, 1.6 + r() * 0.6, 0.2 + r() * 0.3], wobble: 0.6,
      colorA: 0xe4e4e8, colorB: 0xc8ccd4, opacity: 0.55, map: smokeTexture(), fadeIn: 0.1, fadeOut: 0.55, name: 'chimneySmoke',
    });
    group.add(smoke.mesh);
    updaters.push(smoke.update);
  }
  // lamp halos (static platforms only)
  if (q > 0) {
    const glows = makeGlows(glowPoints, { size: 1.6, color: 0xffcf73, intensity: 1.4, flicker: 0.1 });
    group.add(glows.mesh);
    updaters.push(glows.update);
  }

  // ================================================================== HAZARD FLOURISH: tower cannons flash
  const flashes = makeFlashPool(group, { count: 10, color: 0xffd08a, intensity: 5 });
  updaters.push((t) => flashes.update(t));
  let now = 0;
  updaters.push((t) => { now = t; });
  function onHazard(evt) {
    if (!evt || (evt.kind && evt.kind !== 'barrage')) return;
    const warn = evt.type === 'hazardWarn';
    const n = warn ? 3 : 6;
    const pool = cannonMuzzles.slice().sort((a, b) => Math.abs(a.x - (evt.x || 0) * 4) - Math.abs(b.x - (evt.x || 0) * 4)).slice(0, 10);
    for (let i = 0; i < n && pool.length; i++) {
      const m = pool[Math.floor(Math.random() * pool.length)];
      flashes.fire(m.x, m.y, m.z, warn ? 9 : 14, 0.5, i * 0.09);
    }
  }

  // ------------------------------------------------------------------ update / dispose
  for (const s of ships) updaters.push(s.update);
  const extraTex = [brickTex, brickTex2, plankTex, sailTex, flagTex, banTex, courtTex, bastionTex];
  function update(time, dt) {
    for (const m of clothMats) m.userData.uTime.value = time;
    for (const fn of updaters) fn(time, dt);
  }
  function dispose() {
    disposeGroup(group, extraTex);
    unit.dispose();
  }
  return { group, sun, platformObjects, update, background, fog, dispose, onHazard };
}
