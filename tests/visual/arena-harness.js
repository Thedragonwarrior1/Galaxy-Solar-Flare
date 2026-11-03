// Visual harness for the arena environments (bundled by scripts/build.js, opened via tests/visual/arena.html).
// URL params: arena, quality (low|medium|high), yaw, pitch, dist, t (seconds of animation), frames, bloom (0|1),
//             w, h (render size), live (1 = keep animating), dummies (0|1), focusY
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ARENAS, platformAt } from '../../src/shared/sim/arenas.js';
import { buildArena } from '../../src/client/render/arenas/index.js';
import { toonMat, addOutline } from '../../src/client/render/toon.js';

const qs = new URLSearchParams(location.search);
const id = qs.get('arena') || 'pirate_haven';
const A = ARENAS[id];
const quality = qs.get('quality') || 'high';
const yaw = parseFloat(qs.get('yaw') || String(A.camera.yaw || 0));
const pitch = parseFloat(qs.get('pitch') || String(A.camera.pitch));
const dist = parseFloat(qs.get('dist') || '26');
const focusY = parseFloat(qs.get('focusY') || String(A.camera.focusY));
const T = parseFloat(qs.get('t') || '3');
const frames = Math.max(1, parseInt(qs.get('frames') || '6', 10));
const bloomOn = qs.has('bloom') ? qs.get('bloom') === '1' : quality !== 'low';
const live = qs.get('live') === '1';
const W = parseInt(qs.get('w') || String(window.innerWidth), 10);
const H = parseInt(qs.get('h') || String(window.innerHeight), 10);
const showDummies = qs.get('dummies') !== '0';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1200);
const focus = new THREE.Vector3(0, focusY, 0);
camera.position.set(
  focus.x + dist * Math.sin(yaw) * Math.cos(pitch),
  focus.y + dist * Math.sin(pitch),
  focus.z + dist * Math.cos(yaw) * Math.cos(pitch),
);
camera.lookAt(focus);

const t0 = performance.now();
const arena = buildArena(id, { quality, arena: A });
const buildMs = performance.now() - t0;
scene.add(arena.group);
scene.background = arena.background || null;
scene.fog = arena.fog || null;

// shadows (caller-side configuration, as the game renderer would do)
const sun = arena.sun;
sun.castShadow = true;
const sm = quality === 'high' ? 2048 : 1024;
sun.shadow.mapSize.set(sm, sm);
const sc = sun.shadow.camera;
sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160;
sc.updateProjectionMatrix();

// dummy fighters (1.8 tall capsules) for scale
const dummies = [];
if (showDummies) {
  const cols = [0xe8463a, 0x3b7bd9, 0x3fbf5a, 0xf2c14e, 0xb05ad9, 0xff8a3d];
  const capsule = new THREE.CapsuleGeometry(0.45, 0.9, 6, 12);
  const mk = (i, get) => {
    const m = new THREE.Mesh(capsule, toonMat(cols[i % cols.length], { rim: 0.4 }));
    addOutline(m, 0.035, 0x1b1226);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    dummies.push({ m, get });
  };
  A.spawns.forEach((s, i) => mk(i, () => [s[0], s[1], s[2]]));
  A.platforms.filter((p) => p.id !== 'main' && p.kind === 'soft').forEach((p, i) => {
    mk(4 + i, (frame) => { const q = platformAt(p, frame); return [q.x + 0.6, q.top, q.z]; });
  });
}

function place(time) {
  const frame = time * 60;
  for (const p of A.platforms) {
    const q = platformAt(p, frame);
    arena.platformObjects[p.id].position.set(q.x, q.top, q.z);
  }
  for (const d of dummies) {
    const [x, y, z] = d.get(frame);
    d.m.position.set(x, y + 0.9, z);
  }
}

let composer = null;
if (bloomOn) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.85));
  composer.addPass(new OutputPass());
}
const draw = () => (composer ? composer.render() : renderer.render(scene, camera));

renderer.info.autoReset = false;
const times = [];
let tPrev = T - (frames - 1) / 30;
function step(time) {
  const dt = Math.max(1 / 60, time - tPrev);
  tPrev = time;
  arena.update(time, dt);
  place(time);
  const a = performance.now();
  renderer.info.reset();
  draw();
  times.push(performance.now() - a);
}

// optional: fire a hazard flourish mid-way (hazard=1)
const hazardKind = { pirate_haven: 'cannon', marine_fortress: 'barrage', sky_kingdom: 'wind', volcanic_island: 'geyser' }[id];
const hazardAt = qs.has('hazard') ? parseFloat(qs.get('hazard')) : -1;
let hazardFired = false;

for (let i = 0; i < frames; i++) {
  const time = T - (frames - 1 - i) / 30;
  step(time);
  // events arrive between frames in the game, i.e. after at least one update()
  if (!hazardFired && hazardAt >= 0 && time >= hazardAt) {
    hazardFired = true;
    arena.onHazard({ type: 'hazardWarn', kind: hazardKind, x: 4, y: 0, z: 0, dir: 1 });
    arena.onHazard({ type: 'hazard', kind: hazardKind, x: 4, y: 0, z: 0, dir: 1 });
  }
}
// scene-only stats (one plain render incl. shadow pass)
renderer.info.reset();
renderer.render(scene, camera);
const calls = renderer.info.render.calls;
const triangles = renderer.info.render.triangles;
renderer.info.reset();
draw();
const totalCalls = renderer.info.render.calls;
const avg = times.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, times.length - 1);

// count shadow casters for reference
let casters = 0;
let meshes = 0;
arena.group.traverse((o) => { if (o.isMesh) { meshes++; if (o.castShadow) casters++; } });

window.__stats = {
  arena: id, quality, calls, triangles, totalCallsWithPost: totalCalls, avgFrameMs: +avg.toFixed(1), buildMs: +buildMs.toFixed(1),
  meshes, casters, programs: renderer.info.programs ? renderer.info.programs.length : -1,
  geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
};
// Geometry check: walkable-top overhang + anything protruding above each platform's top surface.
if (qs.get('check') === '1') {
  const report = {};
  const v = new THREE.Vector3();
  for (const p of A.platforms) {
    const root = arena.platformObjects[p.id];
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    let overhang = -Infinity;
    let above = -Infinity;
    let aboveName = '';
    let bottom = Infinity;
    root.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline || o.material.transparent && o.material.blending === THREE.AdditiveBlending) return;
      if (o.geometry.isInstancedBufferGeometry) return;
      const pos = o.geometry.attributes.position;
      const m = inv.clone().multiply(o.matrixWorld);
      const insts = o.isInstancedMesh ? o.count : 1;
      for (let k = 0; k < insts; k++) {
        const mi = new THREE.Matrix4();
        if (o.isInstancedMesh) o.getMatrixAt(k, mi);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          if (o.isInstancedMesh) v.applyMatrix4(mi);
          v.applyMatrix4(m);
          const ext = p.shape === 'cyl' ? Math.hypot(v.x, v.z) - p.r : Math.max(Math.abs(v.x) - p.hx, Math.abs(v.z) - p.hz);
          if (v.y > -0.3 && v.y < 0.3) overhang = Math.max(overhang, ext);
          if (ext < 0.15 && v.y > above) { above = v.y; aboveName = o.name || o.material.type; }
          bottom = Math.min(bottom, v.y);
        }
      }
    });
    report[p.id] = { overhang: +overhang.toFixed(3), maxAboveTop: +above.toFixed(3), aboveName, lowest: +bottom.toFixed(2), thick: p.thick };
  }
  window.__check = report;
  console.log('CHECK ' + JSON.stringify(report));
}
window.__arena = arena;
window.__done = true;
console.log('STATS ' + JSON.stringify(window.__stats));

if (qs.get('dispose') === '1') {
  scene.remove(arena.group);
  arena.dispose();
  renderer.info.reset();
  renderer.render(scene, camera);
  window.__afterDispose = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  console.log('AFTER_DISPOSE ' + JSON.stringify(window.__afterDispose));
}

if (live) {
  const start = performance.now();
  const loop = () => {
    step(T + (performance.now() - start) / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
