// Arena visual contract — see docs/ARCHITECTURE.md "Arena visual contract".
//
// buildArena(arenaId, ctx) -> { group, sun, platformObjects, update(time, dt), background, fog, dispose(), onHazard(evt) }
//   ctx = { quality: 'low'|'medium'|'high', arena: ARENAS[arenaId] }
// Visual only: collision lives in src/shared/sim/arenas.js. Each platformObjects[id] root has its local origin at the
// centre of the platform's top surface; the caller positions it every frame from platformAt(p, frame).
import { buildPirateHaven } from './pirateHaven.js';
import { buildMarineFortress } from './marineFortress.js';
import { buildSkyKingdom } from './skyKingdom.js';
import { buildVolcanicIsland } from './volcanicIsland.js';

const BUILDERS = {
  pirate_haven: buildPirateHaven,
  marine_fortress: buildMarineFortress,
  sky_kingdom: buildSkyKingdom,
  volcanic_island: buildVolcanicIsland,
};

export const ARENA_VISUAL_IDS = Object.keys(BUILDERS);

export function buildArena(arenaId, ctx = {}) {
  const build = BUILDERS[arenaId];
  if (!build) throw new Error(`buildArena: unknown arena "${arenaId}"`);
  if (!ctx.arena) throw new Error('buildArena: ctx.arena (ARENAS[arenaId]) is required');
  const quality = ctx.quality === 'low' || ctx.quality === 'high' ? ctx.quality : 'medium';
  const res = build({ ...ctx, quality });
  // Make sure every platform has a root, positioned at its rest placement.
  for (const p of ctx.arena.platforms) {
    const o = res.platformObjects[p.id];
    if (!o) throw new Error(`buildArena(${arenaId}): missing platform object "${p.id}"`);
    o.position.set(p.x, p.top, p.z);
  }
  res.group.updateMatrixWorld(true);
  if (!res.onHazard) res.onHazard = () => {};
  return res;
}
