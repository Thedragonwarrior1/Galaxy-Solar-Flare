// Runtime helpers used by character move scripts (teleports, tethers, projectile spawns, multi-phase zones).
import { localToWorld, yawOf, clamp } from '../sim/math.js';
import { inFootprint, closestRim } from '../sim/collision.js';
import { DEG } from '../sim/constants.js';

/** Spawn a projectile at a fighter-local point. yawOff in degrees (+ = right). */
export function shoot(w, f, kind, local, { yawOff = 0, pitch = 0, over = {} } = {}) {
  const p = localToWorld(f.pos, f.facing, local[0], local[1] * f.scale, local[2] * f.scale);
  return w.spawnProjectile(f, kind, p, f.facing - yawOff * DEG, pitch, over);
}

/** Spawn a zone at a fighter-local point. */
export function zoneAt(w, f, kind, local, def) {
  const p = localToWorld(f.pos, f.facing, local[0], local[1] * f.scale, local[2] * f.scale);
  return w.spawnZone(f, kind, p, def);
}

/** Zone def with an initial multi-hit phase followed by a finishing hit at age `finalAt`. */
export function multiThenFinal(base, multi, final, finalAt) {
  const def = { ...base, hit: { ...multi } };
  const prevTick = base.tick;
  def.tick = (w, z) => {
    if (prevTick) prevTick(w, z);
    if (z.age === finalAt) { z.def.hit = { ...final, from: finalAt, to: finalAt + (final.dur || 4) }; z.reg = new Map(); }
  };
  return def;
}

/** Is this world point inside one of fighter f's own zones of the given kind? */
export function inOwnZone(w, f, kind, x, y, z) {
  for (const zn of w.zones) {
    if (zn.owner !== f.id || zn.kind !== kind) continue;
    if (Math.hypot(x - zn.x, y - zn.y, z - zn.z) < zn.r) return true;
  }
  return false;
}

/**
 * Teleport fighter by an offset, keeping the destination legal:
 * never inside solid geometry, never past the blast zone margin.
 */
export function teleport(w, f, dx, dy, dz) {
  const B = w.arena.blast;
  const from = { x: f.pos.x, y: f.pos.y, z: f.pos.z };
  let x = clamp(f.pos.x + dx, B.minX + 4, B.maxX - 4);
  let z = clamp(f.pos.z + dz, B.minZ + 4, B.maxZ - 4);
  let y = clamp(f.pos.y + dy, B.minY + 3, B.maxY - 6);
  for (let i = 0; i < w.platforms.length; i++) {
    const p = w.platforms[i], pl = w.placements[i];
    if (p.kind !== 'solid') continue;
    if (y < pl.top && y > pl.top - p.thick - f.height && inFootprint(p, pl, x, z, f.radius)) {
      if (inFootprint(p, pl, x, z, -0.2)) y = pl.top + 0.02; // pop on top
      else { // beside the wall: push outward
        const rim = closestRim(p, pl, x, z, {});
        x = rim.x + rim.nx * (f.radius + 0.1); z = rim.z + rim.nz * (f.radius + 0.1);
      }
    }
  }
  f.pos.x = x; f.pos.y = y; f.pos.z = z;
  f.prev.x = x; f.prev.y = y + 0.05; f.prev.z = z;
  f.leaveGround();
  w.emit('fx', { name: 'teleportOut', id: f.id, x: from.x, y: from.y, z: from.z });
  w.emit('fx', { name: 'teleportIn', id: f.id, x, y, z });
}

/** Find the best ledge point within range, roughly in front / above. */
export function findLedge(w, f, range, coneDeg = 100) {
  let best = null, bd = range;
  const rim = {};
  for (let i = 0; i < w.platforms.length; i++) {
    const p = w.platforms[i];
    if (!p.ledges) continue;
    const pl = w.placements[i];
    closestRim(p, pl, f.pos.x, f.pos.z, rim);
    const dx = rim.x - f.pos.x, dz = rim.z - f.pos.z, dy = pl.top - (f.pos.y + f.height * 0.8);
    if (dy < -1.5) continue; // ledge must not be far below hands
    if (f.pos.y > pl.top - 0.3) continue; // already above the surface
    const d = Math.hypot(dx, dy, dz);
    if (d > bd) continue;
    const yaw = yawOf(dx, dz);
    let da = Math.abs(((yaw - f.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (Math.hypot(dx, dz) > 1.2 && da > coneDeg * DEG) continue;
    bd = d;
    best = { idx: i, x: rim.x, z: rim.z, nx: rim.nx, nz: rim.nz, top: pl.top };
  }
  return best;
}

/** Start a tether pull toward a ledge (call from a move event). Returns true if a ledge was found. */
export function startTether(w, f, range, cone) {
  const L = findLedge(w, f, range, cone);
  if (!L) return false;
  f.mvars.tether = L;
  f.facing = yawOf(L.x - f.pos.x, L.z - f.pos.z);
  w.emit('fx', { name: 'tether', id: f.id, x: L.x, y: L.top, z: L.z });
  return true;
}

/** Per-frame tether pull (call from move tick). Grabs the ledge on arrival. */
export function tetherTick(w, f, speed = 26) {
  const L = f.mvars.tether;
  if (!L) return false;
  const tx = L.x + L.nx * f.radius * 1.1, tz = L.z + L.nz * f.radius * 1.1, ty = L.top - f.height * 0.85;
  const dx = tx - f.pos.x, dy = ty - f.pos.y, dz = tz - f.pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.7 || f.mvars.tetherFrames > 40) {
    f.grabLedge(L.idx, { x: L.x, z: L.z, nx: L.nx, nz: L.nz }, w.placements[L.idx].top);
    return true;
  }
  f.mvars.tetherFrames = (f.mvars.tetherFrames || 0) + 1;
  f.vel.x = (dx / d) * speed; f.vel.y = (dy / d) * speed; f.vel.z = (dz / d) * speed;
  f.kb.x = f.kb.y = f.kb.z = 0;
  return false;
}

/** Generate alternating rapid-strike keys for two effectors between frames f0..f1. */
export function rapidKeys(limbA, limbB, f0, f1, { every = 3, reach = 1.7, h = 1.25, spread = 18, hSpread = 0.25, seed = 7 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s % 1000) / 1000; };
  const A = [[f0 - 2, 25, 0.4, h]], Bk = [[f0 - 2, -25, 0.4, h]];
  let i = 0;
  for (let fr = f0; fr <= f1; fr += every, i++) {
    const a = (rnd() - 0.5) * spread * 2, hh = h + (rnd() - 0.5) * hSpread * 2;
    if (i % 2 === 0) { A.push([fr, a, reach, hh, 'snap']); Bk.push([fr, -20, 0.5, h]); }
    else { Bk.push([fr, a, reach, hh, 'snap']); A.push([fr, 20, 0.5, h]); }
  }
  return { [limbA]: A, [limbB]: Bk };
}
