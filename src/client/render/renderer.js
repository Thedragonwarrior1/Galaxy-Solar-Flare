// GameRenderer: owns the WebGL renderer, post-processing, arena visuals, fighter models, VFX and camera.
// Reads a "view" of the world (local sim World or an online snapshot proxy with the same fields).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildArena } from './arenas/index.js';
import { ARENAS, platformAt } from '../../shared/sim/arenas.js';
import { CHARACTERS, ROSTER } from '../../shared/characters/index.js';
import { groundBelow } from '../../shared/sim/collision.js';
import { evalTrack } from '../../shared/sim/tracks.js';
import { FighterModel, LOOKS } from './characterModels.js';
import { FighterAnimator, cylLocal } from './animator.js';
import { VFX } from './vfx.js';
import { CameraRig } from './camera.js';
import { SHIELD } from '../../shared/sim/constants.js';

export const PLAYER_COLORS = [0xff4d5e, 0x3fa7ff, 0xffd23f, 0x4fe08a];
export const TEAM_COLORS = [0xff4d5e, 0x3fa7ff];
export const CPU_COLOR = 0xb0b0b8;

const QUALITY = {
  low: { pixelRatio: 0.85, shadows: false, bloom: false, aa: false, shadowSize: 0 },
  medium: { pixelRatio: 1.25, shadows: true, bloom: true, aa: true, shadowSize: 1024 },
  high: { pixelRatio: 2, shadows: true, bloom: true, aa: true, shadowSize: 2048 },
};

export class GameRenderer {
  constructor(container, settings) {
    this.container = container;
    this.settings = { ...settings };
    this.q = QUALITY[settings.quality] || QUALITY.high;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'game-canvas';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87c8ff);
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 900);
    this.rig = new CameraRig(this.camera);
    this.rig.shakeEnabled = settings.screenShake !== false;
    this.vfx = new VFX(this.scene, this.camera, settings.quality);
    this.vfx.intensity = settings.vfx !== undefined ? settings.vfx : 1;
    this.fighters = new Map();
    this.arenaVis = null;
    this.arenaId = null;
    this.time = 0;
    this.mode = 'idle'; // 'match' | 'showcase' | 'select' | 'results'
    this.fill = new THREE.HemisphereLight(0xffffff, 0x444466, 0.25); // safety fill so nothing renders black
    this.scene.add(this.fill);
    this.blobGeo = new THREE.CircleGeometry(1, 24);
    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    this.buildComposer();
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  buildComposer() {
    const q = this.q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio) * (this.settings.resolution || 1));
    if (q.bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.42, 0.86);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null; this.bloom = null;
    }
  }

  applySettings(s) {
    const qualityChanged = s.quality !== this.settings.quality || s.resolution !== this.settings.resolution;
    this.settings = { ...s };
    this.rig.shakeEnabled = s.screenShake !== false;
    this.vfx.intensity = s.vfx !== undefined ? s.vfx : 1;
    if (qualityChanged) {
      this.q = QUALITY[s.quality] || QUALITY.high;
      this.renderer.shadowMap.enabled = this.q.shadows;
      this.vfx.setQuality(s.quality);
      this.buildComposer();
      this.resize();
      if (this.arenaId) { const id = this.arenaId; this.arenaId = null; this.loadArena(id); }
      this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setSize(w, h); this.composer.setPixelRatio(this.renderer.getPixelRatio()); }
    this.vfx.add.mat.uniforms.uScale.value = h * this.renderer.getPixelRatio() * 0.9;
    this.vfx.alpha.mat.uniforms.uScale.value = h * this.renderer.getPixelRatio() * 0.9;
  }

  // ------------------------------------------------------------------ arena
  loadArena(id) {
    if (this.arenaId === id) return;
    this.unloadArena();
    const arena = ARENAS[id];
    const vis = buildArena(id, { quality: this.settings.quality, arena });
    this.scene.add(vis.group);
    this.scene.background = vis.background || new THREE.Color(0x87c8ff);
    this.scene.fog = vis.fog || null;
    const sun = vis.sun;
    if (sun) {
      sun.castShadow = this.q.shadows;
      if (this.q.shadows) {
        sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
        const c = sun.shadow.camera;
        c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 1; c.far = 160;
        c.updateProjectionMatrix();
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.03;
      }
    }
    this.arenaVis = vis;
    this.arenaId = id;
    this.arena = arena;
    this.rig.setArena(arena);
  }

  unloadArena() {
    if (!this.arenaVis) return;
    this.scene.remove(this.arenaVis.group);
    try { this.arenaVis.dispose(); } catch (e) { /* ignore */ }
    this.arenaVis = null;
    this.arenaId = null;
  }

  // ------------------------------------------------------------------ fighters
  colorFor(f, view) {
    if (view && view.teams) return TEAM_COLORS[f.team % 2];
    if (f.cpu) return CPU_COLOR;
    return PLAYER_COLORS[f.slot % 4];
  }

  addFighter(f, view) {
    const color = this.colorFor(f, view);
    const model = new FighterModel(CHARACTERS[f.charId], this.settings.quality, color);
    model.addTo(this.scene);
    const anim = new FighterAnimator(model);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 3;
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat); blob.rotation.x = -Math.PI / 2; blob.renderOrder = 2;
    const shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending });
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), shieldMat); shield.visible = false;
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.6, 0.18, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); plat.visible = false;
    this.scene.add(ring, blob, shield, plat);
    const v = { f, model, anim, ring, blob, shield, plat, color, prev: { ...f.pos }, cur: { ...f.pos }, lastState: '', smokeT: 0, wasMonster: false };
    this.fighters.set(f.id, v);
    return v;
  }

  clearFighters() {
    for (const v of this.fighters.values()) {
      v.model.removeFrom(this.scene); v.model.dispose();
      this.scene.remove(v.ring, v.blob, v.shield, v.plat);
      v.ring.geometry.dispose(); v.ring.material.dispose(); v.shield.geometry.dispose(); v.shield.material.dispose(); v.plat.geometry.dispose(); v.plat.material.dispose();
    }
    this.fighters.clear();
  }

  /** Begin rendering a match from a world view. */
  startMatch(view) {
    this.clearFighters();
    this.vfx.clearAll();
    this.loadArena(view.arena.id);
    this.view = view;
    for (const f of view.fighters) this.addFighter(f, view);
    this.mode = 'match';
    this.rig.snap = true;
  }

  endMatch() { this.clearFighters(); this.vfx.clearAll(); this.view = null; this.showHitboxes = false; if (this.hbGroup) this.hbGroup.visible = false; }

  /** Call after every sim step (local play) so frames can interpolate between steps. */
  captureStep(view) {
    for (const f of view.fighters) {
      const v = this.fighters.get(f.id);
      if (!v) continue;
      v.prev.x = v.cur.x; v.prev.y = v.cur.y; v.prev.z = v.cur.z;
      v.cur.x = f.pos.x; v.cur.y = f.pos.y; v.cur.z = f.pos.z;
      // teleports / respawns: don't interpolate across big jumps
      if (Math.hypot(v.cur.x - v.prev.x, v.cur.y - v.prev.y, v.cur.z - v.prev.z) > 3) { v.prev.x = v.cur.x; v.prev.y = v.cur.y; v.prev.z = v.cur.z; }
    }
  }

  // ------------------------------------------------------------------ events -> visuals
  handleEvents(events, view) {
    const V = this.vfx;
    for (const e of events) {
      const fv = e.id !== undefined ? this.fighters.get(e.id) : null;
      if (fv) fv.anim.onEvent(e);
      switch (e.type) {
        case 'hit': {
          const a = view.fighters[e.a];
          V.hit(e, a ? a.charId : null);
          const s = Math.min(1.2, 0.08 + e.kb * 0.004 + e.dmg * 0.01);
          if (e.kb > 20 || e.dmg > 6) this.rig.shake(s, 0.12 + e.kb * 0.0015);
          if (e.deadly) { this.rig.zoomPunch(1); this.rig.shake(1.0, 0.45); }
          break;
        }
        case 'shieldHit': V.shieldHit(e); break;
        case 'shieldBreak': V.burst(e.x, e.y, e.z, { count: 40, speed: 8, color: 0xbfe9ff, color1: 0x5aa9ff, size: 0.4, life: 0.7 }); this.rig.shake(0.6, 0.3); break;
        case 'parry': V.parry(e); this.rig.shake(0.3, 0.15); break;
        case 'clank': V.clank(e); break;
        case 'explode': V.explosion(e); this.rig.shake(Math.min(1.4, 0.2 + e.r * 0.15), 0.3); break;
        case 'ko': {
          const f = view.fighters[e.id];
          V.koBlast(e, fv ? fv.color : 0xffffff);
          this.rig.shake(1.6, 0.6);
          break;
        }
        case 'respawn': if (fv) V.respawn(e.x, e.y, e.z, fv.color); break;
        case 'land': if (fv && e.hard) V.dust(fv.f.pos.x, fv.f.pos.y, fv.f.pos.z, 1.2); break;
        case 'jump': if (fv) { if (e.air) V.ring(fv.f.pos.x, fv.f.pos.y + 0.05, fv.f.pos.z, { color: 0xffffff, r1: 1.2, life: 0.3, opacity: 0.6 }); else V.dust(fv.f.pos.x, fv.f.pos.y, fv.f.pos.z, 0.7); } break;
        case 'dodge': if (fv) V.burst(fv.f.pos.x, fv.f.pos.y + 1, fv.f.pos.z, { count: 10, speed: 3, color: 0xffffff, color1: fv.color, size: 0.35, life: 0.3 }); break;
        case 'ultStart': {
          const f = view.fighters[e.id];
          if (f) { V.ring(f.pos.x, f.pos.y + 0.1, f.pos.z, { color: LOOKS[f.charId].trail, r1: 6, life: 0.6 }); V.burst(f.pos.x, f.pos.y + 1, f.pos.z, { count: 50, speed: 10, color: 0xffffff, color1: LOOKS[f.charId].trail, size: 0.45, life: 0.7 }); }
          break;
        }
        case 'transform': if (fv) { V.burst(fv.f.pos.x, fv.f.pos.y + 1.2, fv.f.pos.z, { count: 50, speed: 7, color: 0xb7f5b0, color1: 0x2d6a4f, size: 0.6, life: 0.8 }); V.ring(fv.f.pos.x, fv.f.pos.y + 0.1, fv.f.pos.z, { color: 0x95d5b2, r1: 4, life: 0.5 }); } break;
        case 'fx': this.fxEvent(e); break;
        case 'hazardWarn': case 'hazard': if (this.arenaVis) this.arenaVis.onHazard(e); if (e.type === 'hazard' && e.kind === 'wind') this.rig.shake(0.2, 0.4); break;
        default: break;
      }
    }
  }

  fxEvent(e) {
    const V = this.vfx;
    const fv = this.fighters.get(e.id);
    const col = fv ? LOOKS[fv.f.charId].trail : 0xffffff;
    switch (e.name) {
      case 'teleportOut': case 'teleportIn':
        V.burst(e.x, e.y + 1, e.z, { count: 26, speed: 6, color: 0xffffff, color1: 0x3ee0d0, size: 0.35, life: 0.45 });
        V.ring(e.x, e.y + 1, e.z, { color: 0x3ee0d0, flat: false, r1: 1.8, life: 0.3 });
        break;
      case 'tether': V.burst(e.x, e.y, e.z, { count: 14, speed: 4, color: col, size: 0.3, life: 0.4 }); break;
      case 'hookMiss': V.burst(e.x, e.y, e.z, { count: 8, speed: 2, color: 0xcccccc, size: 0.25, life: 0.3 }); break;
      case 'meteorImpact': V.ring(e.x, e.y + 0.1, e.z, { color: 0xff7b00, r1: 8, life: 0.5 }); this.rig.shake(1.4, 0.5); break;
      case 'cloudStrike': { const a = new THREE.Vector3(e.x, e.y + 5, e.z), b = new THREE.Vector3(e.x, e.y, e.z); for (let i = 0; i < 3; i++) V.bolt(a, b, 0xfff27a, 0.25, 0.25, 0.9); V.flash(e.x, e.y + 0.5, e.z, { color: 0xfff7b0, r1: 2, life: 0.2 }); break; }
      case 'tech': V.burst(e.x, e.y + 0.5, e.z, { count: 16, speed: 4, color: 0xffffff, color1: 0x9ad1ff, size: 0.3, life: 0.35 }); break;
      case 'chargeStart': break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ per-frame
  /**
   * Render a match frame.
   * alpha: interpolation factor between the last two sim steps (local play), or 1 for net views.
   */
  renderMatch(dt, alpha, view, opts = {}) {
    this.time += dt;
    const V = this.vfx;
    V.beginFrame();
    // moving platforms (render at interpolated frame)
    if (this.arenaVis) {
      const fr = view.frame - 1 + alpha;
      for (const p of view.arena.platforms) {
        const o = this.arenaVis.platformObjects[p.id];
        if (o && p.motion) { const q = platformAt(p, fr); o.position.set(q.x, q.top, q.z); }
      }
      this.arenaVis.update(this.time, dt);
    }
    const focus = [];
    let cine = null;
    for (const f of view.fighters) {
      const v = this.fighters.get(f.id) || this.addFighter(f, view);
      v.f = f;
      const pos = { x: v.prev.x + (v.cur.x - v.prev.x) * alpha, y: v.prev.y + (v.cur.y - v.prev.y) * alpha, z: v.prev.z + (v.cur.z - v.prev.z) * alpha };
      if (opts.net) { pos.x = f.pos.x; pos.y = f.pos.y; pos.z = f.pos.z; }
      // hitlag shake (impact readability)
      if (f.hitlag > 0 && f.state === 'hitstun') { pos.x += (Math.random() - 0.5) * 0.12; pos.z += (Math.random() - 0.5) * 0.12; }
      const fview = f;
      fview.inv = typeof f.intangible === 'function' ? f.intangible() : f.inv;
      v.anim.update(fview, pos, dt, 'game');
      this.decorate(v, f, pos, view, dt);
      if (f.state !== 'dead' && !f.eliminated) focus.push(new THREE.Vector3(pos.x, pos.y + 1, pos.z));
      if (view.cine && view.cine.id === f.id) {
        cine = { pos: new THREE.Vector3(pos.x, pos.y, pos.z), facing: f.facing };
        const m = f.mdef || (f.move && f.def.moves[f.move]);
        if (m && m.tele) V.telegraph(f, m.tele, LOOKS[f.charId].trail, this.time);
      }
      this.trails(v, f, dt);
    }
    this.drawHitboxes(view);
    for (const p of view.projectiles) V.projectile(p, dt, view.fighters[p.owner]);
    for (const z of view.zones) V.zone(z, dt, view);
    for (const h of view.hazards || []) V.hazardWarn(h);
    V.endFrame();
    V.update(dt);
    // camera
    if (opts.orbit) this.rig.orbit(opts.orbit * dt);
    this.rig.update(dt, focus, cine);
    this.renderer.toneMappingExposure = cine ? 0.82 : (view.phase === 'ending' ? 1.08 : 1.0);
    this.draw();
  }

  /** Training aid: draw active hitboxes (red) and hurtboxes (blue) from the local sim. */
  drawHitboxes(view) {
    const on = this.showHitboxes && typeof view.collectHitboxes === 'function';
    if (!this.hbGroup) {
      if (!on) return;
      this.hbGroup = new THREE.Group();
      this.hbGroup.renderOrder = 9;
      this.scene.add(this.hbGroup);
      this.hbSphere = new THREE.SphereGeometry(1, 14, 10);
      this.hbMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.35, depthTest: false });
      this.hurtMat = new THREE.MeshBasicMaterial({ color: 0x3fa7ff, transparent: true, opacity: 0.18, depthTest: false, wireframe: true });
      this.hbPool = [];
    }
    this.hbGroup.visible = on;
    if (!on) return;
    const list = view.collectHitboxes();
    let k = 0;
    const get = (mat) => { let m = this.hbPool[k]; if (!m) { m = new THREE.Mesh(this.hbSphere, mat); this.hbPool.push(m); this.hbGroup.add(m); } m.material = mat; m.visible = true; k++; return m; };
    for (const hb of list) {
      const m = get(this.hbMat);
      m.position.set(hb.x, hb.y + (hb.shape === 'cyl' ? hb.h / 2 : 0), hb.z);
      m.scale.set(hb.r, hb.shape === 'cyl' ? hb.h / 2 : hb.r, hb.r);
    }
    for (const f of view.fighters) {
      if (f.state === 'dead') continue;
      const m = get(this.hurtMat);
      m.position.set(f.pos.x, f.pos.y + f.height / 2, f.pos.z);
      m.scale.set(f.radius, f.height / 2, f.radius);
    }
    for (let i = k; i < this.hbPool.length; i++) this.hbPool[i].visible = false;
  }

  decorate(v, f, pos, view, dt) {
    const alive = f.state !== 'dead';
    const P = view.arena.platforms, PL = view.placements;
    const g = alive ? groundBelow(P, PL, pos.x, pos.y + 0.3, pos.z, 0) : null;
    v.ring.visible = v.blob.visible = !!g && alive;
    if (g) {
      const h = Math.max(0, pos.y - g.y);
      const k = Math.max(0.35, 1 - h / 14);
      v.blob.position.set(pos.x, g.y + 0.02, pos.z); v.blob.scale.setScalar(0.55 * k * (f.scale || 1));
      v.ring.position.set(pos.x, g.y + 0.03, pos.z); v.ring.scale.setScalar((f.scale || 1) * (0.9 + 0.1 * Math.sin(this.time * 4)));
      v.ring.material.opacity = 0.75 * k;
    }
    // shield bubble
    const shielding = f.state === 'shield' || f.state === 'shieldstun';
    v.shield.visible = shielding;
    if (shielding) {
      const r = (0.5 + 0.75 * (f.shieldHP / SHIELD.MAX)) * (f.scale || 1);
      v.shield.position.set(pos.x, pos.y + f.def.stats.height * 0.5 * (f.scale || 1), pos.z);
      v.shield.scale.setScalar(r);
      v.shield.material.opacity = f.state === 'shieldstun' ? 0.55 : (f.sf <= SHIELD.PARRY_WINDOW ? 0.7 : 0.32);
    }
    // respawn platform
    v.plat.visible = f.state === 'respawn';
    if (v.plat.visible) v.plat.position.set(pos.x, pos.y - 0.1, pos.z);
    // flash / rim feedback
    const m = v.model;
    let rimC = null, rimS = 0.32;
    if (f.flash > 0) { rimC = 0xffffff; rimS = 1.4; }
    else if (f.ult >= 100 && alive) { rimC = LOOKS[f.charId].trail; rimS = 0.55 + 0.35 * Math.sin(this.time * 6); }
    else if (f.pct >= 120) { rimC = 0xff3030; rimS = 0.45 + 0.2 * Math.sin(this.time * 5); }
    const key = (rimC || 0) + ':' + Math.round(rimS * 20);
    if (key !== v.rimKey) { v.rimKey = key; m.setRim(new THREE.Color(rimC !== null ? rimC : 0xffffff), rimS); }
    // high-percent steam + knockback trail
    v.smokeT -= dt;
    if (alive && f.pct >= 100 && v.smokeT <= 0) { v.smokeT = 0.35 - Math.min(0.25, (f.pct - 100) * 0.002); this.vfx.burst(pos.x, pos.y + 1.6, pos.z, { count: 2, speed: 0.8, up: 1.4, color: 0xdddddd, color1: 0x888888, size: 0.5, life: 0.9, alpha: true }); }
    if (f.state === 'hitstun' && f.kb) {
      const sp = Math.hypot(f.kb.x, f.kb.y, f.kb.z);
      if (sp > 12) this.vfx.burst(pos.x, pos.y + 1, pos.z, { count: 2, speed: 0.4, color: sp > 30 ? 0xffffff : 0xcfcfcf, color1: 0x777777, size: 0.55 + sp * 0.012, life: 0.5, alpha: true });
      if (sp > 30) this.vfx.add.spawn({ x: pos.x, y: pos.y + 1, z: pos.z, color: v.color, size: 0.9, life: 0.35 });
    }
    // dust while running fast
    if (f.grounded && f.state === 'idle' && Math.hypot(f.vel.x, f.vel.z) > f.def.stats.runSpeed * 0.8 && Math.random() < 0.15) this.vfx.dust(pos.x, pos.y, pos.z, 0.35);
    // monster aura
    if (f.transform > 0 && Math.random() < 0.3) this.vfx.add.spawn({ x: pos.x + (Math.random() - 0.5), y: pos.y + Math.random() * 2.5, z: pos.z + (Math.random() - 0.5), vy: 2, color: 0x95d5b2, color1: 0x2d6a4f, size: 0.4, life: 0.6 });
    // Blaze Kick flaming feet during moves, Ember gauntlet embers
    if (f.state === 'move' && (f.charId === 'blaze_kick' || f.charId === 'ember_king')) {
      const t = v.anim.targets[f.charId === 'blaze_kick' ? 'footR' : 'handR'];
      this.vfx.add.spawn({ x: t.x, y: t.y, z: t.z, vy: 1.5, color: 0xffd166, color1: 0xff2a00, size: 0.45, life: 0.3 });
    }
    if (f.state === 'move' && f.charId === 'tempest' && Math.random() < 0.5) {
      const t = v.anim.targets.tipR;
      this.vfx.sparks.spawn(t.x, t.y, t.z, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0xfff27a, 0.15);
    }
  }

  trails(v, f, dt) {
    const m = f.state === 'move' ? (f.mdef || (f.move && f.def.moves[f.move])) : null;
    const look = LOOKS[f.charId];
    const want = new Set();
    if (m && m.hb) {
      for (const h of m.hb) {
        if (f.mf < h.f[0] - 3 || f.mf > h.f[1] + 2) continue;
        if (h.seg) want.add(h.seg[1]);
        else if (h.at) want.add(h.at);
      }
    }
    for (const limb of ['handR', 'handL', 'footR', 'footL', 'tipR', 'tipL']) {
      const key = f.id + ':' + limb;
      const on = want.has(limb);
      const r = this.vfx.ribbons.get(key);
      if (!on && !r) continue;
      const rib = this.vfx.trailFor(key, look.trail);
      if (on) {
        const T = v.anim.targets;
        let A, B;
        if (limb.startsWith('tip')) { A = (limb === 'tipR' ? v.model.limbs.R.end.position : v.model.limbs.L.end.position).clone(); B = T[limb].clone(); }
        else { B = T[limb].clone(); A = B.clone().lerp(new THREE.Vector3(f.pos.x, B.y, f.pos.z), Math.min(0.45, 0.35 / Math.max(0.3, B.distanceTo(new THREE.Vector3(f.pos.x, B.y, f.pos.z))))); }
        rib.push(A, B);
      }
      rib.update(dt, on);
    }
  }

  draw() {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  /** Screen position (CSS px) of a world point, or null if behind the camera. */
  project(p) {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    if (v.z > 1) return null;
    const el = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * el.clientWidth, y: (-v.y * 0.5 + 0.5) * el.clientHeight };
  }

  /** World-space movement basis from the camera (for camera-relative controls). */
  inputBasis() {
    const yaw = this.rig.yaw;
    return { fx: -Math.sin(yaw), fz: -Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) };
  }

  // ------------------------------------------------------------------ showcase (menus / character select / results)
  startShowcase(arenaId, entries, layout = 'menu') {
    this.clearFighters();
    this.vfx.clearAll();
    this.loadArena(arenaId);
    this.mode = 'showcase';
    this.showcase = { layout, entries: [], t: 0 };
    entries.forEach((e, i) => this.addShowcaseEntry(e, i, entries.length));
  }

  addShowcaseEntry(e, i, n) {
    const def = CHARACTERS[e.char];
    const f = {
      id: 100 + i, slot: i, charId: def.id, def, state: e.pose || 'idle', sf: 0, facing: 0, vel: { x: 0, y: 0, z: 0 }, kb: { x: 0, y: 0, z: 0 },
      grounded: true, scale: 1, transform: 0, height: def.stats.height, pos: { x: 0, y: 0, z: 0 }, mf: 0, move: null, mdef: null, pct: 0, ult: 0, team: i, cpu: 0,
    };
    const L = this.showcase.layout;
    if (L === 'menu') { const sp = [[-3.2, 0, 1.2], [3.2, 0, 1.0], [-1.1, 0, -1.4], [1.1, 0, -1.6]][i % 4]; f.pos = { x: sp[0], y: 0, z: sp[2] }; f.facing = Math.atan2(-sp[0] * 0.3, 1); }
    else if (L === 'select') { const span = 2.6; f.pos = { x: (i - (n - 1) / 2) * span, y: 0, z: 2 }; f.facing = 0; }
    else if (L === 'results') { const span = 2.4; const order = [0, -1, 1, -2]; f.pos = { x: order[i % 4] * span, y: i === 0 ? 0.6 : 0, z: i === 0 ? 2.5 : 1.5 }; f.facing = 0; }
    const v = this.addFighter(f, null);
    v.ring.visible = false;
    v.showcaseColor = e.color;
    if (e.color !== undefined) { v.ring.material.color.set(e.color).multiplyScalar(1.6); }
    this.showcase.entries.push({ f, v, demo: null, demoT: 2 + Math.random() * 3, pose: e.pose || 'idle' });
    return v;
  }

  /** Character select: replace the lineup (array of {char, color}). */
  setLineup(entries) {
    if (!this.showcase) return;
    const cur = this.showcase.entries.map((e) => e.f.charId).join(',');
    const next = entries.map((e) => e.char).join(',');
    if (cur === next) return;
    for (const e of this.showcase.entries) {
      e.v.model.removeFrom(this.scene); e.v.model.dispose(); this.scene.remove(e.v.ring, e.v.blob, e.v.shield, e.v.plat); this.fighters.delete(e.f.id);
    }
    this.showcase.entries = [];
    entries.forEach((e, i) => { const v = this.addShowcaseEntry(e, i, entries.length); this.vfx.burst(v.f.pos.x, 1, v.f.pos.z, { count: 30, speed: 5, color: 0xffffff, color1: LOOKS[e.char].trail, size: 0.4, life: 0.6 }); });
  }

  /** Play a specific move animation on a showcase fighter (ability preview). */
  previewMove(index, moveKey) {
    const e = this.showcase && this.showcase.entries[index];
    if (!e) return;
    const m = e.f.def.moves[moveKey];
    if (!m) return;
    e.demo = { key: moveKey, m, mf: 0 };
  }

  renderShowcase(dt) {
    this.time += dt;
    const S = this.showcase;
    if (!S) return this.draw();
    S.t += dt;
    if (this.arenaVis) this.arenaVis.update(this.time, dt);
    const V = this.vfx;
    for (const e of S.entries) {
      const f = e.f;
      if (S.layout !== 'results' && !e.demo) {
        e.demoT -= dt;
        if (e.demoT <= 0) {
          const keys = ['jab1', 'fwdHeavy', 'upHeavy', 'sp1', 'sp2', 'nair'];
          const k = keys[Math.floor(Math.random() * keys.length)];
          e.demo = { key: k, m: f.def.moves[k], mf: 0 };
          e.demoT = 2.5 + Math.random() * 3;
        }
      }
      if (e.demo) {
        e.demo.mf += dt * 60;
        f.state = 'move'; f.move = e.demo.key; f.mdef = e.demo.m; f.mf = e.demo.mf; f.grounded = true;
        if (e.demo.mf >= Math.min(e.demo.m.total, 90)) { e.demo = null; f.state = e.pose; f.move = null; f.mdef = null; }
      } else { f.state = e.pose === 'victory' ? 'idle' : e.pose; }
      e.v.anim.update(f, f.pos, dt, e.pose === 'victory' || e.pose === 'defeat' ? e.pose : 'game');
      e.v.blob.visible = true; e.v.blob.position.set(f.pos.x, f.pos.y + 0.02, f.pos.z); e.v.blob.scale.setScalar(0.55);
      e.v.ring.visible = S.layout === 'select'; e.v.ring.position.set(f.pos.x, f.pos.y + 0.03, f.pos.z);
      this.trails(e.v, f, dt);
    }
    V.update(dt);
    if (S.layout === 'menu') this.rig.orbitShowcase(S.t, new THREE.Vector3(0, 1.6, 0), 15, 4.2, 0.07);
    else if (S.layout === 'select') { this.camera.position.set(0, 2.1, 9.8); this.camera.lookAt(0, 1.25, 2); if (this.camera.fov !== 40) { this.camera.fov = 40; this.camera.updateProjectionMatrix(); } }
    else if (S.layout === 'results') { this.camera.position.set(Math.sin(S.t * 0.2) * 1.5, 2.4, 9.5); this.camera.lookAt(0, 1.4, 1.5); }
    this.renderer.toneMappingExposure = 1;
    this.draw();
  }

  // ------------------------------------------------------------------ portraits
  /** Render head-and-shoulders portraits of every fighter to data URLs (used by HUD and menus). */
  renderPortraits(size = 256) {
    const out = {};
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(2, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.5); rim.position.set(-3, 2, -2); scene.add(rim);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const buf = new Uint8Array(size * size * 4);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    const prevTone = this.renderer.toneMapping;
    for (const def of ROSTER) {
      const m = new FighterModel(def, 'high');
      m.addTo(scene);
      const a = new FighterAnimator(m);
      const f = { def, charId: def.id, state: 'idle', sf: 0, facing: 0.35, vel: { x: 0, y: 0, z: 0 }, kb: { x: 0, y: 0, z: 0 }, grounded: true, scale: 1, transform: 0, height: def.stats.height };
      a.update(f, { x: 0, y: 0, z: 0 }, 0.016, 'game');
      m.setExpression('normal');
      const h = def.stats.height;
      cam.position.set(0.25, h * 0.86, 2.3); cam.lookAt(0, h * 0.8, 0);
      this.renderer.setRenderTarget(rt);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.render(scene, cam);
      this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      this.renderer.setRenderTarget(null);
      const img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      g.putImageData(img, 0, 0);
      out[def.id] = canvas.toDataURL('image/png');
      m.removeFrom(scene); m.dispose();
    }
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = prevTone;
    rt.dispose();
    return out;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.clearFighters(); this.unloadArena();
    this.renderer.dispose();
  }
}

export { cylLocal, evalTrack };
