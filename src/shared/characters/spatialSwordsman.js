// SPATIAL SWORDSMAN — tactical teleporter with a long nodachi. Controls space with a slowing domain.
import { defineCharacter } from './common.js';
import { BTN, DEG } from '../sim/constants.js';
import { teleport, zoneAt, inOwnZone, multiThenFinal } from './helpers.js';
import { localToWorld } from '../sim/math.js';

const BLADE = 1.55;
function blade(keys, total, side = 'R') {
  const hand = 'hand' + side, tip = 'tip' + side;
  const H = keys.map(([f, a, r, h, e]) => [f, a, r, h, e]);
  const T = keys.map(([f, a, r, h, e, th, tr]) => [f, a, tr !== undefined ? tr : r + BLADE, th !== undefined ? th : h, e]);
  H.push([total, null]); T.push([total, null]);
  return { [hand]: H, [tip]: T };
}

function phaseStep(w, f, range) {
  const inDomain = inOwnZone(w, f, 'domain', f.pos.x, f.pos.y + 1, f.pos.z);
  const d = range * (inDomain ? 1.6 : 1);
  let dx, dz;
  if (f.stick > 0.3) { dx = f.mx / f.stick; dz = f.mz / f.stick; }
  else { dx = Math.sin(f.facing); dz = Math.cos(f.facing); }
  return { dx: dx * d, dz: dz * d, inDomain };
}

export default defineCharacter({
  id: 'spatial_swordsman',
  name: 'Spatial Swordsman',
  title: 'The Surgeon of Space',
  style: 'Tactical Teleporter',
  personality: 'Calm, precise and strategic.',
  desc: 'A composed swordsman who cuts space itself. Teleports in and out of range, carves delayed rifts at distance, and claims territory with a slowing spatial domain.',
  palette: { primary: '#26304a', secondary: '#e9ecef', accent: '#3ee0d0', ui: '#3ee0d0' },
  ratings: { power: 3, speed: 3, range: 4, defense: 3, recovery: 5, difficulty: 5 },
  stats: {
    weight: 98, runSpeed: 10.5, walkSpeed: 4.8, groundAccel: 62, friction: 56,
    airSpeed: 8.3, airAccel: 28, airFriction: 6, gravity: 40, fallSpeed: 13.5, fastFall: 21,
    jumpVel: 17, djumpVel: 15.6, airJumps: 1, radius: 0.45, height: 1.88, weapons: 'nodachi',
  },
  throwName: 'Displacement Throw', throwDmg: 9,
  abilities: [{ key: 'Q', move: 'sp1' }, { key: 'E', move: 'sp2' }, { key: 'R', move: 'sp3' }, { key: 'F', move: 'ult' }],
  ai: { range: 2.6, poke: 'fwdHeavy', pokeRange: [3, 5.5], kill: 'fwdHeavy', antiAir: 'upHeavy', combo: 'jab1', setup: 'sp1', approach: 'sp2', ultRange: 9 },
  moves: {
    jab1: {
      name: 'Pommel Strike', total: 20,
      fx: blade([[0, 30, 0.4, 1.1, 'io', 0.8, 0.8], [4, 0, 0.95, 1.3, 'snap', 0.9, 0.0], [8, 0, 0.9, 1.3, 'lin', 0.9, 0.0], [14, 20, 0.5, 1.2, 'io', 0.9, 0.6]], 20),
      pose: [[0, { twist: -10 }], [4, { twist: 15, lean: 6 }], [20, { twist: 0, lean: 0 }]],
      hb: [{ f: [4, 6], at: 'handR', r: 0.5, dmg: 3, ang: 30, bkb: 12, kbg: 40, el: 'punch' }],
      next: { move: 'jab2', btn: 'ATTACK', from: 5, to: 19 },
      sfx: [[3, 'whoosh_light']],
    },
    jab2: {
      name: 'Measured Cut', total: 30,
      fx: blade([[0, 50, 0.5, 1.3], [3, 70, 0.75, 1.3, 'out'], [8, -50, 0.85, 1.2, 'snap'], [12, -60, 0.8, 1.2], [22, -20, 0.5, 1.2]], 30),
      pose: [[0, { twist: 20 }], [8, { twist: -30, lean: 8 }], [30, { twist: 0, lean: 0 }]],
      hb: [{ f: [5, 9], seg: ['handR', 'tipR', 3], r: 0.45, dmg: 7, ang: 40, bkb: 42, kbg: 72, el: 'slash' }],
      sfx: [[4, 'spatial_cut']],
    },
    dash: {
      name: 'Phase Lunge', desc: 'Blinks forward through space with a thrust.', total: 34,
      fx: blade([[0, 30, 0.4, 1.1], [5, 0, 0.95, 1.15, 'snap'], [12, 0, 0.9, 1.15], [22, 20, 0.5, 1.1]], 34),
      pose: [[0, { lean: 10 }], [5, { lean: 30, crouch: 0.3 }], [18, { lean: 18 }], [34, { lean: 0, crouch: 0 }]],
      mv: [{ f: [2, 10], fwd: 17 }, { f: [11, 16], fwd: 5 }],
      hb: [{ f: [5, 11], seg: ['handR', 'tipR', 3], r: 0.45, dmg: 9, ang: 40, bkb: 55, kbg: 55, el: 'slash' }],
      sfx: [[2, 'teleport_out'], [5, 'spatial_cut']],
    },
    upHeavy: {
      name: 'Heaven Severance', desc: 'Charge, then a wide arc cuts the sky overhead.', total: 46,
      charge: { at: 5, max: 60, btn: BTN.HEAVY },
      fx: blade([[0, -40, 0.6, 1.0, 'io', 0.7], [5, -60, 0.8, 0.8, 'io', 0.4], [10, -10, 0.7, 1.9, 'snap', 3.2, 1.6], [13, 40, 0.5, 2.1, 'lin', 3.6, 0.9], [18, 60, 0.5, 1.9, 'io', 3.2, 0.8], [30, 20, 0.5, 1.2]], 46),
      pose: [[0, { crouch: 0.1 }], [5, { crouch: 0.45, twist: -30 }], [11, { crouch: 0, lean: -15, twist: 20 }], [24, { lean: -5 }], [46, { lean: 0, twist: 0 }]],
      hb: [{ f: [8, 13], seg: ['handR', 'tipR', 3], r: 0.55, dmg: 14, ang: 86, bkb: 40, kbg: 95, el: 'slash' }],
      sfx: [[8, 'spatial_cut']],
    },
    fwdHeavy: {
      name: 'Rift Slash', desc: 'A wide slash; a moment later, space itself splits a few metres further ahead.', total: 50,
      charge: { at: 6, max: 60, btn: BTN.HEAVY },
      fx: blade([[0, 40, 0.5, 1.3], [6, 110, 0.7, 1.5, 'out'], [10, 60, 0.85, 1.3, 'in'], [13, -70, 0.95, 1.15, 'snap'], [18, -80, 0.9, 1.15], [32, -20, 0.5, 1.2]], 50),
      pose: [[0, { twist: 0 }], [6, { twist: 45, crouch: 0.2 }], [13, { twist: -40, lean: 16, crouch: 0.25 }], [50, { twist: 0, lean: 0, crouch: 0 }]],
      hb: [{ f: [11, 14], seg: ['handR', 'tipR', 3], r: 0.5, dmg: 15, ang: 38, bkb: 36, kbg: 94, el: 'slash', hitlag: 1.15 }],
      events: [{
        f: 12, fn: (w, f) => {
          const mult = 1 + 0.45 * (f.charge / 60);
          const z = zoneAt(w, f, 'riftCut', [0, 4.3, 1.1], { r: 1.25, life: 16, visual: 'rift', hit: { dmg: 10, ang: 40, bkb: 50, kbg: 80, el: 'spatial', dir: 'away', from: 7, to: 9 } });
          z.dmgMult = mult;
        },
      }],
      sfx: [[10, 'spatial_cut'], [19, 'spatial_cut']],
    },
    nair: {
      name: 'Orbit Edge', kind: 'air', total: 32, landLag: 8,
      fx: blade([[0, 60, 0.5, 1.2], [5, 90, 0.85, 1.15, 'out'], [15, 450, 0.85, 1.15, 'lin'], [22, 470, 0.5, 1.2]], 32),
      pose: [[0, { spin: 0 }], [5, { spin: 0, tuck: 0.3 }], [15, { spin: 360, tuck: 0.3 }, 'lin'], [32, { spin: 360, tuck: 0 }]],
      hb: [{ f: [5, 14], seg: ['handR', 'tipR', 3], r: 0.48, dmg: 10, ang: 45, bkb: 30, kbg: 76, el: 'slash' }],
      sfx: [[4, 'spatial_cut']],
    },
    fair: {
      name: 'Crescent Draw', kind: 'air', total: 36, landLag: 11,
      fx: blade([[0, 10, 0.4, 1.5, 'io', 2.6, 0.6], [4, 5, 0.35, 2.1, 'out', 3.4, 0.3], [9, 0, 1.0, 0.7, 'snap', 0.1, 2.3], [13, 0, 0.95, 0.65, 'lin', 0.0, 2.2]], 36),
      pose: [[0, { lean: 0 }], [4, { lean: -12 }], [9, { lean: 25 }], [36, { lean: 0 }]],
      hb: [{ f: [7, 10], seg: ['handR', 'tipR', 3], r: 0.5, dmg: 12, ang: 42, bkb: 30, kbg: 92, el: 'slash' }],
      sfx: [[6, 'spatial_cut']],
    },
    dair: {
      name: 'Gravity Pin', kind: 'air', total: 38, landLag: 14,
      fx: blade([[0, 20, 0.4, 1.3, 'io', 2.4, 0.5], [6, 10, 0.4, 0.8, 'snap', -0.75, 0.45], [14, 10, 0.4, 0.8, 'lin', -0.75, 0.45]], 38),
      pose: [[0, { tuck: 0.3 }], [6, { tuck: 0.5, lean: 10 }], [38, { tuck: 0, lean: 0 }]],
      hb: [{ f: [7, 12], seg: ['handR', 'tipR', 2], r: 0.55, dmg: 12, ang: -75, bkb: 25, kbg: 80, el: 'slash' }],
      sfx: [[6, 'spatial_cut']],
    },
    sp1: {
      name: 'Domain', desc: 'Q — opens a spatial domain for 6s. Enemies inside are slowed; your teleports inside reach 60% further.', kind: 'any', total: 32, cooldown: 720, gravity: 0.3,
      fx: { handL: [[0, -20, 0.4, 1.1], [10, -10, 0.6, 1.9, 'out'], [20, -10, 0.6, 1.9], [32, null]] },
      pose: [[0, { lean: 0 }], [10, { lean: -6, armUpL: 1 }], [20, { lean: -6 }], [32, { lean: 0 }]],
      events: [{
        f: 12, fn: (w, f) => {
          for (const z of w.zones) if (z.owner === f.id && z.kind === 'domain') z.dead = true;
          w.spawnZone(f, 'domain', { x: f.pos.x, y: f.pos.y + 0.5, z: f.pos.z }, { r: 5.8, life: 360, slow: 0.55, visual: 'domain' });
        },
      }],
      sfx: [[10, 'domain_open']],
    },
    sp2: {
      name: 'Phase Step', desc: 'E — vanishes and reappears a short distance away with a cutting arrival slash.', kind: 'any', total: 32, cooldown: 60, gravity: 0, inv: [5, 12], edgeStop: false,
      fx: blade([[0, 20, 0.4, 1.2], [5, 30, 0.4, 1.3], [12, 80, 0.75, 1.25, 'out'], [15, -60, 0.85, 1.15, 'snap'], [19, -70, 0.8, 1.15], [28, -20, 0.5, 1.2]], 32),
      pose: [[0, { crouch: 0.2 }], [5, { crouch: 0.3, hidden: 1 }], [11, { hidden: 1 }], [12, { hidden: 0, twist: 30 }], [15, { twist: -30, lean: 10 }], [32, { twist: 0, lean: 0, crouch: 0 }]],
      events: [{ f: 9, fn: (w, f) => { const s = phaseStep(w, f, 5); teleport(w, f, s.dx, 0.2, s.dz); } }],
      hb: [{ f: [13, 16], seg: ['handR', 'tipR', 3], r: 0.5, dmg: 7, ang: 50, bkb: 45, kbg: 60, el: 'spatial' }],
      sfx: [[5, 'teleport_out'], [10, 'teleport_in'], [13, 'spatial_cut']],
    },
    sp3: {
      name: 'Spatial Shift', desc: 'R — teleports up to 8.5m in any direction (default: up). Longer inside your domain.', kind: 'any', total: 34, helpless: true, landLag: 14, ledgeGrab: 15, gravity: 0, inv: [6, 18], edgeStop: false,
      fx: { handL: [[0, -20, 0.4, 1.1], [6, 0, 0.6, 1.6], [18, 0, 0.6, 1.6], [34, null]] },
      pose: [[0, { crouch: 0.3 }], [6, { hidden: 1 }], [13, { hidden: 1 }], [14, { hidden: 0 }], [34, { crouch: 0 }]],
      events: [{
        f: 13, fn: (w, f) => {
          const inDomain = inOwnZone(w, f, 'domain', f.pos.x, f.pos.y + 1, f.pos.z);
          const d = 8.5 * (inDomain ? 1.4 : 1);
          let hx = 0, hz = 0, up = 1;
          if (f.stick > 0.3) { hx = f.mx / f.stick; hz = f.mz / f.stick; up = f.held('DOWN') ? -0.3 : 0.75; }
          const L = Math.hypot(hx, up, hz) || 1;
          teleport(w, f, (hx / L) * d, (up / L) * d, (hz / L) * d);
          if (f.stick > 0.3) f.facing = Math.atan2(hx, hz);
          f.vel.x = f.vel.y = f.vel.z = 0;
        },
      }],
      sfx: [[5, 'teleport_out'], [13, 'teleport_in']],
    },
    ult: {
      name: 'Dimension Severance', desc: 'F — expands a vast spatial dome. Everything inside is diced apart, then flung out.', kind: 'any', ult: true, cinematic: 40, total: 100, gravity: 0, airControl: 0,
      tele: { shape: 'dome', r: 9 },
      fx: blade([[0, 20, 0.4, 1.2], [30, 0, 0.6, 2.2, 'io', 3.6, 0.6], [44, 0, 0.6, 2.2, 'io', 3.6, 0.6], [50, -90, 0.9, 1.1, 'snap'], [70, -90, 0.9, 1.1], [80, -20, 0.5, 1.2]], 100),
      pose: [[0, { lean: 0 }], [30, { lean: -10, lift: 0.3 }], [44, { lean: -10, lift: 0.3 }], [50, { twist: -60, lean: 10, lift: 0 }], [80, { twist: 0, lean: 0 }]],
      events: [{
        f: 44, fn: (w, f) => {
          const def = multiThenFinal(
            { r: 9, life: 52, visual: 'severDome', ultDome: true },
            { dmg: 2.6, ang: 90, bkb: 30, kbg: 100, setKb: 0, rehit: 6, el: 'spatial', dir: 'radial', ult: true, from: 2, to: 36 },
            { dmg: 15, ang: 55, bkb: 85, kbg: 85, el: 'spatial', dir: 'radial', ult: true, shield: 3, hitlag: 1.5, dur: 4 },
            42,
          );
          const p = localToWorld(f.pos, f.facing, 0, 0, 1);
          w.spawnZone(f, 'severDome', p, def);
        },
      }],
      sfx: [[0, 'ult_spatial']],
    },
  },
});
void DEG;
