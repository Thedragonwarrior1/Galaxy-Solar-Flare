// Arena collision + gameplay data. Shared by client (rendering) and server (authoritative sim).
// Coordinates: Y is up. Units are "metres" (a fighter is ~1.8 tall).
//
// Platform kinds:
//   solid : full collision (land on top, pushed out of sides, bonk underside). Ledges grabbable if ledges:true.
//   soft  : one-way (land from above only, drop through with DOWN).
// Shapes:
//   box  : centre (x,z), half extents (hx,hz), top surface y = top, extends down by `thick`.
//   cyl  : centre (x,z), radius r, top surface y = top, extends down by `thick`.
// Optional motion (deterministic from sim frame): { axis:'x'|'y'|'z', amp, period (frames), phase (0..1) }

export const ARENAS = {
  pirate_haven: {
    id: 'pirate_haven',
    name: 'Pirate Haven',
    tagline: 'A sun-drenched harbour of tall ships and creaking docks.',
    platforms: [
      { id: 'main', kind: 'solid', shape: 'box', x: 0, z: 0, top: 0, hx: 12, hz: 7, thick: 3, ledges: true },
      { id: 'left', kind: 'soft', shape: 'box', x: -6.5, z: 0.5, top: 4.6, hx: 3.2, hz: 2.4, thick: 0.4 },
      { id: 'right', kind: 'soft', shape: 'box', x: 6.5, z: -0.5, top: 4.6, hx: 3.2, hz: 2.4, thick: 0.4 },
    ],
    blast: { minX: -32, maxX: 32, minZ: -25, maxZ: 25, minY: -16, maxY: 30 },
    spawns: [[-7, 0, 2], [7, 0, -2], [-3, 0, -3.5], [3, 0, 3.5]],
    respawn: [[-4, 9, 0], [4, 9, 0], [0, 9, -3], [0, 9, 3]],
    camera: { yaw: 0, pitch: 0.38, minDist: 17, maxDist: 42, focusY: 2.5 },
    hazard: 'cannon',
    koStyle: 'water',
    ambience: 'ocean',
    music: 'pirate_haven',
  },
  marine_fortress: {
    id: 'marine_fortress',
    name: 'Marine Fortress',
    tagline: 'Granite ramparts of the Admiralty, bristling with cannon.',
    platforms: [
      { id: 'main', kind: 'solid', shape: 'box', x: 0, z: 0, top: 0, hx: 15, hz: 8, thick: 4, ledges: true },
      { id: 'blockL', kind: 'solid', shape: 'box', x: -10.5, z: -2, top: 3.2, hx: 3.5, hz: 3.5, thick: 3.2, ledges: false },
      { id: 'blockR', kind: 'solid', shape: 'box', x: 10.5, z: 2, top: 3.2, hx: 3.5, hz: 3.5, thick: 3.2, ledges: false },
      { id: 'bridge', kind: 'soft', shape: 'box', x: 0, z: -4, top: 7.4, hx: 4.5, hz: 1.8, thick: 0.5 },
    ],
    blast: { minX: -36, maxX: 36, minZ: -27, maxZ: 27, minY: -18, maxY: 32 },
    spawns: [[-5, 0, 3], [5, 0, -3], [-10.5, 3.2, -2], [10.5, 3.2, 2]],
    respawn: [[-5, 10, 0], [5, 10, 0], [0, 10, -3], [0, 10, 3]],
    camera: { yaw: 0, pitch: 0.4, minDist: 19, maxDist: 46, focusY: 3 },
    hazard: 'barrage',
    koStyle: 'water',
    ambience: 'fortress',
    music: 'marine_fortress',
  },
  sky_kingdom: {
    id: 'sky_kingdom',
    name: 'Sky Kingdom',
    tagline: 'Floating isles of crystal and cloud, high above the world.',
    platforms: [
      { id: 'main', kind: 'solid', shape: 'cyl', x: 0, z: 0, top: 0, r: 10.5, thick: 4, ledges: true },
      { id: 'isleA', kind: 'soft', shape: 'cyl', x: -7.5, z: 3, top: 4.8, r: 2.6, thick: 0.8, motion: { axis: 'y', amp: 0.6, period: 240, phase: 0 } },
      { id: 'isleB', kind: 'soft', shape: 'cyl', x: 7.5, z: -3, top: 4.8, r: 2.6, thick: 0.8, motion: { axis: 'y', amp: 0.6, period: 240, phase: 0.5 } },
      { id: 'drifter', kind: 'soft', shape: 'box', x: 0, z: -6.5, top: 8.6, hx: 2.8, hz: 1.6, thick: 0.6, motion: { axis: 'x', amp: 3, period: 480, phase: 0 } },
    ],
    blast: { minX: -32, maxX: 32, minZ: -30, maxZ: 30, minY: -16, maxY: 32 },
    spawns: [[-6, 0, 2], [6, 0, -2], [-2, 0, -5], [2, 0, 5]],
    respawn: [[-4, 10, 0], [4, 10, 0], [0, 10, -3], [0, 10, 3]],
    camera: { yaw: 0, pitch: 0.36, minDist: 17, maxDist: 42, focusY: 3 },
    hazard: 'wind',
    koStyle: 'cloud',
    ambience: 'sky',
    music: 'sky_kingdom',
  },
  volcanic_island: {
    id: 'volcanic_island',
    name: 'Volcanic Island',
    tagline: 'Black basalt over a sea of fire. Watch your step.',
    platforms: [
      { id: 'main', kind: 'solid', shape: 'box', x: 0, z: 0, top: 0, hx: 13, hz: 7.5, thick: 4, ledges: true },
      { id: 'pillarL', kind: 'soft', shape: 'cyl', x: -8.5, z: -2, top: 4.2, r: 2.3, thick: 0.6 },
      { id: 'pillarR', kind: 'soft', shape: 'cyl', x: 8.5, z: 2, top: 4.2, r: 2.3, thick: 0.6 },
      { id: 'crown', kind: 'soft', shape: 'box', x: 0, z: 0, top: 8.4, hx: 3, hz: 1.6, thick: 0.5 },
    ],
    blast: { minX: -32, maxX: 32, minZ: -25, maxZ: 25, minY: -15, maxY: 30 },
    spawns: [[-7, 0, 2], [7, 0, -2], [-3, 0, -4], [3, 0, 4]],
    respawn: [[-4, 10, 0], [4, 10, 0], [0, 10, -3], [0, 10, 3]],
    camera: { yaw: 0, pitch: 0.4, minDist: 17, maxDist: 42, focusY: 2.5 },
    hazard: 'geyser',
    koStyle: 'lava',
    ambience: 'volcano',
    music: 'volcanic_island',
  },
};

export const ARENA_IDS = Object.keys(ARENAS);

// Current (possibly moving) platform placement at a given sim frame.
export function platformAt(p, frame) {
  if (!p.motion) return { x: p.x, top: p.top, z: p.z };
  const m = p.motion;
  const s = Math.sin(((frame / m.period) + (m.phase || 0)) * Math.PI * 2) * m.amp;
  return {
    x: p.x + (m.axis === 'x' ? s : 0),
    top: p.top + (m.axis === 'y' ? s : 0),
    z: p.z + (m.axis === 'z' ? s : 0),
  };
}
