// Big animated surfaces: stylised ocean, foam rings, lava sea, cloud sea, waterfalls.
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_OUT, fogUniforms } from './common.js';

/** Radial grid on the XZ plane (dense near the centre, sparse far away). */
export function polarGrid(r0, r1, rings, segs, cx = 0, cz = 0) {
  const pos = [0 + cx, 0, 0 + cz];
  const ratio = Math.pow(r1 / r0, 1 / (rings - 1));
  for (let i = 0; i < rings; i++) {
    const r = r0 * Math.pow(ratio, i);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
    }
  }
  const idx = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + i * segs + j;
      const b = 1 + i * segs + ((j + 1) % segs);
      const c = 1 + (i + 1) * segs + j;
      const d = 1 + (i + 1) * segs + ((j + 1) % segs);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const WAVES = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uChop;
vec3 gbWave(vec2 p, vec2 d, float k, float a, float s){
  float ph = dot(d, p) * k + uTime * s;
  return vec3(a * sin(ph), a * k * cos(ph) * d);
}
// returns (height, dh/dx, dh/dz)
vec3 gbWaves(vec2 p){
  vec3 r = gbWave(p, vec2(0.94, 0.33), 0.21, 0.55, 1.05);
  r += gbWave(p, vec2(-0.37, 0.93), 0.33, 0.33, 1.35);
  r += gbWave(p, vec2(0.75, -0.66), 0.57, 0.17 * uChop, 2.05);
  r += gbWave(p, vec2(-0.98, -0.2), 0.91, 0.09 * uChop, 2.7);
  return r * uAmp;
}
`;

const SDF = /* glsl */ `
uniform vec4 uStage;   // cx, cz, hx, hz   (hz < 0 -> circle with radius hx)
uniform float uStageRound;
float sdStage(vec2 p){
  if (uStage.w < 0.0) return length(p - uStage.xy) - uStage.z;
  vec2 d = abs(p - uStage.xy) - (uStage.zw - uStageRound);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uStageRound;
}
`;

/**
 * Stylised cel ocean. opts: { y, radius, deep, mid, shallow, foam, sky, sunDir, sunColor, stage:[cx,cz,hx,hz],
 *   shadowOffset:[x,z], amp, chop, sparkle, shallowFall, ringFoam }
 */
export function makeOcean(opts) {
  const uniforms = fogUniforms({
    uTime: { value: 0 },
    uAmp: { value: opts.amp !== undefined ? opts.amp : 0.5 },
    uChop: { value: opts.chop !== undefined ? opts.chop : 1 },
    uDeep: { value: new THREE.Color(opts.deep) },
    uMid: { value: new THREE.Color(opts.mid) },
    uShallow: { value: new THREE.Color(opts.shallow) },
    uFoam: { value: new THREE.Color(opts.foam || 0xffffff) },
    uSky: { value: new THREE.Color(opts.sky) },
    uSunDir: { value: opts.sunDir.clone().normalize() },
    uSunCol: { value: new THREE.Color(opts.sunColor || 0xfff0d0) },
    uStage: { value: new THREE.Vector4(...(opts.stage || [0, 0, 10, 6])) },
    uStageRound: { value: opts.stageRound !== undefined ? opts.stageRound : 1.0 },
    uShadowOff: { value: new THREE.Vector2(...(opts.shadowOffset || [0, 0])) },
    uSparkle: { value: opts.sparkle !== undefined ? opts.sparkle : 2.5 },
    uShallowFall: { value: opts.shallowFall || 0.06 },
    uRingFoam: { value: opts.ringFoam !== undefined ? opts.ringFoam : 1 },
    uDetail: { value: opts.detail !== undefined ? opts.detail : 1 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${WAVES}
      varying vec3 vW; varying vec3 vN; varying float vH;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float r = length(wp.xz);
        float att = 1.0 - smoothstep(70.0, 240.0, r);
        vec3 w = gbWaves(wp.xz) * att;
        wp.y += w.x;
        vH = w.x / max(uAmp, 0.001);
        vN = normalize(vec3(-w.y, 1.0, -w.z));
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep, uMid, uShallow, uFoam, uSky, uSunDir, uSunCol;
      uniform vec2 uShadowOff;
      uniform float uSparkle, uShallowFall, uRingFoam, uDetail;
      ${SDF}
      ${GLSL_NOISE}
      varying vec3 vW; varying vec3 vN; varying float vH;
      #include <fog_pars_fragment>
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        vec2 p = vW.xz;
        float camD = length(cameraPosition - vW);
        float d = sdStage(p);
        float h01 = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
        // base colour: deep troughs -> lighter crests (stepped)
        vec3 col = mix(uDeep, uMid, smoothstep(0.42, 0.5, h01) * 0.6 + smoothstep(0.62, 0.7, h01) * 0.4);
        float shallow = exp(-max(d, 0.0) * uShallowFall);
        col = mix(col, uShallow, smoothstep(0.15, 0.6, shallow) * 0.9);
        // facing bands (toon): slopes facing the sun are lighter
        float slope = dot(n.xz, normalize(uSunDir.xz + 1e-4));
        col *= 1.0 + 0.10 * smoothstep(0.03, 0.06, slope) - 0.08 * smoothstep(-0.05, -0.09, slope);
        // anime wave squiggles: zero-isolines of drifting noise, only on the upper half of the waves
        float lod = 1.0 - smoothstep(60.0, 160.0, camD);
        #ifdef CHEAP
          float lines = 0.0;
          float caps = smoothstep(0.9, 0.93, h01) * lod;
        #else
          float nz = snoise(p * 0.11 + vec2(uTime * 0.035, -uTime * 0.02));
          float iso = abs(nz);
          float lines = (1.0 - smoothstep(0.012, 0.03, iso)) * smoothstep(0.55, 0.8, h01) * lod * uDetail;
          // whitecaps on the highest crests
          float caps = smoothstep(0.9, 0.93, h01 + snoise(p * 0.3 + uTime * 0.1) * 0.1) * lod;
        #endif
        // foam rings around the stage foundation (outside only)
        #ifdef CHEAP
          float ring = sin(d * 1.25 - uTime * 1.7 + sin(p.x * 0.3) * 1.2);
          float dn = d + sin(p.x * 0.9 + uTime) * 0.4;
        #else
          float ring = sin(d * 1.25 - uTime * 1.7 + snoise(p * 0.25) * 1.6);
          float dn = d + snoise(p * 0.7 + uTime * 0.35) * 0.8;
        #endif
        float rings = smoothstep(0.78, 0.86, ring) * exp(-max(d, 0.0) * 0.22) * smoothstep(0.0, 1.0, d) * uRingFoam;
        float contact = (1.0 - smoothstep(0.0, 1.4, dn)) * smoothstep(-2.5, -0.8, dn) * uRingFoam;
        float foam = clamp(lines * 0.7 + caps * 0.8 + rings * 0.7 + contact * 0.9, 0.0, 1.0);
        // shade under the stage + its sun shadow on the water
        float sh = 1.0 - 0.3 * (1.0 - smoothstep(-0.5, 0.5, sdStage(p + uShadowOff)));
        sh *= 1.0 - 0.35 * (1.0 - smoothstep(-3.0, 0.5, d));
        col *= sh;
        col = mix(col, uFoam * mix(0.82, 1.0, sh), foam);
        // horizon fresnel
        float fr = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
        col = mix(col, uSky, fr * 0.75);
        // glints: sun reflection + random twinkles on crests (HDR -> bloom)
        vec3 Rf = reflect(-V, n);
        float sp = max(dot(Rf, uSunDir), 0.0);
        #ifdef CHEAP
          float tw = 0.0;
        #else
          float tw = step(0.975, vnoise(p * 1.7 + vec2(uTime * 0.9, uTime * 0.6))) * smoothstep(0.6, 0.85, h01) * lod * sh;
        #endif
        col += uSunCol * (pow(sp, 60.0) * 1.5 + pow(sp, 8.0) * 0.06 + tw * 0.8) * uSparkle * (1.0 - foam * 0.8);
        gl_FragColor = vec4(col, 1.0);
        ${GLSL_OUT}
      }`,
    fog: true,
    defines: opts.cheap ? { CHEAP: 1 } : {},
  });
  const geo = polarGrid(1.5, opts.radius || 460, opts.rings || 70, opts.segs || 128);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = opts.y;
  mesh.name = 'ocean';
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  return { mesh, uniforms, update: (t) => { uniforms.uTime.value = t; } };
}

/**
 * Animated foam rings that hug obstacles at the water line. items: [{x, z, rx, rz?, rot?}]
 * Shares the ocean wave uniforms so rings ride the swell.
 */
export function makeFoamRings(items, ocean, { y = 0, color = 0xffffff, opacity = 0.9 } = {}) {
  const geo = new THREE.RingGeometry(0.85, 1.7, 28, 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: fogUniforms({
      uTime: ocean.uniforms.uTime,
      uAmp: ocean.uniforms.uAmp,
      uChop: ocean.uniforms.uChop,
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    }),
    vertexShader: /* glsl */ `
      ${WAVES}
      varying vec2 vL; varying float vSeed;
      #include <fog_pars_vertex>
      void main(){
        vL = position.xz;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float att = 1.0 - smoothstep(70.0, 240.0, length(wp.xz));
        wp.y += gbWaves(wp.xz).x * att + 0.06;
        vSeed = float(gl_InstanceID) * 0.37;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vL; varying float vSeed;
      #include <fog_pars_fragment>
      void main(){
        float r = length(vL);
        float ang = atan(vL.y, vL.x);
        float wob = 0.07 * sin(ang * 5.0 + uTime * 1.8 + vSeed * 9.0) + 0.04 * sin(ang * 11.0 - uTime * 2.3);
        float contact = 1.0 - smoothstep(0.05, 0.14, abs(r - 1.03 - wob));
        float rip = fract(r * 2.0 - uTime * 0.45 + vSeed);
        float ripple = smoothstep(0.82, 0.92, rip) * (1.0 - smoothstep(1.15, 1.65, r)) * step(1.12, r);
        float a = max(contact, ripple * 0.75) * uOpacity;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor, a);
        ${GLSL_OUT}
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4();
  items.forEach((it, i) => {
    m4.compose(new THREE.Vector3(it.x, y, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot || 0), new THREE.Vector3(it.rx, 1, it.rz !== undefined ? it.rz : it.rx));
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.renderOrder = 2;
  mesh.name = 'foamRings';
  mesh.userData.noShadow = true;
  return mesh;
}

/** Lava sea. opts: { y, radius, crust, red, orange, yellow, stage, intensity, flow } */
export function makeLava(opts) {
  const uniforms = fogUniforms({
    uTime: { value: 0 },
    uAmp: { value: opts.amp !== undefined ? opts.amp : 0.25 },
    uChop: { value: 0.6 },
    uCrust: { value: new THREE.Color(opts.crust || 0x1a0d10) },
    uRed: { value: new THREE.Color(opts.red || 0xa3161a) },
    uOrange: { value: new THREE.Color(opts.orange || 0xff5a14) },
    uYellow: { value: new THREE.Color(opts.yellow || 0xffd257) },
    uStage: { value: new THREE.Vector4(...(opts.stage || [0, 0, 10, 6])) },
    uStageRound: { value: 1.5 },
    uGlow: { value: opts.intensity !== undefined ? opts.intensity : 2.2 },
    uPulse: { value: 1 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${WAVES}
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float att = 1.0 - smoothstep(60.0, 200.0, length(wp.xz));
        wp.y += gbWaves(wp.xz * 0.6).x * att;
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uGlow, uPulse;
      uniform vec3 uCrust, uRed, uOrange, uYellow;
      ${SDF}
      ${GLSL_NOISE}
      varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        vec2 p = vW.xz;
        float camD = length(cameraPosition - vW);
        float lod = 1.0 - smoothstep(80.0, 200.0, camD);
        float d = sdStage(p);
        #ifdef CHEAP
          vec2 q = vec2(sin(p.y * 0.05 + uTime * 0.2), cos(p.x * 0.05 - uTime * 0.15));
          float f = snoise(p * 0.045 + q * 1.3 + vec2(uTime * 0.025, 0.0)) * 0.7;
        #else
          vec2 q = vec2(snoise(p * 0.03 + vec2(0.0, uTime * 0.02)), snoise(p * 0.03 + vec2(5.2, 1.3) - uTime * 0.015));
          float f = fbm3(p * 0.045 + q * 1.3 + vec2(uTime * 0.025, 0.0));
        #endif
        float heat = clamp(0.5 + f * 0.95, 0.0, 1.0);
        // dark crust plates floating on molten rock (hard cel boundary)
        float molten = smoothstep(0.585, 0.625, heat);
        vec3 col = mix(uCrust, uRed, smoothstep(0.3, 0.52, heat) * 0.55);
        col = mix(col, uOrange, molten);
        float hot = smoothstep(0.83, 0.87, heat);
        col = mix(col, uYellow, hot);
        float edge = (1.0 - smoothstep(0.0, 0.02, abs(heat - 0.605))) * lod;
        col = mix(col, uYellow, edge * 0.75);
        // thin glowing cracks inside the crust
        #ifdef CHEAP
          float crack = 0.0;
        #else
          float cr = abs(snoise(p * 0.085 + q * 0.7 + vec2(uTime * 0.01, 0.0)));
          float crack = (1.0 - smoothstep(0.015, 0.04, cr)) * (1.0 - molten) * lod;
        #endif
        col = mix(col, uOrange, crack * 0.85);
        float glow = mix(0.2, 1.0, molten) + edge * 1.0 + crack * 1.2 + hot * 0.8;
        // churning band where lava meets the rock
        #ifdef CHEAP
          float shore = (1.0 - smoothstep(0.0, 2.2, d + sin(p.x * 0.6 + uTime) * 0.6)) * smoothstep(-3.0, -0.5, d);
        #else
          float shore = (1.0 - smoothstep(0.0, 2.2, d + snoise(p * 0.5 + uTime * 0.4) * 1.0)) * smoothstep(-3.0, -0.5, d);
        #endif
        col = mix(col, uYellow, shore * 0.7);
        glow += shore * 0.9;
        // the stage shadows the lava directly beneath it (keeps its silhouette readable)
        glow *= mix(0.45, 1.0, smoothstep(-4.0, 0.5, d));
        col *= glow * uGlow * uPulse;
        gl_FragColor = vec4(col, 1.0);
        ${GLSL_OUT}
      }`,
    fog: true,
    defines: opts.cheap ? { CHEAP: 1 } : {},
  });
  const geo = polarGrid(1.5, opts.radius || 420, 64, 112);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = opts.y;
  mesh.name = 'lava';
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  return { mesh, uniforms, update: (t) => { uniforms.uTime.value = t; } };
}

/** Fluffy cloud sea floor (2-tone emboss shading). */
export function makeCloudSea(opts) {
  const uniforms = fogUniforms({
    uTime: { value: 0 },
    uLit: { value: new THREE.Color(opts.lit || 0xffffff) },
    uShade: { value: new THREE.Color(opts.shade || 0xc9c2f0) },
    uDeep: { value: new THREE.Color(opts.deep || 0xa59ee0) },
    uSunDir: { value: opts.sunDir.clone().normalize() },
    uStage: { value: new THREE.Vector4(...(opts.stage || [0, 0, 10, -1])) },
    uStageRound: { value: 0 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uLit, uShade, uDeep, uSunDir;
      ${SDF}
      ${GLSL_NOISE}
      varying vec3 vW;
      #include <fog_pars_fragment>
      float puff(vec2 p){
        float big = 0.5 + 0.5 * snoise(p * 0.35);
        return 0.45 * big + 0.35 * (1.0 - abs(snoise(p))) + 0.2 * (1.0 - abs(snoise(p * 2.3 + 3.7)));
      }
      void main(){
        vec2 p = vW.xz * 0.026 + vec2(uTime * 0.008, uTime * 0.003);
        float h = puff(p);
        vec2 sd = normalize(uSunDir.xz + 1e-4) * 0.07;
        float h2 = puff(p - sd);
        float lit = smoothstep(-0.02, 0.02, h - h2 + 0.012);
        vec3 col = mix(uShade, uLit, lit);
        // deep gaps between cloud mounds
        col = mix(uDeep, col, smoothstep(0.38, 0.46, h));
        col = mix(col, uLit * 1.04, smoothstep(0.78, 0.84, h) * lit * 0.6);
        gl_FragColor = vec4(col, 1.0);
        ${GLSL_OUT}
      }`,
    fog: true,
  });
  const geo = new THREE.PlaneGeometry(opts.size || 900, opts.size || 900, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = opts.y;
  mesh.name = 'cloudSea';
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  return { mesh, uniforms, update: (t) => { uniforms.uTime.value = t; } };
}

/**
 * Ribbon geometry following a path (array of [x,y,z]) with given widths; UV u across, v along.
 * side: Vector3 giving the across direction (default x).
 */
export function ribbonGeo(path, widths, side = [1, 0, 0]) {
  const pos = [];
  const uv = [];
  const idx = [];
  const s = new THREE.Vector3(...side).normalize();
  let len = 0;
  const lens = [0];
  for (let i = 1; i < path.length; i++) {
    len += new THREE.Vector3(...path[i]).distanceTo(new THREE.Vector3(...path[i - 1]));
    lens.push(len);
  }
  for (let i = 0; i < path.length; i++) {
    const w = Array.isArray(widths) ? widths[i] : widths;
    const p = path[i];
    for (let k = 0; k <= 2; k++) {
      const t = k / 2 - 0.5;
      pos.push(p[0] + s.x * w * t, p[1] + s.y * w * t, p[2] + s.z * w * t);
      uv.push(k / 2, lens[i] / Math.max(len, 1e-3));
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < 2; k++) {
      const a = i * 3 + k;
      const b = a + 1;
      const c = a + 3;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, length: len };
}

/** Scrolling waterfall material (transparent). Geometry UV: u across (0..1), v along fall (0 top .. 1 bottom). */
export function waterfallMaterial({ water = 0x7fd3ff, foam = 0xffffff, speed = 1.2, opacity = 0.92, glow = 1.0, scale = [10, 3] } = {}) {
  const uniforms = fogUniforms({
    uTime: { value: 0 },
    uWater: { value: new THREE.Color(water).multiplyScalar(glow) },
    uFoam: { value: new THREE.Color(foam).multiplyScalar(glow) },
    uSpeed: { value: speed },
    uOpacity: { value: opacity },
    uScale: { value: new THREE.Vector2(...scale) },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vSeed;
      attribute vec3 color;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vSeed = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed, uOpacity; uniform vec3 uWater, uFoam; uniform vec2 uScale;
      varying vec2 vUv; varying vec3 vSeed;
      ${GLSL_NOISE}
      #include <fog_pars_fragment>
      void main(){
        float off = vSeed.x * 37.0;
        float s1 = vnoise(vec2(vUv.x * uScale.x + off, vUv.y * uScale.y - uTime * uSpeed));
        float s2 = vnoise(vec2(vUv.x * uScale.x * 2.3 + off, vUv.y * uScale.y * 1.7 - uTime * uSpeed * 1.6));
        float streak = smoothstep(0.55, 0.62, s1 * 0.65 + s2 * 0.35);
        float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
        vec3 col = mix(uWater, uFoam, clamp(streak + (1.0 - edge) * 0.6 + smoothstep(0.8, 1.0, vUv.y) * 0.7 + (1.0 - smoothstep(0.0, 0.06, vUv.y)) * 0.8, 0.0, 1.0));
        float a = uOpacity * (0.55 + 0.45 * edge) * smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
        gl_FragColor = vec4(col, a);
        ${GLSL_OUT}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  return { mat, uniforms, update: (t) => { uniforms.uTime.value = t; } };
}
