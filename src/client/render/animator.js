// Procedural animator: turns a fighter's sim state into a full-body pose.
// Base layer: locomotion / reactions per state (character-specific stances, run styles, victory poses).
// Action layer: the move's own effector tracks (the same data the sim uses for hitboxes) + body pose keys.
import * as THREE from 'three';
import { evalTrack, evalPose } from '../../shared/sim/tracks.js';
import { BODY } from '../../shared/characters/common.js';

const DEG = Math.PI / 180;
const Yv = new THREE.Vector3(0, 1, 0);
const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(), q: new THREE.Quaternion() };

// fighter-local cylindrical (angle deg, radius, height) -> local vector (+Z forward, -X right)
export function cylLocal(a, r, h, out = new THREE.Vector3()) {
  return out.set(-Math.sin(a * DEG) * r, h, Math.cos(a * DEG) * r);
}

function solveIK(A, T, l1, l2, pole, stretch, outB, outC) {
  const dir = tmp.d.subVectors(T, A);
  let d = dir.length();
  if (d < 1e-5) { dir.set(0, -1, 0); d = 1e-5; } else dir.divideScalar(d);
  let L1 = l1, L2 = l2;
  const max = (l1 + l2) * 0.999;
  if (d > max) {
    if (stretch) { const k = d / max; L1 *= k; L2 *= k; }
    else { d = Math.min(d, max * 1.12); const k = d / max; L1 *= k; L2 *= k; } // allow slight anime stretch (≤12%)
  }
  outC.copy(A).addScaledVector(dir, Math.min(d, (L1 + L2) * 0.999));
  const dd = Math.min(d, (L1 + L2) * 0.999);
  const cosA = THREE.MathUtils.clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const p = tmp.e.subVectors(pole, A);
  p.addScaledVector(dir, -p.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1);
  p.normalize();
  outB.copy(A).addScaledVector(dir, L1 * cosA).addScaledVector(p, L1 * sinA);
  return { L1, L2 };
}

function placeSeg(mesh, P, Q, thick = 1) {
  const v = tmp.c.subVectors(Q, P);
  const len = v.length();
  mesh.position.copy(P);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(Yv, v.divideScalar(len));
  mesh.scale.set(thick, Math.max(0.001, len), thick);
}

const STANCE = {
  bouncy: { handR: [35, 0.3, 1.2], handL: [-35, 0.3, 1.25], feet: 0.2, bounce: 0.06, lean: 6 },
  guard: { handR: [28, 0.45, 1.05], handL: [-28, 0.42, 1.0], tipR: [-22, 1.45, 1.45], tipL: [22, 1.45, 1.3], feet: 0.3, crouch: 0.18, lean: 10 },
  pockets: { handR: [115, 0.22, 0.95], handL: [-115, 0.22, 0.95], feet: 0.16, lean: -4, sway: 1 },
  calm: { handR: [60, 0.3, 1.3], handL: [-60, 0.25, 0.95], tipR: [160, 0.6, 2.1], feet: 0.18, lean: 0 },
  proud: { handR: [25, 0.22, 1.18], handL: [-25, 0.22, 1.22], feet: 0.24, lean: -6 },
  jaunty: { handR: [70, 0.42, 1.0], handL: [-60, 0.25, 0.95], tipR: [70, 0.55, 2.3], feet: 0.18, lean: 0, sway: 1 },
  friendly: { handR: [80, 0.32, 0.95], handL: [-80, 0.32, 0.95], feet: 0.24, lean: 2, bounce: 0.02 },
  nervous: { handR: [20, 0.32, 1.15], handL: [-10, 0.42, 1.25], feet: 0.2, crouch: 0.12, lean: 8, shake: 1 },
};

const VICTORY = {
  captain_rubber: (t) => ({ lift: Math.abs(Math.sin(t * 5)) * 0.35, handR: [10, 0.25, 2.3], handL: [-60, 0.4, 1.3], lean: -8 }),
  threeblade: (t) => ({ handR: [40, 0.5, 1.1], handL: [-40, 0.5, 1.1], tipR: [-30, 1.4, 1.6], tipL: [30, 1.4, 1.6], crouch: 0.25, lean: 12, twist: Math.sin(t) * 3 }),
  blaze_kick: (t) => ({ handR: [110, 0.22, 0.95], handL: [-110, 0.22, 0.95], footR: [0, 1.3, 1.9], lean: -25 + Math.sin(t * 2) * 3 }),
  spatial_swordsman: (t) => ({ handR: [50, 0.32, 1.35], handL: [-30, 0.5, 1.55], tipR: [170, 0.8, 2.1], twist: -10, lean: Math.sin(t) * 2 }),
  ember_king: (t) => ({ handR: [0, 0.3, 2.35], handL: [-30, 0.25, 1.15], lean: -10, lift: Math.sin(t * 3) * 0.03 }),
  tempest: (t) => ({ handR: [20 + t * 400, 0.5, 1.5], handL: [-40, 0.3, 1.0], tipR: [t * 400, 1.6, 1.6], spin: Math.sin(t * 2) * 20 }),
  monster_doctor: (t) => ({ handR: [80, 0.45, 1.6 + Math.sin(t * 4) * 0.05], handL: [-80, 0.45, 1.6 + Math.sin(t * 4) * 0.05], crouch: 0.15, lean: -5 }),
  slingshot_sniper: (t) => ({ handR: [10, 0.3, 2.2], handL: [-80, 0.3, 1.0], lean: -12, lift: Math.abs(Math.sin(t * 4)) * 0.2 }),
};

export class FighterAnimator {
  constructor(model) {
    this.m = model;
    this.runPhase = 0;
    this.flipT = 99;
    this.landT = 99;
    this.tumble = 0;
    this.tumbleAxis = new THREE.Vector3(1, 0, 0);
    this.visFacing = null;
    this.visScale = 1;
    this.prevState = '';
    this.idleT = Math.random() * 10;
    this.base = {};
    this.act = {};
    this.targets = {
      handR: new THREE.Vector3(), handL: new THREE.Vector3(), footR: new THREE.Vector3(), footL: new THREE.Vector3(),
      tipR: new THREE.Vector3(), tipL: new THREE.Vector3(),
    };
    this.hasTip = { tipR: false, tipL: false };
    this.trail = {}; // world positions of effectors for trails
  }

  onEvent(e) {
    if (e.type === 'jump' && e.air) this.flipT = 0;
    if (e.type === 'land') this.landT = 0;
  }

  /**
   * f: fighter view (sim Fighter or net proxy). pos: interpolated position {x,y,z}. dt in seconds.
   * mode: 'game' | 'victory' | 'defeat' | 'showcase'
   */
  update(f, pos, dt, mode = 'game') {
    const m = this.m, s = m.s, L = m.look;
    this.idleT += dt;
    this.flipT += dt * 60; this.landT += dt * 60;
    const st = mode === 'game' ? f.state : mode;
    const P = this.base; for (const k in P) delete P[k];
    // ---- root placement
    m.root.position.set(pos.x, pos.y, pos.z);
    if (this.visFacing === null || st === 'move' || mode !== 'game') this.visFacing = f.facing;
    else {
      let d = f.facing - this.visFacing;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.visFacing += d * Math.min(1, dt * 22);
    }
    m.root.rotation.set(0, this.visFacing, 0);
    const targetScale = f.scale || 1;
    this.visScale += (targetScale - this.visScale) * Math.min(1, dt * 6);
    m.root.scale.setScalar(this.visScale);
    if (m.monsterBits) m.setMonster((f.transform || 0) > 0);

    const stance = STANCE[L.stance] || STANCE.friendly;
    const speed = Math.hypot(f.vel.x, f.vel.z);
    const runK = Math.min(1, speed / Math.max(1, f.def.stats.runSpeed));
    let expr = 'normal';
    let alpha = 1;
    let hidden = false;

    // ---- base layer
    const setH = (k, a, r, h) => { P[k] = [a, r, h]; };
    const standing = () => {
      setH('handR', ...stance.handR); setH('handL', ...stance.handL);
      if (stance.tipR) setH('tipR', ...stance.tipR);
      if (stance.tipL) setH('tipL', ...stance.tipL);
      const fw = stance.feet;
      setH('footR', 100, fw, 0); setH('footL', -100, fw, 0);
      P.crouch = (stance.crouch || 0) + Math.sin(this.idleT * 2.2) * 0.02;
      P.lean = stance.lean || 0;
      if (stance.bounce) P.lift = Math.abs(Math.sin(this.idleT * 4.5)) * stance.bounce;
      if (stance.sway) P.tilt = Math.sin(this.idleT * 1.3) * 3;
      if (stance.shake) P.twist = Math.sin(this.idleT * 30) * 1.5;
      P.headPitch = Math.sin(this.idleT * 0.9) * 2;
    };
    const run = () => {
      this.runPhase += dt * (6 + speed * 0.9);
      const ph = this.runPhase, amp = runK;
      const stride = 0.42 * amp * (L.run === 'stomp' ? 0.85 : 1);
      const lift = 0.28 * amp;
      setH('footR', 0, 0, 0); setH('footL', 0, 0, 0);
      P.footRx = [-BODY.hipW * s, Math.max(0, Math.sin(ph)) * lift, Math.cos(ph) * stride];
      P.footLx = [BODY.hipW * s, Math.max(0, -Math.sin(ph)) * lift, -Math.cos(ph) * stride];
      P.lean = 8 + 14 * amp;
      P.lift = Math.abs(Math.cos(ph)) * 0.05 * amp;
      if (L.run === 'ninja') { setH('handR', 155, 0.45, 1.0); setH('handL', -155, 0.45, 1.0); setH('tipR', 175, 1.5, 1.3); setH('tipL', -175, 1.5, 1.3); P.lean = 25 * amp + 5; }
      else if (L.run === 'glide') { setH('handR', 70, 0.3, 1.0); setH('handL', -70, 0.3, 1.0); setH('tipR', 175, 1.0, 1.7); P.lean = 12 * amp; }
      else if (L.run === 'flail') { setH('handR', 40 + Math.sin(ph) * 60, 0.45, 1.3 + Math.cos(ph * 2) * 0.2); setH('handL', -40 + Math.sin(ph) * 60, 0.45, 1.3 - Math.cos(ph * 2) * 0.2); }
      else {
        const sw = Math.cos(ph) * 0.38 * amp;
        P.handRx = [-0.28 * s, 1.05 * s + Math.max(0, -Math.cos(ph)) * 0.12, -sw];
        P.handLx = [0.28 * s, 1.05 * s + Math.max(0, Math.cos(ph)) * 0.12, sw];
        if (stance.tipR) setH('tipR', 160, 0.8, 1.6);
      }
      if (L.stance === 'pockets' && L.run !== 'ninja') { setH('handR', 115, 0.22, 0.95); setH('handL', -115, 0.22, 0.95); delete P.handRx; delete P.handLx; }
      P.twist = Math.sin(ph) * 8 * amp;
    };
    const airborne = () => {
      const vy = f.vel.y + (f.kb ? f.kb.y : 0);
      const rising = vy > 1;
      setH('handR', 60, 0.45, rising ? 1.55 : 1.45); setH('handL', -60, 0.45, rising ? 1.55 : 1.4);
      setH('footR', 20, 0.15, rising ? 0.42 : 0.22); setH('footL', -20, 0.1, rising ? 0.3 : 0.12);
      P.tuck = rising ? 0.3 : 0.1;
      if (stance.tipR) setH('tipR', 120, 1.2, 1.9);
      if (stance.tipL) setH('tipL', -120, 1.2, 1.9);
      if (this.flipT < 22) { P.flip = (this.flipT / 22) * 360 * (L.run === 'ninja' ? -1 : 1); P.tuck = 0.7; }
      P.lean = rising ? -4 : 6;
    };

    switch (st) {
      case 'idle': case 'land': case 'respawn': case 'jumpsquat': case 'shieldDrop': {
        if (runK > 0.12 && st === 'idle') run(); else standing();
        if (st === 'jumpsquat') P.crouch = 0.55;
        if (st === 'land') P.crouch = Math.max(P.crouch || 0, 0.45 * (1 - Math.min(1, this.landT / Math.max(4, f.lag || 6))));
        if (this.landT < 6 && st === 'idle') P.crouch = Math.max(P.crouch || 0, 0.3 * (1 - this.landT / 6));
        break;
      }
      case 'air': {
        airborne();
        if (f.tumble) { this.tumble += dt * 9; P.flip = this.tumble / DEG; expr = 'hurt'; }
        break;
      }
      case 'shield': case 'shieldstun': {
        standing(); setH('handR', 18, 0.42, 1.3); setH('handL', -18, 0.42, 1.25); P.crouch = 0.22; P.lean = 10;
        if (stance.tipR) setH('tipR', -30, 1.1, 2.0); if (stance.tipL) setH('tipL', 30, 1.1, 2.0);
        break;
      }
      case 'spotdodge': standing(); P.tilt = 28 * Math.sin(Math.min(1, f.sf / 24) * Math.PI); alpha = 0.45; break;
      case 'roll': {
        standing(); P.tuck = 0.8; P.crouch = 0.6;
        const fwd = f.rollDir ? (f.rollDir.x * Math.sin(f.facing) + f.rollDir.z * Math.cos(f.facing)) : 1;
        const side = f.rollDir ? (f.rollDir.x * Math.cos(f.facing) - f.rollDir.z * Math.sin(f.facing)) : 0;
        const t = Math.min(1, f.sf / 30);
        P.flip = fwd * t * 360; P.tilt = side * t * 360; alpha = 0.55; break;
      }
      case 'airdodge': airborne(); P.tuck = 0.6; alpha = 0.45; P.spin = (f.sf / (f.lag || 34)) * 180; break;
      case 'hitstun': case 'parried': case 'rebound': {
        airborne();
        setH('handR', 110, 0.5, 1.6); setH('handL', -110, 0.5, 1.6);
        P.lean = -28; expr = 'hurt';
        if (f.tumble && st === 'hitstun') {
          const kb = f.kb ? Math.hypot(f.kb.x, f.kb.y, f.kb.z) : 0;
          this.tumble += dt * (6 + kb * 0.35);
          P.flip = -this.tumble / DEG;
        } else if (f.grounded) { P.crouch = 0.25; setH('footR', 100, 0.2, 0); setH('footL', -100, 0.2, 0); }
        break;
      }
      case 'helpless': airborne(); setH('handR', 30, 0.3, 2.1); setH('handL', -30, 0.3, 2.1); P.spin = Math.sin(this.idleT * 6) * 10; P.tuck = 0; break;
      case 'ledge': {
        setH('handR', 14, 0.48, f.height * 0.88 + 0.12); setH('handL', -14, 0.48, f.height * 0.88 + 0.12);
        setH('footR', 20, 0.25, 0.05); setH('footL', -20, 0.2, 0.15);
        P.lean = -5; P.tilt = Math.sin(this.idleT * 2) * 3;
        break;
      }
      case 'ledgeClimb': case 'ledgeRoll': case 'getup': case 'tech': standing(); P.crouch = 0.5; P.tuck = st === 'ledgeRoll' ? 0.8 : 0; if (st === 'ledgeRoll') P.flip = (f.sf / 30) * 360; alpha = 0.7; break;
      case 'knockdown': standing(); P.flip = -80; P.lift = -0.65 * s; setH('handR', 100, 0.6, 0.9); setH('handL', -100, 0.6, 0.9); expr = 'hurt'; break;
      case 'dizzy': standing(); P.tilt = Math.sin(this.idleT * 4) * 12; P.headPitch = 15; P.headYaw = Math.sin(this.idleT * 6) * 20; expr = 'hurt'; break;
      case 'captured': airborne(); setH('handR', 120, 0.3, 0.9); setH('handL', -120, 0.3, 0.9); P.lean = -15; expr = 'hurt'; break;
      case 'holding': standing(); setH('handR', 10, 0.75, 1.15); setH('handL', -10, 0.75, 1.15); P.lean = 8; break;
      case 'frozen': standing(); break;
      case 'victory': {
        standing();
        Object.assign(P, (VICTORY[f.charId] || VICTORY.captain_rubber)(this.idleT));
        for (const k of ['handR', 'handL', 'footR', 'footL', 'tipR', 'tipL']) if (P[k] && !Array.isArray(P[k])) delete P[k];
        expr = 'normal';
        break;
      }
      case 'defeat': standing(); setH('handR', 20, 0.25, 1.15); setH('handL', -20, 0.25, 1.15); P.headPitch = 20; P.lean = 10; P.crouch = 0.1; break;
      case 'move': {
        if (f.grounded && runK > 0.6) run(); else if (f.grounded) standing(); else airborne();
        break;
      }
      default: standing();
    }
    if (f.state === 'dead') hidden = true;

    // ---- action layer (move tracks + pose keys)
    const mdef = f.mdef || (f.move && f.def.moves[f.move]) || null;
    const A = this.act;
    for (const k in A) delete A[k];
    let trackW = {};
    if (st === 'move' && mdef) {
      const mf = f.mf;
      if (mdef.pose) evalPose(mdef.pose, mf, A);
      for (const k in A) P[k] = A[k];
      if (mdef.hb && mdef.hb.length) expr = 'attack';
      if (mdef.fx) {
        for (const limb in mdef.fx) {
          const k = evalTrack(mdef.fx[limb], mf);
          if (k) trackW[limb] = { a: k.a, r: k.r, h: k.h, w: k.w };
        }
      }
      if (f.grounded && !trackW.footR && !trackW.footL && runK < 0.6) {
        // planted fighting stance during ground attacks (no foot sliding)
        setH('footR', 120, 0.24 + (P.crouch || 0) * 0.15, 0); setH('footL', -60, 0.24 + (P.crouch || 0) * 0.15, 0);
        delete P.footRx; delete P.footLx;
      }
    }
    if (P.hidden > 0.5) hidden = true;
    if (P.bolt > 0.5) hidden = true;

    // ---- body transforms
    const crouch = THREE.MathUtils.clamp(P.crouch || 0, 0, 1);
    m.body.position.y = 0.9 * s + (P.lift || 0) - crouch * 0.0;
    m.body.rotation.set((P.flip || 0) * DEG, (P.spin || 0) * DEG, -(P.tilt || 0) * DEG, 'YXZ');
    m.hips.position.y = BODY.hipH * s * (1 - crouch * 0.34 - (P.tuck || 0) * 0.08);
    m.spine.rotation.set((P.lean || 0) * DEG, (P.twist || 0) * DEG, 0, 'YXZ');
    m.head.rotation.set((P.headPitch || 0) * DEG - (P.lean || 0) * DEG * 0.4, (P.headYaw || 0) * DEG - (P.twist || 0) * DEG * 0.5, 0);
    const sy = P.stretchY || 1;
    m.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    if (m.coat) m.coat.rotation.x = -Math.min(0.5, speed * 0.03) - (f.grounded ? 0 : 0.15);
    if (m.cape) m.cape.rotation.x = -Math.min(0.7, speed * 0.045) - (f.grounded ? 0.05 : 0.25) + Math.sin(this.idleT * 3) * 0.04;
    m.root.updateMatrixWorld(true);

    // ---- resolve targets to world space
    const T = this.targets;
    const toWorldBody = (arr, out) => m.pivot.localToWorld(cylLocal(arr[0], arr[1] * s, arr[2] * s, out));
    const toWorldBodyXYZ = (arr, out) => m.pivot.localToWorld(out.set(arr[0], arr[1], arr[2]));
    const toWorldRoot = (k, out) => m.root.localToWorld(cylLocal(k.a, k.r * s, k.h * s, out));
    for (const limb of ['handR', 'handL', 'footR', 'footL', 'tipR', 'tipL']) {
      const out = T[limb];
      let have = false;
      if (P[limb + 'x']) { toWorldBodyXYZ(P[limb + 'x'], out); have = true; }
      else if (P[limb]) { toWorldBody(P[limb], out); have = true; }
      const tk = trackW[limb];
      if (tk) {
        const v = toWorldRoot(tk, tmp.b);
        if (have) out.lerp(v, tk.w); else out.copy(v);
        have = true;
      }
      if (limb.startsWith('tip')) this.hasTip[limb] = have;
      else if (!have) toWorldBody(limb === 'handR' ? [70, 0.3, 0.95] : limb === 'handL' ? [-70, 0.3, 0.95] : limb === 'footR' ? [100, 0.15, 0] : [-100, 0.15, 0], out);
    }
    // feet never sink through the floor while grounded
    if (f.grounded) for (const k of ['footR', 'footL']) { if (T[k].y < pos.y) T[k].y = pos.y; }

    // ---- IK
    const stretch = !!f.def.stats.stretchy;
    const armScaleR = P.armScaleR || 1, armScaleL = P.armScaleL || 1;
    const scaleW = this.visScale;
    this.solveLimb(m.limbs.R, m.anchors.shoulderR, T.handR, m.armLen, stretch, 'arm', -1, armScaleR, scaleW);
    this.solveLimb(m.limbs.L, m.anchors.shoulderL, T.handL, m.armLen, stretch, 'arm', 1, armScaleL, scaleW);
    this.solveLimb(m.limbs.FR, m.anchors.hipR, T.footR, m.legLen, stretch, 'leg', -1, 1, scaleW);
    this.solveLimb(m.limbs.FL, m.anchors.hipL, T.footL, m.legLen, stretch, 'leg', 1, 1, scaleW);

    // ---- weapons
    this.placeWeapons(f, P, scaleW);

    // ---- face, visibility, effects
    this.blink(dt, expr);
    m.setVisible(!hidden);
    if (f.inv && st !== 'spotdodge' && st !== 'roll' && st !== 'airdodge') alpha = Math.min(alpha, 0.55 + 0.35 * Math.sin(this.idleT * 30));
    if (alpha !== this.lastAlpha) { m.setOpacity(alpha); this.lastAlpha = alpha; }
    if (m.flameSoles) for (const sole of m.flameSoles) sole.visible = st === 'move';
    if (m.weapons.R && m.weapons.R.userData.orb) m.weapons.R.userData.orb.scale.setScalar(1 + Math.sin(this.idleT * 8) * 0.12);
    // trail sample points (world): effectors + weapon tips
    this.trail.handR = T.handR; this.trail.handL = T.handL; this.trail.footR = T.footR; this.trail.footL = T.footL;
    this.prevState = st;
  }

  solveLimb(limb, anchor, target, lens, stretch, kind, side, thick, scaleW) {
    const A = anchor.getWorldPosition(tmp.a);
    const m = this.m;
    // pole (body space): elbows point down/back/out, knees point forward
    const pole = tmp.b;
    const sc = m.s;
    if (kind === 'arm') m.pivot.localToWorld(pole.set(side * 0.7, BODY.shoulderH * sc - 1.0, -0.8));
    else m.pivot.localToWorld(pole.set(side * 0.18, BODY.hipH * sc - 0.45, 1.6));
    const B = limb._B || (limb._B = new THREE.Vector3()), C = limb._C || (limb._C = new THREE.Vector3());
    solveIK(A, target, lens.upper * scaleW, lens.lower * scaleW, pole, stretch, B, C);
    placeSeg(limb.upper, A, B, thick * scaleW);
    placeSeg(limb.lower, B, C, thick * scaleW);
    limb.joint.position.copy(B); limb.joint.scale.setScalar(thick * scaleW);
    limb.end.position.copy(C);
    limb.end.scale.setScalar((kind === 'arm' ? thick : 1) * scaleW);
    if (kind === 'arm') {
      const dir = tmp.c.subVectors(C, B).normalize();
      limb.end.quaternion.setFromUnitVectors(Yv, dir);
    } else {
      m.root.getWorldQuaternion(limb.end.quaternion);
    }
  }

  placeWeapons(f, P, scaleW) {
    const m = this.m, T = this.targets;
    const W = m.weapons;
    const put = (w, hand, tipKey, fallbackDir) => {
      if (!w) return;
      w.position.copy(hand);
      let dir;
      if (this.hasTip[tipKey]) dir = tmp.c.subVectors(T[tipKey], hand);
      else dir = fallbackDir;
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      dir.normalize();
      w.quaternion.setFromUnitVectors(Yv, dir);
      w.scale.setScalar(scaleW);
    };
    const fwd = m.root.getWorldDirection(tmp.d).clone();
    const down = new THREE.Vector3(0, -1, 0).addScaledVector(fwd, 0.4);
    const L = m.look;
    if (L.weapons === 'threeSwords') {
      put(W.R, m.limbs.R.end.position, 'tipR', fwd.clone().add(new THREE.Vector3(0, 0.6, 0)));
      put(W.L, m.limbs.L.end.position, 'tipL', fwd.clone().add(new THREE.Vector3(0, 0.5, 0)));
      const third = (P.thirdBlade || 0) > 0.5;
      m.backSword.visible = !third;
      if (W.B) {
        W.B.visible = third;
        if (third) { // held in the teeth-free way: floating guard sword orbiting the head
          const t = this.idleT * 6;
          m.head.getWorldPosition(W.B.position);
          W.B.position.add(new THREE.Vector3(Math.sin(t) * 0.5, 0.35, Math.cos(t) * 0.5));
          W.B.quaternion.setFromUnitVectors(Yv, new THREE.Vector3(Math.sin(t + 1.6), 0.2, Math.cos(t + 1.6)).normalize());
        }
      }
    } else if (L.weapons === 'nodachi') {
      put(W.R, m.limbs.R.end.position, 'tipR', fwd.clone().multiplyScalar(-0.3).add(new THREE.Vector3(0, 1, 0)));
    } else if (L.weapons === 'staff') {
      put(W.R, m.limbs.R.end.position, 'tipR', new THREE.Vector3(0, 1, 0).addScaledVector(fwd, 0.15));
    } else if (L.weapons === 'slingshot') {
      put(W.L, m.limbs.L.end.position, 'tipL', fwd.clone().add(new THREE.Vector3(0, 1.2, 0)));
      const mal = (P.mallet || 0) > 0.5;
      m.mallet.visible = mal;
      if (mal) put(m.mallet, m.limbs.R.end.position, 'tipR', down);
    }
  }

  blink(dt, expr) {
    const m = this.m;
    if (expr === 'normal') {
      m.blinkT -= dt;
      if (m.blinkT < 0) { expr = 'blink'; if (m.blinkT < -0.12) m.blinkT = 2 + Math.random() * 3.5; }
    }
    m.setExpression(expr);
  }
}
