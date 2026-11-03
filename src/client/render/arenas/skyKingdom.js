// SKY KINGDOM — floating grass isle over a sea of clouds: rocky inverted-cone underside with roots, vines and glowing
// crystals, waterfalls pouring into the clouds, bobbing mini-isles, a drifting sky-skiff, distant islands and a castle.
import * as THREE from 'three';
import {
  Batch, M, rng, qLevel, vcMat, glowMat, toonMat, makeLights, makeSky, makeGlows, makeParticles, tubeGeo, jitter,
  canvasTexture, lerp, makeNoise2, cloudMaterial, makeCloudField, disposeGroup, makeGulls, smokeTexture,
  clothify, glowTexture, inkOutline,
} from './common.js';
import { makeCloudSea, ribbonGeo, waterfallMaterial } from './surfaces.js';
import { boardTexture, flagAtlas } from './textures.js';
import { hullGeometry, flagGeometry } from './ships.js';

const PAL = {
  grass: '#6cc94f',
  grassLight: '#93dd62',
  grassDark: '#4aa944',
  rim: 0xe6d6b0,
  rimGold: 0xe8b84a,
  rock: [0xb98a5e, 0xa7764e, 0xc89c6c, 0x9a6a4c, 0x8a6a7a, 0x7a5f80],
  skirt: 0x4fae4a,
  vine: 0x3f9a46,
  root: 0x7a5236,
  crystalA: 0x5ff3ff,
  crystalB: 0xff7ad9,
};

function grassCanvas(seed, size, opts = {}) {
  return canvasTexture(size, size, (g, w, h) => {
    const R = rng(seed);
    const cx = w / 2;
    const cy = h / 2;
    const rad = w / 2;
    g.fillStyle = opts.base || PAL.grass;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = R() < 0.5 ? (opts.light || PAL.grassLight) : (opts.dark || PAL.grassDark);
      g.globalAlpha = 0.18 + R() * 0.2;
      g.beginPath(); g.ellipse(R() * w, R() * h, 20 + R() * w * 0.12, 14 + R() * w * 0.08, R() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    // tufts
    g.lineWidth = Math.max(1.5, w / 600);
    for (let i = 0; i < size * 1.6; i++) {
      const x = R() * w;
      const y = R() * h;
      const s = (4 + R() * 7) * (w / 1024);
      g.strokeStyle = R() < 0.6 ? 'rgba(40,120,50,0.55)' : 'rgba(200,255,150,0.5)';
      g.beginPath(); g.moveTo(x - s * 0.6, y - s); g.lineTo(x, y); g.lineTo(x + s * 0.5, y - s * 1.1); g.stroke();
    }
    if (opts.decorate) opts.decorate(g, w, h, R);
    // flowers
    const fcols = opts.flowers || ['#ffffff', '#ffd6f2', '#ffe56b', '#ff9ccf', '#bfe3ff'];
    for (let c = 0; c < (opts.flowerClusters || 40); c++) {
      const a = R() * Math.PI * 2;
      const d = Math.sqrt(R()) * rad * 0.9;
      const x0 = cx + Math.cos(a) * d;
      const y0 = cy + Math.sin(a) * d;
      if (opts.avoid && opts.avoid(x0, y0)) continue;
      const col = fcols[Math.floor(R() * fcols.length)];
      for (let k = 0; k < 6; k++) {
        const x = x0 + (R() - 0.5) * 30 * (w / 1024);
        const y = y0 + (R() - 0.5) * 30 * (w / 1024);
        const s = (2.5 + R() * 2) * (w / 1024);
        g.fillStyle = col;
        for (let p = 0; p < 5; p++) { const pa = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(pa) * s, y + Math.sin(pa) * s, s * 0.8, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ffcf3d';
        g.beginPath(); g.arc(x, y, s * 0.6, 0, Math.PI * 2); g.fill();
      }
    }
    // stone rim ring at the very edge (reads as the boundary)
    const rw = (opts.rimWidth || 0.035) * rad;
    g.strokeStyle = opts.rimColor || '#e8dcbc';
    g.lineWidth = rw;
    g.beginPath(); g.arc(cx, cy, rad - rw / 2 - 1, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(160,120,60,0.6)';
    g.lineWidth = Math.max(2, rw * 0.12);
    const segs = opts.rimSegs || 72;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (rad - rw - 1), cy + Math.sin(a) * (rad - rw - 1));
      g.lineTo(cx + Math.cos(a) * (rad - 1), cy + Math.sin(a) * (rad - 1));
      g.stroke();
    }
    g.strokeStyle = 'rgba(30,90,40,0.45)';
    g.lineWidth = Math.max(2, rw * 0.25);
    g.beginPath(); g.arc(cx, cy, rad - rw - 2, 0, Math.PI * 2); g.stroke();
  });
}

/** Inverted rocky cone (flat shaded, banded strata colours). */
function rockCone(r0, yTop, yBot, seed, { segs = 40, rings = 14, jag = 0.12, pow = 1.25, palette = PAL.rock } = {}) {
  const R = rng(seed);
  const nz = makeNoise2(seed);
  const pts = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = lerp(yTop, yBot, t);
    const rr = r0 * Math.pow(1 - t, pow) * (j === 0 ? 1 : 1);
    const row = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const k = j === 0 ? 1 : 1 + (nz(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + t * 6) * jag) + (R() - 0.5) * jag * 0.6;
      row.push([Math.cos(a) * rr * k, y + (j > 0 && j < rings ? (R() - 0.5) * (yTop - yBot) / rings * 0.5 : 0), Math.sin(a) * rr * k]);
    }
    pts.push(row);
  }
  const pos = [];
  const col = [];
  const band = (y) => {
    const t = (yTop - y) / (yTop - yBot);
    const idx = Math.floor(t * palette.length * 1.6 + nz(y, 3) * 1.2);
    return new THREE.Color(palette[((idx % palette.length) + palette.length) % palette.length]);
  };
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = pts[j][i];
      const b = pts[j][(i + 1) % segs];
      const c = pts[j + 1][i];
      const d = pts[j + 1][(i + 1) % segs];
      const tris = j === rings - 1 ? [[a, b, c]] : [[a, b, c], [b, d, c]];
      for (const tri of tris) {
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const cc = band(cy).multiplyScalar(0.92 + R() * 0.12);
        for (const v of tri) { pos.push(...v); col.push(cc.r, cc.g, cc.b); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // ensure outward normals
  const n = g.attributes.normal;
  const p = g.attributes.position;
  let inward = 0;
  for (let i = 0; i < n.count; i += 3) if (n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i) < 0) inward++;
  if (inward > n.count / 6) {
    const arr = p.array;
    const carr = g.attributes.color.array;
    for (let i = 0; i < arr.length; i += 9) for (let k = 0; k < 3; k++) {
      const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t;
      const u = carr[i + 3 + k]; carr[i + 3 + k] = carr[i + 6 + k]; carr[i + 6 + k] = u;
    }
    g.computeVertexNormals();
  }
  g.userData.surface = (a, t) => {
    // approximate surface point at angle a and depth fraction t
    const rr = r0 * Math.pow(1 - t, pow);
    return [Math.cos(a) * rr, lerp(yTop, yBot, t), Math.sin(a) * rr];
  };
  return g;
}

function crystalGeo(len, rad) {
  const g = new THREE.CylinderGeometry(rad, rad, len * 0.7, 6, 1);
  const tip = new THREE.ConeGeometry(rad, len * 0.3, 6, 1);
  tip.translate(0, len * 0.5, 0);
  const tail = new THREE.ConeGeometry(rad, len * 0.12, 6, 1);
  tail.rotateX(Math.PI);
  tail.translate(0, -len * 0.41, 0);
  const b = new Batch();
  b.add(g); b.add(tip); b.add(tail);
  const geo = b.geometry();
  geo.translate(0, len * 0.41, 0);
  return geo;
}

export function buildSkyKingdom(ctx) {
  const q = qLevel(ctx.quality);
  const A = ctx.arena;
  const group = new THREE.Group();
  group.name = 'arena:sky_kingdom';
  const updaters = [];
  const R = rng(2024);
  const CLOUDS = A.blast.minY + 3;
  const P = Object.fromEntries(A.platforms.map((p) => [p.id, p]));
  const platformObjects = {};

  // ------------------------------------------------------------------ lights / sky / fog
  const HORIZON = 0xeecbe4;
  const { sun, sunDir } = makeLights(group, {
    sunColor: 0xfff3e0, sunIntensity: 2.45, dir: [-0.5, 1.0, 0.55],
    hemiSky: 0xcfe2ff, hemiGround: 0xc9a6d8, hemiIntensity: 1.2,
  });
  const sky = makeSky({
    top: 0x4a98ec, mid: 0x93c8f6, horizon: HORIZON, below: 0xe2c4e4,
    sunDir: new THREE.Vector3(-0.4, 0.35, -0.8), sunColor: 0xfff0d0, sunGlow: 1.0, sunDisc: 2.5,
    clouds: { seed: 61, count: 26, lit: '#f2eef8', shade: '#cdbdec', rim: '#fbf6fb', low: 4, wisps: 14 },
    cloudBand: 0.7,
  });
  group.add(sky.mesh);
  updaters.push(sky.update);
  const fog = new THREE.Fog(HORIZON, 70, 420);
  const background = new THREE.Color(HORIZON);

  // ------------------------------------------------------------------ materials
  const plainMat = vcMat({ rim: 0.3, rimColor: 0xfff4fb });
  const rockMat = vcMat({ rim: 0.25, rimColor: 0xffe8f6 });
  const crystalMat = toonMat(0xffffff, { vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.9, rim: 0.6, rimColor: 0xffffff });
  crystalMat.vertexColors = true;
  // emissive follows the vertex colour: patch the toon shader so emissive = vColor * k
  crystalMat.onBeforeCompile = ((prev) => (shader, r) => {
    prev.call(crystalMat, shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;');
  })(crystalMat.onBeforeCompile);
  crystalMat.customProgramCacheKey = () => 'toon-rim-crystal';
  const cloudMat = cloudMaterial({ lit: 0xe8e3f4, shade: 0xb9abe2, mid: 0xd6cdef, rim: 0xffffff, rimK: 0.1, sunDir });
  const wfall = waterfallMaterial({ water: 0x6fc6ec, foam: 0xdaf0fa, speed: 1.4, opacity: 0.9, glow: 1.0, scale: [7, 2.5] });
  updaters.push(wfall.update);
  const boardTex = boardTexture(21);
  const woodMat = vcMat({ map: boardTex, rim: 0.3 });
  const flagTex = flagAtlas();
  const flagMat = clothify(vcMat({ map: flagTex, side: THREE.DoubleSide, rim: 0.1 }), { amp: 0.22, billow: 0, freq: 1.3, speed: 7, spatial: 0.2 });
  const glowPoints = [];

  // ================================================================== MAIN ISLAND
  const mainP = P.main;
  const wfAngles = [Math.PI * 1.08, -Math.PI * 0.16];
  {
    const p = mainP;
    const root = new THREE.Group();
    root.name = 'platform:main';
    root.position.set(p.x, p.top, p.z);
    const r = p.r;
    const toUV = (x, z) => [(x / r + 1) / 2, 1 - (z / r + 1) / 2];
    const grassTex = grassCanvas(5, 1024, {
      rimWidth: 0.04,
      flowerClusters: 55,
      avoid: (x, y) => Math.hypot(x - 512, y - 512) < 150,
      decorate: (g, w, h, Rr) => {
        const cx = w / 2;
        const cy = h / 2;
        const s = w / (2 * r);
        // stepping-stone ring
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2 + 0.06;
          const rr = 5.6 * s;
          g.fillStyle = '#e0d2b2';
          g.strokeStyle = 'rgba(120,90,60,0.55)';
          g.lineWidth = 3;
          g.beginPath(); g.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.42 * s, 0.3 * s, a, 0, Math.PI * 2); g.fill(); g.stroke();
        }
        // central sun mosaic
        g.fillStyle = '#e2d4b4'; g.beginPath(); g.arc(cx, cy, 2.2 * s, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(120,90,60,0.6)'; g.lineWidth = 4; g.stroke();
        g.fillStyle = '#3ec6c9';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.beginPath();
          g.moveTo(cx + Math.cos(a - 0.12) * 0.9 * s, cy + Math.sin(a - 0.12) * 0.9 * s);
          g.lineTo(cx + Math.cos(a) * 2.0 * s, cy + Math.sin(a) * 2.0 * s);
          g.lineTo(cx + Math.cos(a + 0.12) * 0.9 * s, cy + Math.sin(a + 0.12) * 0.9 * s);
          g.fill();
        }
        g.fillStyle = '#ffcf4a'; g.beginPath(); g.arc(cx, cy, 0.85 * s, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(cx - 0.2 * s, cy - 0.2 * s, 0.35 * s, 0, Math.PI * 2); g.fill();
        // springs + streams running to the waterfall points
        for (const a of wfAngles) {
          const ex = Math.cos(a) * r;
          const ez = Math.sin(a) * r;
          const sx = Math.cos(a) * (r - 3.2);
          const sz = Math.sin(a) * (r - 3.2);
          const [u0, v0] = toUV(sx, sz);
          const [u1, v1] = toUV(ex, ez);
          const px0 = u0 * w; const py0 = (1 - v0) * h;
          const px1 = u1 * w; const py1 = (1 - v1) * h;
          g.lineCap = 'round';
          g.strokeStyle = '#3f8fc9'; g.lineWidth = 0.95 * s;
          g.beginPath(); g.moveTo(px0, py0); g.quadraticCurveTo((px0 + px1) / 2 + 12, (py0 + py1) / 2 - 10, px1, py1); g.stroke();
          g.strokeStyle = '#7fd8ff'; g.lineWidth = 0.65 * s;
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.12 * s;
          g.setLineDash([0.4 * s, 0.6 * s]); g.stroke(); g.setLineDash([]);
          g.fillStyle = '#3f8fc9'; g.beginPath(); g.ellipse(px0, py0, 1.25 * s, 0.95 * s, a, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#7fd8ff'; g.beginPath(); g.ellipse(px0, py0, 1.0 * s, 0.75 * s, a, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(px0 - 0.3 * s, py0 - 0.2 * s, 0.35 * s, 0.15 * s, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#efe4c8'; g.lineWidth = 0.25 * s; g.beginPath(); g.ellipse(px0, py0, 1.32 * s, 1.02 * s, a, 0, Math.PI * 2); g.stroke();
        }
      },
    });
    const top = new THREE.Mesh(new THREE.CircleGeometry(r, q > 0 ? 72 : 48).rotateX(-Math.PI / 2), toonMat(0xffffff, { map: grassTex, rim: 0.05 }));
    top.receiveShadow = true;
    top.name = 'grass';
    root.add(top);
    const plain = new Batch();
    const rock = new Batch();
    const crys = new Batch();
    const segs = q > 0 ? 72 : 48;
    // bright stone rim band + gold line + grassy jagged skirt
    plain.add(new THREE.CylinderGeometry(r + 0.06, r + 0.02, 0.5, segs, 1, true), M(0, -0.25, 0), PAL.rim);
    plain.add(new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.1, segs, 1, true), M(0, -0.52, 0), PAL.rimGold);
    {
      const sk = new THREE.CylinderGeometry(r + 0.04, r - 0.2, 1.0, segs, 2, true);
      const pa = sk.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        if (pa.getY(i) < -0.4) {
          const a = Math.atan2(pa.getZ(i), pa.getX(i));
          pa.setY(i, pa.getY(i) - 0.35 - Math.abs(Math.sin(a * 23)) * 0.7 - Math.abs(Math.sin(a * 7 + 1)) * 0.4);
        }
      }
      sk.computeVertexNormals();
      plain.add(sk, M(0, -1.06, 0), PAL.skirt);
    }
    // rocky underside
    const cone = rockCone(r - 0.25, -1.0, -19, 77, { segs: q > 0 ? 40 : 24, rings: q > 0 ? 14 : 9, jag: 0.14 });
    rock.add(cone, null, (v, n, i) => new THREE.Color(cone.attributes.color.getX(i), cone.attributes.color.getY(i), cone.attributes.color.getZ(i)));
    // roots & vines dangling from the underside
    const nv = [10, 22, 34][q];
    for (let k = 0; k < nv; k++) {
      const a = R() * Math.PI * 2;
      const t = 0.02 + R() * 0.45;
      const s = cone.userData.surface(a, t);
      const len = 2 + R() * 5;
      const isVine = R() < 0.65;
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const f = i / 5;
        pts.push([s[0] * (1 + f * 0.04) + Math.sin(f * 3 + k) * 0.3, s[1] - f * len, s[2] * (1 + f * 0.04) + Math.cos(f * 3 + k) * 0.3]);
      }
      plain.add(tubeGeo(pts, isVine ? 0.07 : 0.11, 4, 10), null, isVine ? PAL.vine : PAL.root);
      if (isVine) for (let i = 1; i < 5; i++) {
        const pp = pts[i];
        plain.add(new THREE.ConeGeometry(0.18, 0.4, 4), M(pp[0], pp[1], pp[2], R() * 3, R() * 3, R() * 3), jitter(0x55c25a, R, 0.1));
      }
    }
    // hanging grass/flower tufts under the rim
    for (let k = 0; k < [16, 30, 44][q]; k++) {
      const a = R() * Math.PI * 2;
      plain.add(new THREE.SphereGeometry(0.45 + R() * 0.3, 6, 4), M(Math.cos(a) * (r - 0.25), -1.25 - R() * 0.5, Math.sin(a) * (r - 0.25), 0, 0, 0, 1, 0.7, 1), jitter(0x5ab84e, R, 0.12));
      if (R() < 0.5) plain.add(new THREE.SphereGeometry(0.13, 5, 3), M(Math.cos(a) * (r + 0.05), -1.25 - R() * 0.4, Math.sin(a) * (r + 0.05)), [0xffffff, 0xffb8e6, 0xffe56b][Math.floor(R() * 3)]);
    }
    // crystal clusters in the rock
    const nc = [5, 9, 13][q];
    for (let k = 0; k < nc; k++) {
      const a = (k / nc) * Math.PI * 2 + R() * 0.4;
      const t = 0.12 + R() * 0.5;
      const s = cone.userData.surface(a, t);
      const col = k % 3 === 0 ? PAL.crystalB : PAL.crystalA;
      const out = new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize();
      for (let i = 0; i < 4 + Math.floor(R() * 3); i++) {
        const d = out.clone().add(new THREE.Vector3((R() - 0.5) * 0.9, (R() - 0.5) * 0.6, (R() - 0.5) * 0.9)).normalize();
        const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        const len = 0.9 + R() * 1.6;
        crys.add(crystalGeo(len, len * 0.16), new THREE.Matrix4().compose(new THREE.Vector3(s[0] * 0.97, s[1], s[2] * 0.97), qq, new THREE.Vector3(1, 1, 1)), col);
      }
      glowPoints.push([s[0] + out.x, s[1] + out.y, s[2] + out.z, 2.2, col]);
    }
    // waterfalls: spout under the rim, ribbon falling into the clouds
    const wb = new Batch();
    wfAngles.forEach((a, wi) => {
      const big = wi === 0;
      const ex = Math.cos(a);
      const ez = Math.sin(a);
      const side = [-ez, 0, ex];
      const path = [];
      const n = 16;
      const drop = -CLOUDS + 1;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const out = r + 0.12 + Math.sqrt(t) * (big ? 2.6 : 1.8) + t * 0.6;
        path.push([ex * out, -0.15 - t * t * 0 - t * drop, ez * out]);
      }
      // first segment curves over the lip
      path[0] = [ex * (r - 0.6), 0.02, ez * (r - 0.6)];
      path[1] = [ex * (r + 0.18), -0.4, ez * (r + 0.18)];
      const w0 = big ? 1.5 : 1.0;
      const { geo } = ribbonGeo(path, path.map((_, i) => w0 * (1 + (i / n) * 0.9)), side);
      wb.add(geo, null, new THREE.Color(wi * 0.37, 0, 0));
      // stone lip where the stream leaves the island (flush with the top)
      plain.add(new THREE.BoxGeometry(w0 + 0.7, 0.5, 0.9), M(ex * (r - 0.4), -0.26, ez * (r - 0.4), 0, -a + Math.PI / 2, 0), 0xe9dcbc);
    });
    const wmesh = wb.mesh(wfall.mat, { name: 'waterfalls' });
    wmesh.renderOrder = 5;
    root.add(wmesh);
    for (const [b, m, o] of [[plain, plainMat, { cast: true, receive: true }], [rock, rockMat, { cast: true, receive: true }], [crys, crystalMat, {}]]) {
      const mesh = b.mesh(m, o);
      if (mesh) root.add(mesh);
      if (mesh && b === rock && q > 0) inkOutline(mesh, 0.08, 0x3a2036);
    }
    // mist where the falls hit the cloud sea
    if (q > 0) {
      const mist = makeParticles({
        count: q > 1 ? 40 : 20, seed: 4, life: 3, size: 2.4, grow: 2.2, sizeVar: 0.4,
        spawn: (rr, i) => { const a = wfAngles[i % 2]; const o = r + 3.2; return [Math.cos(a) * o + (rr() - 0.5) * 2, CLOUDS + 0.8, Math.sin(a) * o + (rr() - 0.5) * 2]; },
        vel: (rr) => [(rr() - 0.5) * 1.5, 1.2 + rr() * 1.2, (rr() - 0.5) * 1.5],
        colorA: 0xffffff, colorB: 0xe8f4ff, opacity: 0.7, map: smokeTexture(), fadeIn: 0.15, fadeOut: 0.5, name: 'mist',
      });
      root.add(mist.mesh);
      updaters.push(mist.update);
    }
    platformObjects.main = root;
    group.add(root);
  }

  // ================================================================== BOBBING MINI-ISLES (soft)
  const isleTex = grassCanvas(9, 512, { base: '#86d65e', light: '#b2e978', dark: '#63bf52', rimWidth: 0.09, rimColor: '#f2e4c4', rimSegs: 24, flowerClusters: 14, flowers: ['#ffffff', '#ffc7ec', '#ff9ccf'] });
  const isleTopMat = toonMat(0xffffff, { map: isleTex, rim: 0.05 });
  for (const id of ['isleA', 'isleB']) {
    const p = P[id];
    const root = new THREE.Group();
    root.name = 'platform:' + id;
    root.position.set(p.x, p.top, p.z);
    const r = p.r;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), isleTopMat);
    top.receiveShadow = true;
    root.add(top);
    const plain = new Batch();
    const crys = new Batch();
    plain.add(new THREE.CylinderGeometry(r + 0.05, r, 0.3, 40, 1, true), M(0, -0.15, 0), 0xeee0bc);
    plain.add(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 0.07, 40, 1, true), M(0, -0.33, 0), PAL.rimGold);
    const cone = rockCone(r - 0.2, -0.36, -3.0, id === 'isleA' ? 5 : 6, { segs: 18, rings: 5, jag: 0.12, pow: 1.5, palette: [0xd8b088, 0xc99e76, 0xe0bc92, 0xb98a6a] });
    plain.add(cone, null, (v, n, i) => new THREE.Color(cone.attributes.color.getX(i), cone.attributes.color.getY(i), cone.attributes.color.getZ(i)));
    // dangling crystal + tufts
    const col = id === 'isleA' ? PAL.crystalA : PAL.crystalB;
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Vector3((R() - 0.5) * 0.8, -1, (R() - 0.5) * 0.8).normalize();
      const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      crys.add(crystalGeo(0.7 + R() * 0.9, 0.16), new THREE.Matrix4().compose(new THREE.Vector3((R() - 0.5) * 0.6, -2.4, (R() - 0.5) * 0.6), qq, new THREE.Vector3(1, 1, 1)), col);
    }
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      plain.add(new THREE.SphereGeometry(0.28, 6, 4), M(Math.cos(a) * (r - 0.15), -0.55, Math.sin(a) * (r - 0.15), 0, 0, 0, 1, 0.6, 1), jitter(0x63bf52, R, 0.1));
    }
    for (let k = 0; k < 3; k++) {
      const a = R() * Math.PI * 2;
      const s = [Math.cos(a) * (r - 0.6), -0.6, Math.sin(a) * (r - 0.6)];
      plain.add(tubeGeo([s, [s[0] * 1.02, s[1] - 1.2, s[2] * 1.02], [s[0] * 0.98, s[1] - 2.2 - R(), s[2] * 0.98]], 0.05, 4, 6), null, PAL.vine);
    }
    for (const [b, m, o] of [[plain, plainMat, { cast: true, receive: true }], [crys, crystalMat, {}]]) {
      const mesh = b.mesh(m, o);
      if (mesh) root.add(mesh);
      if (mesh && b === plain && q > 0) inkOutline(mesh, 0.035, 0x3a2036);
    }
    // per-isle glow halo (moves with the isle)
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(col).multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(2.4);
    halo.position.set(0, -2.6, 0);
    halo.onBeforeRender = (rr, s, cam) => { const pp = new THREE.Vector3().setFromMatrixPosition(halo.matrixWorld); halo.matrixWorld.compose(pp, cam.quaternion, halo.scale); };
    halo.renderOrder = 12;
    if (q > 0) root.add(halo);
    platformObjects[id] = root;
    group.add(root);
  }

  // ================================================================== DRIFTING SKY-SKIFF (soft, moves along x)
  let propeller = null;
  {
    const p = P.drifter;
    const root = new THREE.Group();
    root.name = 'platform:drifter';
    root.position.set(p.x, p.top, p.z);
    const hx = p.hx;
    const hz = p.hz;
    const wood = new Batch();
    const plain = new Batch();
    const n = Math.round((2 * hz) / 0.5);
    for (let i = 0; i < n; i++) {
      const z = -hz + 0.35 + ((2 * hz - 0.7) / n) * (i + 0.5);
      wood.add(new THREE.BoxGeometry(1, 1, 1), M(0, -0.09, z, 0, 0, 0, 2 * hx - 0.7, 0.18, (2 * hz - 0.7) / n - 0.05), jitter([0xd59a62, 0xc98c56, 0xdfa66c][i % 3], R, 0.06));
    }
    // painted trim frame (teal + gold), flush with the deck
    for (const s of [-1, 1]) {
      wood.add(new THREE.BoxGeometry(1, 1, 1), M(0, -0.1, s * (hz - 0.175), 0, 0, 0, 2 * hx, 0.2, 0.35), 0x2fb7b0);
      wood.add(new THREE.BoxGeometry(1, 1, 1), M(s * (hx - 0.175), -0.1, 0, 0, 0, 0, 0.35, 0.2, 2 * hz - 0.7), 0x2fb7b0);
      plain.add(new THREE.BoxGeometry(1, 1, 1), M(0, -0.24, s * (hz + 0.03), 0, 0, 0, 2 * hx + 0.06, 0.08, 0.06), PAL.rimGold);
      plain.add(new THREE.BoxGeometry(1, 1, 1), M(s * (hx + 0.03), -0.24, 0, 0, 0, 0, 0.06, 0.08, 2 * hz), PAL.rimGold);
    }
    plain.add(new THREE.BoxGeometry(1, 1, 1), M(0, -0.4, 0, 0, 0, 0, 2 * hx - 0.1, 0.4, 2 * hz - 0.1), 0x8a5a36);
    // little boat hull underneath
    const { geo } = hullGeometry({ L: 2 * hx - 0.2, W: hz * 0.75, D: 1.0, H: 0.0, sheer: 0.35, sternRise: 0.0, segL: 14, segS: 8 });
    plain.add(geo, M(0, -0.55, 0), (v) => (v.y < -1.1 ? new THREE.Color(0xe8b84a) : new THREE.Color(0xf6f0e2)));
    // side fins (cloth wings) angled down, below deck
    for (const s of [-1, 1]) {
      const fin = new THREE.BufferGeometry();
      fin.setAttribute('position', new THREE.Float32BufferAttribute([-1.2, 0, 0, 1.0, 0, 0, -0.6, -0.9, 1.4], 3));
      fin.computeVertexNormals();
      wood.add(fin, M(0.3, -0.6, s * (hz * 0.72), 0, s > 0 ? 0 : Math.PI, 0, 1, 1, 1), 0xfff4dc); // flat: keep out of the outlined batch
      plain.add(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 4), M(-0.25, -1.05, s * (hz * 0.72 + 0.7), s * 0.95, 0, 0), 0x6b4426);
    }
    // stern lanterns + bow figurehead
    for (const s of [-1, 1]) {
      plain.add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 4), M(-hx + 0.25, -0.5, s * (hz - 0.25)), 0x3a3a46);
      const lg = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), glowMat(0xffd27a, 3));
      lg.position.set(-hx + 0.25, -0.85, s * (hz - 0.25));
      root.add(lg);
    }
    plain.add(new THREE.SphereGeometry(0.3, 8, 6), M(hx + 0.05, -0.75, 0), PAL.rimGold);
    plain.add(new THREE.ConeGeometry(0.22, 0.6, 6), M(hx + 0.35, -0.75, 0, 0, 0, -Math.PI / 2), PAL.rimGold);
    // flag on a short stern pole hanging off the back (below deck height, pointing aft)
    const fb = new Batch({ aWave: 1 });
    fb.add(flagGeometry(1.2, 0.7, 3, true), M(-hx - 0.1, -0.85, -0.5, 0, Math.PI, 0), 0xffffff);
    plain.add(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), M(-hx - 0.05, -0.8, -0.5, 0, 0, Math.PI / 2), 0x6b4426);
    // propeller at the stern
    const prop = new Batch();
    for (let k = 0; k < 3; k++) prop.add(new THREE.BoxGeometry(0.06, 0.7, 0.18), M(0, 0, 0, k * (Math.PI * 2 / 3), 0, 0, 1, 1, 1).multiply(M(0, 0.32, 0)), 0xd9473a);
    prop.add(new THREE.SphereGeometry(0.16, 6, 4), null, PAL.rimGold);
    propeller = prop.mesh(plainMat, { dynamic: true });
    propeller.position.set(-hx - 0.4, -1.0, 0);
    root.add(propeller);
    plain.add(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 5), M(-hx - 0.1, -1.0, 0, 0, 0, Math.PI / 2), 0x3a3a46);
    for (const [b, m, o] of [[wood, woodMat, { cast: true, receive: true }], [plain, plainMat, { cast: true, receive: true }], [fb, flagMat, {}]]) {
      const mesh = b.mesh(m, o);
      if (mesh) root.add(mesh);
      if (mesh && b === plain && q > 0) inkOutline(mesh, 0.03, 0x2a1a24);
    }
    // cloud puffs carrying the skiff
    const puffs = makeCloudField([{ x: 0.2, y: -1.65, z: 0, s: 1.05, n: 6, depth: 1.6, flat: 0.55 }], cloudMat, { seed: 3, segs: [10, 7] });
    puffs.mesh.castShadow = false;
    root.add(puffs.mesh);
    platformObjects.drifter = root;
    group.add(root);
  }

  // ================================================================== CLOUD SEA + CLOUD FIELDS
  const sea = makeCloudSea({ y: CLOUDS - 1.2, lit: 0xe4def2, shade: 0xbcaee4, deep: 0x9fb2e8, sunDir, size: 1000 });
  group.add(sea.mesh);
  updaters.push(sea.update);
  {
    const clusters = [];
    const nSea = [26, 46, 70][q];
    for (let i = 0; i < nSea; i++) {
      const a = R() * Math.PI * 2;
      const d = 14 + Math.pow(R(), 0.7) * 150;
      clusters.push({ x: Math.cos(a) * d, y: CLOUDS - 0.6 + R() * 1.5, z: Math.sin(a) * d - 10, s: 3 + R() * 5 + d * 0.03, n: 5 + Math.floor(R() * 4), rot: R() * 3, depth: 1.4, flat: 0.5, speed: 0.6 + R() * 0.8 });
    }
    // floating cloud banks in the sky (kept away from the play area)
    const nSky = [6, 12, 20][q];
    for (let i = 0; i < nSky; i++) {
      const a = Math.PI * (1.05 + R() * 0.9);
      const d = 60 + R() * 120;
      clusters.push({ x: Math.cos(a) * d * 1.4, y: 2 + R() * 26, z: Math.sin(a) * d, s: 4 + R() * 5, n: 6 + Math.floor(R() * 4), rot: R(), depth: 1.0, flat: 0.62, speed: 1 });
    }
    const field = makeCloudField(clusters, cloudMat, { seed: 12, segs: q > 0 ? [12, 8] : [9, 6], drift: 0.6, wrap: 230 });
    group.add(field.mesh);
    updaters.push(field.update);
  }

  // ================================================================== DISTANT FLOATING ISLANDS + CASTLE
  const far = new Batch();
  const farCrys = new Batch();
  const farFalls = new Batch();
  const isleDefs = [
    { x: -46, y: 2, z: -62, r: 9, h: 16, trees: 5 },
    { x: 54, y: 9, z: -70, r: 7, h: 13, trees: 4 },
    { x: -92, y: 16, z: -110, r: 11, h: 18, trees: 6 },
    { x: 96, y: -2, z: -40, r: 6, h: 10, trees: 3 },
    { x: 22, y: 20, z: -150, r: 8, h: 14, trees: 4 },
    { x: -70, y: -4, z: 10, r: 6, h: 10, trees: 3 },
    { x: 78, y: 12, z: 18, r: 5, h: 8, trees: 2 },
  ].slice(0, [4, 6, 7][q]);
  isleDefs.forEach((d, i) => {
    const cone = rockCone(d.r, d.y - 0.6, d.y - d.h, 300 + i, { segs: q > 0 ? 18 : 12, rings: 6, jag: 0.16 });
    far.add(cone, null, (v, n, k) => new THREE.Color(cone.attributes.color.getX(k), cone.attributes.color.getY(k), cone.attributes.color.getZ(k)));
    far.add(new THREE.CylinderGeometry(d.r * 1.02, d.r, 0.8, 18), M(d.x, d.y - 0.2, d.z), 0x6cc94f);
    // move cone to position (cone was built at origin)
    const last = far.parts[far.parts.length - 2];
    last.translate(d.x, 0, d.z);
    for (let k = 0; k < d.trees; k++) {
      const a = R() * Math.PI * 2;
      const rr = Math.sqrt(R()) * d.r * 0.7;
      const tx = d.x + Math.cos(a) * rr;
      const tz = d.z + Math.sin(a) * rr;
      const th = 1.5 + R() * 2;
      far.add(new THREE.CylinderGeometry(0.2, 0.3, th, 5), M(tx, d.y + th / 2, tz), 0x8a5a36);
      const fc = [0x58c06a, 0x7fd36a, 0xff9ccf, 0x4fae5a][Math.floor(R() * 4)];
      far.add(new THREE.SphereGeometry(1.2 + R() * 0.8, 8, 6), M(tx, d.y + th + 0.8, tz), fc);
      far.add(new THREE.SphereGeometry(0.9 + R() * 0.5, 7, 5), M(tx + 0.7, d.y + th + 0.3, tz + 0.3), fc);
    }
    for (let k = 0; k < 2; k++) {
      const a = R() * Math.PI * 2;
      const s = cone.userData.surface(a, 0.3 + R() * 0.3);
      for (let c = 0; c < 3; c++) {
        const dir = new THREE.Vector3(Math.cos(a) + (R() - 0.5) * 0.6, -0.3 + (R() - 0.5) * 0.5, Math.sin(a) + (R() - 0.5) * 0.6).normalize();
        farCrys.add(crystalGeo(1.5 + R() * 1.5, 0.35), new THREE.Matrix4().compose(new THREE.Vector3(d.x + s[0], s[1], d.z + s[2]), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1)), k ? PAL.crystalA : PAL.crystalB);
      }
    }
    if (i % 2 === 0) {
      // waterfall facing the stage
      const a = Math.atan2(-d.z, -d.x);
      const ex = Math.cos(a);
      const ez = Math.sin(a);
      const path = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; path.push([d.x + ex * (d.r + 0.2 + Math.sqrt(t) * 1.6), d.y - 0.1 - t * (d.y - CLOUDS + 1), d.z + ez * (d.r + 0.2 + Math.sqrt(t) * 1.6)]); }
      const { geo } = ribbonGeo(path, path.map((_, k) => 1.4 + k * 0.15), [-ez, 0, ex]);
      farFalls.add(geo, null, new THREE.Color(0.2 + i * 0.13, 0, 0));
    }
  });
  // sky castle on the big far island
  {
    const cx = -34;
    const cy = 1;
    const cz = -165;
    const cone = rockCone(22, cy - 1, cy - 34, 999, { segs: q > 0 ? 24 : 14, rings: 7, jag: 0.15 });
    cone.translate(cx, 0, cz);
    far.add(cone, null, (v, n, k) => new THREE.Color(cone.attributes.color.getX(k), cone.attributes.color.getY(k), cone.attributes.color.getZ(k)));
    far.add(new THREE.CylinderGeometry(22.4, 22, 1.4, 24), M(cx, cy - 0.3, cz), 0x6cc94f);
    const towers = [[0, 0, 4.5, 30, 0x8fd3e8], [-10, 4, 3, 20, 0xff9cc8], [10, 3, 3, 22, 0xb6a3f2], [-5, -6, 2.4, 16, 0x8fd3e8], [6, -7, 2.6, 18, 0xff9cc8], [-15, -4, 2, 12, 0xb6a3f2], [15, -5, 2, 13, 0x8fd3e8]];
    for (const [dx, dz, r, h, roof] of towers) {
      far.add(new THREE.CylinderGeometry(r, r * 1.08, h, 12), M(cx + dx, cy + h / 2, cz + dz), 0xfaf3ea);
      far.add(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.6, 12), M(cx + dx, cy + h, cz + dz), 0xe8b84a);
      far.add(new THREE.ConeGeometry(r * 1.25, r * 2.6, 12), M(cx + dx, cy + h + r * 1.3, cz + dz), roof);
      far.add(new THREE.SphereGeometry(r * 0.22, 6, 4), M(cx + dx, cy + h + r * 2.65, cz + dz), 0xffd34d);
      for (let k = 0; k < 3; k++) far.add(new THREE.BoxGeometry(0.6, 1.4, 0.2), M(cx + dx, cy + h * (0.4 + k * 0.18), cz + dz + r + 0.05), 0x4a6aa8);
    }
    far.add(new THREE.BoxGeometry(24, 8, 10), M(cx, cy + 4, cz - 1), 0xf2eadc);
    far.add(new THREE.BoxGeometry(25, 0.6, 11), M(cx, cy + 8.2, cz - 1), 0xe8b84a);
    farFalls.add(ribbonGeo([[cx + 12, cy - 0.5, cz + 21], [cx + 12.5, cy - 8, cz + 23], [cx + 13, CLOUDS, cz + 25]], [3, 4, 5], [1, 0, 0]).geo, null, new THREE.Color(0.77, 0, 0));
  }
  group.add(far.mesh(rockMat, { receive: false, name: 'farIslands' }));
  group.add(farCrys.mesh(crystalMat, { name: 'farCrystals' }));
  {
    const m = farFalls.mesh(wfall.mat, { name: 'farFalls' });
    m.renderOrder = 4;
    group.add(m);
  }

  // drifting crystal shards around (outside the play area)
  let shards = null;
  if (q > 0) {
    const n = q > 1 ? 14 : 8;
    const geo = crystalGeo(1.6, 0.35);
    const colors = [];
    const cpos = [];
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const d = 34 + R() * 26;
      cpos.push({ x: Math.cos(a) * d, y: -6 + R() * 22, z: Math.sin(a) * d * 0.8 - 8, ph: R() * 6, s: 0.8 + R() * 1.2 });
      colors.push(R() < 0.6 ? PAL.crystalA : PAL.crystalB);
    }
    const b = new Batch();
    b.add(geo);
    const g2 = b.geometry();
    shards = new THREE.InstancedMesh(g2, crystalMat, n);
    shards.name = 'shards';
    for (let i = 0; i < n; i++) shards.setColorAt(i, new THREE.Color(colors[i]));
    // instance colour multiplies vertex colour (white) -> per-shard tint incl. emissive via vColor
    const m4 = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    updaters.push((t) => {
      for (let i = 0; i < n; i++) {
        const c = cpos[i];
        qq.setFromEuler(new THREE.Euler(Math.sin(t * 0.3 + c.ph) * 0.5, t * 0.4 + c.ph, 0.3));
        m4.compose(new THREE.Vector3(c.x, c.y + Math.sin(t * 0.8 + c.ph) * 0.8, c.z), qq, new THREE.Vector3(c.s, c.s, c.s));
        shards.setMatrixAt(i, m4);
      }
      shards.instanceMatrix.needsUpdate = true;
    });
    group.add(shards);
  }

  // sparkle motes + crystal halos
  if (q > 0) {
    const motes = makeParticles({
      count: q > 1 ? 70 : 35, seed: 31, life: 6, size: 0.22, grow: 0.6, sizeVar: 0.5, wobble: 0.8,
      spawn: (rr) => { const a = rr() * Math.PI * 2; const d = 12 + rr() * 24; return [Math.cos(a) * d, -10 + rr() * 22, Math.sin(a) * d - 4]; },
      vel: (rr) => [(rr() - 0.5) * 0.4, 0.4 + rr() * 0.5, (rr() - 0.5) * 0.4],
      colorA: 0xfff6c8, colorB: 0xbff8ff, intensity: 2.4, additive: true, fadeIn: 0.25, fadeOut: 0.6, name: 'motes',
    });
    group.add(motes.mesh);
    updaters.push(motes.update);
    const glows = makeGlows(glowPoints.map((g) => [g[0], g[1], g[2], g[3]]), { size: 1.2, color: 0x9ff6ff, intensity: 0.9, flicker: 0.25, speed: 2.2 });
    group.add(glows.mesh);
    updaters.push(glows.update);
  }
  // white birds
  if (q > 0) {
    const g = makeGulls({ n: q > 1 ? 9 : 5, seed: 41, area: [[-70, 70], [-90, -40]], height: [6, 20], scale: 1.3 });
    group.add(g.mesh);
    updaters.push(g.update);
  }

  // ================================================================== HAZARD FLOURISH: gust streaks
  const gust = makeGustPool(group, q > 0 ? 14 : 6);
  updaters.push(gust.update);
  let now = 0;
  function onHazard(evt) {
    if (!evt || (evt.kind && evt.kind !== 'wind')) return;
    const dir = typeof evt.dir === 'number' ? Math.sign(evt.dir) || 1 : (evt.dir && evt.dir.x ? Math.sign(evt.dir.x) : 1);
    gust.fire(now, dir, evt.type === 'hazardWarn' ? 0.5 : 1);
  }

  // ------------------------------------------------------------------ update / dispose
  const crystalBase = 0.9;
  function update(time, dt) {
    now = time;
    flagMat.userData.uTime.value = time;
    crystalMat.emissiveIntensity = crystalBase + 0.55 * (0.5 + 0.5 * Math.sin(time * 2.1));
    if (propeller) propeller.rotation.x = time * 14;
    for (const fn of updaters) fn(time, dt);
  }
  function dispose() {
    disposeGroup(group, [boardTex, flagTex, isleTex]);
  }
  return { group, sun, platformObjects, update, background, fog, dispose, onHazard };
}

/** Pool of long translucent wind streaks that sweep across the arena. */
function makeGustPool(parent, count) {
  const tex = canvasTexture(256, 32, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, h * 0.3, w, h * 0.4);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.5, 'rgba(0,0,0,1)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }, { srgb: false });
  const geo = new THREE.PlaneGeometry(1, 1);
  const items = [];
  const R = rng(55);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xf4fbff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.renderOrder = 16;
    m.userData.noShadow = true;
    parent.add(m);
    items.push({ m, t0: -10, y: 0, z: 0, dir: 1, len: 8, sp: 30, off: 0 });
  }
  return {
    fire(now, dir, strength) {
      const n = Math.round(count * strength);
      for (let i = 0; i < n; i++) {
        const it = items[i];
        it.t0 = now + R() * 0.6;
        it.y = -1 + R() * 12;
        it.z = -7 + R() * 11;
        it.dir = dir;
        it.len = 6 + R() * 9;
        it.sp = 60 + R() * 20;
        it.off = -30 - R() * 12;
      }
    },
    update(t) {
      for (const it of items) {
        const a = (t - it.t0) / 1.4;
        if (a < 0 || a > 1) { it.m.visible = false; continue; }
        it.m.visible = true;
        it.m.position.set(it.dir * (it.off + a * it.sp), it.y + Math.sin(a * 6 + it.z) * 0.4, it.z);
        it.m.scale.set(it.len, 0.9, 1);
        it.m.rotation.set(-0.3, 0, (it.z % 1) * 0.12);
        it.m.material.opacity = 0.9 * Math.sin(a * Math.PI);
      }
    },
  };
}
