// VOLCANIC ISLAND — hexagonal basalt battlefield over a sea of fire: glowing lava cracks and lava falls, floating basalt
// slabs, an obsidian crown, jagged spires, smoke and embers, and an erupting caldera behind the stage.
import * as THREE from 'three';
import {
  Batch, M, rng, qLevel, vcMat, glowMat, toonMat, makeLights, makeSky, makeGlows, makeParticles, rockGeo, jitter,
  canvasTexture, smooth, makeNoise2, disposeGroup, smokeTexture, makeFlashPool, terrainGeo, inkOutline,
} from './common.js';
import { makeLava, ribbonGeo, waterfallMaterial } from './surfaces.js';

const PAL = {
  basalt: [0x3b3440, 0x342e3a, 0x433a46, 0x2f2a35, 0x3e3540],
  ash: 0x8c8090,
  rimAsh: 0xa79aa6,
  obsidian: 0x241a2e,
  glow: 0xff7a1f,
  glowHot: 0xffc04a,
};

/** Hex-column top texture (+ matching emissive crack map). Painted in world units. */
function basaltTextures(seed, wU, hU, pxPerUnit, { cell = 0.72, crackProb = 0.16, light = false, circle = false, rimBand = 0.45 } = {}) {
  const W = Math.min(2048, Math.round(wU * pxPerUnit));
  const H = Math.min(2048, Math.round(hU * pxPerUnit));
  const R = rng(seed);
  const sx = W / wU;
  const sy = H / hU;
  const cells = [];
  const dx = cell * Math.sqrt(3);
  const dy = cell * 1.5;
  for (let j = -1; j * dy < hU + dy; j++) {
    for (let i = -1; i * dx < wU + dx; i++) {
      const cx = i * dx + (j % 2 ? dx / 2 : 0) + (R() - 0.5) * 0.08;
      const cy = j * dy + (R() - 0.5) * 0.08;
      cells.push({ cx, cy, k: R(), crack: R() < crackProb });
    }
  }
  const poly = (g, c, shrink) => {
    g.beginPath();
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2 + Math.PI / 6;
      const x = (c.cx + Math.cos(ang) * cell * shrink) * sx;
      const y = (c.cy + Math.sin(ang) * cell * shrink) * sy;
      if (a) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  };
  const edgeDist = (c) => (circle ? wU / 2 - Math.hypot(c.cx - wU / 2, c.cy - hU / 2) : Math.min(c.cx, c.cy, wU - c.cx, hU - c.cy));
  const map = canvasTexture(W, H, (g) => {
    g.fillStyle = light ? '#2a2228' : '#1a141c';
    g.fillRect(0, 0, W, H);
    for (const c of cells) {
      const ed = edgeDist(c);
      const nearEdge = ed < rimBand;
      const base = light ? [128, 116, 124] : [72, 62, 76];
      const k = (c.k - 0.5) * 22;
      const lift = nearEdge ? (light ? 34 : 58) : 0;
      g.fillStyle = `rgb(${(base[0] + k + lift) | 0},${(base[1] + k + lift * 0.95) | 0},${(base[2] + k + lift * 0.9) | 0})`;
      poly(g, c, 0.93);
      g.fill();
      // cel bevel: lit upper-left rim, shadowed lower-right
      g.save();
      poly(g, c, 0.93);
      g.clip();
      g.fillStyle = 'rgba(255,235,220,0.13)';
      g.fillRect((c.cx - cell) * sx, (c.cy - cell) * sy, cell * 2 * sx, cell * 0.45 * sy);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect((c.cx - cell) * sx, (c.cy + cell * 0.55) * sy, cell * 2 * sx, cell * 0.6 * sy);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,220,200,0.06)';
        g.beginPath(); g.arc((c.cx + (R() - 0.5) * cell) * sx, (c.cy + (R() - 0.5) * cell) * sy, (0.05 + R() * 0.1) * sx, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
  });
  const emissive = canvasTexture(W, H, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, W, H);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const c of cells) {
      if (!c.crack || edgeDist(c) < rimBand + 0.3) continue;
      const n = 2 + Math.floor(R() * 3);
      const start = Math.floor(R() * 6);
      g.beginPath();
      for (let a = 0; a <= n; a++) {
        const ang = ((start + a) / 6) * Math.PI * 2 + Math.PI / 6;
        const x = (c.cx + Math.cos(ang) * cell) * sx;
        const y = (c.cy + Math.sin(ang) * cell) * sy;
        if (a) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.strokeStyle = 'rgba(255,90,20,0.55)';
      g.lineWidth = 0.16 * sx;
      g.stroke();
      g.strokeStyle = 'rgba(255,190,80,1)';
      g.lineWidth = 0.06 * sx;
      g.stroke();
    }
  });
  return { map, emissive };
}

/** Hexagonal prism (column) geometry with a slightly bevelled top, unit circumradius. */
function hexColumn(h, r) {
  return new THREE.CylinderGeometry(r * 0.94, r, h, 6, 1);
}

export function buildVolcanicIsland(ctx) {
  const q = qLevel(ctx.quality);
  const A = ctx.arena;
  const group = new THREE.Group();
  group.name = 'arena:volcanic_island';
  const updaters = [];
  const R = rng(1313);
  const LAVA = A.blast.minY + 3;
  const P = Object.fromEntries(A.platforms.map((p) => [p.id, p]));
  const platformObjects = {};

  // ------------------------------------------------------------------ lights / sky / fog
  const HAZE = 0x6a2a26;
  const { sun } = makeLights(group, {
    sunColor: 0xffb48a, sunIntensity: 2.3, dir: [-0.55, 0.9, 0.7],
    hemiSky: 0x8a5a86, hemiGround: 0xff6a24, hemiIntensity: 1.25,
  });
  const sky = makeSky({
    top: 0x1c0a1c, mid: 0x5a1a26, horizon: 0x9a3a26, below: HAZE,
    sunDir: new THREE.Vector3(0.15, 0.08, -1), sunColor: 0xff6a2a, sunGlow: 1.2, sunDisc: 0,
    clouds: { seed: 71, count: 20, lit: '#6a3a44', shade: '#2e1a24', rim: '#c4583a', low: 0, wisps: 18, alpha: 0.85 },
    cloudBand: 0.55,
  });
  group.add(sky.mesh);
  updaters.push(sky.update);
  const fog = new THREE.Fog(HAZE, 40, 300);
  const background = new THREE.Color(HAZE);

  // ------------------------------------------------------------------ materials
  const rockMat = vcMat({ rim: 0.35, rimColor: 0xff8a50 });
  const plainMat = vcMat({ rim: 0.3, rimColor: 0xffa070 });
  const seamGlow = glowMat(PAL.glow, 2.6);
  const hotGlow = glowMat(PAL.glowHot, 3.2);
  const lavaFall = waterfallMaterial({ water: 0xe8380c, foam: 0xffa83a, speed: 0.55, opacity: 0.95, glow: 1.35, scale: [5, 2] });
  updaters.push(lavaFall.update);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const glowPoints = [];
  const emissiveMats = [];
  const texList = [];

  function topMaterial(tex, intensity = 2.2) {
    const m = toonMat(0xffffff, { map: tex.map, emissive: 0xff7a2a, emissiveIntensity: intensity, rim: 0.12, rimColor: 0xff9a60 });
    m.emissiveMap = tex.emissive;
    m.userData.baseEmissive = intensity;
    emissiveMats.push(m);
    texList.push(tex.map, tex.emissive);
    return m;
  }

  // ================================================================== MAIN BASALT PLATEAU
  {
    const p = P.main;
    const root = new THREE.Group();
    root.name = 'platform:main';
    root.position.set(p.x, p.top, p.z);
    const hx = p.hx;
    const hz = p.hz;
    const th = p.thick;
    const tex = basaltTextures(3, 2 * hx, 2 * hz, 78, { cell: 0.75, crackProb: 0.14, rimBand: 0.55 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * hx, 2 * hz).rotateX(-Math.PI / 2), topMaterial(tex, 2.4));
    top.receiveShadow = true;
    top.name = 'basaltTop';
    root.add(top);
    const cols = new Batch();
    const seams = new Batch();
    // perimeter hex columns: flat faces flush with the footprint, tops just under the top plane
    const cr = 0.62;
    const inr = cr * Math.cos(Math.PI / 6);
    const colAt = (x, z, rot) => {
      const extra = R() < 0.3 ? 2 + R() * 3.5 : R() * 1.6;
      const h = th + extra;
      const col = jitter(PAL.basalt[Math.floor(R() * PAL.basalt.length)], R, 0.06);
      cols.add(hexColumn(h, cr), M(x, -0.015 - h / 2, z, 0, rot, 0), (v) => {
        const t = (-v.y) / (th + 5);
        return col.clone().lerp(new THREE.Color(0x5a2a22), smooth(0.5, 1.0, t) * 0.6);
      });
      // glowing tip on long hanging columns
      if (extra > 2.2) seams.add(new THREE.ConeGeometry(cr * 0.5, 0.5, 6), M(x, -0.015 - h - 0.2, z, Math.PI, rot, 0), 0xffffff);
    };
    const stepX = inr * 2;
    // CylinderGeometry(6) has flats facing ±x at rot 0; rotate by 90deg for the ±z sides
    for (const s of [-1, 1]) {
      for (let x = -hx + inr; x <= hx - inr + 0.01; x += stepX) {
        colAt(x, s * (hz - inr + (R() - 0.5) * 0.06), Math.PI / 2);
      }
    }
    for (const s of [-1, 1]) {
      for (let z = -hz + inr * 2.2; z <= hz - inr * 2.2 + 0.01; z += stepX) {
        colAt(s * (hx - inr + (R() - 0.5) * 0.06), z, 0);
      }
    }
    // dark core behind the columns
    cols.add(unit, M(0, -th / 2 - 0.02, 0, 0, 0, 0, 2 * hx - 1.2, th, 2 * hz - 1.2), 0x1a141e);
    // jagged underside: hanging columns & stalactites
    const nh = [14, 26, 40][q];
    for (let i = 0; i < nh; i++) {
      const x = (R() - 0.5) * 2 * (hx - 2.2);
      const z = (R() - 0.5) * 2 * (hz - 2);
      const h = 2 + R() * 5;
      cols.add(hexColumn(h, 0.5 + R() * 0.6), M(x, -th - h / 2 + 0.5, z, 0, R() * 3, 0), (v) => new THREE.Color(0x2f2832).lerp(new THREE.Color(0x6a2a1e), smooth(-th, -th - 6, v.y)));
      if (R() < 0.5) seams.add(new THREE.ConeGeometry(0.22, 0.6, 6), M(x, -th - h + 0.2, z, Math.PI, 0, 0), 0xffffff);
    }
    // glowing seams between some side columns (lava in the cracks)
    const nSeams = [8, 16, 24][q];
    for (let i = 0; i < nSeams; i++) {
      const side = Math.floor(R() * 4);
      const t = (R() - 0.5) * 2;
      const y0 = -0.5 - R() * 1.0;
      const len = 1.2 + R() * 2.4;
      if (side < 2) seams.add(unit, M(t * (hx - 1), y0 - len / 2, (side ? 1 : -1) * (hz - 0.05), 0, 0, 0, 0.09, len, 0.05), 0xffffff);
      else seams.add(unit, M((side === 2 ? 1 : -1) * (hx - 0.05), y0 - len / 2, t * (hz - 1), 0, 0, 0, 0.05, len, 0.09), 0xffffff);
    }
    // bright ash rim cap on the very edge (flush) + molten edge line right under it
    const rimB = new Batch();
    for (const s of [-1, 1]) {
      rimB.add(unit, M(0, -0.065, s * (hz + 0.03), 0, 0, 0, 2 * hx + 0.12, 0.12, 0.06), PAL.rimAsh);
      rimB.add(unit, M(s * (hx + 0.03), -0.065, 0, 0, 0, 0, 0.06, 0.12, 2 * hz), PAL.rimAsh);
      seams.add(unit, M(0, -0.2, s * (hz + 0.025), 0, 0, 0, 2 * hx + 0.06, 0.05, 0.04), 0xffffff);
      seams.add(unit, M(s * (hx + 0.025), -0.2, 0, 0, 0, 0, 0.04, 0.05, 2 * hz), 0xffffff);
    }
    // lava falls pouring from cracks in the front and sides
    const falls = new Batch();
    const fallDefs = [[-10.5, 1, 0.8], [hx, 0, 0.9, 2.5], [-hx, 0, 0.9, -3]];
    fallDefs.forEach(([a, side, w, zz], i) => {
      let x0; let z0; let nx; let nz;
      if (side === 1) { x0 = a; z0 = hz; nx = 0; nz = 1; } else { x0 = a; z0 = zz; nx = Math.sign(a); nz = 0; }
      const path = [];
      const yStart = -1.1 - (i % 2) * 0.6;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const out = 0.15 + Math.sqrt(t) * 1.4;
        path.push([x0 + nx * out, yStart - t * (yStart - (LAVA - p.top) + 0.5), z0 + nz * out]);
      }
      const { geo } = ribbonGeo(path, path.map((_, k) => w * (1 + k * 0.05)), [nz, 0, -nx]);
      falls.add(geo, null, new THREE.Color(i * 0.21, 0, 0));
      seams.add(new THREE.SphereGeometry(w * 0.4, 8, 6), M(x0 + nx * 0.05, yStart + 0.1, z0 + nz * 0.05, 0, 0, 0, 1 - Math.abs(nx) * 0.7, 0.6, 0.3 + Math.abs(nx) * 0.7), 0xffffff);
      glowPoints.push([p.x + x0 + nx * 0.6, p.top + yStart, p.z + z0 + nz * 0.6, 2.4]);
    });
    if (q > 0) {
      const fm = falls.mesh(lavaFall.mat, { name: 'lavaFalls' });
      fm.renderOrder = 4;
      root.add(fm);
    }
    for (const [b, m, o] of [[cols, rockMat, { cast: true, receive: true }], [rimB, plainMat, { cast: false, receive: true }], [seams, seamGlow, {}]]) {
      const mesh = b.mesh(m, o);
      if (mesh) root.add(mesh);
      if (mesh && b === cols && q > 0) inkOutline(mesh, 0.05, 0x0e070a);
    }
    platformObjects.main = root;
    group.add(root);
  }

  // ================================================================== FLOATING BASALT SLABS (soft "pillars")
  const slabTex = basaltTextures(8, 4.6, 4.6, 110, { cell: 0.62, crackProb: 0.0, light: true, circle: true, rimBand: 0.42 });
  const slabMat = topMaterial(slabTex, 1.0);
  for (const id of ['pillarL', 'pillarR']) {
    const p = P[id];
    const root = new THREE.Group();
    root.name = 'platform:' + id;
    root.position.set(p.x, p.top, p.z);
    const r = p.r;
    const th = p.thick;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r, 36).rotateX(-Math.PI / 2), slabMat);
    top.receiveShadow = true;
    root.add(top);
    const b = new Batch();
    const g = new Batch();
    b.add(new THREE.CylinderGeometry(r + 0.04, r - 0.05, th - 0.12, 36, 1, true), M(0, -(th - 0.12) / 2 - 0.12, 0), (v) => new THREE.Color(0x6e6270).lerp(new THREE.Color(0x3a3040), smooth(0, -th, v.y)));
    b.add(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.12, 36, 1, true), M(0, -0.06, 0), PAL.rimAsh);
    g.add(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.06, 36, 1, true), M(0, -0.18, 0), 0xffffff);
    // hanging column cluster underneath (narrower than the slab)
    const nc = 7;
    for (let i = 0; i < nc; i++) {
      const a = (i / nc) * Math.PI * 2;
      const rr = i === 0 ? 0 : 0.95;
      const h = 1.2 + R() * 2.2 + (i === 0 ? 1.5 : 0);
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      b.add(hexColumn(h, 0.55), M(x, -th - h / 2 + 0.1, z, 0, 0, 0), (v) => new THREE.Color(0x3a3240).lerp(new THREE.Color(0x7a3020), smooth(-th, -th - 4, v.y)));
      if (h > 2.2) g.add(new THREE.ConeGeometry(0.22, 0.5, 6), M(x, -th - h - 0.1, z, Math.PI, 0, 0), 0xffffff);
    }
    // orbiting debris
    for (let i = 0; i < 4; i++) {
      const a = R() * Math.PI * 2;
      b.add(rockGeo(0.25 + R() * 0.25, 600 + i, 0, 0.8), M(Math.cos(a) * (r + 0.6), -th - 1 - R() * 1.5, Math.sin(a) * (r + 0.6)), 0x4a4050);
    }
    for (const [bb, m, o] of [[b, rockMat, { cast: true, receive: true }], [g, seamGlow, {}]]) {
      const mesh = bb.mesh(m, o);
      if (mesh) root.add(mesh);
      if (mesh && bb === b && q > 0) inkOutline(mesh, 0.035, 0x0e070a);
    }
    platformObjects[id] = root;
    group.add(root);
  }

  // ================================================================== OBSIDIAN CROWN (soft)
  {
    const p = P.crown;
    const root = new THREE.Group();
    root.name = 'platform:crown';
    root.position.set(p.x, p.top, p.z);
    const hx = p.hx;
    const hz = p.hz;
    const th = p.thick;
    const runeTex = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#2a1e34';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},${120 + Math.random() * 40},0.25)`;
        g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.fill();
      }
      g.strokeStyle = '#d6a24a'; g.lineWidth = 10;
      g.strokeRect(10, 10, w - 20, h - 20);
      g.lineWidth = 3;
      g.strokeRect(26, 26, w - 52, h - 52);
    });
    const runeEm = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff8a2a';
      g.lineWidth = 5;
      g.lineCap = 'round';
      const R2 = rng(5);
      for (let i = 0; i < 7; i++) {
        const cx = 70 + i * 62;
        const cy = h / 2;
        g.beginPath();
        g.arc(cx, cy, 16, R2() * 6, R2() * 6 + 4);
        g.moveTo(cx - 14, cy + 22); g.lineTo(cx + 14, cy - 22);
        if (R2() < 0.5) { g.moveTo(cx - 18, cy); g.lineTo(cx + 18, cy); }
        g.stroke();
      }
    });
    const m = toonMat(0xffffff, { map: runeTex, emissive: 0xff7a2a, emissiveIntensity: 1.8, rim: 0.5, rimColor: 0xb08aff });
    m.emissiveMap = runeEm;
    m.userData.baseEmissive = 1.8;
    emissiveMats.push(m);
    texList.push(runeTex, runeEm);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * hx, 2 * hz).rotateX(-Math.PI / 2), m);
    top.receiveShadow = true;
    root.add(top);
    const b = new Batch();
    const g = new Batch();
    b.add(unit, M(0, -th / 2 - 0.01, 0, 0, 0, 0, 2 * hx + 0.04, th - 0.02, 2 * hz + 0.04), (v) => new THREE.Color(PAL.obsidian).lerp(new THREE.Color(0x4a2a5a), smooth(-th, 0, v.y)));
    for (const s of [-1, 1]) {
      g.add(unit, M(0, -0.16, s * (hz + 0.04), 0, 0, 0, 2 * hx + 0.1, 0.07, 0.04), 0xffffff);
      g.add(unit, M(s * (hx + 0.04), -0.16, 0, 0, 0, 0, 0.04, 0.07, 2 * hz + 0.1), 0xffffff);
    }
    // obsidian shards underneath
    for (let i = 0; i < 9; i++) {
      const x = (R() - 0.5) * 2 * (hx - 0.6);
      const z = (R() - 0.5) * 2 * (hz - 0.5);
      const h = 0.5 + R() * 1.1;
      b.add(new THREE.ConeGeometry(0.3 + R() * 0.25, h, 5), M(x, -th - h / 2 + 0.05, z, Math.PI, R() * 3, 0), (v) => new THREE.Color(0x2a1e38).lerp(new THREE.Color(0x6a3a8a), R() * 0.4));
    }
    g.add(new THREE.OctahedronGeometry(0.32, 0), M(0, -th - 1.1, 0, 0, 0, 0, 1, 1.5, 1), 0xffffff);
    glowPoints.push([p.x, p.top - th - 1.1, p.z, 1.8]);
    for (const [bb, mm, o] of [[b, rockMat, { cast: true, receive: true }], [g, hotGlow, {}]]) {
      const mesh = bb.mesh(mm, o);
      if (mesh) root.add(mesh);
      if (mesh && bb === b && q > 0) inkOutline(mesh, 0.035, 0x0e070a);
    }
    platformObjects.crown = root;
    group.add(root);
  }

  // ================================================================== LAVA SEA
  const lava = makeLava({ y: LAVA, crust: 0x1e0e12, red: 0x7a1214, orange: 0xff4e12, yellow: 0xffc24a, stage: [P.main.x, P.main.z, P.main.hx - 0.5, P.main.hz - 0.5], intensity: 1.15, amp: 0.2, cheap: q === 0 });
  group.add(lava.mesh);
  updaters.push(lava.update);

  // ================================================================== SPIRES, ROCKS, CALDERA
  const scen = new Batch();
  const scenGlow = new Batch();
  const spireCol = (v) => (v.y < LAVA + 0.8 ? new THREE.Color(0x8a2a14) : new THREE.Color(0x2c2630).lerp(new THREE.Color(0x4a3f4c), Math.random() * 0.5));
  // basalt column clusters & jagged spires in the lava (outside the play area)
  const spires = [[-38, -22, 9], [40, -26, 12], [-56, -48, 16], [58, -44, 14], [-30, -60, 8], [26, -58, 10], [-70, -6, 11], [72, -2, 13], [-20, 30, 6], [24, 34, 7], [0, -40, 6]].slice(0, [6, 9, 11][q]);
  for (const [x, z, h] of spires) {
    const n = 4 + Math.floor(R() * 5);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const rr = R() * 2.4;
      const hh = h * (0.4 + R() * 0.7);
      scen.add(hexColumn(hh + 3, 0.9 + R() * 0.7), M(x + Math.cos(a) * rr, LAVA - 3 + (hh + 3) / 2, z + Math.sin(a) * rr, (R() - 0.5) * 0.15, R() * 3, (R() - 0.5) * 0.15), spireCol);
    }
    scen.add(rockGeo(3.2 + R() * 2, 700 + x, 1, 1.8, 0.35), M(x + 2.5, LAVA + h * 0.3, z - 1.5, 0, R() * 3, 0), spireCol);
    scenGlow.add(new THREE.TorusGeometry(3.6, 0.25, 4, 14), M(x, LAVA + 0.1, z, Math.PI / 2, 0, 0), 0xffffff);
  }
  // low rocks near the stage base, glowing where they meet the lava
  for (let i = 0; i < [6, 10, 14][q]; i++) {
    const a = R() * Math.PI * 2;
    const x = Math.cos(a) * (16 + R() * 10);
    const z = Math.sin(a) * (11 + R() * 8);
    const r = 1 + R() * 2;
    scen.add(rockGeo(r, 800 + i, 1, 0.8, 0.3), M(x, LAVA + r * 0.2, z, 0, R() * 3, 0), spireCol);
  }
  // the caldera: a broad, low volcano behind the stage (low enough to show its glowing lake from the game camera)
  const VX = 6;
  const VZ = -96;
  const VR = 54;
  const VTOP = 3.5;
  const craterR = 17;
  {
    const nz = makeNoise2(9);
    const height = (x, z) => {
      const d = Math.hypot(x - VX, z - VZ);
      if (d < craterR) return VTOP - 1.6 - (craterR - d) * 0.05;
      const t = (d - craterR) / (VR - craterR);
      const cone = (VTOP - LAVA + 3) * Math.pow(Math.max(0, 1 - t), 1.6);
      const ridge = Math.abs(Math.sin(Math.atan2(z - VZ, x - VX) * 7)) * 2.5 * (1 - t);
      return Math.min(VTOP + 0.4, LAVA - 3 + cone + ridge + nz(x * 0.08, z * 0.08) * 1.2 * (1 - t));
    };
    const terr = terrainGeo({
      x0: VX - VR - 4, x1: VX + VR + 4, z0: VZ + VR + 4, z1: VZ - VR - 4, nx: q > 0 ? 56 : 32, nz: q > 0 ? 56 : 32, height,
      color: (x, y, z, ny) => {
        const d = Math.hypot(x - VX, z - VZ);
        if (y < LAVA + 0.6) return new THREE.Color(0x7a2414);
        if (d < craterR + 3) return new THREE.Color(0x5a2a26);
        return new THREE.Color(ny > 0.8 ? 0x3a3038 : 0x2a2230).lerp(new THREE.Color(0x4a3a44), (nz(x * 0.2, z * 0.2) + 1) * 0.3);
      },
    });
    scen.add(terr, null, (v, n, i) => new THREE.Color(terr.attributes.color.getX(i), terr.attributes.color.getY(i), terr.attributes.color.getZ(i)));
    // glowing lava lake in the crater + rivers down the front flank
    const lake = new THREE.Mesh(new THREE.CircleGeometry(craterR + 0.6, 32).rotateX(-Math.PI / 2), hotGlow);
    lake.position.set(VX, VTOP - 0.9, VZ);
    group.add(lake);
    const rivers = new Batch();
    for (let k = 0; k < (q > 0 ? 4 : 2); k++) {
      const a = Math.PI / 2 + (k - 1.5) * 0.42 + (R() - 0.5) * 0.2;
      const path = [];
      for (let i = 0; i <= 14; i++) {
        const d = craterR - 1 + i * ((VR - craterR) / 14);
        const wig = Math.sin(i * 0.9 + k) * 2.0;
        const x = VX + Math.cos(a) * d + Math.cos(a + Math.PI / 2) * wig;
        const z = VZ + Math.sin(a) * d + Math.sin(a + Math.PI / 2) * wig;
        path.push([x, height(x, z) + 0.35, z]);
      }
      const { geo } = ribbonGeo(path, path.map((_, i) => 0.9 + i * 0.07), [Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2)]);
      rivers.add(geo, null, new THREE.Color(k * 0.3, 0, 0));
    }
    const rv = rivers.mesh(lavaFall.mat, { name: 'lavaRivers' });
    rv.renderOrder = 4;
    group.add(rv);
    glowPoints.push([VX, VTOP + 1, VZ, 30]);
  }
  // distant ring of dark mountains to close the horizon
  {
    const nz = makeNoise2(19);
    const ring = new Batch();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const d = 210 + nz(i, 1) * 30;
      const h = 18 + (nz(i * 0.7, 3) + 1) * 22;
      ring.add(rockGeo(1, 900 + i, 1, 1, 0.45), M(Math.cos(a) * d, LAVA - 4, Math.sin(a) * d, 0, R() * 3, 0, 26 + R() * 18, h, 20 + R() * 10), (v) => new THREE.Color(0x231a22).lerp(new THREE.Color(0x4a2226), smooth(LAVA + h, LAVA, v.y)));
    }
    group.add(ring.mesh(rockMat, { receive: false, name: 'mountains' }));
  }
  group.add(scen.mesh(rockMat, { receive: true, name: 'spires' }));
  group.add(scenGlow.mesh(seamGlow, { name: 'spireGlow' }));

  // ================================================================== LIGHTS FROM THE LAVA
  if (q > 0) {
    const pl = [];
    const defs = q > 1 ? [[0, -7, 10, 0xff6a20, 120], [-14, -6, -6, 0xff5a1a, 70], [14, -6, -6, 0xff5a1a, 70]] : [[0, -7, 10, 0xff6a20, 120]];
    for (const [x, y, z, c, I] of defs) {
      const L = new THREE.PointLight(c, I, 40, 1.6);
      L.position.set(x, y, z);
      L.userData.base = I;
      group.add(L);
      pl.push(L);
    }
    updaters.push((t) => { pl.forEach((L, i) => { L.intensity = L.userData.base * (0.85 + 0.15 * Math.sin(t * 3.1 + i * 2) * Math.sin(t * 1.7 + i)); }); });
  }

  // ================================================================== SMOKE, EMBERS, PLUME
  if (q > 0) {
    const plume = makeParticles({
      count: q > 1 ? 60 : 30, seed: 2, life: 10, size: 9, grow: 3.0, sizeVar: 0.35, wobble: 2.5,
      spawn: (r) => [VX + (r() - 0.5) * 10, VTOP + 1, VZ + (r() - 0.5) * 10],
      vel: (r) => [1.5 + r() * 1.5, 5 + r() * 3, 1 + r() * 1.5],
      colorA: 0x6a4a4a, colorB: 0x2a2228, opacity: 0.85, map: smokeTexture(), fadeIn: 0.08, fadeOut: 0.55, name: 'plume',
    });
    group.add(plume.mesh);
    updaters.push(plume.update);
    const smoke = makeParticles({
      count: q > 1 ? 40 : 18, seed: 6, life: 8, size: 3.2, grow: 3.2, sizeVar: 0.4, wobble: 1.2,
      spawn: (r) => { const a = r() * Math.PI * 2; const d = 18 + r() * 30; return [Math.cos(a) * d * 1.3, LAVA + 0.5, Math.sin(a) * d - 8]; },
      vel: (r) => [(r() - 0.5) * 0.8, 1.5 + r() * 1.2, (r() - 0.5) * 0.8],
      colorA: 0x5a3a3a, colorB: 0x2a2028, opacity: 0.55, map: smokeTexture(), fadeIn: 0.1, fadeOut: 0.5, name: 'lavaSmoke',
    });
    group.add(smoke.mesh);
    updaters.push(smoke.update);
    const embers = makeParticles({
      count: q > 1 ? 160 : 70, seed: 7, life: 5, size: 0.14, grow: 0.5, sizeVar: 0.6, wobble: 1.6, spin: 2,
      spawn: (r) => { const a = r() * Math.PI * 2; const d = 4 + r() * 30; return [Math.cos(a) * d * 1.2, LAVA + r() * 6, Math.sin(a) * d * 0.9]; },
      vel: (r) => [(r() - 0.5) * 1.2, 2.5 + r() * 3, (r() - 0.5) * 1.2],
      colorA: 0xffc04a, colorB: 0xff3a10, intensity: 3.5, additive: true, fadeIn: 0.05, fadeOut: 0.55, name: 'embers',
    });
    group.add(embers.mesh);
    updaters.push(embers.update);
    const glows = makeGlows(glowPoints, { size: 2.2, color: 0xff7a2a, intensity: 1.3, flicker: 0.2, speed: 3 });
    group.add(glows.mesh);
    updaters.push(glows.update);
  }

  // ================================================================== HAZARD FLOURISH: caldera burst
  const flashes = makeFlashPool(group, { count: 6, color: 0xff8a3a, intensity: 4 });
  updaters.push((t) => flashes.update(t));
  let burstT = -100;
  let now = 0;
  function onHazard(evt) {
    if (!evt || (evt.kind && evt.kind !== 'geyser')) return;
    const big = evt.type === 'hazard';
    flashes.fire(VX, VTOP + 4, VZ, big ? 60 : 30, big ? 1.4 : 0.8, 0);
    if (big) flashes.fire(VX, VTOP + 12, VZ, 40, 1.8, 0.25);
    burstT = now;
  }

  // ------------------------------------------------------------------ update / dispose
  function update(time, dt) {
    now = time;
    const burst = Math.max(0, 1 - (time - burstT) / 2.5);
    const pulse = 0.8 + 0.2 * Math.sin(time * 1.7) + burst * 0.8;
    for (const m of emissiveMats) m.emissiveIntensity = m.userData.baseEmissive * pulse;
    lava.uniforms.uPulse.value = 0.92 + 0.08 * Math.sin(time * 1.3) + burst * 0.3;
    for (const fn of updaters) fn(time, dt);
  }
  function dispose() {
    disposeGroup(group, texList);
    unit.dispose();
  }

  return { group, sun, platformObjects, update, background, fog, dispose, onHazard };
}
