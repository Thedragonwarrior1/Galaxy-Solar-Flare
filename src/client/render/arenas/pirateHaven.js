// PIRATE HAVEN — sun-drenched harbour: wooden dock on tall pilings, hanging cargo rafts, tall ships, town and lighthouse.
import * as THREE from 'three';
import {
  Batch, M, between, rng, qLevel, vcMat, glowMat, toonMat, makeLights, makeSky, makeGlows, rockGeo, tubeGeo,
  sagPoints, jitter, makeNoise2, terrainGeo, prismGeo, clothify, canvasTexture, smooth, makeFlashPool,
  disposeGroup, inkOutline, makeBeam, smokeTexture,
} from './common.js';
import { makeOcean, makeFoamRings } from './surfaces.js';
import { boardTexture, plankTexture, ropeTexture, sailAtlas, flagAtlas, star } from './textures.js';
import { buildShip, shipMaterials, flagGeometry, hullGeometry } from './ships.js';

const PAL = {
  deck: [0xc0814a, 0xb5763f, 0xca8d55, 0xab6c3a, 0xbf7d45, 0xb88050],
  trim: 0xf6d27e,
  clad: [0x8d5a35, 0x7f4f2f],
  post: 0x7b4c2c,
  postWet: 0x4a3626,
  algae: 0x4e7b45,
  iron: 0x3a3a46,
  soft: [0xf0c27a, 0xe8b66c, 0xf5cf8c, 0xe9bd78],
  softEnd: 0xd9473a,
  bunting: [0xe8463a, 0xffd23f, 0x1fb5a8, 0xfff4e0, 0x3b7bd9],
};

export function buildPirateHaven(ctx) {
  const q = qLevel(ctx.quality);
  const A = ctx.arena;
  const group = new THREE.Group();
  group.name = 'arena:pirate_haven';
  const updaters = [];
  const R = rng(4242);
  const WATER = A.blast.minY + 3; // ocean surface (world y)
  const P = Object.fromEntries(A.platforms.map((p) => [p.id, p]));

  // ------------------------------------------------------------------ lights / sky / fog
  const HORIZON = 0xcfeaf2;
  const { sun, sunDir } = makeLights(group, {
    sunColor: 0xfff0d6, sunIntensity: 2.7, dir: [-0.55, 0.95, 0.62],
    hemiSky: 0xb3dcff, hemiGround: 0x9a7a5a, hemiIntensity: 1.2,
  });
  const sky = makeSky({
    top: 0x2f7fe0, mid: 0x74bdf2, horizon: HORIZON, below: HORIZON,
    sunDir: new THREE.Vector3(-0.55, 0.5, -0.62), sunColor: 0xfff1c9, sunGlow: 0.7,
    clouds: { seed: 21, count: 22, lit: '#ffffff', shade: '#bcd3f2', rim: '#fffbea', low: 16 },
  });
  group.add(sky.mesh);
  updaters.push(sky.update);
  const fog = new THREE.Fog(HORIZON, 60, 420);
  const background = new THREE.Color(HORIZON);

  // ------------------------------------------------------------------ textures + materials
  const boardTex = boardTexture(3);
  const boardTex2 = boardTexture(8, { nails: false });
  const plankTex = plankTexture(5);
  const ropeTex = ropeTexture();
  const sailTex = sailAtlas(11);
  const flagTex = flagAtlas();
  const woodMat = vcMat({ map: boardTex, rim: 0.22 });
  const softWoodMat = vcMat({ map: boardTex2, rim: 0.3 });
  const plainMat = vcMat({ rim: 0.25 });
  const ropeMat = vcMat({ map: ropeTex, rim: 0.15 });
  const lanternGlow = glowMat(0xffc15a, 3.2);
  const buntMat = clothify(vcMat({ side: THREE.DoubleSide, rim: 0.1 }), { amp: 0.05, billow: 0, freq: 0.6, speed: 4.5, spatial: 1.3 });
  const shipMats = shipMaterials({ plankTex, sailTex, flagTex });
  const clothMats = [buntMat, shipMats.sail, shipMats.flag];

  const unit = new THREE.BoxGeometry(1, 1, 1);
  const cyl8 = new THREE.CylinderGeometry(1, 1, 1, q > 0 ? 8 : 6, 1);
  const glowPoints = [];
  const pennants = [];
  const pennants2 = [];
  let glowOff = [0, 0, 0];
  let buntIdx = 0;

  // ------------------------------------------------------------------ helpers
  function lantern(b, glowB, x, y, z, s = 1) {
    b.add(new THREE.CylinderGeometry(0.2 * s, 0.24 * s, 0.08 * s, 6), M(x, y - 0.3 * s, z), PAL.iron);
    b.add(new THREE.ConeGeometry(0.26 * s, 0.24 * s, 6), M(x, y + 0.34 * s, z), PAL.iron);
    b.add(new THREE.TorusGeometry(0.08 * s, 0.025 * s, 4, 8), M(x, y + 0.5 * s, z), PAL.iron);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      b.add(unit, M(x + Math.cos(a) * 0.19 * s, y, z + Math.sin(a) * 0.19 * s, 0, 0, 0, 0.04 * s, 0.6 * s, 0.04 * s), PAL.iron);
    }
    if (q > 0) glowB.add(new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 0.5 * s, 6), M(x, y, z));
    else b.add(new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 0.5 * s, 6), M(x, y, z), 0xffc96a);
    glowPoints.push([x + glowOff[0], y + glowOff[1], z + glowOff[2], s]);
  }

  function barrel(b, x, y, z, s = 1, rx = 0, rz = 0, ry = 0) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector2(0.42 + Math.sin(t * Math.PI) * 0.09, t * 1.1 - 0.55));
    }
    const g = new THREE.LatheGeometry(pts, q > 0 ? 10 : 7);
    const wood = jitter(0x9a5d32, R, 0.12);
    b.add(g, M(x, y, z, rx, ry, rz, s), (v) => {
      const ly = v.y;
      return Math.abs(Math.abs((ly - y) / s) - 0.36) < 0.06 ? new THREE.Color(PAL.iron) : wood;
    });
    b.add(new THREE.CircleGeometry(0.43, q > 0 ? 10 : 7), M(x, y + 0.55 * s, z, -Math.PI / 2 + rx, ry, rz, s), 0xb87a48);
  }

  function crate(b, x, y, z, s = 1, ry = 0) {
    const c = jitter(0xc28a52, R, 0.1);
    b.add(unit, M(x, y, z, 0, ry, 0, s * 0.96), c);
    const fr = 0x6b4426;
    for (const [dx, dz, w, d] of [[0.47, 0, 0.08, 1.0], [-0.47, 0, 0.08, 1.0], [0, 0.47, 1.0, 0.08], [0, -0.47, 1.0, 0.08]]) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
      b.add(unit, m.clone().multiply(M(dx, 0.47, dz, 0, 0, 0, w, 0.08, d)), fr);
      b.add(unit, m.clone().multiply(M(dx, -0.47, dz, 0, 0, 0, w, 0.08, d)), fr);
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    for (const [dx, dz] of [[0.47, 0.47], [-0.47, 0.47], [0.47, -0.47], [-0.47, -0.47]]) b.add(unit, m.clone().multiply(M(dx, 0, dz, 0, 0, 0, 0.09, 1.0, 0.09)), fr);
    b.add(unit, m.clone().multiply(M(0, 0, 0.49, 0, 0, Math.PI / 4, 0.08, 1.3, 0.04)), fr);
  }

  function ropeCoil(b, x, y, z, s = 1) {
    for (let i = 0; i < 3; i++) b.add(new THREE.TorusGeometry(0.42 * s - i * 0.02, 0.07 * s, 5, 14), M(x, y + 0.07 * s + i * 0.12 * s, z, Math.PI / 2, 0, 0), 0xe7cd98);
  }

  // ================================================================== MAIN DOCK
  const platformObjects = {};
  {
    const p = P.main;
    const root = new THREE.Group();
    root.name = 'platform:main';
    root.position.set(p.x, p.top, p.z);
    const wood = new Batch();
    const plain = new Batch();
    const rope = new Batch();
    const glowB = new Batch();
    const bunt = new Batch({ aWave: 1 });
    const hx = p.hx;
    const hz = p.hz;
    const th = p.thick;
    const water = WATER - p.top;
    const trim = 0.55;
    const OVER = 0.06;

    // dark underlay visible through plank gaps
    plain.add(unit, M(0, -0.24, 0, 0, 0, 0, 2 * hx - 0.3, 0.08, 2 * hz - 0.3), 0x2f1d12);
    // deck planks (rows along x with staggered joints)
    const ix = hx - trim;
    const iz = hz - trim;
    const rows = Math.round((2 * iz) / 0.74);
    const pitch = (2 * iz) / rows;
    for (let r = 0; r < rows; r++) {
      const z = -iz + pitch * (r + 0.5);
      const c1 = -ix + 2 * ix * (0.18 + R() * 0.22);
      const c2 = c1 + 2 * ix * (0.24 + R() * 0.2);
      for (const [a, b] of [[-ix, c1], [c1, c2], [c2, ix]]) {
        const len = b - a - 0.05;
        wood.add(unit, M((a + b) / 2, -0.11, z, 0, 0, 0, len, 0.22, pitch - 0.07), jitter(PAL.deck[Math.floor(R() * PAL.deck.length)], R, 0.08));
      }
    }
    // bright trim frame (overhangs by OVER)
    const tH = 0.3;
    for (const s of [-1, 1]) {
      wood.add(unit, M(0, -tH / 2, s * (hz - trim / 2 + OVER / 2), 0, 0, 0, 2 * hx + 2 * OVER, tH, trim + OVER), PAL.trim);
      wood.add(unit, M(s * (hx - trim / 2 + OVER / 2), -tH / 2, 0, 0, 0, 0, trim + OVER, tH, 2 * hz - 2 * trim), PAL.trim);
    }
    // corner brass plates on the side faces
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      plain.add(unit, M(sx * (hx + OVER + 0.01), -0.5, sz * (hz - 0.35), 0, 0, 0, 0.04, 0.5, 0.7), 0xe0a83a);
      plain.add(unit, M(sx * (hx - 0.35), -0.5, sz * (hz + OVER + 0.01), 0, 0, 0, 0.7, 0.5, 0.04), 0xe0a83a);
    }
    // side cladding boards
    const bh = (th - tH) / 3;
    for (let k = 0; k < 3; k++) {
      const y = -tH - bh * (k + 0.5);
      const c = PAL.clad[k % 2];
      for (const s of [-1, 1]) {
        wood.add(unit, M(0, y, s * (hz - 0.1), 0, 0, 0, 2 * hx - 0.1, bh - 0.05, 0.2), jitter(c, R, 0.05));
        wood.add(unit, M(s * (hx - 0.1), y, 0, 0, 0, 0, 0.2, bh - 0.05, 2 * hz - 0.4), jitter(c, R, 0.05));
      }
    }
    plain.add(unit, M(0, -tH - (th - tH) / 2, 0, 0, 0, 0, 2 * hx - 0.35, th - tH - 0.02, 2 * hz - 0.35), 0x24170e);

    // pilings (perimeter + interior)
    const postR = 0.34;
    const posts = [];
    const nX = 7;
    for (let i = 0; i < nX; i++) {
      const x = -hx + 0.2 + ((2 * hx - 0.4) * i) / (nX - 1);
      posts.push([x, hz - 0.2, true], [x, -hz + 0.2, true]);
    }
    for (const z of [-hz / 2, 0, hz / 2]) posts.push([hx - 0.2, z, true], [-hx + 0.2, z, true]);
    if (q > 0) for (const x of [-8, -4, 0, 4, 8]) for (const z of [-3.2, 0.4, 3.6]) posts.push([x + (R() - 0.5), z + (R() - 0.5), false]);
    const postBot = water - 1.5;
    const postColor = (v) => {
      if (v.y < water + 0.6) return new THREE.Color(PAL.algae).lerp(new THREE.Color(0x24302a), smooth(water + 0.6, water - 1, v.y));
      if (v.y < water + 3) return new THREE.Color(PAL.postWet).lerp(new THREE.Color(PAL.post), smooth(water + 0.6, water + 3, v.y));
      return new THREE.Color(PAL.post);
    };
    const footprints = [];
    for (const [x, z, outer] of posts) {
      const top = outer ? -0.05 - tH : -th;
      plain.add(cyl8, M(x, (top + postBot) / 2, z, 0, R() * 3, 0, postR, top - postBot, postR), postColor);
      if (outer) {
        for (const yy of [-0.75, -th + 0.35]) plain.add(cyl8, M(x, yy, z, 0, 0, 0, postR + 0.03, 0.12, postR + 0.03), PAL.iron);
      }
      footprints.push({ x: p.x + x, z: p.z + z, rx: postR * 1.4 });
    }
    // braces + stringers under the deck (front/back/sides)
    const tiers = [-th - 0.2, (-th + water) / 2, water + 1.2];
    for (const s of [-1, 1]) {
      const z = s * (hz - 0.45);
      for (const y of tiers) plain.add(unit, M(0, y, z, 0, 0, 0, 2 * hx - 0.6, 0.3, 0.2), PAL.postWet);
      const x = s * (hx - 0.45);
      for (const y of tiers) plain.add(unit, M(x, y, 0, 0, 0, 0, 0.2, 0.3, 2 * hz - 0.6), PAL.postWet);
      for (let i = 0; i < nX - 1; i++) {
        const xa = -hx + 0.2 + ((2 * hx - 0.4) * i) / (nX - 1);
        const xb = -hx + 0.2 + ((2 * hx - 0.4) * (i + 1)) / (nX - 1);
        for (let t = 0; t < 2; t++) {
          const ya = tiers[t];
          const yb = tiers[t + 1];
          plain.add(unit, between([xa, ya, z], [xb, yb, z]).multiply(M(0, 0, 0, 0, 0, 0, 0.22, 1, 0.16)), PAL.postWet);
          plain.add(unit, between([xa, yb, z], [xb, ya, z]).multiply(M(0, 0, 0, 0, 0, 0, 0.22, 1, 0.16)), PAL.postWet);
        }
      }
    }
    // rope swags + bunting along all four faces
    const ropeY = -tH - 0.12;
    const outZ = hz + 0.07;
    const outX = hx + 0.07;
    const swag = (a, b, faceN) => {
      const pts = sagPoints(a, b, 0.38, 10);
      rope.add(tubeGeo(pts, 0.075, 5, 16), null, 0xffffff);
      if (q === 0) return;
      const n = 5;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const i = Math.round(t * 10);
        const pt = pts[i];
        const g = new THREE.BufferGeometry();
        const w = 0.26;
        // triangle hanging down, facing faceN
        const tang = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize();
        const v0 = pt.clone().addScaledVector(tang, -w).add(new THREE.Vector3(0, -0.04, 0));
        const v1 = pt.clone().addScaledVector(tang, w).add(new THREE.Vector3(0, -0.04, 0));
        const v2 = pt.clone().add(new THREE.Vector3(0, -0.62, 0));
        const off = new THREE.Vector3(faceN[0], 0, faceN[1]).multiplyScalar(0.03);
        [v0, v1, v2].forEach((v) => v.add(off));
        g.setAttribute('position', new THREE.Float32BufferAttribute([...v0.toArray(), ...v1.toArray(), ...v2.toArray()], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([faceN[0], 0, faceN[1], faceN[0], 0, faceN[1], faceN[0], 0, faceN[1]], 3));
        g.setAttribute('aWave', new THREE.Float32BufferAttribute([0, 0, 1], 1));
        bunt.add(g, null, PAL.bunting[buntIdx++ % PAL.bunting.length]);
      }
    };
    for (let i = 0; i < nX - 1; i++) {
      const xa = -hx + 0.2 + ((2 * hx - 0.4) * i) / (nX - 1);
      const xb = -hx + 0.2 + ((2 * hx - 0.4) * (i + 1)) / (nX - 1);
      swag([xa, ropeY, outZ], [xb, ropeY, outZ], [0, 1]);
      swag([xa, ropeY, -outZ], [xb, ropeY, -outZ], [0, -1]);
    }
    const zs = [-hz + 0.2, -hz / 2, 0, hz / 2, hz - 0.2];
    for (let i = 0; i < zs.length - 1; i++) {
      swag([outX, ropeY, zs[i]], [outX, ropeY, zs[i + 1]], [1, 0]);
      swag([-outX, ropeY, zs[i]], [-outX, ropeY, zs[i + 1]], [-1, 0]);
    }
    // lanterns hanging on brackets at the front corners/centre
    const lanternSpots = q > 0 ? [[-hx + 0.2, hz], [0, hz], [hx - 0.2, hz], [-hx + 0.2, -hz], [hx - 0.2, -hz]] : [[-hx + 0.2, hz], [hx - 0.2, hz]];
    for (const [x, z] of lanternSpots) {
      const s = Math.sign(z);
      plain.add(unit, M(x, -1.05, z + s * 0.32, 0, 0, 0, 0.08, 0.08, 0.5), PAL.iron);
      lantern(plain, glowB, x, -1.55, z + s * 0.5, 0.9);
    }

    // flat deck decals (compass rose + hatch grates) — polygon-offset overlay, no height
    const decalTex = canvasTexture(1024, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.5;
      const rr = h * 0.42;
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(122,40,28,0.85)';
      g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 4;
      g.beginPath(); g.arc(cx, cy, rr * 0.86, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * rr * 0.86, cy + Math.sin(a) * rr * 0.86);
        g.lineTo(cx + Math.cos(a) * rr * (i % 4 ? 0.93 : 1), cy + Math.sin(a) * rr * (i % 4 ? 0.93 : 1));
        g.stroke();
      }
      star(g, cx, cy, rr * 0.8, rr * 0.16, 4, 'rgba(122,40,28,0.88)');
      g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4);
      star(g, 0, 0, rr * 0.55, rr * 0.12, 4, 'rgba(236,196,96,0.9)');
      g.restore();
      g.fillStyle = 'rgba(250,236,200,0.95)';
      g.beginPath(); g.arc(cx, cy, rr * 0.1, 0, Math.PI * 2); g.fill();
      // hatch grates at the sides
      for (const gx of [w * 0.1, w * 0.9]) {
        const gw = w * 0.13;
        const gh = h * 0.5;
        g.fillStyle = 'rgba(40,26,18,0.92)';
        g.fillRect(gx - gw / 2, cy - gh / 2, gw, gh);
        g.fillStyle = 'rgba(150,100,60,0.95)';
        for (let i = 0; i <= 6; i++) g.fillRect(gx - gw / 2 + (i * (gw - 8)) / 6, cy - gh / 2, 8, gh);
        for (let i = 0; i <= 8; i++) g.fillRect(gx - gw / 2, cy - gh / 2 + (i * (gh - 8)) / 8, gw, 8);
        g.strokeStyle = 'rgba(230,180,80,0.95)'; g.lineWidth = 6;
        g.strokeRect(gx - gw / 2, cy - gh / 2, gw, gh);
      }
    });
    const decalMat = toonMat(0xffffff, { map: decalTex, transparent: true, rim: 0 });
    decalMat.polygonOffset = true;
    decalMat.polygonOffsetFactor = -2;
    decalMat.polygonOffsetUnits = -4;
    decalMat.depthWrite = false;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(2 * (hx - trim) * 0.92, (2 * (hx - trim) * 0.92) / 2).rotateX(-Math.PI / 2), decalMat);
    decal.position.y = 0.002;
    decal.receiveShadow = true;
    decal.renderOrder = 1;
    decal.name = 'deckDecal';

    const mWood = wood.mesh(woodMat, { cast: true, receive: true, name: 'deck' });
    const mPlain = plain.mesh(plainMat, { cast: true, receive: true, name: 'understructure' });
    const mRope = rope.mesh(ropeMat, { cast: false, receive: true, name: 'ropes' });
    const mGlow = glowB.mesh(lanternGlow, { name: 'lanterns' });
    const mBunt = bunt.mesh(buntMat, { name: 'bunting' });
    for (const m of [mWood, mPlain, mRope, mGlow, mBunt, decal]) if (m) root.add(m);
    if (q > 0) inkOutline(mWood, 0.045, 0x2a1408);
    platformObjects.main = root;
    group.add(root);
    root.userData.footprints = footprints;

    // rocky islet under the pilings
    const rocks = new Batch();
    const rockCol = (v, n) => {
      if (v.y < WATER + 0.4) return new THREE.Color(0x3b4a48);
      if (n.y > 0.55) return new THREE.Color(0x6f9a4c).lerp(new THREE.Color(0x8fb35a), R() * 0.5);
      return new THREE.Color(0xb08a68).lerp(new THREE.Color(0xc9a27a), R());
    };
    const rockList = [];
    for (let i = 0; i < (q > 0 ? 9 : 5); i++) {
      const x = (R() - 0.5) * 2 * (hx - 3);
      const z = (R() - 0.5) * 2 * (hz - 2.5);
      const r = 2.2 + R() * 2.2;
      rocks.add(rockGeo(r, 100 + i, 1, 0.75), M(x, WATER - r * 0.3 + R() * 0.8, z, 0, R() * 6, 0), rockCol);
      rockList.push({ x, z, rx: r * 0.95 });
    }
    // scattered rocks around the harbour
    for (let i = 0; i < (q > 0 ? 16 : 7); i++) {
      const a = R() * Math.PI * 2;
      const d = 18 + R() * 30;
      const x = Math.cos(a) * d * 1.3;
      const z = Math.sin(a) * d - 8;
      if (Math.abs(x) < 15 && z > -14 && z < 12) continue;
      const r = 0.8 + R() * 2.2;
      rocks.add(rockGeo(r, 200 + i, 1, 0.6 + R() * 0.6), M(x, WATER - r * 0.25, z, 0, R() * 6, 0), rockCol);
      rockList.push({ x, z, rx: r * 0.9 });
    }
    // sea stacks mid-distance
    for (const [x, z, r, h] of [[-44, -34, 4, 2.8], [52, -40, 3.4, 3.4], [-62, -70, 5, 2.2], [18, -88, 3, 2.5], [80, -64, 4.2, 2.6]]) {
      rocks.add(rockGeo(r, 300 + x, 1, h), M(x, WATER + r * h * 0.3, z, 0, R() * 6, 0), rockCol);
      rockList.push({ x, z, rx: r * 1.05 });
    }
    group.add(rocks.mesh(plainMat, { cast: true, receive: true, name: 'rocks' }));
    root.userData.rockList = rockList;
  }

  // ================================================================== HANGING CARGO RAFTS (soft)
  const cranes = new Batch();
  const craneRope = new Batch();
  for (const id of ['left', 'right']) {
    const p = P[id];
    const root = new THREE.Group();
    root.name = 'platform:' + id;
    root.position.set(p.x, p.top, p.z);
    const wood = new Batch();
    const plain = new Batch();
    const rope = new Batch();
    const glowB = new Batch();
    const hx = p.hx;
    const hz = p.hz;
    const th = p.thick;
    const endW = 0.42;
    glowOff = [p.x, p.top, p.z];
    const n = Math.round((2 * hx) / 0.64);
    const pw = (2 * hx) / n;
    for (let i = 0; i < n; i++) {
      const x = -hx + pw * (i + 0.5);
      wood.add(unit, M(x, -0.08, 0, 0, Math.PI / 2, 0, 2 * hz - 2 * endW, 0.16, pw - 0.06), jitter(PAL.soft[i % PAL.soft.length], R, 0.06));
    }
    for (const s of [-1, 1]) {
      wood.add(unit, M(0, -0.09, s * (hz - endW / 2), 0, 0, 0, 2 * hx, 0.18, endW), PAL.softEnd);
      plain.add(unit, M(0, -0.28, s * (hz - 0.75), 0, 0, 0, 2 * hx - 0.3, th - 0.18, 0.32), 0x9a6a3c);
      plain.add(unit, M(s * (hx - 0.6), -0.28, 0, 0, 0, 0, 0.32, th - 0.18, 2 * hz - 0.6), 0x9a6a3c);
    }
    plain.add(unit, M(0, -0.17, 0, 0, 0, 0, 2 * hx - 0.2, 0.03, 2 * hz - 0.2), 0x4a2e1c);
    // rope-bound rim (marks the edge)
    const rr = 0.085;
    const ry = -0.1;
    const o = 0.02;
    const rim = [[-hx - o, ry, -hz - o], [hx + o, ry, -hz - o], [hx + o, ry, hz + o], [-hx - o, ry, hz + o]];
    for (let k = 0; k < 4; k++) rope.add(tubeGeo([rim[k], rim[(k + 1) % 4]], rr, 5, 6), null, 0xffffff);
    for (const c of rim) plain.add(new THREE.SphereGeometry(rr * 1.3, 6, 4), M(c[0], c[1], c[2]), 0xd09a3a);
    // hanging ropes from the corners to the hook block
    const blockY = 6.0;
    const block = [0, blockY, 0];
    for (const c of rim) rope.add(tubeGeo([[c[0] * 0.97, 0.02, c[2] * 0.97], block], 0.045, 4, 4), null, 0xffffff);
    plain.add(unit, M(0, blockY + 0.25, 0, 0, 0, 0, 0.5, 0.7, 0.32), 0x6b4426);
    plain.add(new THREE.TorusGeometry(0.22, 0.06, 5, 10, Math.PI * 1.4), M(0, blockY - 0.2, 0, 0, 0, Math.PI * 0.8), PAL.iron);
    plain.add(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 8), M(0, blockY + 0.3, 0, Math.PI / 2, 0, 0), 0xb08a5a);
    rope.add(tubeGeo([[0, blockY + 0.6, 0], [0, 9.2, 0]], 0.06, 4, 3), null, 0xffffff);
    // lanterns slung under the front corners and centre
    for (const [x, z] of [[-hx + 0.35, hz - 0.2], [hx - 0.35, hz - 0.2], [0, -hz + 0.3]]) {
      rope.add(tubeGeo([[x, -th + 0.05, z], [x, -th - 0.45, z]], 0.03, 3, 2), null, 0xffffff);
      lantern(plain, glowB, x, -th - 0.85, z, 0.75);
    }
    // little pennant on the front rope
    const mWood = wood.mesh(softWoodMat, { cast: true, receive: true, name: 'raft', dynamic: false });
    const mPlain = plain.mesh(plainMat, { cast: true, receive: true });
    const mRope = rope.mesh(ropeMat, { cast: false, receive: false });
    const mGlow = glowB.mesh(lanternGlow);
    for (const m of [mWood, mPlain, mRope, mGlow]) if (m) root.add(m);
    if (q > 0) inkOutline(mWood, 0.035, 0x3a1e0c);
    platformObjects[id] = root;
    group.add(root);
    glowOff = [0, 0, 0];
    // crane (static scenery behind the dock) whose boom tip sits above the raft
    const sx = Math.sign(p.x);
    const base = [sx * 18.5, WATER - 1, -12.5];
    const top = [sx * 18.5, 13.4, -12.5];
    const tip = [p.x, p.top + 9.6, p.z];
    cranes.add(cyl8, between(base, top, 0.55), (v) => (v.y < WATER + 1.2 ? new THREE.Color(PAL.algae) : new THREE.Color(0x8a5634)));
    for (const dz of [-1, 1]) cranes.add(cyl8, between([base[0] - sx * 2.8, WATER - 1, base[2] + dz * 2.5], [top[0], 4, top[2]], 0.28), 0x7a4a2c);
    cranes.add(unit, between([top[0], top[1] - 0.4, top[2]], [tip[0], tip[1] + 0.4, tip[2]]).multiply(M(0, 0, 0, 0, 0, 0, 0.5, 1, 0.42)), 0x9a6238);
    cranes.add(unit, between([top[0], 6.5, top[2]], [lerpV(top, tip, 0.42)[0], lerpV(top, tip, 0.42)[1] - 0.3, lerpV(top, tip, 0.42)[2]]).multiply(M(0, 0, 0, 0, 0, 0, 0.3, 1, 0.3)), 0x7a4a2c);
    cranes.add(unit, M(top[0], top[1] + 0.4, top[2], 0, 0, 0, 1.1, 0.8, 1.1), 0xd9473a);
    cranes.add(new THREE.ConeGeometry(0.9, 1.0, 4), M(top[0], top[1] + 1.3, top[2], 0, Math.PI / 4, 0), 0x2f6fb8);
    cranes.add(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8), M(tip[0], tip[1], tip[2], Math.PI / 2, 0, 0), 0xb08a5a);
    cranes.add(cyl8, M(base[0], WATER + 0.6, base[2], 0, 0, 0, 1.2, 1.6, 1.2), 0x5a3a24);
    for (let k = 0; k < 3; k++) cranes.add(cyl8, M(top[0], 1 + k * 4, top[2], 0, 0, 0, 0.62, 0.16, 0.62), PAL.iron);
    craneRope.add(tubeGeo([tip, [top[0], top[1] - 0.6, top[2]], [top[0] + sx * 0.4, 1.5, top[2] + 0.5]], 0.05, 4, 10), null, 0xffffff);
    // pennant on the crane top
    pennants.push([flagGeometry(2.6, 1.0, 1, true), M(top[0], top[1] + 2.5, top[2], 0, sx > 0 ? 0.3 : -0.3, 0)]);
    cranes.add(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 4), M(top[0], top[1] + 2.4, top[2]), PAL.iron);
  }
  function lerpV(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // ================================================================== WATER-LEVEL JETTIES WITH CARGO
  const jetty = new Batch();
  const jettyPlain = new Batch();
  const jettyRope = new Batch();
  const jettyGlow = new Batch();
  const jettySpots = q > 0 ? [[-21, -1, 0.15], [21, -3, -0.12], [-30, -20, 0.5], [31, -18, -0.4]] : [[-21, -1, 0.15], [21, -3, -0.12]];
  const extraFoam = [];
  for (const [jx, jz, rot] of jettySpots) {
    const y = WATER + 0.75;
    const L = 8;
    const Wd = 4;
    const m0 = new THREE.Matrix4().compose(new THREE.Vector3(jx, y, jz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
    const n = 11;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (L / n) * (i + 0.5);
      jetty.add(unit, m0.clone().multiply(M(x, 0, 0, 0, Math.PI / 2, 0, Wd, 0.18, L / n - 0.06)), jitter(0xa8703f, R, 0.1));
    }
    for (const [px, pz] of [[-L / 2 + 0.3, -Wd / 2 + 0.2], [L / 2 - 0.3, -Wd / 2 + 0.2], [-L / 2 + 0.3, Wd / 2 - 0.2], [L / 2 - 0.3, Wd / 2 - 0.2], [0, Wd / 2 - 0.2], [0, -Wd / 2 + 0.2]]) {
      jettyPlain.add(cyl8, m0.clone().multiply(M(px, -0.2, pz, 0, 0, 0, 0.26, 2.6, 0.26)), (v) => (v.y < WATER + 0.3 ? new THREE.Color(PAL.algae) : new THREE.Color(0x6b4428)));
      jettyPlain.add(cyl8, m0.clone().multiply(M(px, 0.5, pz, 0, 0, 0, 0.28, 1.0, 0.28)), 0x6b4428);
      const wp = new THREE.Vector3(px, 0, pz).applyMatrix4(m0);
      extraFoam.push({ x: wp.x, z: wp.z, rx: 0.4 });
    }
    // cargo
    const cargo = (fn, lx, lz, ...a) => { const wp = new THREE.Vector3(lx, 0, lz).applyMatrix4(m0); fn(jettyPlain, wp.x, wp.y + 0.09, wp.z, ...a); };
    cargo((b, x, yy, z) => barrel(b, x, yy + 0.55, z, 1), -2.6, -0.8);
    cargo((b, x, yy, z) => barrel(b, x, yy + 0.55, z, 1), -1.7, -1.1);
    cargo((b, x, yy, z) => barrel(b, x, yy + 1.65, z, 1), -2.15, -0.95);
    cargo((b, x, yy, z) => barrel(b, x, yy + 0.42, z, 0.85, Math.PI / 2, 0, rot), -2.2, 0.9);
    cargo((b, x, yy, z) => crate(b, x, yy + 0.5, z, 1, rot + 0.2), 1.2, -0.7);
    cargo((b, x, yy, z) => crate(b, x, yy + 1.4, z, 0.8, rot - 0.3), 1.25, -0.7);
    cargo((b, x, yy, z) => crate(b, x, yy + 0.4, z, 0.8, rot + 0.7), 2.4, 0.6);
    cargo((b, x, yy, z) => ropeCoil(b, x, yy, z, 1), 0.2, 1.1);
    // mooring post with lantern
    const lp = new THREE.Vector3(L / 2 - 0.4, 0, Wd / 2 - 0.3).applyMatrix4(m0);
    jettyPlain.add(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 5), M(lp.x, lp.y + 1.1, lp.z), PAL.iron);
    lantern(jettyPlain, jettyGlow, lp.x, lp.y + 2.4, lp.z, 0.9);
    // rowboat moored alongside
    if (q > 0) {
      const { geo } = hullGeometry({ L: 4.6, W: 0.9, D: 0.6, H: 0.45, sheer: 0.35, sternRise: 0, segL: 12, segS: 8 });
      const bp = new THREE.Vector3(0.5, 0, Wd / 2 + 1.3).applyMatrix4(m0);
      const bm = M(bp.x, WATER + 0.05, bp.z, 0, rot + 0.08, 0);
      jettyPlain.add(geo, bm, (v) => (v.y < WATER + 0.2 ? new THREE.Color(0x2a5e8a) : new THREE.Color(0xfff2d6)));
      for (const dx of [-0.8, 0.6]) jettyPlain.add(unit, bm.clone().multiply(M(dx, 0.25, 0, 0, 0, 0, 0.3, 0.06, 1.6)), 0xa8703f);
      jettyRope.add(tubeGeo(sagPoints([bp.x + 1.8, WATER + 0.5, bp.z], [lp.x, lp.y + 0.3, lp.z], 0.5, 6), 0.035, 3, 8), null, 0xffffff);
      extraFoam.push({ x: bp.x, z: bp.z, rx: 2.6, rz: 1.1, rot: -(rot + 0.08) });
    }
    extraFoam.push({ x: jx, z: jz, rx: L / 2 + 0.6, rz: Wd / 2 + 0.2, rot: -rot, wide: true });
  }
  group.add(jetty.mesh(woodMat, { cast: true, receive: true, name: 'jetties' }));
  group.add(jettyPlain.mesh(plainMat, { cast: true, receive: true, name: 'cargo' }));
  if (!jettyRope.empty) group.add(jettyRope.mesh(ropeMat));
  if (!jettyGlow.empty) group.add(jettyGlow.mesh(lanternGlow));
  {
    const cm = cranes.mesh(plainMat, { cast: true, receive: true, name: 'cranes' });
    group.add(cm);
    if (q > 1) inkOutline(cm, 0.06, 0x24140c);
  }
  group.add(craneRope.mesh(ropeMat));

  // pennant flags (cranes) — cloth
  if (q > 0) {
    const fb = new Batch({ aWave: 1 });
    for (const [g, m] of pennants) fb.add(g, m, 0xffffff);
    group.add(fb.mesh(shipMats.flag, { receive: false }));
  }

  // ================================================================== OCEAN
  const sdy = sunDir.y;
  const hDrop = P.main.top - WATER;
  const ocean = makeOcean({
    y: WATER, deep: 0x1466b0, mid: 0x2a9ad8, shallow: 0x35cfc6, foam: 0xd9eef3, sky: 0xc8e8f0,
    sunDir, sunColor: 0xfff0d0, stage: [P.main.x, P.main.z, P.main.hx - 1.5, P.main.hz - 1.2], stageRound: 2.5,
    shadowOffset: [(sunDir.x / sdy) * hDrop, (sunDir.z / sdy) * hDrop], amp: 0.5, sparkle: 2.4,
    rings: q > 0 ? 72 : 48, segs: q > 0 ? 128 : 72, cheap: q === 0,
  });
  group.add(ocean.mesh);
  updaters.push(ocean.update);
  if (q > 0) {
    const pm = P.main;
    const outside = (it) => Math.abs(it.x - pm.x) > pm.hx + 0.5 || Math.abs(it.z - pm.z) > pm.hz + 0.5;
    const items = [...platformObjects.main.userData.rockList.filter(outside), ...extraFoam];
    const foam = makeFoamRings(items, ocean, { y: WATER });
    group.add(foam);
  }

  // ================================================================== SHIPS
  const ships = [];
  const shipDefs = [
    { pos: [-40, WATER, -58], heading: 0.22, L: 22, sails: [1, 2, 1], altSail: 1, flagSlot: 0, hull: { bottom: 0x3b2a40, band: 0xe8b04a, wood: 0x2f2a36, trim: 0xe8b04a, deck: 0xb08860 }, seed: 1 },
    { pos: [37, WATER, -63], heading: Math.PI - 0.18, L: 24, sails: [0, 0, 0], flagSlot: 1, hull: { bottom: 0x6a2a24, band: 0xf6f0e0, wood: 0xa4502e, trim: 0xf2c14e }, seed: 2 },
    { pos: [-2, WATER, -104], heading: 0.05, L: 19, sails: [1, 1, 1], flagSlot: 3, hull: { bottom: 0x24485e, band: 0xffd34d, wood: 0x2a8a8a, trim: 0xffd34d }, seed: 3, masts: 2 },
    { pos: [-74, WATER, -14], heading: Math.PI / 2 + 0.5, L: 21, sails: [0, 1, 0], flagSlot: 1, hull: { bottom: 0x5a2a2a, band: 0xffd34d, wood: 0x7b4a2c }, seed: 4 },
    { pos: [72, WATER, -22], heading: -Math.PI / 2 - 0.35, L: 23, sails: [1, 2, 1], altSail: 1, flagSlot: 0, hull: { bottom: 0x2b2b36, band: 0xd23c35, wood: 0x3a3440 }, seed: 5 },
  ];
  const nShips = [2, 3, 5][q];
  for (let i = 0; i < nShips; i++) {
    const s = buildShip({ ...shipDefs[i], quality: q, masts: shipDefs[i].masts || 3 }, shipMats);
    group.add(s.group);
    ships.push(s);
    extraFoam.push({ x: shipDefs[i].pos[0], z: shipDefs[i].pos[2] });
  }
  if (q > 0) {
    const items = ships.map((s, i) => ({ x: shipDefs[i].pos[0], z: shipDefs[i].pos[2], rx: s.length * 0.52, rz: s.beam * 1.2, rot: -shipDefs[i].heading }));
    group.add(makeFoamRings(items, ocean, { y: WATER, opacity: 0.75 }));
  }

  // ================================================================== FAR SHORE: hills, town, lighthouse
  {
    const nz = makeNoise2(31);
    const shoreZ = (x) => -128 - 18 * Math.sin(x * 0.012 + 0.6) + (x > 45 && x < 95 ? 26 * Math.sin(((x - 45) / 50) * Math.PI) : 0);
    const height = (x, z) => {
      const d = shoreZ(x) - z; // distance inland
      if (d < 0) return WATER - 3 + d * 0.2;
      const cliff = smooth(0, 5, d) * (6 + 3 * nz(x * 0.05, 3));
      const hills = smooth(8, 45, d) * (10 + 9 * (nz(x * 0.018, z * 0.018) * 0.5 + 0.5) + 6 * Math.sin(x * 0.01));
      return WATER - 1.5 + cliff + hills + nz(x * 0.15, z * 0.15) * 0.6;
    };
    const cSand = new THREE.Color(0xf0dca0);
    const cRock = new THREE.Color(0xb39a84);
    const cGrass = new THREE.Color(0x6db45a);
    const cGrass2 = new THREE.Color(0x4f9a52);
    const terr = terrainGeo({
      x0: -260, x1: 260, z0: -110, z1: -215, nx: q > 0 ? 90 : 50, nz: q > 0 ? 22 : 12, height,
      color: (x, y, z, ny) => {
        if (y < WATER + 0.9) return cSand;
        if (ny < 0.72) return cRock.clone().lerp(new THREE.Color(0x8f7a6a), (nz(x * 0.3, y * 0.3) + 1) * 0.3);
        return cGrass.clone().lerp(cGrass2, (nz(x * 0.06, z * 0.06) + 1) * 0.5);
      },
    });
    const land = new Batch();
    land.add(terr, null, (v, n, i) => new THREE.Color(terr.attributes.color.getX(i), terr.attributes.color.getY(i), terr.attributes.color.getZ(i)));
    // town houses on the gentle slopes
    const town = new Batch();
    const walls = [0xf0dcbc, 0xf2c49a, 0xe9a08c, 0xa6d6cc, 0xf0dc84, 0xbccbe8, 0xe8b0c2];
    const roofs = [0xd2553a, 0xc4472e, 0x2f7fa8, 0xe07a3a, 0x8a3b54];
    const nHouses = [26, 60, 110][q];
    let placed = 0;
    for (let k = 0; k < nHouses * 4 && placed < nHouses; k++) {
      const x = -150 + R() * 195;
      const z = shoreZ(x) - 4 - R() * 26;
      const y = height(x, z);
      const yx = height(x + 2, z);
      const yz = height(x, z - 2);
      if (Math.abs(yx - y) > 1.2 || Math.abs(yz - y) > 1.2) continue;
      placed++;
      const w = 3 + R() * 3;
      const d = 2.6 + R() * 2;
      const h = 2.6 + R() * 3.4;
      const ry = (R() - 0.5) * 0.4;
      const m0 = M(x, y, z, 0, ry, 0);
      town.add(unit, m0.clone().multiply(M(0, h / 2 - 0.5, 0, 0, 0, 0, w, h + 1, d)), walls[Math.floor(R() * walls.length)]);
      town.add(prismGeo(w + 0.5, 1.4 + R(), d + 0.5), m0.clone().multiply(M(0, h, 0)), roofs[Math.floor(R() * roofs.length)]);
      // windows / door (front face)
      for (let wi = 0; wi < Math.floor(w / 1.3); wi++) {
        town.add(unit, m0.clone().multiply(M(-w / 2 + 0.8 + wi * 1.3, h * 0.6, d / 2 + 0.02, 0, 0, 0, 0.55, 0.7, 0.06)), 0x35577a);
      }
      town.add(unit, m0.clone().multiply(M(0, 0.5, d / 2 + 0.02, 0, 0, 0, 0.8, 1.4, 0.06)), 0x6b3f2a);
    }
    // palm trees along the beach
    for (let k = 0; k < [6, 14, 24][q]; k++) {
      const x = -200 + R() * 330;
      const z = shoreZ(x) - 1 - R() * 4;
      const y = height(x, z);
      const h = 5 + R() * 3;
      const lean = (R() - 0.5) * 0.5;
      town.add(new THREE.CylinderGeometry(0.22, 0.34, h, 5), M(x, y + h / 2, z, 0, 0, lean), 0x9a6a40);
      const tx = x - Math.sin(lean) * h;
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2;
        town.add(new THREE.ConeGeometry(0.6, 3.6, 3), M(tx + Math.cos(a) * 1.4, y + h - 0.3, z + Math.sin(a) * 1.4, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2), 0x3f9a4a);
      }
    }
    // harbour fort/tower on the left hill
    {
      const x = -95;
      const z = shoreZ(x) - 10;
      const y = height(x, z);
      town.add(new THREE.CylinderGeometry(4, 4.6, 12, 10), M(x, y + 6, z), 0xe8dcc6);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        town.add(unit, M(x + Math.cos(a) * 4.1, y + 12.5, z + Math.sin(a) * 4.1, 0, -a, 0, 1.0, 1.0, 0.8), 0xe8dcc6);
      }
      town.add(new THREE.CylinderGeometry(0.1, 0.1, 6, 4), M(x, y + 15, z), PAL.iron);
      pennants2.push([flagGeometry(4, 2.6, 0), M(x, y + 17, z)]);
    }
    // lighthouse on the headland
    const lx = 70;
    const lz = shoreZ(70) - 3;
    const ly = height(lx, lz);
    const LH = 14;
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(2.2 - t * 0.8, t * LH)); }
    town.add(new THREE.LatheGeometry(pts, 12), M(lx, ly, lz), (v) => (Math.floor(((v.y - ly) / LH) * 5) % 2 ? new THREE.Color(0xd8382f) : new THREE.Color(0xfff8ee)));
    town.add(new THREE.CylinderGeometry(2.0, 2.0, 0.4, 12), M(lx, ly + LH + 0.2, lz), 0x2b2b36);
    town.add(new THREE.CylinderGeometry(1.0, 1.1, 0.25, 10), M(lx, ly + LH + 2.3, lz), 0x2b2b36);
    town.add(new THREE.ConeGeometry(1.4, 1.6, 10), M(lx, ly + LH + 3.1, lz), 0xd8382f);
    town.add(new THREE.CylinderGeometry(3.4, 3.8, 2.6, 8), M(lx - 4, ly + 1.3, lz + 1), 0xfff8ee);
    town.add(prismGeo(7.2, 2.0, 4.4), M(lx - 4, ly + 2.6, lz + 1), 0xd8382f);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.9, 10), glowMat(0xfff2b0, 3.0));
    lamp.position.set(lx, ly + LH + 1.35, lz);
    group.add(lamp);
    glowPoints.push([lx, ly + LH + 1.4, lz, 6]);
    group.add(land.mesh(plainMat, { receive: false, name: 'shore' }));
    group.add(town.mesh(plainMat, { receive: false, name: 'town' }));
    // rotating lighthouse beam
    if (q > 0) {
      const beam = makeBeam({ length: 60, r0: 0.35, r1: 3.2, color: 0xfff2c0, strength: 0.22 });
      beam.position.set(lx, ly + LH + 1.35, lz);
      group.add(beam);
      updaters.push((t) => { beam.rotation.y = t * 0.6; });
    }
    if (q > 0) {
      const fb = new Batch({ aWave: 1 });
      for (const [g, m] of pennants2) fb.add(g, m, 0xffffff);
      group.add(fb.mesh(shipMats.flag, { receive: false }));
    }
  }

  // ================================================================== GULLS
  if (q > 0) {
    const gull = new THREE.BufferGeometry();
    const v = [0, 0, 0, -0.9, 0.18, -0.3, -0.25, 0.05, 0.12, 0, 0, 0, 0.9, 0.18, -0.3, 0.25, 0.05, 0.12, 0, 0.02, -0.25, 0, 0.02, 0.45, -0.08, 0.06, 0.05];
    gull.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    gull.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    gull.setAttribute('aWave', new THREE.Float32BufferAttribute([0, 1, 0.3, 0, 1, 0.3, 0, 0, 0], 1));
    gull.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 0.25, 0.25, 0.3, 1, 1, 1, 1, 1, 1, 0.25, 0.25, 0.3, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.3, 1, 1, 1], 3));
    const gm = clothify(vcMat({ side: THREE.DoubleSide, rim: 0.2 }), { amp: 0.35, billow: 0, freq: 0, speed: 9, spatial: 0 });
    clothMats.push(gm);
    const n = q > 1 ? 14 : 8;
    const gulls = new THREE.InstancedMesh(gull, gm, n);
    gulls.name = 'gulls';
    gulls.frustumCulled = false;
    const gs = [];
    for (let i = 0; i < n; i++) gs.push({ cx: (R() - 0.5) * 90, cz: -38 - R() * 40, r: 6 + R() * 10, y: 3 + R() * 9, sp: (0.25 + R() * 0.3) * (R() < 0.5 ? -1 : 1), ph: R() * 6.28, s: 1.3 + R() * 0.6 });
    const m4 = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    updaters.push((t) => {
      for (let i = 0; i < n; i++) {
        const g = gs[i];
        const a = g.ph + t * g.sp;
        qq.setFromAxisAngle(up, -a + (g.sp > 0 ? Math.PI : 0));
        m4.compose(new THREE.Vector3(g.cx + Math.cos(a) * g.r, g.y + Math.sin(t * 0.7 + g.ph) * 0.6, g.cz + Math.sin(a) * g.r), qq, new THREE.Vector3(g.s, g.s, g.s));
        gulls.setMatrixAt(i, m4);
      }
      gulls.instanceMatrix.needsUpdate = true;
    });
    group.add(gulls);
  }

  // lantern halos
  if (q > 0) {
    const glows = makeGlows(glowPoints.map((p) => [p[0], p[1], p[2], p[3] * 1.0]), { size: 1.5, color: 0xffb74a, intensity: 1.6, flicker: 0.18 });
    // halos attached to moving rafts must follow them: rebuild per-root halos instead
    group.add(glows.mesh);
    updaters.push(glows.update);
  }

  // ================================================================== HAZARD FLOURISH (ship cannons)
  const flashes = makeFlashPool(group, { count: 8, color: 0xffcf73, intensity: 5 });
  const smoke = q > 0 ? makeSmokePool(group, 10) : null;
  updaters.push((t) => { flashes.update(t); if (smoke) smoke.update(t); });
  let lastT = 0;
  function onHazard(evt) {
    if (!evt || (evt.kind && evt.kind !== 'cannon')) return;
    if (!ships.length) return;
    // pick the ship on the side the shot comes from
    let best = ships[0];
    let bestD = Infinity;
    const ex = evt.x !== undefined ? evt.x : 0;
    for (const s of ships) {
      const d = Math.abs(s.group.position.x - ex * 3) + (s.group.position.z < -80 ? 40 : 0);
      if (d < bestD) { bestD = d; best = s; }
    }
    best.group.updateMatrixWorld(true);
    const isWarn = evt.type === 'hazardWarn';
    const ms = best.muzzles.filter((m) => {
      const w = m.clone().applyMatrix4(best.group.matrixWorld);
      const c = new THREE.Vector3(m.x, m.y, 0).applyMatrix4(best.group.matrixWorld);
      return w.z > c.z; // side facing the dock
    });
    const list = ms.length ? ms : best.muzzles;
    const n = isWarn ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const m = list[Math.floor(Math.random() * list.length)].clone().applyMatrix4(best.group.matrixWorld);
      flashes.fire(m.x, m.y, m.z, isWarn ? 6 : 10, 0.45, i * 0.12);
      if (smoke) smoke.fire(m.x, m.y, m.z, lastT + i * 0.12);
    }
    best.kick(lastT, 1);
  }
  updaters.push((t) => { lastT = t; });

  // ------------------------------------------------------------------ smoke pool helper (cannon puffs)
  function makeSmokePool(parent, count) {
    const items = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: smokeTexture(), color: 0xf4efe6, transparent: true, depthWrite: false, opacity: 0 });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 13;
      m.userData.noShadow = true;
      m.onBeforeRender = (r, s, cam) => { const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld); m.matrixWorld.compose(p, cam.quaternion, m.scale); };
      parent.add(m);
      items.push({ m, t0: -10, base: new THREE.Vector3() });
    }
    let k = 0;
    return {
      fire(x, y, z, t0) { const it = items[k++ % count]; it.base.set(x, y, z); it.t0 = t0; },
      update(t) {
        for (const it of items) {
          const a = (t - it.t0) / 2.4;
          if (a < 0 || a > 1) { it.m.visible = false; continue; }
          it.m.visible = true;
          const s = 2 + a * 6;
          it.m.scale.set(s, s, s);
          it.m.position.set(it.base.x, it.base.y + a * 3, it.base.z + a * 2);
          it.m.material.opacity = 0.85 * (1 - a);
        }
      },
    };
  }

  // ------------------------------------------------------------------ update / dispose
  const extraTex = [boardTex, boardTex2, plankTex, ropeTex, sailTex, flagTex];
  for (const s of ships) updaters.push(s.update);
  function update(time, dt) {
    for (const m of clothMats) m.userData.uTime.value = time;
    for (const fn of updaters) fn(time, dt);
  }
  function dispose() {
    disposeGroup(group, extraTex);
    unit.dispose();
    cyl8.dispose();
  }
  return { group, sun, platformObjects, update, background, fog, dispose, onHazard };
}

