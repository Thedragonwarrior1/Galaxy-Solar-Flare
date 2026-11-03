// VFX: pooled GPU particles, sparks, shockwave rings, flashes, weapon trails, lightning, and visuals for
// projectiles / zones / hazards / ultimate telegraphs. Driven by sim events + per-frame world state.
import * as THREE from 'three';
import { glowTexture, toonMat, addOutline } from './toon.js';
import { LOOKS } from './characterModels.js';

const ELEMENT_COLORS = {
  punch: [0xfff3b0, 0xffb627], kick: [0xffffff, 0x9ad1ff], slash: [0xe0fbff, 0x7ee8ff], fire: [0xffe066, 0xff5400],
  lightning: [0xfffbd1, 0xffd60a], spatial: [0xc8fff9, 0x3ee0d0], pellet: [0xfff0c2, 0xe9c46a], trap: [0xd8ffd0, 0x7bd389],
};

// ------------------------------------------------------------------ particle pool (additive or alpha)
class Particles {
  constructor(max, blending) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: glowTexture() }, uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float uScale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.p = []; // live particles
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
  }
  spawn(o) {
    if (!this.free.length) return;
    const i = this.free.pop();
    this.p.push({ i, x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 0.6, t: 0, s0: o.size || 0.3, s1: o.size1 !== undefined ? o.size1 : (o.size || 0.3) * 0.2,
      c0: new THREE.Color(o.color || 0xffffff), c1: new THREE.Color(o.color1 !== undefined ? o.color1 : (o.color || 0xffffff)), g: o.grav || 0, drag: o.drag || 0, a0: o.alpha !== undefined ? o.alpha : 1 });
  }
  update(dt) {
    const P = this.p;
    for (let k = P.length - 1; k >= 0; k--) {
      const q = P[k];
      q.t += dt;
      const i = q.i;
      if (q.t >= q.life) { this.size[i] = 0; this.alpha[i] = 0; this.free.push(i); P[k] = P[P.length - 1]; P.pop(); continue; }
      const u = q.t / q.life;
      q.vy -= q.g * dt;
      const dk = 1 - q.drag * dt; q.vx *= dk; q.vy *= dk; q.vz *= dk;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.col[i * 3] = q.c0.r + (q.c1.r - q.c0.r) * u; this.col[i * 3 + 1] = q.c0.g + (q.c1.g - q.c0.g) * u; this.col[i * 3 + 2] = q.c0.b + (q.c1.b - q.c0.b) * u;
      this.size[i] = q.s0 + (q.s1 - q.s0) * u;
      this.alpha[i] = q.a0 * (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9);
    }
    const g = this.geo.attributes;
    g.position.needsUpdate = g.color.needsUpdate = g.size.needsUpdate = g.alpha.needsUpdate = true;
  }
  clear() { for (const q of this.p) { this.size[q.i] = 0; this.alpha[q.i] = 0; this.free.push(q.i); } this.p.length = 0; }
}

// ------------------------------------------------------------------ sparks (velocity-stretched lines)
class Sparks {
  constructor(max) {
    this.max = max;
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.p = []; this.free = []; for (let i = max - 1; i >= 0; i--) this.free.push(i);
  }
  spawn(x, y, z, vx, vy, vz, color, life = 0.3, len = 0.06) {
    if (!this.free.length) return;
    this.p.push({ i: this.free.pop(), x, y, z, vx, vy, vz, c: new THREE.Color(color).multiplyScalar(2.2), life, t: 0, len });
  }
  update(dt) {
    for (let k = this.p.length - 1; k >= 0; k--) {
      const q = this.p[k], i = q.i;
      q.t += dt;
      if (q.t >= q.life) { this.pos.fill(0, i * 6, i * 6 + 6); this.free.push(i); this.p[k] = this.p[this.p.length - 1]; this.p.pop(); continue; }
      q.vy -= 14 * dt; q.vx *= 0.94; q.vy *= 0.94; q.vz *= 0.94;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const f = 1 - q.t / q.life;
      this.pos[i * 6] = q.x; this.pos[i * 6 + 1] = q.y; this.pos[i * 6 + 2] = q.z;
      this.pos[i * 6 + 3] = q.x - q.vx * q.len; this.pos[i * 6 + 4] = q.y - q.vy * q.len; this.pos[i * 6 + 5] = q.z - q.vz * q.len;
      for (let j = 0; j < 2; j++) { this.col[i * 6 + j * 3] = q.c.r * f; this.col[i * 6 + j * 3 + 1] = q.c.g * f; this.col[i * 6 + j * 3 + 2] = q.c.b * f; }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ ribbon trail
class Ribbon {
  constructor(color, n = 14, width = 1) {
    this.n = n;
    this.a = []; this.b = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.al = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(1.6) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * (0.6 + vA), vA * 0.85); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.active = false;
    this.fade = 0;
  }
  push(A, B) {
    this.a.unshift(A.clone()); this.b.unshift(B.clone());
    if (this.a.length > this.n) { this.a.pop(); this.b.pop(); }
  }
  update(dt, on) {
    if (on) this.fade = 1; else this.fade = Math.max(0, this.fade - dt * 6);
    if (!on && this.a.length) { this.a.pop(); this.b.pop(); }
    const n = this.a.length;
    for (let i = 0; i < this.n; i++) {
      const j = Math.min(i, n - 1);
      if (n === 0) { this.al[i * 2] = this.al[i * 2 + 1] = 0; continue; }
      const A = this.a[j], B = this.b[j];
      this.pos.set([A.x, A.y, A.z], i * 6); this.pos.set([B.x, B.y, B.z], i * 6 + 3);
      const t = i < n ? (1 - i / this.n) * this.fade : 0;
      this.al[i * 2] = t; this.al[i * 2 + 1] = t * 0.6;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
    this.mesh.visible = this.fade > 0.01 && n > 1;
  }
}

// ------------------------------------------------------------------ lightning bolt strip
function boltPoints(a, b, segs = 10, jag = 0.5) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    if (i > 0 && i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * jag, (Math.random() - 0.5) * jag * 0.4, (Math.random() - 0.5) * jag));
    pts.push(p);
  }
  return pts;
}

class Bolt {
  constructor(color, width = 0.18) {
    this.max = 24;
    this.width = width;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < this.max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  set(points, camPos) {
    const n = Math.min(points.length, this.max);
    const side = new THREE.Vector3(), d = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < this.max; i++) {
      const p = points[Math.min(i, n - 1)];
      const q = points[Math.min(i + 1, n - 1)];
      d.subVectors(q, points[Math.max(0, Math.min(i, n - 1) - 1)]).normalize();
      v.subVectors(camPos, p).normalize();
      side.crossVectors(d, v).normalize().multiplyScalar(this.width * (1 - 0.5 * (i / n)));
      this.pos.set([p.x + side.x, p.y + side.y, p.z + side.z], i * 6);
      this.pos.set([p.x - side.x, p.y - side.y, p.z - side.z], i * 6 + 3);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ main VFX system
export class VFX {
  constructor(scene, camera, quality = 'high') {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.setQuality(quality);
    this.add = new Particles(this.maxP, THREE.AdditiveBlending);
    this.alpha = new Particles(Math.floor(this.maxP / 2), THREE.NormalBlending);
    this.sparks = new Sparks(400);
    this.group.add(this.add.points, this.alpha.points, this.sparks.lines);
    this.transient = []; // {obj, t, life, update(u)}
    this.persist = new Map(); // key -> {obj, update}
    this.ribbons = new Map();
    this.intensity = 1;
  }

  setQuality(q) {
    this.quality = q;
    this.maxP = q === 'low' ? 1200 : q === 'medium' ? 2600 : 4500;
    this.density = q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1;
  }

  n(count) { return Math.max(1, Math.round(count * this.density * this.intensity)); }

  // ---------- primitives
  burst(x, y, z, { count = 20, speed = 6, color = 0xffffff, color1, size = 0.35, life = 0.5, grav = 0, drag = 2, up = 0, spread = 1, alpha = false } = {}) {
    const sys = alpha ? this.alpha : this.add;
    for (let i = 0, N = this.n(count); i < N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.65);
      sys.spawn({ x, y, z, vx: Math.sin(ph) * Math.cos(th) * sp * spread, vy: Math.cos(ph) * sp + up, vz: Math.sin(ph) * Math.sin(th) * sp * spread, color, color1, size: size * (0.6 + Math.random() * 0.8), life: life * (0.6 + Math.random() * 0.6), grav, drag });
    }
  }

  sparkBurst(x, y, z, color, count = 14, speed = 12) {
    for (let i = 0, N = this.n(count); i < N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.sparks.spawn(x, y, z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp, color, 0.18 + Math.random() * 0.2, 0.05);
    }
  }

  ring(x, y, z, { color = 0xffffff, r0 = 0.3, r1 = 3, life = 0.35, flat = true, thick = 0.18, opacity = 0.9, normal } = {}) {
    const geo = new THREE.RingGeometry(flat ? 0.84 : 0.92, 1, 48);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (flat) m.rotation.x = -Math.PI / 2;
    else if (normal) m.lookAt(x + normal.x, y + normal.y, z + normal.z);
    else m.quaternion.copy(this.camera.quaternion);
    m.renderOrder = 5;
    this.group.add(m);
    this.transient.push({ obj: m, t: 0, life, update: (u) => { const r = r0 + (r1 - r0) * (1 - Math.pow(1 - u, 3)); m.scale.setScalar(r); mat.opacity = opacity * (1 - u); geo.dispose; void thick; } , dispose: () => { geo.dispose(); mat.dispose(); } });
  }

  flash(x, y, z, { color = 0xffffff, r0 = 0.2, r1 = 1.6, life = 0.25, opacity = 1 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.sphereGeo || (this.sphereGeo = new THREE.SphereGeometry(1, 20, 14)), mat);
    m.position.set(x, y, z);
    this.group.add(m);
    this.transient.push({ obj: m, t: 0, life, update: (u) => { m.scale.setScalar(r0 + (r1 - r0) * Math.sqrt(u)); mat.opacity = opacity * (1 - u) * (1 - u); }, dispose: () => mat.dispose() });
  }

  star(x, y, z, color, size = 1.4, life = 0.18) {
    // anime impact star: billboard with additive spiky texture
    if (!this.starTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.translate(64, 64); g.fillStyle = '#fff';
      g.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 18 : 62; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill();
      this.starTex = new THREE.CanvasTexture(c);
    }
    const mat = new THREE.SpriteMaterial({ map: this.starTex, color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: Math.random() * Math.PI });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z); sp.renderOrder = 7;
    this.group.add(sp);
    this.transient.push({ obj: sp, t: 0, life, update: (u) => { sp.scale.setScalar(size * (0.4 + u * 1.1)); mat.opacity = 1 - u; }, dispose: () => mat.dispose() });
  }

  bolt(a, b, color = 0xffe14d, life = 0.22, width = 0.16, jag = 0.6) {
    const bo = new Bolt(color, width);
    this.group.add(bo.mesh);
    let k = 0;
    this.transient.push({ obj: bo.mesh, t: 0, life, update: (u) => { if (k++ % 2 === 0) bo.set(boltPoints(a, b, 12, jag), this.camera.position); bo.mesh.material.opacity = 1 - u * u; }, dispose: () => { bo.geo.dispose(); bo.mesh.material.dispose(); } });
  }

  slashArc(x, y, z, yaw, color, r = 1.6, life = 0.2, tilt = 0) {
    const geo = new THREE.RingGeometry(r * 0.75, r, 32, 1, -Math.PI * 0.55, Math.PI * 1.1);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(-Math.PI / 2 + tilt, 0, 0);
    const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = yaw; m.position.set(0, 0, 0); holder.add(m);
    this.group.add(holder);
    this.transient.push({ obj: holder, t: 0, life, update: (u) => { holder.scale.setScalar(0.8 + u * 0.5); mat.opacity = 1 - u; }, dispose: () => { geo.dispose(); mat.dispose(); } });
  }

  // ---------- event reactions
  hit(e, attackerChar) {
    const [c0, c1] = ELEMENT_COLORS[e.el] || ELEMENT_COLORS.punch;
    const look = attackerChar ? LOOKS[attackerChar] : null;
    const tint = look ? look.trail : c1;
    const big = e.heavy || e.deadly;
    const sz = Math.min(2.6, 0.7 + e.dmg * 0.07 + (big ? 0.6 : 0));
    this.star(e.x, e.y, e.z, c0, sz * 1.3, big ? 0.22 : 0.14);
    this.flash(e.x, e.y, e.z, { color: c0, r1: sz * 0.7, life: 0.14 });
    this.sparkBurst(e.x, e.y, e.z, tint, 8 + e.dmg, 10 + e.dmg * 0.6);
    this.burst(e.x, e.y, e.z, { count: 6 + e.dmg, speed: 4 + e.dmg * 0.3, color: c0, color1: c1, size: 0.3, life: 0.35 });
    if (e.el === 'fire') this.burst(e.x, e.y, e.z, { count: 14, speed: 3, up: 2, color: 0xffd166, color1: 0xff3b0a, size: 0.55, life: 0.55, drag: 3 });
    if (e.el === 'lightning') for (let i = 0; i < 3; i++) { const a = new THREE.Vector3(e.x, e.y, e.z); this.bolt(a, a.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 3)), 0xfff27a, 0.15, 0.06, 0.4); }
    if (e.el === 'slash') this.slashArc(e.x, e.y, e.z, Math.random() * Math.PI, c1, 0.9 + e.dmg * 0.04, 0.16, (Math.random() - 0.5) * 1.5);
    if (e.el === 'spatial') { this.ring(e.x, e.y, e.z, { color: 0x3ee0d0, flat: false, r1: 1.8, life: 0.3 }); this.burst(e.x, e.y, e.z, { count: 12, speed: 6, color: 0xbff8ff, color1: 0x3ee0d0, size: 0.25, life: 0.4 }); }
    if (big) this.ring(e.x, e.y, e.z, { color: c0, flat: false, r1: 2.6 + e.dmg * 0.05, life: 0.3 });
    if (e.deadly) { this.ring(e.x, e.y, e.z, { color: 0xfff3b0, flat: false, r1: 3.6, life: 0.32, opacity: 0.55 }); this.burst(e.x, e.y, e.z, { count: 40, speed: 16, color: 0xffffff, color1: tint, size: 0.4, life: 0.6 }); }
  }

  shieldHit(e) { this.flash(e.x, e.y, e.z, { color: 0x9ad1ff, r1: 0.8, life: 0.12 }); this.sparkBurst(e.x, e.y, e.z, 0x9ad1ff, 6, 6); }
  parry(e) { this.ring(e.x, e.y, e.z, { color: 0xffffff, flat: false, r1: 3, life: 0.35 }); this.star(e.x, e.y, e.z, 0xbff8ff, 2.4, 0.25); this.sparkBurst(e.x, e.y, e.z, 0xffffff, 24, 14); }
  clank(e) { this.star(e.x, e.y, e.z, 0xffffff, 1.6, 0.16); this.sparkBurst(e.x, e.y, e.z, 0xffe066, 18, 12); }
  explosion(e) {
    const r = e.r || 2;
    const fire = e.el !== 'trap' && e.el !== 'spatial';
    this.flash(e.x, e.y, e.z, { color: fire ? 0xffd27a : 0xbff8ff, r0: r * 0.3, r1: r * 1.05, life: 0.32 });
    this.ring(e.x, e.y + 0.05, e.z, { color: fire ? 0xff8c1a : 0x7bd389, r1: r * 1.5, life: 0.4 });
    this.burst(e.x, e.y, e.z, { count: 18 + r * 10, speed: r * 3.5, up: 2, color: fire ? 0xffe066 : 0xd8ffd0, color1: fire ? 0xff2a00 : 0x2a9d8f, size: 0.5 + r * 0.12, life: 0.6, drag: 3 });
    this.burst(e.x, e.y, e.z, { count: 10 + r * 5, speed: r * 1.6, up: 2.2, color: 0x4a4a4a, color1: 0x222222, size: 0.9 + r * 0.2, life: 1.2, drag: 2, alpha: true });
    this.sparkBurst(e.x, e.y, e.z, 0xffc14d, 12 + r * 4, 10 + r * 2);
  }
  dust(x, y, z, k = 1) { this.burst(x, y + 0.1, z, { count: 8 * k, speed: 2.5 * k, up: 0.6, spread: 1.4, color: 0xe8dcc8, color1: 0xb8a68c, size: 0.45, life: 0.5, drag: 3.5, alpha: true }); }
  koBlast(e, color) {
    const p = new THREE.Vector3(e.x, e.y, e.z);
    const dir = new THREE.Vector3(-e.x, 2 - e.y, -e.z).normalize();
    const geo = new THREE.CylinderGeometry(0.6, 3.2, 24, 20, 1, true);
    geo.translate(0, 12, 0);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.group.add(m);
    this.transient.push({ obj: m, t: 0, life: 1.1, update: (u) => { m.scale.set(1 + u * 0.8, 0.3 + Math.min(1, u * 4) * 0.7, 1 + u * 0.8); mat.opacity = (1 - u) * 0.95; }, dispose: () => { geo.dispose(); mat.dispose(); } });
    this.flash(e.x, e.y, e.z, { color: 0xffffff, r0: 1, r1: 6, life: 0.5 });
    this.burst(e.x, e.y, e.z, { count: 60, speed: 18, color: 0xffffff, color1: color, size: 0.6, life: 0.9 });
    if (e.style === 'water') this.burst(e.x, e.y + 2, e.z, { count: 50, speed: 9, up: 9, grav: 18, color: 0xe0f7ff, color1: 0x5ab4e5, size: 0.5, life: 1.1, alpha: true });
    if (e.style === 'lava') this.burst(e.x, e.y + 2, e.z, { count: 50, speed: 8, up: 9, grav: 16, color: 0xffd166, color1: 0xff3b0a, size: 0.6, life: 1.1 });
  }
  respawn(x, y, z, color) { this.ring(x, y, z, { color, r1: 2.5, life: 0.6 }); this.burst(x, y + 1, z, { count: 30, speed: 4, color: 0xffffff, color1: color, size: 0.3, life: 0.8 }); }

  // ---------- trails following fighter effectors
  trailFor(key, color) {
    let r = this.ribbons.get(key);
    if (!r) { r = new Ribbon(color, 12); this.ribbons.set(key, r); this.group.add(r.mesh); }
    return r;
  }

  // ---------- persistent visuals keyed by sim ids
  persistent(key, make) {
    let p = this.persist.get(key);
    if (!p) { p = make(); p.seen = true; this.persist.set(key, p); if (p.obj) this.group.add(p.obj); }
    p.seen = true;
    return p;
  }

  beginFrame() { for (const p of this.persist.values()) p.seen = false; }
  endFrame() {
    for (const [k, p] of this.persist) {
      if (!p.seen) { if (p.obj) this.group.remove(p.obj); if (p.dispose) p.dispose(); this.persist.delete(k); }
    }
  }

  // projectile visuals
  projectile(p, dt, owner) {
    const kind = p.kind;
    const v = this.persistent('p' + p.pid, () => this.makeProjectile(kind, p, owner));
    v.obj.position.set(p.x, p.y, p.z);
    if (v.update) v.update(p, dt);
  }

  makeProjectile(kind, p, owner) {
    const g = new THREE.Group();
    const glow = (color, r, mult = 2.2) => new THREE.Mesh(this.sphereGeo || (this.sphereGeo = new THREE.SphereGeometry(1, 20, 14)), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(mult), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    const self = this;
    if (kind === 'fireball' || kind === 'sunball' || kind === 'meteor') {
      const big = kind === 'sunball';
      const core = glow(big ? 0xfff1a8 : 0xffd166, 1, big ? 3 : 2.6); const halo = glow(0xff5400, 1, 1.4); halo.material.opacity = 0.45;
      g.add(core, halo);
      return { obj: g, update(pp) { const r = pp.r; core.scale.setScalar(r * 0.75); halo.scale.setScalar(r * (1.25 + Math.sin(performance.now() * 0.02) * 0.08));
        self.add.spawn({ x: pp.x + (Math.random() - 0.5) * r, y: pp.y + (Math.random() - 0.5) * r, z: pp.z + (Math.random() - 0.5) * r, vx: -pp.vx * 0.1, vy: 1.5, vz: -pp.vz * 0.1, color: 0xffd166, color1: 0xff2a00, size: r * (big ? 0.8 : 1.1), life: 0.45, drag: 2 });
        if (big && Math.random() < 0.5) self.sparkBurst(pp.x, pp.y, pp.z, 0xffb627, 2, 8); } };
    }
    if (kind === 'bolt') {
      const bo = new Bolt(0xfff27a, 0.12); g.add(bo.mesh);
      const core = glow(0xffffff, 1, 3); core.scale.setScalar(0.3); g.add(core);
      return { obj: g, update(pp) { const d = new THREE.Vector3(pp.vx, pp.vy, pp.vz).normalize(); const a = new THREE.Vector3(0, 0, 0), b = d.clone().multiplyScalar(-2.2); bo.set(boltPoints(a, b, 8, 0.35), self.camera.position.clone().sub(g.position)); }, dispose() { bo.geo.dispose(); } };
    }
    if (kind === 'pellet') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toonMat(0xd0d0d0, { rim: 0.8 })); g.add(m);
      const tr = glow(0xfff0c2, 1, 2); tr.scale.set(0.12, 0.12, 0.9); g.add(tr);
      return { obj: g, update(pp) { g.lookAt(pp.x + pp.vx, pp.y + pp.vy, pp.z + pp.vz); tr.position.z = -0.6; } };
    }
    if (kind === 'bomb' || kind === 'minibomb') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(kind === 'bomb' ? 0.32 : 0.26, 14, 10), toonMat(0x22223a, { rim: 0.6 })); addOutline(m, 0.02); g.add(m);
      const fuse = glow(0xffd166, 1, 3); fuse.scale.setScalar(0.09); fuse.position.y = 0.32; g.add(fuse);
      return { obj: g, update(pp) { m.rotation.x += 0.2; fuse.scale.setScalar(0.07 + Math.random() * 0.06); if (Math.random() < 0.6) self.sparks.spawn(pp.x, pp.y + 0.32, pp.z, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4, 0xffc14d, 0.2); } };
    }
    if (kind === 'trap') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.12, 16), toonMat(0x6d4c41)); addOutline(base, 0.02); g.add(base);
      const spring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16), toonMat(0xbcbcbc, { rim: 0.6 })); spring.rotation.x = Math.PI / 2; spring.position.y = 0.12; g.add(spring);
      const light = glow(0x7bd389, 1, 2.5); light.scale.setScalar(0.08); light.position.y = 0.2; g.add(light);
      return { obj: g, update(pp) { light.visible = pp.armed ? (performance.now() % 600 < 300) : true; light.material.color.set(pp.armed ? 0xff4d4d : 0x7bd389).multiplyScalar(2.5); } };
    }
    if (kind === 'slashWave') {
      const geo = new THREE.RingGeometry(0.9, 1.25, 28, 1, -Math.PI * 0.45, Math.PI * 0.9);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fffe0).multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; const h = new THREE.Group(); h.add(m); g.add(h);
      return { obj: g, update(pp) { h.rotation.y = Math.atan2(pp.vx, pp.vz) - Math.PI / 2; h.rotation.order = 'YXZ'; m.rotation.z = Math.PI / 2; } };
    }
    const core = glow(0xffffff, 1); core.scale.setScalar(p.r || 0.3); g.add(core);
    return { obj: g };
  }

  // zone visuals
  zone(z, dt, world) {
    const v = this.persistent('z' + z.zid, () => this.makeZone(z, world));
    if (v.obj) v.obj.position.set(z.x, z.y, z.z);
    if (v.update) v.update(z, dt);
  }

  makeZone(z, world) {
    const kind = z.kind, self = this;
    const g = new THREE.Group();
    const dome = (color, r, wire = true) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uT: { value: 0 }, uA: { value: 1 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }',
        fragmentShader: `uniform vec3 uColor; uniform float uT; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
            float grid = step(0.94, fract(vP.y * 1.6 + uT * 0.4)) + step(0.96, fract(atan(vP.z, vP.x) * 4.0));
            gl_FragColor = vec4(uColor * (0.75 + grid * 0.8), (f * 0.42 + grid * 0.12 + 0.015) * uA); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      void wire;
      return { m, mat };
    };
    if (kind === 'domain' || kind === 'severDome') {
      const d = dome(kind === 'domain' ? 0x3ee0d0 : 0x9ffcff, z.r);
      g.add(d.m);
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.15, z.r, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ee0d0).multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05 - (kind === 'domain' ? 0.5 : 1); g.add(ring);
      d.m.position.y = kind === 'domain' ? -0.5 : -1;
      return { obj: g, update(zz, dt) {
        d.mat.uniforms.uT.value += dt;
        const intro = Math.min(1, zz.age / 10), out = Math.min(1, (zz.life - zz.age) / 12);
        g.scale.setScalar(0.2 + 0.8 * intro); d.mat.uniforms.uA.value = out;
        if (kind === 'severDome' && Math.random() < 0.7) { const a = Math.random() * Math.PI * 2, r = Math.random() * zz.r; const p = new THREE.Vector3(zz.x + Math.cos(a) * r, zz.y + Math.random() * 3, zz.z + Math.sin(a) * r); self.slashArc(p.x, p.y, p.z, Math.random() * Math.PI, 0x9ffcff, 1.2 + Math.random(), 0.12, (Math.random() - 0.5) * 3); }
      } };
    }
    if (kind === 'riftCut') {
      return { obj: g, update(zz) { if (zz.age === 6 || (zz.age === 7 && !this.done)) { this.done = true; self.slashArc(zz.x, zz.y, zz.z, Math.random() * 3, 0x3ee0d0, 1.6, 0.25, 1.2); self.burst(zz.x, zz.y, zz.z, { count: 16, speed: 5, color: 0xffffff, color1: 0x3ee0d0, size: 0.3, life: 0.4 }); } if (zz.age < 6 && Math.random() < 0.5) self.add.spawn({ x: zz.x + (Math.random() - 0.5) * 0.6, y: zz.y + (Math.random() - 0.5) * 0.6, z: zz.z + (Math.random() - 0.5) * 0.6, color: 0x3ee0d0, size: 0.25, life: 0.2 }); } };
    }
    if (kind === 'flamePillar' || kind === 'geyser') {
      const lava = kind === 'geyser';
      const col = new THREE.Mesh(new THREE.CylinderGeometry(z.r * 0.7, z.r, z.h || 4, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(lava ? 0xff5a1f : 0xff7b00).multiplyScalar(1.8), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      col.position.y = (z.h || 4) / 2; g.add(col);
      return { obj: g, update(zz) { const u = zz.age / zz.life; col.scale.set(1 + Math.sin(zz.age) * 0.05, Math.min(1, zz.age / 4), 1 + Math.cos(zz.age) * 0.05); col.material.opacity = 0.55 * (1 - u);
        for (let i = 0; i < 3; i++) self.add.spawn({ x: zz.x + (Math.random() - 0.5) * zz.r, y: zz.y + Math.random() * 0.5, z: zz.z + (Math.random() - 0.5) * zz.r, vx: (Math.random() - 0.5) * 2, vy: 10 + Math.random() * 8, vz: (Math.random() - 0.5) * 2, color: 0xffe066, color1: lava ? 0xb5170a : 0xff2a00, size: 0.7, life: 0.5, drag: 1.5 }); } };
    }
    if (kind === 'shockwave' || kind === 'roar') {
      return { obj: g, update(zz) { if (zz.age === 1) { self.ring(zz.x, zz.y + 0.08, zz.z, { color: kind === 'roar' ? 0xff5a5a : 0xffe2b0, r0: 0.4, r1: zz.r * 1.2, life: 0.35 }); self.dust(zz.x, zz.y, zz.z, 2.4); if (kind === 'roar') self.ring(zz.x, zz.y + 1, zz.z, { color: 0xff8a8a, flat: false, r1: zz.r * 1.3, life: 0.4 }); } } };
    }
    if (kind === 'thunderStrike' || kind === 'ultBolt') {
      const ult = kind === 'ultBolt';
      const warn = new THREE.Mesh(new THREE.RingGeometry(z.r * 0.8, z.r, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd60a).multiplyScalar(2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      warn.rotation.x = -Math.PI / 2; warn.position.y = ult ? 2.06 : 0.06; g.add(warn);
      const strikeAt = ult ? 22 : 0;
      return { obj: g, update(zz) {
        warn.material.opacity = zz.age < strikeAt ? 0.4 + 0.4 * Math.sin(zz.age * 0.8) : Math.max(0, 1 - (zz.age - strikeAt) / 8);
        if (zz.age === strikeAt || zz.age === strikeAt + 1 && !this.struck) {
          this.struck = true;
          const base = new THREE.Vector3(zz.x, zz.y + (ult ? 2 : 0), zz.z);
          for (let i = 0; i < (ult ? 4 : 3); i++) self.bolt(base.clone().add(new THREE.Vector3(0, 18, 0)), base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5)), 0xfff7b0, ult ? 0.4 : 0.28, ult ? 0.45 : 0.3, 1.6);
          self.flash(base.x, base.y + 0.5, base.z, { color: 0xfff7b0, r1: ult ? 4 : 2.6, life: 0.3 });
          self.ring(base.x, base.y + 0.06, base.z, { color: 0xffd60a, r1: zz.r * 2.5, life: 0.35 });
          self.sparkBurst(base.x, base.y + 0.3, base.z, 0xfff27a, 26, 14);
        }
      } };
    }
    if (kind === 'stormCloud') {
      const cloudMat = toonMat(0x4a4e69, { rim: 0.4, transparent: true, opacity: 0.95 });
      const cg = new THREE.Group();
      for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.55 + Math.random() * 0.35, 12, 10), cloudMat); s.position.set((Math.random() - 0.5) * 2.6, Math.random() * 0.4, (Math.random() - 0.5) * 1.6); cg.add(s); }
      cg.position.y = (z.h || 4.8) + 0.4; g.add(cg);
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.12, z.r, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd60a).multiplyScalar(1.5), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
      return { obj: g, update(zz) { cg.rotation.y += 0.01; cg.position.y = (zz.h || 4.8) + 0.4 + Math.sin(zz.age * 0.05) * 0.15; if (Math.random() < 0.05) { const a = new THREE.Vector3(zz.x + (Math.random() - 0.5) * 2, zz.y + zz.h + 0.2, zz.z + (Math.random() - 0.5) * 1.4); self.bolt(a, a.clone().add(new THREE.Vector3((Math.random() - 0.5), -1.2, (Math.random() - 0.5))), 0xfff27a, 0.12, 0.05, 0.4); } }, dispose() { cloudMat.dispose(); } };
    }
    if (kind === 'tornado') {
      const swirl = document.createElement('canvas'); swirl.width = 64; swirl.height = 256; { const g = swirl.getContext('2d'); for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(220,235,255,${0.25 + Math.random() * 0.5})`; g.lineWidth = 2 + Math.random() * 5; g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(20, y - 30, 44, y + 30, 64, y - 10); g.stroke(); } }
      const tex = new THREE.CanvasTexture(swirl); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4, 1);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r * 0.3, z.h || 7, 32, 1, true), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0xbfd7ff).multiplyScalar(1.1), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      cone.position.y = (z.h || 7) / 2; g.add(cone);
      return { obj: g, update(zz) { cone.rotation.y += 0.35; cone.material.map.offset.y -= 0.03; cone.material.opacity = 0.45 * Math.min(1, (zz.life - zz.age) / 10);
        for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2, h = Math.random() * (zz.h || 7), r = zz.r * (0.3 + h / (zz.h || 7) * 0.7); self.add.spawn({ x: zz.x + Math.cos(a) * r, y: zz.y + h, z: zz.z + Math.sin(a) * r, vx: -Math.sin(a) * 9, vy: 3, vz: Math.cos(a) * 9, color: 0xe0f0ff, color1: 0x6c8cff, size: 0.35, life: 0.4 }); }
        if (Math.random() < 0.15) { const b = new THREE.Vector3(zz.x, zz.y + zz.h, zz.z); self.bolt(b, b.clone().add(new THREE.Vector3((Math.random() - 0.5) * zz.r * 2, -zz.h * 0.8, (Math.random() - 0.5) * zz.r * 2)), 0xfff27a, 0.12, 0.12, 0.8); } } };
    }
    if (kind === 'blast' || kind === 'hazardBlast') return { obj: null };
    return { obj: null };
  }

  hazardWarn(h) {
    const v = this.persistent('h' + h.hid, () => {
      const g = new THREE.Group();
      if (h.kind === 'wind') return { obj: g, update(hz) { if (hz.phase === 'active' && Math.random() < 0.8) { const dx = Math.sin(hz.dir), dz = Math.cos(hz.dir); const x = -dx * 25 + (Math.random() - 0.5) * 40 * Math.abs(dz), z = -dz * 25 + (Math.random() - 0.5) * 30 * Math.abs(dx); this.self.add.spawn({ x, y: Math.random() * 10, z, vx: dx * 30, vz: dz * 30, color: 0xffffff, size: 0.2, size1: 0.2, life: 1.6, alpha: 0.5 }); } }, self: this };
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3b3b).multiplyScalar(1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const r = h.kind === 'geyser' ? 1.6 : 2.6;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r, 40), mat); ring.rotation.x = -Math.PI / 2; g.add(ring);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat.clone()); fill.rotation.x = -Math.PI / 2; fill.material.opacity = 0.18; g.add(fill);
      return { obj: g, update(hz) { const k = hz.phase === 'warn' ? hz.t / hz.warn : 1; fill.scale.setScalar(Math.max(0.01, k)); mat.opacity = hz.phase === 'warn' ? 0.35 + 0.35 * Math.sin(hz.t * 0.5) : 0; fill.material.opacity = hz.phase === 'warn' ? 0.2 : 0; } };
    });
    if (v.obj) v.obj.position.set(h.x, h.y + 0.07, h.z);
    if (v.update) v.update(h);
  }

  // ultimate telegraph shape during the cinematic freeze
  telegraph(f, tele, color, t) {
    const key = 'tele' + f.id;
    const v = this.persistent(key, () => {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      let m;
      if (tele.shape === 'line') { m = new THREE.Mesh(new THREE.PlaneGeometry(tele.width, tele.len), mat); m.rotation.x = -Math.PI / 2; m.position.z = tele.len / 2; }
      else if (tele.shape === 'square') { m = new THREE.Mesh(new THREE.PlaneGeometry(tele.size, tele.size), mat); m.rotation.x = -Math.PI / 2; m.position.z = tele.ahead || 0; }
      else if (tele.shape === 'circle' || tele.shape === 'dome') { m = new THREE.Mesh(new THREE.RingGeometry((tele.r || 5) * 0.92, tele.r || 5, 64), mat); m.rotation.x = -Math.PI / 2; m.position.z = tele.ahead || 0; }
      else { m = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2, 8), mat); }
      const g = new THREE.Group(); g.add(m);
      return { obj: g, mat, dispose() { mat.dispose(); m.geometry.dispose(); } };
    });
    v.obj.position.set(f.pos.x, f.pos.y + 0.08, f.pos.z);
    v.obj.rotation.y = f.facing;
    v.mat.opacity = 0.25 + 0.2 * Math.sin(t * 12);
  }

  update(dt) {
    this.add.update(dt); this.alpha.update(dt); this.sparks.update(dt);
    for (let i = this.transient.length - 1; i >= 0; i--) {
      const tr = this.transient[i];
      tr.t += dt;
      const u = Math.min(1, tr.t / tr.life);
      tr.update(u);
      if (tr.t >= tr.life) { this.group.remove(tr.obj); if (tr.dispose) tr.dispose(); this.transient.splice(i, 1); }
    }
  }

  clearAll() {
    for (const tr of this.transient) { this.group.remove(tr.obj); if (tr.dispose) tr.dispose(); }
    this.transient.length = 0;
    for (const [, p] of this.persist) { if (p.obj) this.group.remove(p.obj); if (p.dispose) p.dispose(); }
    this.persist.clear();
    for (const [, r] of this.ribbons) { this.group.remove(r.mesh); r.geo.dispose(); }
    this.ribbons.clear();
    this.add.clear(); this.alpha.clear();
  }
}

export { ELEMENT_COLORS };
