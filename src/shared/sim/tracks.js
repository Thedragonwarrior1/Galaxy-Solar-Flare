// Effector tracks: keyframed limb/weapon paths in fighter-local cylindrical space.
// The SAME tracks drive (a) hitbox positions in the authoritative sim and (b) IK targets in the renderer,
// so attack animations always line up with their hitboxes.
//
// A track is an array of keys: [frame, angleDeg, radius, height, ease?]  or  [frame, null]  (released to base pose)
// Interpolation is linear in (angle, radius, height) = natural arcs for swings, straight lines for thrusts.
import { EASE } from './math.js';

const OUT = { a: 0, r: 0, h: 0, w: 0 };

/**
 * Evaluate a track at (fractional) frame f.
 * Returns a shared object {a, r, h, w} (w = blend weight 0..1) or null when inactive.
 */
export function evalTrack(track, f) {
  if (!track || track.length === 0) return null;
  const first = track[0];
  if (f < first[0]) return null;
  const last = track[track.length - 1];
  if (f >= last[0]) {
    if (last[1] === null || last[1] === undefined) return null;
    OUT.a = last[1]; OUT.r = last[2]; OUT.h = last[3]; OUT.w = 1;
    return OUT;
  }
  for (let i = 0; i < track.length - 1; i++) {
    const k0 = track[i], k1 = track[i + 1];
    if (f >= k0[0] && f < k1[0]) {
      const span = k1[0] - k0[0];
      const tRaw = span > 0 ? (f - k0[0]) / span : 1;
      const n0 = k0[1] === null || k0[1] === undefined;
      const n1 = k1[1] === null || k1[1] === undefined;
      if (n0 && n1) return null;
      if (n1) { // blending out to base pose
        OUT.a = k0[1]; OUT.r = k0[2]; OUT.h = k0[3]; OUT.w = 1 - EASE.io(tRaw);
        return OUT;
      }
      if (n0) { // blending in from base pose
        OUT.a = k1[1]; OUT.r = k1[2]; OUT.h = k1[3]; OUT.w = EASE.io(tRaw);
        return OUT;
      }
      const ease = EASE[k1[4] || 'io'] || EASE.io;
      const t = ease(tRaw);
      OUT.a = k0[1] + (k1[1] - k0[1]) * t;
      OUT.r = k0[2] + (k1[2] - k0[2]) * t;
      OUT.h = k0[3] + (k1[3] - k0[3]) * t;
      OUT.w = 1;
      return OUT;
    }
  }
  return null;
}

/** Copy of evalTrack result (for callers that need to keep several at once). */
export function evalTrackCopy(track, f) {
  const r = evalTrack(track, f);
  return r ? { a: r.a, r: r.r, h: r.h, w: r.w } : null;
}

/** Evaluate keyed scalar/obj pose params: keys [frame, {param: value}], linear blend between keys. */
export function evalPose(keys, f, out = {}) {
  if (!keys || keys.length === 0) return out;
  for (const k in out) delete out[k];
  if (f <= keys[0][0]) { Object.assign(out, keys[0][1]); return out; }
  const last = keys[keys.length - 1];
  if (f >= last[0]) { Object.assign(out, last[1]); return out; }
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1];
    if (f >= k0[0] && f < k1[0]) {
      const t = EASE[k1[2] || 'io']((f - k0[0]) / Math.max(1e-6, k1[0] - k0[0]));
      const a = k0[1], b = k1[1];
      const names = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const n of names) {
        const va = a[n] !== undefined ? a[n] : 0;
        const vb = b[n] !== undefined ? b[n] : 0;
        out[n] = typeof va === 'number' ? va + (vb - va) * t : (t < 0.5 ? va : vb);
      }
      return out;
    }
  }
  return out;
}
