// Shared helpers for the procedural arena environments.
// Everything here is procedural: merged geometry batches, canvas textures and small GLSL shaders.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMat, glowTexture, gradientMap, canvasTexture, rng, addOutline } from '../toon.js';

export { toonMat, canvasTexture, rng, glowTexture, addOutline };

export const QUALITY_LEVEL = { low: 0, medium: 1, high: 2 };
export const qLevel = (q) => (QUALITY_LEVEL[q] !== undefined ? QUALITY_LEVEL[q] : 1);

// ---------------------------------------------------------------------------------------------
// Math / transform helpers
// ---------------------------------------------------------------------------------------------
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Matrix from position / euler rotation / scale. */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}

/** Matrix that places a unit-height Y-axis geometry (centred at origin) between points a and b. */
export function between(a, b, radiusScale = 1) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const len = d.length();
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(radiusScale, len, radiusScale));
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function color(hex) {
  return new THREE.Color(hex);
}

/** Mix two hex colours (sRGB-space mix is fine for art purposes); returns THREE.Color. */
export function mixHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** Slight random variation of a colour (lightness jitter). */
export function jitter(hex, r, amt = 0.08) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h + (r() - 0.5) * amt * 0.25, clamp(hsl.s + (r() - 0.5) * amt, 0, 1), clamp(hsl.l + (r() - 0.5) * amt, 0, 1));
  return c;
}

// ---------------------------------------------------------------------------------------------
// Geometry batching (merge many small parts into one draw call with vertex colours)
// ---------------------------------------------------------------------------------------------
const BASE_ATTRS = ['position', 'normal', 'uv', 'color'];

/**
 * Accumulates transformed, vertex-coloured copies of geometries and merges them into one mesh.
 * extra: { attrName: itemSize } custom attributes every part receives (default 0 / provided value).
 */
export class Batch {
  constructor(extra = {}) {
    this.parts = [];
    this.extra = extra;
  }

  /**
   * geo: source geometry (not modified). m: Matrix4 or null.
   * col: hex | THREE.Color | (pos:Vector3, nrm:Vector3, i) => THREE.Color
   * attrs: { name: number | number[] | (pos, i) => number|number[] }
   */
  add(geo, m = null, col = 0xffffff, attrs = {}, opts = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (opts && opts.uvScale && g.attributes.uv) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * opts.uvScale[0], uv.getY(i) * opts.uvScale[1]);
    }
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (opts && opts.worldUV) {
      // box-projected UVs in world units / tile (dominant normal axis)
      const tile = opts.worldUV;
      const pos = g.attributes.position;
      const nrm = g.attributes.normal;
      const uv = g.attributes.uv;
      const ox = opts.uvOffset ? opts.uvOffset[0] : 0;
      const oy = opts.uvOffset ? opts.uvOffset[1] : 0;
      for (let i = 0; i < n; i++) {
        const ax = Math.abs(nrm.getX(i));
        const ay = Math.abs(nrm.getY(i));
        const az = Math.abs(nrm.getZ(i));
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (ay >= ax && ay >= az) uv.setXY(i, x / tile + ox, z / tile + oy);
        else if (ax >= az) uv.setXY(i, z / tile + ox, y / tile + oy);
        else uv.setXY(i, x / tile + ox, y / tile + oy);
      }
    }
    const carr = new Float32Array(n * 3);
    if (typeof col === 'function') {
      const pos = g.attributes.position;
      const nrm = g.attributes.normal;
      const v = new THREE.Vector3();
      const nv = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, i);
        nv.fromBufferAttribute(nrm, i);
        const c = col(v, nv, i);
        carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b;
      }
    } else {
      const c = col && col.isColor ? col : new THREE.Color(col);
      for (let i = 0; i < n; i++) { carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(carr, 3));
    for (const [name, size] of Object.entries(this.extra)) {
      const arr = new Float32Array(n * size);
      const val = attrs[name];
      if (typeof val === 'function') {
        const pos = g.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          v.fromBufferAttribute(pos, i);
          const r = val(v, i);
          if (size === 1) arr[i] = r; else for (let k = 0; k < size; k++) arr[i * size + k] = r[k];
        }
      } else if (val !== undefined) {
        for (let i = 0; i < n; i++) {
          if (size === 1) arr[i] = val; else for (let k = 0; k < size; k++) arr[i * size + k] = val[k];
        }
      } else if (g.attributes[name]) {
        arr.set(g.attributes[name].array.subarray(0, n * size));
      }
      g.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
    }
    const keep = new Set([...BASE_ATTRS, ...Object.keys(this.extra)]);
    for (const k of Object.keys(g.attributes)) if (!keep.has(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    g.clearGroups();
    this.parts.push(g);
    return g;
  }

  get empty() {
    return this.parts.length === 0;
  }

  geometry() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Build mesh (or null when empty). opts: { cast, receive, name, outline } */
  mesh(material, opts = {}) {
    const g = this.geometry();
    if (!g) return null;
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = !!opts.cast;
    mesh.receiveShadow = opts.receive !== undefined ? !!opts.receive : true;
    if (opts.name) mesh.name = opts.name;
    mesh.matrixAutoUpdate = opts.dynamic ? true : false;
    mesh.updateMatrix();
    return mesh;
  }
}

/**
 * Ink outline for merged / flat-shaded meshes: welds vertices into a smooth-normal copy of the mesh so the
 * inverted-hull extrusion of toon.js's addOutline has no cracks, then attaches that outline to the mesh.
 */
export function inkOutline(mesh, thickness = 0.05, color = 0x1b1226) {
  if (!mesh) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', mesh.geometry.attributes.position.clone());
  const smoothGeo = mergeVertices(g, 1e-3);
  g.dispose();
  smoothGeo.computeVertexNormals();
  smoothGeo.computeBoundingSphere();
  const carrier = new THREE.Mesh(smoothGeo);
  const o = addOutline(carrier, thickness, color);
  mesh.add(o); // re-parents the outline from the carrier to the mesh
  o.matrixAutoUpdate = false;
  o.updateMatrix();
  return o;
}

/** Add a batch mesh into parent if non-empty. Returns mesh or null. */
export function addBatch(parent, batch, material, opts) {
  const m = batch.mesh(material, opts);
  if (m) parent.add(m);
  return m;
}

/** Flat-shaded jagged rock geometry (non-indexed). */
export function rockGeo(r, seed = 1, detail = 1, squash = 1, jag = 0.28) {
  const R = rng(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const cache = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) { k = 1 + (R() - 0.5) * 2 * jag; cache.set(key, k); }
    v.multiplyScalar(r * k);
    v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Tube along a list of points (for ropes, chains, vines, roots). */
export function tubeGeo(points, radius = 0.05, radial = 5, tubular = null, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular || Math.max(4, points.length * 6), radius, radial, closed);
}

/** Rope sagging between two points (catenary-ish), returns array of Vector3. */
export function sagPoints(a, b, sag, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(new THREE.Vector3(lerp(a[0], b[0], t), lerp(a[1], b[1], t) - Math.sin(Math.PI * t) * sag, lerp(a[2], b[2], t)));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------

/** Vertex-coloured toon material (optionally textured). */
export function vcMat(opts = {}) {
  return toonMat(0xffffff, { vertexColors: true, ...opts });
}

/** Unlit HDR emissive material (values > 1 so it blooms). */
export function glowMat(hex, intensity = 2.5, opts = {}) {
  const c = new THREE.Color(hex).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, fog: opts.fog !== undefined ? opts.fog : true, vertexColors: !!opts.vertexColors, transparent: !!opts.transparent, opacity: opts.opacity !== undefined ? opts.opacity : 1, side: opts.side || THREE.FrontSide, depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : true, blending: opts.blending || THREE.NormalBlending });
}

/**
 * Wrap a (toon) material with vertex wind displacement driven by attribute aWave (0 pinned .. 1 free).
 * Displacement is along the object-space normal: billow + travelling wave. Updates via mat.userData.uTime.
 */
export function clothify(mat, { amp = 0.12, billow = 0.0, freq = 1.0, speed = 3.0, spatial = 0.35 } = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: amp },
    uBillow: { value: billow },
    uFreq: { value: freq },
    uSpeed: { value: speed },
    uSpatial: { value: spatial },
  };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWave;\nuniform float uTime, uAmp, uBillow, uFreq, uSpeed, uSpatial;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wIid = 0.0;
        #ifdef USE_INSTANCING
          wIid = float(gl_InstanceID) * 1.618;
        #endif
        float wPh = uTime * uSpeed - aWave * uFreq * 6.2831 + (position.x + position.y * 0.6 + position.z) * uSpatial + wIid;
        transformed += objectNormal * aWave * (uBillow + uAmp * (sin(wPh) + 0.35 * sin(wPh * 2.3 + 1.7)));`
      );
  };
  mat.customProgramCacheKey = () => 'toon-rim-cloth';
  mat.userData.uTime = uniforms.uTime;
  mat.userData.wave = uniforms;
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------------------------
/**
 * Sun + hemisphere (+ optional ambient). Sun target is added to group too.
 * dir: direction the light COMES FROM (unnormalised).
 */
export function makeLights(group, { sunColor = 0xffffff, sunIntensity = 2.8, dir = [-0.5, 1, 0.6], hemiSky = 0xbfe3ff, hemiGround = 0x6b5a4a, hemiIntensity = 1.2, ambient = 0, ambientIntensity = 0 } = {}) {
  const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
  const d = new THREE.Vector3(...dir).normalize();
  sun.position.copy(d).multiplyScalar(60);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 160;
  sc.updateProjectionMatrix();
  sun.name = 'sun';
  group.add(sun);
  group.add(sun.target);
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, hemiIntensity);
  hemi.name = 'hemi';
  group.add(hemi);
  if (ambientIntensity > 0) {
    const amb = new THREE.AmbientLight(ambient, ambientIntensity);
    group.add(amb);
  }
  return { sun, hemi, sunDir: d };
}

// ---------------------------------------------------------------------------------------------
// GLSL snippets
// ---------------------------------------------------------------------------------------------
export const GLSL_NOISE = /* glsl */ `
vec3 gbMod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 gbMod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 gbPermute(vec3 x){ return gbMod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = gbMod289(i);
  vec3 p = gbPermute(gbPermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float gbHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gbHash(i), gbHash(i + vec2(1.0, 0.0)), u.x), mix(gbHash(i + vec2(0.0, 1.0)), gbHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p){ return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03 + 17.1) + 0.125 * snoise(p * 4.01 - 9.7); }
`;

export const GLSL_OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
`;

/** Clone of three's fog uniforms merged with custom ones (custom values are NOT cloned). */
export function fogUniforms(custom) {
  const u = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  return Object.assign(u, custom);
}

// ---------------------------------------------------------------------------------------------
// Sky dome (gradient + sun glow + painted anime clouds band)
// ---------------------------------------------------------------------------------------------
/**
 * opts: { top, mid, horizon, below, sunDir(Vector3), sunColor, sunGlow, clouds: { seed, count, lit, shade, rim, alt } , radius, cloudBand }
 */
export function makeSky(opts) {
  const R = rng(opts.clouds ? opts.clouds.seed || 7 : 7);
  let cloudTex = null;
  if (opts.clouds) {
    const c = opts.clouds;
    cloudTex = canvasTexture(2048, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const n = c.count || 18;
      for (let k = 0; k < n; k++) {
        const big = R() < 0.45;
        const cw = (big ? 180 : 90) + R() * (big ? 260 : 120);
        const cx = R() * w;
        const baseY = h - (c.low || 20) - R() * (big ? 120 : 300); // y from top; bottom of canvas = horizon
        const ch = cw * (0.28 + R() * 0.25);
        const puffs = [];
        const np = 7 + Math.floor(R() * 8);
        for (let i = 0; i < np; i++) {
          const t = (i + 0.5) / np;
          const px = cx - cw / 2 + t * cw + (R() - 0.5) * cw * 0.1;
          const hump = Math.sin(t * Math.PI);
          const r = ch * (0.32 + 0.55 * hump) * (0.75 + R() * 0.4);
          const py = baseY - r * 0.55 - hump * ch * 0.35;
          puffs.push([px, py, r]);
        }
        const drawAll = (dx) => {
          // shade layer
          g.fillStyle = c.shade || '#c9c3ea';
          for (const [px, py, r] of puffs) { g.beginPath(); g.arc(px + dx, py, r, 0, Math.PI * 2); g.fill(); }
          g.fillRect(cx - cw / 2 + dx, baseY - ch * 0.35, cw, ch * 0.35);
          // lit layer (shifted up/left, leaving a cel shadow band at the bottom)
          g.fillStyle = c.lit || '#ffffff';
          for (const [px, py, r] of puffs) { g.beginPath(); g.arc(px + dx - r * 0.06, py - r * 0.18, r * 0.9, 0, Math.PI * 2); g.fill(); }
          // rim tint on top
          if (c.rim) {
            g.fillStyle = c.rim;
            for (const [px, py, r] of puffs) { g.beginPath(); g.arc(px + dx - r * 0.18, py - r * 0.42, r * 0.42, 0, Math.PI * 2); g.fill(); }
          }
          // flat bottom cut
          g.clearRect(cx - cw / 2 - 20 + dx, baseY, cw + 40, 400);
        };
        g.save();
        g.globalAlpha = (c.alpha || 0.95) * (big ? 1 : 0.85);
        drawAll(0);
        if (cx - cw / 2 < 0) drawAll(w);
        if (cx + cw / 2 > w) drawAll(-w);
        g.restore();
      }
      // a few wispy streaks higher up
      g.globalAlpha = 0.35;
      g.strokeStyle = c.lit || '#ffffff';
      g.lineCap = 'round';
      for (let k = 0; k < (c.wisps || 10); k++) {
        const y = 40 + R() * 200;
        const x = R() * w;
        const len = 120 + R() * 300;
        g.lineWidth = 4 + R() * 10;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len / 2, y - 10 - R() * 20, x + len, y + (R() - 0.5) * 20);
        g.stroke();
      }
      g.globalAlpha = 1;
    });
    cloudTex.wrapS = THREE.RepeatWrapping;
    cloudTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  const uniforms = {
    uTop: { value: new THREE.Color(opts.top) },
    uMid: { value: new THREE.Color(opts.mid) },
    uHorizon: { value: new THREE.Color(opts.horizon) },
    uBelow: { value: new THREE.Color(opts.below !== undefined ? opts.below : opts.horizon) },
    uSunDir: { value: (opts.sunDir || new THREE.Vector3(0, 1, 0)).clone().normalize() },
    uSunColor: { value: new THREE.Color(opts.sunColor || 0xfff2cc) },
    uSunGlow: { value: opts.sunGlow !== undefined ? opts.sunGlow : 0.5 },
    uSunDisc: { value: opts.sunDisc !== undefined ? opts.sunDisc : 3.0 },
    uClouds: { value: cloudTex },
    uHasClouds: { value: cloudTex ? 1 : 0 },
    uCloudBand: { value: opts.cloudBand || 0.6 },
    uTime: { value: 0 },
    uCloudSpeed: { value: opts.cloudSpeed !== undefined ? opts.cloudSpeed : 0.002 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uBelow, uSunDir, uSunColor;
      uniform float uSunGlow, uSunDisc, uHasClouds, uCloudBand, uTime, uCloudSpeed;
      uniform sampler2D uClouds;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float e = d.y;
        vec3 col;
        if (e >= 0.0) {
          col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, e));
          col = mix(col, uTop, smoothstep(0.18, 0.85, e));
        } else {
          col = mix(uHorizon, uBelow, smoothstep(0.0, -0.25, e));
        }
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 6.0) * 0.25 + pow(sd, 48.0) * 0.5) * uSunGlow;
        col += uSunColor * smoothstep(0.9975, 0.9985, sd) * uSunDisc;
        if (uHasClouds > 0.5 && e > -0.02) {
          float u = atan(d.x, -d.z) / 6.28318 + 0.5 + uTime * uCloudSpeed;
          float el = asin(clamp(e, 0.0, 1.0));
          float v = 1.0 - clamp(el / uCloudBand, 0.0, 1.0);
          vec4 c = texture2D(uClouds, vec2(u, v));
          float fade = smoothstep(-0.02, 0.03, e) * (1.0 - smoothstep(0.92, 1.0, 1.0 - v));
          col = mix(col, c.rgb + uSunColor * pow(sd, 10.0) * 0.4, c.a * fade);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const geo = new THREE.SphereGeometry(opts.radius || 470, 48, 24);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { mesh, update: (t) => { uniforms.uTime.value = t; }, uniforms };
}

// ---------------------------------------------------------------------------------------------
// GPU-animated billboard particles (one draw call)
// ---------------------------------------------------------------------------------------------
let smokeTex = null;
export function smokeTexture() {
  if (smokeTex) return smokeTex;
  const R = rng(99);
  smokeTex = canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const a = R() * Math.PI * 2;
      const rr = R() * 22;
      const x = w / 2 + Math.cos(a) * rr;
      const y = h / 2 + Math.sin(a) * rr;
      const r = 22 + R() * 22;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.3)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }, { srgb: false });
  smokeTex.userData.shared = true;
  return smokeTex;
}

function instQuad() {
  const q = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = q.index;
  geo.setAttribute('position', q.attributes.position);
  geo.setAttribute('uv', q.attributes.uv);
  return geo;
}

/**
 * opts: {
 *   count, seed, spawn(r) -> [x,y,z], vel(r) -> [vx,vy,vz], life, size, sizeVar, grow, accel:[x,y,z],
 *   colorA, colorB, intensity, opacity, additive, map, fadeIn, fadeOut, wobble, spin, fog
 * }
 */
export function makeParticles(opts) {
  const n = opts.count;
  const R = rng(opts.seed || 3);
  const base = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = opts.spawn(R, i);
    base.set(p, i * 3);
    const v = opts.vel ? opts.vel(R, i) : [0, 0, 0];
    vel.set(v, i * 3);
    seed[i * 4] = R();
    seed[i * 4 + 1] = 1 + (R() - 0.5) * 2 * (opts.sizeVar !== undefined ? opts.sizeVar : 0.4);
    seed[i * 4 + 2] = (R() - 0.5) * 2 * (opts.spin !== undefined ? opts.spin : 0.6);
    seed[i * 4 + 3] = R();
  }
  const geo = instQuad();
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aVel', new THREE.InstancedBufferAttribute(vel, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = n;
  const k = opts.intensity !== undefined ? opts.intensity : 1;
  const uniforms = fogUniforms({
    uTime: { value: 0 },
    uLife: { value: opts.life || 4 },
    uSize: { value: opts.size || 0.5 },
    uGrow: { value: opts.grow !== undefined ? opts.grow : 1 },
    uAccel: { value: new THREE.Vector3(...(opts.accel || [0, 0, 0])) },
    uColorA: { value: new THREE.Color(opts.colorA || 0xffffff).multiplyScalar(k) },
    uColorB: { value: new THREE.Color(opts.colorB !== undefined ? opts.colorB : opts.colorA || 0xffffff).multiplyScalar(k) },
    uOpacity: { value: opts.opacity !== undefined ? opts.opacity : 1 },
    uFadeIn: { value: opts.fadeIn !== undefined ? opts.fadeIn : 0.15 },
    uFadeOut: { value: opts.fadeOut !== undefined ? opts.fadeOut : 0.6 },
    uWobble: { value: opts.wobble || 0 },
    uMap: { value: opts.map || glowTexture() },
    uRate: { value: 1 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aBase; attribute vec3 aVel; attribute vec4 aSeed;
      uniform float uTime, uLife, uSize, uGrow, uFadeIn, uFadeOut, uWobble;
      uniform vec3 uAccel, uColorA, uColorB;
      varying vec2 vUv; varying float vAlpha; varying vec3 vCol;
      #include <fog_pars_vertex>
      void main(){
        float age = fract(uTime / uLife + aSeed.x);
        float t = age * uLife;
        vec3 p = aBase + aVel * t + 0.5 * uAccel * t * t;
        float ph = aSeed.w * 6.2831;
        p.x += sin(uTime * 0.9 + ph) * uWobble * (0.3 + age);
        p.z += cos(uTime * 0.7 + ph * 1.3) * uWobble * (0.3 + age);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        float size = uSize * aSeed.y * mix(1.0, uGrow, age);
        float ang = aSeed.z * uTime + ph;
        vec2 c = position.xy;
        c = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
        mvPosition.xy += c * size;
        vAlpha = smoothstep(0.0, uFadeIn, age) * (1.0 - smoothstep(uFadeOut, 1.0, age));
        vCol = mix(uColorA, uColorB, age);
        vUv = uv;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uOpacity;
      varying vec2 vUv; varying float vAlpha; varying vec3 vCol;
      #include <fog_pars_fragment>
      void main(){
        vec4 tx = texture2D(uMap, vUv);
        float a = tx.a * vAlpha * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vCol * tx.rgb, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogF = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          ${opts.additive ? 'gl_FragColor.a *= 1.0 - fogF;' : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF);'}
        #endif
      }`,
    transparent: true,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: opts.fog !== undefined ? opts.fog : true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = opts.renderOrder || 10;
  mesh.name = opts.name || 'particles';
  mesh.userData.noShadow = true;
  return { mesh, uniforms, update: (t) => { uniforms.uTime.value = t; } };
}

/** Static flickering glow billboards (lantern halos, crystal glints). One draw call. */
export function makeGlows(points, { size = 1.2, color = 0xffc46a, intensity = 2, flicker = 0.15, speed = 7, opacity = 0.9, name = 'glows', fog = true } = {}) {
  const n = points.length;
  const base = new Float32Array(n * 3);
  const seed = new Float32Array(n * 2);
  const R = rng(17);
  points.forEach((p, i) => { base.set([p[0], p[1], p[2]], i * 3); seed[i * 2] = R() * 6.28; seed[i * 2 + 1] = p[3] !== undefined ? p[3] : 1; });
  const geo = instQuad();
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
  geo.instanceCount = n;
  const uniforms = fogUniforms({
    uTime: { value: 0 },
    uSize: { value: size },
    uColor: { value: new THREE.Color(color).multiplyScalar(intensity) },
    uFlicker: { value: flicker },
    uSpeed: { value: speed },
    uOpacity: { value: opacity },
    uMap: { value: glowTexture() },
    uPulse: { value: 1 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aBase; attribute vec2 aSeed;
      uniform float uTime, uSize, uFlicker, uSpeed, uPulse;
      varying vec2 vUv; varying float vA;
      #include <fog_pars_vertex>
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(aBase, 1.0);
        float f = 1.0 - uFlicker + uFlicker * (0.6 * sin(uTime * uSpeed + aSeed.x) + 0.4 * sin(uTime * uSpeed * 2.7 + aSeed.x * 3.0));
        mvPosition.xy += position.xy * uSize * aSeed.y * (0.9 + 0.1 * f);
        vA = f * uPulse;
        vUv = uv;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying float vA;
      #include <fog_pars_fragment>
      void main(){
        vec4 tx = texture2D(uMap, vUv);
        gl_FragColor = vec4(uColor * tx.rgb, tx.a * vA * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogF = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor.a *= 1.0 - fogF;
        #endif
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  mesh.name = name;
  return { mesh, uniforms, update: (t) => { uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------------------------------------
// Toon clouds (instanced spheres with a 2-tone anime shader)
// ---------------------------------------------------------------------------------------------
export function cloudMaterial({ lit = 0xffffff, shade = 0xc6c4ee, rim = 0xffffff, rimK = 0.35, sunDir, fog = true, mid = null } = {}) {
  const uniforms = fogUniforms({
    uLit: { value: new THREE.Color(lit) },
    uShade: { value: new THREE.Color(shade) },
    uMidC: { value: new THREE.Color(mid !== null ? mid : new THREE.Color(lit).lerp(new THREE.Color(shade), 0.45)) },
    uRim: { value: new THREE.Color(rim) },
    uRimK: { value: rimK },
    uSunDir: { value: (sunDir || new THREE.Vector3(0.3, 1, 0.4)).clone().normalize() },
  });
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          n = mat3(instanceMatrix) * n;
        #endif
        wp = modelMatrix * wp;
        vN = normalize(mat3(modelMatrix) * n);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLit, uShade, uMidC, uRim, uSunDir; uniform float uRimK;
      varying vec3 vN; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float d = dot(n, uSunDir);
        vec3 col = mix(uShade, uMidC, smoothstep(-0.25, -0.15, d));
        col = mix(col, uLit, smoothstep(0.2, 0.3, d));
        float rim = smoothstep(0.55, 0.85, 1.0 - max(dot(n, V), 0.0));
        col += uRim * rim * uRimK * (0.4 + 0.6 * smoothstep(-0.3, 0.4, d));
        gl_FragColor = vec4(col, 1.0);
        ${GLSL_OUT}
      }`,
    fog,
  });
}

/**
 * Build an instanced cloud field. clusters: [{ x, y, z, s (scale), n (puffs), flat }]
 * Returns { mesh, update(t), clusters } — clusters drift along +x with wrap when drift set.
 */
export function makeCloudField(clusters, material, { seed = 5, segs = [12, 8], drift = 0, wrap = 400 } = {}) {
  const R = rng(seed);
  const puffs = [];
  clusters.forEach((c, ci) => {
    const n = c.n || 7;
    const s = c.s || 4;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const hump = Math.sin(t * Math.PI);
      const r = s * (0.45 + 0.55 * hump) * (0.75 + R() * 0.45);
      const ang = c.rot || 0;
      const lx = (t - 0.5) * s * 2.6 + (R() - 0.5) * s * 0.4;
      const lz = (R() - 0.5) * s * (c.depth || 1.0);
      puffs.push({
        ci,
        ox: lx * Math.cos(ang) - lz * Math.sin(ang),
        oy: hump * s * 0.35 + (R() - 0.3) * s * 0.25,
        oz: lx * Math.sin(ang) + lz * Math.cos(ang),
        r,
        flat: c.flat || 0.62,
      });
    }
  });
  const geo = new THREE.SphereGeometry(1, segs[0], segs[1]);
  const mesh = new THREE.InstancedMesh(geo, material, puffs.length);
  mesh.name = 'clouds';
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const one = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const place = (t) => {
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      const c = clusters[p.ci];
      let x = c.x + (drift ? (t * drift * (c.speed || 1)) : 0);
      if (drift) x = ((x + wrap) % (2 * wrap) + 2 * wrap) % (2 * wrap) - wrap;
      pos.set(x + p.ox, c.y + p.oy, c.z + p.oz);
      sc.set(p.r, p.r * p.flat, p.r);
      m4.compose(pos, one, sc);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(0);
  mesh.computeBoundingSphere();
  if (drift) mesh.frustumCulled = false;
  return { mesh, update: drift ? (t) => place(t) : () => {}, count: puffs.length };
}

// ---------------------------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------------------------
const TEX_KEYS = ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'bumpMap', 'aoMap', 'lightMap', 'specularMap', 'displacementMap', 'roughnessMap', 'metalnessMap'];

export function disposeGroup(root, extraTextures = []) {
  const geos = new Set();
  const mats = new Set();
  const texs = new Set(extraTextures);
  const shared = new Set([glowTexture(), smokeTex, gradientMap(2), gradientMap(3), gradientMap(4), gradientMap(5)]);
  root.traverse((o) => {
    if (o.geometry && !o.isSprite) geos.add(o.geometry);
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (o.userData.isOutline && m.isShaderMaterial) continue; // cached in toon.js, shared with characters
        mats.add(m);
      }
    }
  });
  for (const m of mats) {
    for (const k of TEX_KEYS) if (m[k] && m[k].isTexture) texs.add(m[k]);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) texs.add(u.value);
    m.dispose();
  }
  for (const g of geos) g.dispose();
  for (const t of texs) if (t && !shared.has(t) && !(t.userData && t.userData.shared)) t.dispose();
  root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
}

/** Mark meshes so they cast/receive shadows (skip outlines + particles). */
export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && !o.userData.noShadow) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

const _bbPos = new THREE.Vector3();
/** Billboard helper: make a mesh face the camera when rendered (works with the contract's camera-less update). */
export function billboard(mesh) {
  mesh.onBeforeRender = (renderer, scene, camera) => {
    _bbPos.setFromMatrixPosition(mesh.matrixWorld);
    mesh.matrixWorld.compose(_bbPos, camera.quaternion, mesh.scale);
  };
  return mesh;
}

/** Transient flash pool for hazard flourishes (additive camera-facing glows). */
export function makeFlashPool(parent, { count = 6, color = 0xffd27a, intensity = 4 } = {}) {
  const items = [];
  const quadGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const m = billboard(new THREE.Mesh(quadGeo, mat));
    m.visible = false;
    m.renderOrder = 15;
    m.frustumCulled = false;
    m.userData.noShadow = true;
    parent.add(m);
    items.push({ m, t0: -1, dur: 0.5, size: 4, delay: 0 });
  }
  let next = 0;
  let now = 0;
  return {
    /** Fire a flash at (x,y,z); delay in seconds relative to the last update time. */
    fire(x, y, z, size = 5, dur = 0.5, delay = 0, tint = null) {
      const it = items[next++ % count];
      it.m.position.set(x, y, z);
      it.t0 = now + delay;
      it.dur = dur;
      it.size = size;
      it.m.visible = false;
      it.armed = true;
      if (tint !== null) it.m.material.color.set(tint).multiplyScalar(intensity);
    },
    update(t) {
      now = t;
      for (const it of items) {
        if (!it.armed) continue;
        const k = (t - it.t0) / it.dur;
        if (k < 0) { it.m.visible = false; continue; }
        if (k >= 1) { it.m.visible = false; it.armed = false; continue; }
        it.m.visible = true;
        const s = it.size * (0.5 + 0.9 * Math.sqrt(k));
        it.m.scale.set(s, s, s);
        it.m.material.opacity = (1 - k) * (1 - k);
      }
    },
    items,
  };
}

// ---------------------------------------------------------------------------------------------
// CPU noise + terrain
// ---------------------------------------------------------------------------------------------
/** 2D value noise in [-1, 1]. */
export function makeNoise2(seed = 1) {
  const h = (ix, iy) => {
    let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  };
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
  };
}

/**
 * Flat-shaded heightfield with per-face colours.
 * opts: { x0, x1, z0, z1, nx, nz, height(x,z) -> y, color(cx, cy, cz, ny) -> THREE.Color }
 */
export function terrainGeo({ x0, x1, z0, z1, nx, nz, height, color: colorFn }) {
  const pos = [];
  const col = [];
  const H = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = lerp(x0, x1, i / nx);
      const z = lerp(z0, z1, j / nz);
      H.push([x, height(x, z), z]);
    }
  }
  const at = (i, j) => H[j * (nx + 1) + i];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tri = (p, q, r) => {
    a.set(...p); b.set(...q); c.set(...r);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    if (n.y < 0) n.negate();
    const cc = colorFn((p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3, (p[2] + q[2] + r[2]) / 3, n.y);
    for (const v of [p, q, r]) { pos.push(...v); col.push(cc.r, cc.g, cc.b); }
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const p00 = at(i, j);
      const p10 = at(i + 1, j);
      const p01 = at(i, j + 1);
      const p11 = at(i + 1, j + 1);
      if ((i + j) % 2) { tri(p00, p01, p10); tri(p10, p01, p11); } else { tri(p00, p01, p11); tri(p00, p11, p10); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // make sure faces point up (winding)
  const nr = g.attributes.normal;
  let flip = 0;
  for (let i = 0; i < nr.count; i += 3) if (nr.getY(i) < 0) flip++;
  if (flip > nr.count / 6) {
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Simple triangular prism roof (ridge along x), centred, base at y=0. */
export function prismGeo(w, h, d) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Gulls (instanced, flapping via cloth displacement) and light beams
// ---------------------------------------------------------------------------------------------
export function makeGulls({ n = 10, seed = 9, area = [[-45, 45], [-80, -38]], height = [3, 12], radius = [6, 16], scale = 1.4 } = {}) {
  const R = rng(seed);
  const gull = new THREE.BufferGeometry();
  const v = [0, 0, 0, -0.9, 0.18, -0.3, -0.25, 0.05, 0.12, 0, 0, 0, 0.9, 0.18, -0.3, 0.25, 0.05, 0.12, 0, 0.02, -0.25, 0, 0.02, 0.45, -0.08, 0.06, 0.05];
  gull.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  gull.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(27).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  gull.setAttribute('aWave', new THREE.Float32BufferAttribute([0, 1, 0.3, 0, 1, 0.3, 0, 0, 0], 1));
  gull.setAttribute('color', new THREE.Float32BufferAttribute([0.85, 0.85, 0.85, 0.2, 0.2, 0.25, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.2, 0.2, 0.25, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.9, 0.6, 0.2, 0.85, 0.85, 0.85], 3));
  const mat = clothify(vcMat({ side: THREE.DoubleSide, rim: 0.2 }), { amp: 0.35, billow: 0, freq: 0, speed: 9, spatial: 0 });
  const mesh = new THREE.InstancedMesh(gull, mat, n);
  mesh.name = 'gulls';
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  const gs = [];
  for (let i = 0; i < n; i++) {
    gs.push({
      cx: lerp(area[0][0], area[0][1], R()), cz: lerp(area[1][0], area[1][1], R()), r: lerp(radius[0], radius[1], R()),
      y: lerp(height[0], height[1], R()), sp: (0.25 + R() * 0.3) * (R() < 0.5 ? -1 : 1), ph: R() * 6.28, s: scale * (0.85 + R() * 0.4),
    });
  }
  const m4 = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pp = new THREE.Vector3();
  const ss = new THREE.Vector3();
  const update = (t) => {
    mat.userData.uTime.value = t;
    for (let i = 0; i < n; i++) {
      const g = gs[i];
      const a = g.ph + t * g.sp;
      qq.setFromAxisAngle(up, -a + (g.sp > 0 ? Math.PI : 0));
      pp.set(g.cx + Math.cos(a) * g.r, g.y + Math.sin(t * 0.7 + g.ph) * 0.6, g.cz + Math.sin(a) * g.r);
      m4.compose(pp, qq, ss.set(g.s, g.s, g.s));
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update, mat };
}

/** Additive volumetric-looking light beam (cone along +x from the origin). */
export function makeBeam({ length = 60, r0 = 0.4, r1 = 4, color = 0xfff2c0, strength = 0.22 } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, length, 14, 1, true);
  g.translate(0, length / 2, 0);
  g.rotateZ(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uLen: { value: length }, uStrength: { value: strength } },
    vertexShader: 'uniform float uLen; varying float vT; varying vec3 vN; varying vec3 vW; void main(){ vT = clamp(position.x / uLen, 0.0, 1.0); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uStrength; varying float vT; varying vec3 vN; varying vec3 vW; void main(){ vec3 V = normalize(cameraPosition - vW); float f = abs(dot(normalize(vN), V)); float a = pow(1.0 - vT, 1.5) * uStrength * f * f; gl_FragColor = vec4(uColor * a, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 14;
  mesh.userData.noShadow = true;
  mesh.name = 'beam';
  return mesh;
}
