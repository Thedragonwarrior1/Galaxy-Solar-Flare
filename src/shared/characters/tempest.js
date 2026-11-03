// TEMPEST — lightning & weather fighter. Floaty and light, controls space with bolts and storm traps.
import { defineCharacter } from './common.js';
import { BTN } from '../sim/constants.js';
import { shoot, zoneAt, multiThenFinal } from './helpers.js';

const STAFF = 1.35;
function staff(keys, total) {
  const H = keys.map(([f, a, r, h, e]) => [f, a, r, h, e]);
  const T = keys.map(([f, a, r, h, e, th, tr]) => [f, a, tr !== undefined ? tr : r + STAFF, th !== undefined ? th : h, e]);
  H.push([total, null]); T.push([total, null]);
  return { handR: H, tipR: T };
}

const twirl = [];
for (let i = 0; i <= 8; i++) twirl.push([6 + i * 2, i * 120, 0.7, 1.3, 'lin', 1.3, 1.5]);

function stormCloudDef() {
  return {
    r: 1.9, h: 4.8, life: 420, visual: 'stormCloud', strikes: 0, cd: 0,
    tick: (w, z) => {
      if (z.cd > 0) { z.cd--; if (z.cd === 54) z.def.hit = null; return; }
      if (z.age < 24) return;
      const owner = w.fighters[z.owner];
      for (const f of w.fighters) {
        if (!w.hostile(owner, f) || !f.canTakeHits()) continue;
        if (w.inZone(z, f)) {
          z.def.hit = { dmg: 10, ang: 80, bkb: 55, kbg: 70, el: 'lightning', dir: 'radial', from: z.age, to: z.age + 3 };
          z.reg = new Map();
          z.cd = 58;
          z.def.strikes++;
          w.emit('fx', { name: 'cloudStrike', id: z.owner, x: z.x, y: z.y, z: z.z, zid: z.zid });
          if (z.def.strikes >= 2) z.life = z.age + 8;
          break;
        }
      }
    },
  };
}

export default defineCharacter({
  id: 'tempest',
  name: 'Tempest',
  title: 'The Weather Witch of the Grand Line',
  style: 'Lightning & Weather',
  personality: 'Clever, mischievous and unpredictable.',
  desc: 'A sharp-witted navigator who bends the weather with a segmented staff. Fires lightning bolts, plants thunderclouds as traps, and calls bolts from the sky. Floaty and light.',
  palette: { primary: '#4361ee', secondary: '#f8f9fa', accent: '#ffd60a', ui: '#ffd60a' },
  ratings: { power: 3, speed: 3, range: 5, defense: 2, recovery: 4, difficulty: 4 },
  stats: {
    weight: 84, runSpeed: 10.6, walkSpeed: 4.9, groundAccel: 60, friction: 52,
    airSpeed: 9.2, airAccel: 34, airFriction: 7, gravity: 36, fallSpeed: 12, fastFall: 19.5,
    jumpVel: 16.4, djumpVel: 15.4, airJumps: 1, radius: 0.42, height: 1.72, weapons: 'staff',
  },
  throwName: 'Static Fling', throwDmg: 8,
  abilities: [{ key: 'Q', move: 'sp1' }, { key: 'E', move: 'sp2' }, { key: 'R', move: 'sp3' }, { key: 'F', move: 'ult' }],
  ai: { range: 2.3, projectile: 'sp1', projRange: [4, 18], poke: 'fwdHeavy', pokeRange: [2.8, 4.6], kill: 'fwdHeavy', antiAir: 'upHeavy', setup: 'sp2', combo: 'jab1', ultRange: 18 },
  projectiles: {
    bolt: { r: 0.45, speed: 31, life: 34, grav: 0, dmg: 7, ang: 40, bkb: 35, kbg: 55, el: 'lightning', dir: 'proj', ground: 'die' },
  },
  moves: {
    jab1: {
      name: 'Staff Poke', total: 18,
      fx: staff([[0, 30, 0.4, 1.1, 'io', 1.0, 1.2], [3, 0, 0.8, 1.2, 'snap'], [7, 0, 0.75, 1.2], [13, 20, 0.45, 1.1, 'io', 1.0, 1.4]], 18),
      pose: [[0, { twist: -10 }], [3, { twist: 20, lean: 8 }], [18, { twist: 0, lean: 0 }]],
      hb: [{ f: [3, 6], at: 'tipR', r: 0.45, dmg: 2.5, ang: 25, bkb: 10, kbg: 35, el: 'punch' }],
      next: { move: 'jab2', btn: 'ATTACK', from: 4, to: 17 },
      sfx: [[2, 'whoosh_light']],
    },
    jab2: {
      name: 'Staff Swing', total: 20,
      fx: staff([[0, 40, 0.5, 1.2], [3, 60, 0.6, 1.25, 'out'], [7, -50, 0.65, 1.15, 'snap'], [11, -60, 0.6, 1.15]], 20),
      pose: [[0, { twist: 20 }], [7, { twist: -30 }], [20, { twist: 0 }]],
      hb: [{ f: [4, 8], seg: ['handR', 'tipR', 2], r: 0.45, dmg: 3, ang: 30, bkb: 12, kbg: 40, el: 'punch' }],
      next: { move: 'jab3', btn: 'ATTACK', from: 5, to: 19 },
      sfx: [[3, 'whoosh_light']],
    },
    jab3: {
      name: 'Static Twirl', desc: 'Twirls the staff into a crackling vortex, then discharges.', total: 38,
      fx: staff([[0, 0, 0.5, 1.2], ...twirl, [26, 960, 0.8, 1.3, 'snap'], [30, 960, 0.75, 1.3]], 38),
      pose: [[0, { twist: 0 }], [6, { lean: 6 }], [24, { lean: 6 }], [27, { lean: 18 }], [38, { lean: 0 }]],
      hb: [
        { f: [6, 22], p: [0, 1.2, 1.25], r: 1.0, dmg: 1.2, ang: 10, bkb: 15, kbg: 100, setKb: 0, rehit: 4, el: 'lightning', hitlag: 0.5, grp: 0, hits: 4 },
        { f: [26, 29], p: [0, 1.4, 1.25], r: 1.1, dmg: 4, ang: 42, bkb: 55, kbg: 85, el: 'lightning', grp: 1 },
      ],
      sfx: [[6, 'spark'], [14, 'spark'], [25, 'lightning_zap']],
    },
    dash: {
      name: 'Gale Sweep', total: 32,
      fx: staff([[0, 40, 0.5, 1.0], [4, 60, 0.7, 0.6, 'out', 0.25], [9, -50, 0.75, 0.5, 'snap', 0.2], [16, -60, 0.7, 0.6, 'lin', 0.3]], 32),
      pose: [[0, { lean: 10 }], [4, { lean: 25, crouch: 0.4, twist: 30 }], [9, { twist: -30 }], [32, { lean: 0, crouch: 0, twist: 0 }]],
      mv: [{ f: [2, 11], fwd: 14 }, { f: [12, 16], fwd: 5 }],
      hb: [{ f: [5, 11], seg: ['handR', 'tipR', 2], r: 0.55, dmg: 8, ang: 70, bkb: 60, kbg: 45, el: 'punch' }],
      sfx: [[3, 'wind_gust']],
    },
    upHeavy: {
      name: 'Skyward Arc', desc: 'Charge, then sweep the staff overhead trailing an arc of lightning.', total: 44,
      charge: { at: 5, max: 60, btn: BTN.HEAVY },
      fx: staff([[0, -50, 0.6, 0.9, 'io', 0.5], [5, -70, 0.7, 0.7, 'io', 0.3], [10, -10, 0.6, 1.8, 'snap', 3.0, 1.0], [13, 50, 0.5, 2.0, 'lin', 3.2, 0.9], [18, 70, 0.5, 1.8, 'io', 2.9, 0.9]], 44),
      pose: [[0, { crouch: 0.1 }], [5, { crouch: 0.4, twist: -30 }], [11, { crouch: 0, lean: -15, twist: 20 }], [44, { lean: 0, twist: 0 }]],
      hb: [{ f: [8, 13], seg: ['handR', 'tipR', 3], r: 0.6, dmg: 13, ang: 87, bkb: 42, kbg: 92, el: 'lightning' }],
      sfx: [[8, 'lightning_zap']],
    },
    fwdHeavy: {
      name: 'Thunder Strike', desc: 'Raises the staff and calls a lightning bolt down onto the spot a few metres ahead.', total: 50,
      charge: { at: 6, max: 60, btn: BTN.HEAVY },
      fx: staff([[0, 20, 0.5, 1.2], [6, 10, 0.4, 2.0, 'out', 3.2, 0.5], [13, 5, 0.6, 2.1, 'snap', 3.4, 1.3], [24, 5, 0.6, 2.0, 'io', 3.2, 1.2], [36, 20, 0.5, 1.2]], 50),
      pose: [[0, { lean: 0 }], [6, { lean: -12, armUpR: 1 }], [13, { lean: 10, armUpR: 1 }], [26, { lean: 5 }], [50, { lean: 0 }]],
      hb: [{ f: [12, 14], seg: ['handR', 'tipR', 2], r: 0.55, dmg: 6, ang: 50, bkb: 35, kbg: 60, el: 'lightning' }],
      events: [{ f: 14, fn: (w, f) => {
        const z = zoneAt(w, f, 'thunderStrike', [0, 3.6, 0], { r: 1.35, h: 13, life: 12, visual: 'thunderStrike', hit: { dmg: 16, ang: 72, bkb: 40, kbg: 92, el: 'lightning', dir: 'away', from: 0, to: 4, hitlag: 1.2 } });
        z.dmgMult = 1 + 0.45 * f.charge / 60;
      } }],
      sfx: [[6, 'spark'], [14, 'thunder']],
    },
    nair: {
      name: 'Spark Halo', kind: 'air', total: 30, landLag: 7,
      fx: staff([[0, 60, 0.5, 1.2], [4, 90, 0.7, 1.15, 'out'], [14, 450, 0.7, 1.15, 'lin'], [20, 470, 0.5, 1.2]], 30),
      pose: [[0, { spin: 0 }], [4, { spin: 0 }], [14, { spin: 360 }, 'lin'], [30, { spin: 360 }]],
      hb: [
        { f: [4, 8], p: [0, 0, 1.0], r: 1.45, dmg: 4, ang: 70, bkb: 30, kbg: 30, el: 'lightning', dir: 'radial', grp: 0 },
        { f: [10, 14], p: [0, 0, 1.0], r: 1.5, dmg: 5, ang: 45, bkb: 35, kbg: 78, el: 'lightning', dir: 'radial', grp: 1 },
      ],
      sfx: [[3, 'spark'], [10, 'lightning_zap']],
    },
    fair: {
      name: 'Gust Slash', kind: 'air', total: 34, landLag: 11,
      fx: staff([[0, 10, 0.4, 1.5, 'io', 2.6, 0.6], [4, 5, 0.35, 2.0, 'out', 3.2, 0.3], [9, 0, 0.95, 0.75, 'snap', 0.3, 2.1], [13, 0, 0.9, 0.7, 'lin', 0.25, 2.0]], 34),
      pose: [[0, { lean: 0 }], [4, { lean: -12 }], [9, { lean: 22 }], [34, { lean: 0 }]],
      hb: [{ f: [7, 10], seg: ['handR', 'tipR', 3], r: 0.5, dmg: 11, ang: 42, bkb: 32, kbg: 90, el: 'punch' }],
      sfx: [[6, 'wind_gust']],
    },
    dair: {
      name: 'Bolt Drop', kind: 'air', total: 36, landLag: 13,
      fx: staff([[0, 20, 0.4, 1.3, 'io', 2.4, 0.5], [6, 5, 0.3, 0.7, 'snap', -0.8, 0.35], [14, 5, 0.3, 0.7, 'lin', -0.8, 0.35]], 36),
      pose: [[0, { tuck: 0.2 }], [6, { tuck: 0.5 }], [36, { tuck: 0 }]],
      hb: [{ f: [6, 10], p: [0, 0.2, -0.8], r: 0.9, dmg: 12, ang: -70, bkb: 25, kbg: 80, el: 'lightning' }],
      sfx: [[5, 'lightning_zap']],
    },
    sp1: {
      name: 'Lightning Bolt', desc: 'Q — fires a fast lightning bolt from the staff.', kind: 'any', total: 28, cooldown: 34, aim: 'far', gravity: 0.5,
      fx: staff([[0, 20, 0.5, 1.2], [5, 10, 0.5, 1.4, 'out'], [9, 0, 0.8, 1.35, 'snap'], [16, 0, 0.75, 1.35]], 28),
      pose: [[0, { twist: 0 }], [5, { twist: -20 }], [9, { twist: 15, lean: 8 }], [28, { twist: 0, lean: 0 }]],
      events: [{ f: 9, fn: (w, f) => shoot(w, f, 'bolt', [0, 2.0, 1.35]) }],
      projectileFrame: 9, dmgReadout: 7,
      sfx: [[9, 'lightning_zap']],
    },
    sp2: {
      name: 'Weather Trap', desc: 'E — plants a thundercloud ahead. It strikes the first two foes that wander beneath it.', kind: 'any', total: 30, cooldown: 600, gravity: 0.4,
      fx: staff([[0, 20, 0.5, 1.2], [8, 0, 0.6, 1.9, 'out', 3.0, 1.2], [16, 0, 0.6, 1.9, 'io', 3.0, 1.2]], 30),
      pose: [[0, { lean: 0 }], [8, { lean: -8, armUpR: 1 }], [30, { lean: 0 }]],
      events: [{ f: 12, fn: (w, f) => {
        let n = 0;
        for (const z of w.zones) if (z.owner === f.id && z.kind === 'stormCloud') n++;
        if (n >= 1) for (const z of w.zones) if (z.owner === f.id && z.kind === 'stormCloud') { z.dead = true; break; }
        const g = zoneAt(w, f, 'stormCloud', [0, 3.4, 0], stormCloudDef());
        g.y = Math.max(-1, f.grounded ? f.pos.y : f.pos.y - 2);
      } }],
      sfx: [[10, 'storm_wind']],
    },
    sp3: {
      name: 'Lightning Dash', desc: 'R — turns into a bolt of lightning and streaks in the held direction (default: up).', kind: 'any', total: 38, helpless: true, landLag: 14, ledgeGrab: 8, gravity: 0, edgeStop: false,
      fx: staff([[0, 20, 0.5, 1.2], [6, 0, 0.5, 1.6, 'snap', 2.8, 0.8], [16, 0, 0.5, 1.6]], 38),
      pose: [[0, { crouch: 0.3 }], [6, { crouch: 0, bolt: 1 }], [16, { bolt: 1 }], [20, { bolt: 0 }], [38, { bolt: 0 }]],
      events: [{ f: 6, fn: (w, f) => {
        let hx = 0, hz = 0, up = 1;
        if (f.stick > 0.3) { hx = (f.mx / f.stick) * 0.85; hz = (f.mz / f.stick) * 0.85; up = f.held('DOWN') ? -0.2 : 0.65; f.facing = Math.atan2(hx, hz); }
        const L = Math.hypot(hx, up, hz) || 1;
        f.mvars.dir = { x: hx / L, y: up / L, z: hz / L };
        f.leaveGround();
      } }],
      tick: (w, f, m, mf) => {
        if (mf >= 6 && mf <= 16 && f.mvars.dir) { const d = f.mvars.dir; f.vel.x = d.x * 36; f.vel.y = d.y * 36; f.vel.z = d.z * 36; }
        if (mf === 17) { f.vel.x *= 0.25; f.vel.y *= 0.25; f.vel.z *= 0.25; }
      },
      hb: [{ f: [6, 16], p: [0, 0, 0.9], r: 0.9, dmg: 8, ang: 60, bkb: 50, kbg: 60, el: 'lightning' }],
      sfx: [[6, 'lightning_zap']],
    },
    ult: {
      name: 'Eye of the Storm', desc: 'F — a howling storm engulfs the arena. Lightning marks every foe, then strikes.', kind: 'any', ult: true, cinematic: 40, total: 92, gravity: 0, airControl: 0,
      tele: { shape: 'marks' },
      fx: staff([[0, 20, 0.5, 1.2], [30, 0, 0.5, 2.1, 'out', 3.4, 0.6], [80, 0, 0.5, 2.1, 'io', 3.4, 0.6]], 92),
      pose: [[0, { lift: 0 }], [30, { lift: 0.6, armUpR: 1, lean: -8 }], [80, { lift: 0.6, armUpR: 1 }], [92, { lift: 0 }]],
      events: [{ f: 42, fn: (w, f) => {
        // vortex around Tempest
        w.spawnZone(f, 'tornado', { x: f.pos.x, y: f.pos.y - 1, z: f.pos.z }, multiThenFinal(
          { r: 3.8, h: 7, life: 48, visual: 'tornado' },
          { dmg: 2, ang: 90, bkb: 30, kbg: 100, setKb: 0, rehit: 7, el: 'lightning', dir: 'radial', ult: true, from: 0, to: 34 },
          { dmg: 8, ang: 70, bkb: 70, kbg: 70, el: 'lightning', dir: 'radial', ult: true, dur: 4 }, 40));
        // a bolt marked on every enemy in range
        for (const o of w.fighters) {
          if (!w.hostile(f, o) || !o.alive || o.state === 'respawn') continue;
          if (Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) > 22) continue;
          w.spawnZone(f, 'ultBolt', { x: o.pos.x, y: o.pos.y - 2, z: o.pos.z }, {
            r: 1.9, h: 16, life: 34, visual: 'ultBolt',
            hit: { dmg: 22, ang: 78, bkb: 78, kbg: 84, el: 'lightning', dir: 'away', ult: true, shield: 3, hitlag: 1.4, from: 22, to: 26 },
          });
        }
      } }],
      sfx: [[0, 'ult_tempest']],
    },
  },
});
