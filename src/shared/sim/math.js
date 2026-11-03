// Small math helpers used by the simulation (allocation-light, plain objects).
import { DEG } from './constants.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : 1);

export function v3(x = 0, y = 0, z = 0) { return { x, y, z }; }

export function len2(x, z) { return Math.sqrt(x * x + z * z); }

/** Shortest signed angle difference b - a, in (-PI, PI]. */
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Rotate angle a toward b by at most maxStep. */
export function turnToward(a, b, maxStep) {
  const d = angDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function yawOf(x, z) { return Math.atan2(x, z); }

/**
 * Fighter-local cylindrical coordinates -> world offset.
 * angDeg: 0 = forward, +90 = right. r: horizontal radius. h: height above feet.
 */
export function localToWorld(pos, facing, angDeg, r, h, out = { x: 0, y: 0, z: 0 }) {
  const yaw = facing - angDeg * DEG;
  out.x = pos.x + Math.sin(yaw) * r;
  out.y = pos.y + h;
  out.z = pos.z + Math.cos(yaw) * r;
  return out;
}

/** Squared distance from point p to segment ab (3D). Returns {d2, t}. */
export function pointSegDist2(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t - px, cy = ay + aby * t - py, cz = az + abz * t - pz;
  return cx * cx + cy * cy + cz * cz;
}

/** Seeded RNG (mulberry32). Deterministic across client and server. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

export const EASE = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  snap: (t) => 1 - Math.pow(1 - t, 4),
  back: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
