// Optional arena hazards (disabled in competitive play). Authoritative: they deal damage, so they live in the sim.
import { DT } from './constants.js';
import { inFootprint } from './collision.js';

const WARN = 96;

function randomStagePoint(w) {
  // Prefer a spot near a random fighter so hazards matter, otherwise a random point on the main platform.
  const alive = w.fighters.filter((f) => f.alive && f.state !== 'respawn');
  const main = w.platforms[0], pl = w.placements[0];
  if (alive.length && w.rng() < 0.7) {
    const f = w.rng.pick(alive);
    const x = f.pos.x + w.rng.range(-2.5, 2.5), z = f.pos.z + w.rng.range(-2.5, 2.5);
    // find the surface under that spot
    let best = null;
    for (let i = 0; i < w.platforms.length; i++) {
      const p = w.platforms[i], q = w.placements[i];
      if (inFootprint(p, q, x, z, -0.5) && (!best || q.top > best.top) && q.top <= f.pos.y + 1) best = { top: q.top };
    }
    if (best) return { x, y: best.top, z };
  }
  const ex = main.shape === 'cyl' ? main.r * 0.7 : main.hx * 0.8;
  const ez = main.shape === 'cyl' ? main.r * 0.7 : main.hz * 0.8;
  return { x: pl.x + w.rng.range(-ex, ex), y: pl.top, z: pl.z + w.rng.range(-ez, ez) };
}

function addHazard(w, kind, pos, extra = {}) {
  const hz = { hid: w.nextId++, kind, x: pos.x, y: pos.y, z: pos.z, t: 0, phase: 'warn', warn: extra.warn || WARN, dur: extra.dur || 8, dir: extra.dir || 0, delay: extra.delay || 0 };
  w.hazards.push(hz);
  return hz;
}

export function updateHazards(w) {
  if (!w.hazardsOn || w.phase !== 'play' || w.training && !w.cfg.trainingHazards) {
    if (w.hazards.length && w.phase !== 'play') w.hazards.length = 0;
    return;
  }
  if (--w.hazardTimer <= 0) {
    w.hazardTimer = 560 + Math.floor(w.rng() * 360);
    const kind = w.arena.hazard;
    if (kind === 'cannon') {
      addHazard(w, 'cannon', randomStagePoint(w));
    } else if (kind === 'barrage') {
      const a = randomStagePoint(w);
      const ang = w.rng() * Math.PI;
      for (let i = -1; i <= 1; i++) {
        addHazard(w, 'barrage', { x: a.x + Math.sin(ang) * i * 4, y: a.y, z: a.z + Math.cos(ang) * i * 4 }, { delay: (i + 1) * 18 });
      }
    } else if (kind === 'wind') {
      const dirs = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];
      addHazard(w, 'wind', { x: 0, y: 2, z: 0 }, { dir: w.rng.pick(dirs), dur: 240 });
    } else if (kind === 'geyser') {
      addHazard(w, 'geyser', randomStagePoint(w), { dur: 50 });
      addHazard(w, 'geyser', randomStagePoint(w), { dur: 50, delay: 30 });
    }
  }
  for (const hz of w.hazards) {
    if (hz.delay > 0) { hz.delay--; continue; }
    hz.t++;
    if (hz.phase === 'warn') {
      if (hz.t === 1) w.emit('hazardWarn', { kind: hz.kind, x: hz.x, y: hz.y, z: hz.z, dir: hz.dir, hid: hz.hid });
      if (hz.t >= hz.warn) { hz.phase = 'active'; hz.t = 0; w.emit('hazard', { kind: hz.kind, x: hz.x, y: hz.y, z: hz.z, dir: hz.dir, hid: hz.hid }); activate(w, hz); }
    } else {
      if (hz.kind === 'wind') {
        const fx = Math.sin(hz.dir), fz = Math.cos(hz.dir);
        for (const f of w.fighters) {
          if (!f.alive || f.state === 'ledge' || f.state === 'respawn' || f.state === 'captured') continue;
          const k = f.grounded ? 3.2 : 9;
          f.vel.x += fx * k * DT; f.vel.z += fz * k * DT;
          if (f.grounded) { f.pos.x += fx * 1.2 * DT; f.pos.z += fz * 1.2 * DT; }
        }
      }
      if (hz.t >= hz.dur) hz.phase = 'done';
    }
  }
  if (w.hazards.some((h) => h.phase === 'done')) w.hazards = w.hazards.filter((h) => h.phase !== 'done');
}

function activate(w, hz) {
  if (hz.kind === 'cannon' || hz.kind === 'barrage') {
    w.spawnZone(null, 'hazardBlast', { x: hz.x, y: hz.y + 0.8, z: hz.z }, {
      r: 2.6, life: 8, visual: 'explosion', announce: false,
      hit: { dmg: 13, ang: 65, bkb: 50, kbg: 70, el: 'fire', dir: 'radial', shield: 1.5 },
    });
    w.emit('explode', { x: hz.x, y: hz.y + 0.8, z: hz.z, r: 2.6, el: 'fire', owner: -1 });
  } else if (hz.kind === 'geyser') {
    w.spawnZone(null, 'geyser', { x: hz.x, y: hz.y, z: hz.z }, {
      r: 1.5, h: 9, life: hz.dur, visual: 'geyser', announce: true,
      hit: { dmg: 3, ang: 90, bkb: 30, kbg: 10, setKb: 0, el: 'fire', dir: 'radial', rehit: 8, from: 0, to: 34 },
      tick: (world, z) => {
        if (z.age === 36) {
          z.def.hit = { dmg: 9, ang: 88, bkb: 65, kbg: 62, el: 'fire', dir: 'radial', from: 36, to: 40 };
          z.reg = new Map();
        }
      },
    });
  }
}
