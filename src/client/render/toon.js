// Anime / cel-shading helpers shared by characters, arenas and VFX.
import * as THREE from 'three';

const gradientCache = new Map();

/** Stepped gradient ramp for MeshToonMaterial (hard anime shadow bands). */
export function gradientMap(steps = 3) {
  if (gradientCache.has(steps)) return gradientCache.get(steps);
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    // Bias toward bright: shadows are a clear but not crushing band.
    const v = Math.round(255 * (0.42 + 0.58 * (i / Math.max(1, steps - 1))));
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientCache.set(steps, tex);
  return tex;
}

/**
 * Cel-shaded material with a fresnel rim light.
 * opts: { emissive, emissiveIntensity, map, rim (0..1), rimColor, steps, transparent, opacity, side, vertexColors, flatShading }
 */
export function toonMat(color = 0xffffff, opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(opts.steps || 3),
    emissive: opts.emissive !== undefined ? opts.emissive : 0x000000,
    emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1,
    map: opts.map || null,
    transparent: !!opts.transparent,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
    side: opts.side !== undefined ? opts.side : THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  });
  const rim = opts.rim !== undefined ? opts.rim : 0.35;
  if (rim > 0) {
    mat.userData.rimColor = new THREE.Color(opts.rimColor !== undefined ? opts.rimColor : 0xffffff);
    mat.userData.rimStrength = { value: rim };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = { value: mat.userData.rimColor };
      shader.uniforms.uRimStrength = mat.userData.rimStrength;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
        .replace(
          '#include <dithering_fragment>',
          `float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
           rimF = smoothstep(0.55, 0.85, rimF);
           gl_FragColor.rgb += uRimColor * rimF * uRimStrength;
           #include <dithering_fragment>`
        );
    };
    mat.customProgramCacheKey = () => 'toon-rim';
  }
  return mat;
}

const outlineMatCache = new Map();
function outlineMaterial(color, thickness) {
  const key = color + ':' + thickness;
  if (outlineMatCache.has(key)) return outlineMatCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uThick: { value: thickness } },
    vertexShader: `
      uniform float uThick;
      void main() {
        vec3 p = position + normal * uThick;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    side: THREE.BackSide,
  });
  outlineMatCache.set(key, m);
  return m;
}

/**
 * Inverted-hull ink outline. Adds a child mesh that shares the geometry.
 * Works best on smooth-normal geometry (spheres, capsules, lathes). For boxes use mode:'scale'.
 */
export function addOutline(mesh, thickness = 0.03, color = 0x1b1226, mode = 'normal') {
  let o;
  if (mode === 'scale') {
    o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
    const s = 1 + thickness;
    o.scale.set(s, s, s);
  } else {
    o = new THREE.Mesh(mesh.geometry, outlineMaterial(color, thickness));
  }
  o.name = 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
}

/** Create a CanvasTexture by drawing with a 2D context callback. */
export function canvasTexture(w, h, draw, { repeat, srgb = true, filter } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  if (filter === 'nearest') {
    t.magFilter = THREE.NearestFilter;
  }
  t.anisotropy = 4;
  return t;
}

/** Deterministic pseudo-random generator for procedural content. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

/** Additive glow sprite texture (radial gradient), cached. */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, { srgb: false });
  return glowTex;
}

/** Utility: set castShadow/receiveShadow recursively (skips outlines). */
export function setShadows(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}
