// Knockback, hitstun and hitlag formulas.
import { KB, DEG, DT } from './constants.js';

/**
 * Smash-style knockback.
 * pct: victim percent AFTER the hit's damage is applied. dmg: damage of the hit.
 * weight: victim weight (100 = average). bkb: base knockback. kbg: knockback growth (100 = normal).
 */
export function computeKnockback(pct, dmg, weight, bkb, kbg, setKb = null) {
  if (setKb !== null && setKb !== undefined) {
    // Fixed knockback (multi-hits, captures): percent-independent.
    return ((((1 + (10 * setKb) / 20) * (200 / (weight + 100)) * 1.4) + 18) * (kbg / 100)) + bkb;
  }
  const scaling = (pct / 10 + (pct * dmg) / 20) * (200 / (weight + 100)) * 1.4 + 18;
  return scaling * (kbg / 100) + bkb;
}

export function hitstunFrames(kb) {
  return Math.max(0, Math.floor(kb * KB.HITSTUN_MULT));
}

export function hitlagFrames(dmg, mult = 1) {
  return Math.min(KB.HITLAG_MAX, Math.floor((dmg * KB.HITLAG_PER_DMG + KB.HITLAG_BASE) * mult));
}

/** Launch velocity vector from knockback, horizontal yaw and elevation angle (deg). */
export function launchVector(kb, yaw, angDeg) {
  const speed = kb * KB.LAUNCH_SCALE;
  const el = angDeg * DEG;
  const h = Math.cos(el) * speed;
  return { x: Math.sin(yaw) * h, y: Math.sin(el) * speed, z: Math.cos(yaw) * h };
}

/**
 * Directional influence: victim's stick (world-space, |s|<=1) at the end of hitlag
 * bends the launch: perpendicular stick rotates yaw; holding against the launch raises the angle.
 */
export function applyDI(vec, sx, sz) {
  const mag = Math.hypot(sx, sz);
  if (mag < 0.2) return vec;
  const hx = vec.x, hz = vec.z;
  const hl = Math.hypot(hx, hz);
  if (hl < 1e-4) return vec;
  const ux = hx / hl, uz = hz / hl;
  // perpendicular component (right-hand perpendicular of launch dir)
  const px = -uz, pz = ux;
  const perp = (sx * px + sz * pz); // -1..1
  const along = (sx * ux + sz * uz); // -1..1
  const yawRot = perp * KB.DI_YAW;
  const c = Math.cos(yawRot), s = Math.sin(yawRot);
  // rotate (ux,uz) toward perpendicular
  let nx = ux * c + px * s;
  let nz = uz * c + pz * s;
  const speed = Math.hypot(hl, vec.y);
  let el = Math.atan2(vec.y, hl);
  // holding toward the stage (against launch) raises the trajectory = survive horizontal kills longer
  el += -along * KB.DI_PITCH;
  el = Math.max(-1.5, Math.min(1.5, el));
  const nh = Math.cos(el) * speed;
  return { x: nx * nh, y: Math.sin(el) * speed, z: nz * nh };
}

/**
 * Predict whether a launch would cross a blast zone (used for the dramatic "deadly hit" effect).
 * Quick integration of launch decay + gravity capped at fall speed.
 */
export function predictKO(pos, launch, stats, blast, frames = 150) {
  let x = pos.x, y = pos.y, z = pos.z;
  let kx = launch.x, ky = launch.y, kz = launch.z;
  let vy = 0;
  for (let i = 0; i < frames; i++) {
    const m = Math.hypot(kx, ky, kz);
    if (m > 0) {
      const nm = Math.max(0, m - KB.DECAY * DT);
      const s = nm / m;
      kx *= s; ky *= s; kz *= s;
    }
    vy = Math.max(-stats.fallSpeed, vy - stats.gravity * DT);
    x += kx * DT; y += (ky + vy) * DT; z += kz * DT;
    if (x < blast.minX || x > blast.maxX || z < blast.minZ || z > blast.maxZ || y > blast.maxY || y < blast.minY) return true;
    if (m < 2 && vy < 0) return false;
  }
  return false;
}
