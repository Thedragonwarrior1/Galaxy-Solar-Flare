// Headless contract test for the arena environments (no WebGL needed).
// Run: node --test tests/visual/arena-contract.test.js
// Builds every arena at every quality with a stub 2D canvas, then checks the visual contract from
// docs/ARCHITECTURE.md and that walkable top surfaces match the collision footprints in src/shared/sim/arenas.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARENAS, ARENA_IDS, platformAt } from '../../src/shared/sim/arenas.js';

// --- minimal DOM canvas stub (drawing calls are no-ops) ---
function fakeContext() {
  const grad = { addColorStop() {} };
  const target = { canvas: null };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
globalThis.document = globalThis.document || {
  createElement: (tag) => {
    if (tag !== 'canvas') throw new Error('stub only supports canvas');
    const c = { width: 1, height: 1, style: {}, getContext: () => { const g = fakeContext(); g.canvas = c; return g; } };
    return c;
  },
  createElementNS: (ns, tag) => globalThis.document.createElement(tag),
};

const { buildArena } = await import('../../src/client/render/arenas/index.js');

const MAX_OVERHANG = 0.15;

function measure(root, p) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  let overhang = -Infinity;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || o.geometry.isInstancedBufferGeometry) return;
    if (o.material.blending === THREE.AdditiveBlending) return;
    const pos = o.geometry.attributes.position;
    const m = inv.clone().multiply(o.matrixWorld);
    const mi = new THREE.Matrix4();
    for (let k = 0; k < (o.isInstancedMesh ? o.count : 1); k++) {
      if (o.isInstancedMesh) o.getMatrixAt(k, mi);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (o.isInstancedMesh) v.applyMatrix4(mi);
        v.applyMatrix4(m);
        if (v.y < -0.3 || v.y > 0.3) continue;
        const ext = p.shape === 'cyl' ? Math.hypot(v.x, v.z) - p.r : Math.max(Math.abs(v.x) - p.hx, Math.abs(v.z) - p.hz);
        overhang = Math.max(overhang, ext);
      }
    }
  });
  return overhang;
}

for (const id of ARENA_IDS) {
  for (const quality of ['low', 'medium', 'high']) {
    test(`${id} (${quality}) honours the arena visual contract`, () => {
      const A = ARENAS[id];
      const res = buildArena(id, { quality, arena: A });
      assert.ok(res.group && res.group.isGroup, 'group');
      assert.ok(res.sun && res.sun.isDirectionalLight, 'sun is a DirectionalLight');
      let sunInside = false;
      let targetInside = false;
      res.group.traverse((o) => { if (o === res.sun) sunInside = true; if (o === res.sun.target) targetInside = true; });
      assert.ok(sunInside && targetInside, 'sun and sun.target live inside group');
      assert.equal(typeof res.update, 'function');
      assert.equal(typeof res.dispose, 'function');
      assert.equal(typeof res.onHazard, 'function');
      assert.ok(res.background === null || res.background.isColor || res.background.isTexture, 'background');
      assert.ok(res.fog === null || res.fog.isFog || res.fog.isFogExp2, 'fog');
      for (const p of A.platforms) {
        const root = res.platformObjects[p.id];
        assert.ok(root && root.isObject3D, `platformObjects.${p.id}`);
        let inGroup = false;
        res.group.traverse((o) => { if (o === root) inGroup = true; });
        assert.ok(inGroup, `${p.id} root is inside group`);
        assert.deepEqual([root.position.x, root.position.y, root.position.z], [p.x, p.top, p.z], `${p.id} rest placement`);
        const oh = measure(root, p);
        assert.ok(oh <= MAX_OVERHANG + 1e-6, `${p.id}: top-surface overhang ${oh.toFixed(3)} > ${MAX_OVERHANG}`);
        assert.ok(oh >= -0.05, `${p.id}: walkable top does not reach the footprint edge (${oh.toFixed(3)})`);
      }
      // animate a few frames incl. moving platforms + hazard flourishes
      for (let f = 0; f < 5; f++) {
        const t = f / 60;
        res.update(t, 1 / 60);
        for (const p of A.platforms) {
          const q = platformAt(p, f);
          res.platformObjects[p.id].position.set(q.x, q.top, q.z);
        }
      }
      res.onHazard({ type: 'hazardWarn', kind: A.hazard, x: 2, y: 0, z: 0, dir: 1 });
      res.onHazard({ type: 'hazard', kind: A.hazard, x: 2, y: 0, z: 0, dir: -1 });
      res.update(0.2, 1 / 60);
      // rough draw-call bound: visible meshes (shadow pass excluded)
      let meshes = 0;
      res.group.traverse((o) => { if (o.isMesh) meshes++; });
      const budget = { low: 60, medium: 100, high: 150 }[quality];
      assert.ok(meshes <= budget, `${meshes} meshes exceeds the ${quality} budget ${budget}`);
      res.dispose();
    });
  }
}

test('unknown arena id throws', () => {
  assert.throws(() => buildArena('nope', { quality: 'low', arena: ARENAS.pirate_haven }));
});
