// Visual harness: renders all fighters (idle / run / attack frames) for screenshot review.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ROSTER } from '../../src/shared/characters/index.js';
import { FighterModel } from '../../src/client/render/characterModels.js';
import { FighterAnimator } from '../../src/client/render/animator.js';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') || 'idle';
const move = q.get('move') || 'fwdHeavy';
const frame = +(q.get('frame') || 14);
const only = q.get('char');
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec9ff);
const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xdff2ff, 0x6b5a4a, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4); sun.position.set(6, 12, 8); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshToonMaterial({ color: 0xc9a46a }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const list = only ? ROSTER.filter((c) => c.id === only) : ROSTER;
const fighters = [];
list.forEach((def, i) => {
  const m = new FighterModel(def, 'high');
  m.addTo(scene);
  const a = new FighterAnimator(m);
  const x = (i - (list.length - 1) / 2) * 2.1;
  const f = { def, charId: def.id, state: 'idle', sf: 10, facing: q.get('facing') ? +q.get('facing') : 0.35, vel: { x: 0, y: 0, z: 0 }, kb: { x: 0, y: 0, z: 0 }, grounded: true, scale: 1, transform: 0, height: def.stats.height, mf: 0, move: null, mdef: null };
  if (mode === 'run') f.vel = { x: 0, y: 0, z: def.stats.runSpeed };
  if (mode === 'move') { f.state = 'move'; f.move = move; f.mdef = def.moves[move]; f.mf = frame; f.grounded = f.mdef.kind !== 'air'; }
  if (mode === 'air') { f.state = 'air'; f.grounded = false; f.vel.y = 5; }
  if (mode === 'monster' && def.id === 'monster_doctor') { f.transform = 100; f.scale = 1.45; }
  fighters.push({ m, a, f, pos: { x, y: f.grounded ? 0 : 1.2, z: 0 } });
});
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.5, 0.4, 0.85));
composer.addPass(new OutputPass());
const span = list.length * 2.1;
const zoom = +(q.get('zoom') || 1);
cam.position.set(0, 1.6, (span * 0.95 + 3) / zoom);
cam.lookAt(0, 1.05, 0);
let t = 0;
for (let i = 0; i < 30; i++) { t += 1 / 60; for (const F of fighters) { if (mode === 'run') F.f.sf++; F.a.update(F.f, F.pos, 1 / 60, mode === 'victory' ? 'victory' : 'game'); } }
composer.render();
window.__done = true;
