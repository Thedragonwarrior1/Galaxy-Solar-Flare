// Platform collision: footprint tests, landing, solid push-out, ledge rim queries, ground probing.
import { clamp } from './math.js';

/** Is point (x,z) within platform footprint (current placement pl) expanded by margin? */
export function inFootprint(p, pl, x, z, margin = 0) {
  if (p.shape === 'cyl') {
    const dx = x - pl.x, dz = z - pl.z;
    const r = p.r + margin;
    return dx * dx + dz * dz <= r * r;
  }
  return Math.abs(x - pl.x) <= p.hx + margin && Math.abs(z - pl.z) <= p.hz + margin;
}

/** Signed distance from (x,z) to footprint edge (negative inside). */
export function footprintSdf(p, pl, x, z) {
  if (p.shape === 'cyl') {
    return Math.hypot(x - pl.x, z - pl.z) - p.r;
  }
  const dx = Math.abs(x - pl.x) - p.hx;
  const dz = Math.abs(z - pl.z) - p.hz;
  const ox = Math.max(dx, 0), oz = Math.max(dz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0);
}

/**
 * Closest point on the platform's top rim to (x,z), with outward normal.
 * Box corners are pulled in slightly so hanging fighters don't sit on a corner.
 */
export function closestRim(p, pl, x, z, out = {}) {
  if (p.shape === 'cyl') {
    let dx = x - pl.x, dz = z - pl.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    out.x = pl.x + dx * p.r; out.z = pl.z + dz * p.r; out.nx = dx; out.nz = dz;
    return out;
  }
  const dx = x - pl.x, dz = z - pl.z;
  const ex = Math.abs(dx) - p.hx, ez = Math.abs(dz) - p.hz;
  const inset = 0.35;
  if (ex > ez) {
    const s = dx < 0 ? -1 : 1;
    out.x = pl.x + s * p.hx; out.z = clamp(z, pl.z - p.hz + inset, pl.z + p.hz - inset);
    out.nx = s; out.nz = 0;
  } else {
    const s = dz < 0 ? -1 : 1;
    out.z = pl.z + s * p.hz; out.x = clamp(x, pl.x - p.hx + inset, pl.x + p.hx - inset);
    out.nx = 0; out.nz = s;
  }
  return out;
}

/**
 * Push a vertical cylinder (fighter body) out of a solid platform's side walls.
 * Returns true if pushed. Mutates pos. `r` = body radius.
 */
export function pushOutSolid(p, pl, pos, r, h, prevY, vel, kb) {
  const top = pl.top, bottom = pl.top - p.thick;
  // Vertical overlap with the block body (feet below top surface, head above bottom).
  if (pos.y >= top - 0.02 || pos.y + h <= bottom) return false;
  if (!inFootprint(p, pl, pos.x, pos.z, r)) return false;
  // Coming up from underneath -> bonk.
  if (prevY + h <= bottom + 0.05) {
    pos.y = bottom - h - 0.01;
    if (vel.y > 0) vel.y = 0;
    if (kb.y > 0) kb.y = -kb.y * 0.3;
    return true;
  }
  // Deep inside the block horizontally -> pop on top (anti-stuck) rather than ejecting sideways.
  if (inFootprint(p, pl, pos.x, pos.z, -0.9)) {
    pos.y = top;
    if (vel.y < 0) vel.y = 0;
    if (kb.y < 0) kb.y = 0;
    return true;
  }
  // Barely below the top (stepping up / landing) -> snap up rather than shove sideways.
  if (top - pos.y < 0.3 && inFootprint(p, pl, pos.x, pos.z, -0.05)) {
    pos.y = top;
    return true;
  }
  if (p.shape === 'cyl') {
    let dx = pos.x - pl.x, dz = pos.z - pl.z;
    const d = Math.hypot(dx, dz) || 1e-4;
    dx /= d; dz /= d;
    pos.x = pl.x + dx * (p.r + r + 0.01);
    pos.z = pl.z + dz * (p.r + r + 0.01);
    const vn = vel.x * dx + vel.z * dz;
    if (vn < 0) { vel.x -= vn * dx; vel.z -= vn * dz; }
    const kn = kb.x * dx + kb.z * dz;
    if (kn < 0) { kb.x -= kn * dx * 1.6; kb.z -= kn * dz * 1.6; }
    return true;
  }
  const penX = p.hx + r - Math.abs(pos.x - pl.x);
  const penZ = p.hz + r - Math.abs(pos.z - pl.z);
  if (penX < penZ) {
    const s = pos.x < pl.x ? -1 : 1;
    pos.x = pl.x + s * (p.hx + r + 0.01);
    if (vel.x * s < 0) vel.x = 0;
    if (kb.x * s < 0) kb.x = -kb.x * 0.6; // wall bounce
  } else {
    const s = pos.z < pl.z ? -1 : 1;
    pos.z = pl.z + s * (p.hz + r + 0.01);
    if (vel.z * s < 0) vel.z = 0;
    if (kb.z * s < 0) kb.z = -kb.z * 0.6;
  }
  return true;
}

/**
 * Highest walkable surface below (x, y, z). Returns {y, id} or null.
 * Used by the AI (is there ground under me?) and the renderer (drop shadows).
 */
export function groundBelow(platforms, placements, x, y, z, margin = 0) {
  let best = null;
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i], pl = placements[i];
    if (pl.top > y + 0.05) continue;
    if (!inFootprint(p, pl, x, z, margin)) continue;
    if (!best || pl.top > best.y) best = { y: pl.top, id: p.id, index: i };
  }
  return best;
}
