// SLINGSHOT SNIPER — long-range gadgeteer. Precision shots, bombs, traps and a grappling hook.
import { defineCharacter } from './common.js';
import { BTN } from '../sim/constants.js';
import { shoot, startTether, tetherTick } from './helpers.js';
import { localToWorld } from '../sim/math.js';

function hammer(keys, total) {
  // handR holds the mallet; tipR is the mallet head
  const H = keys.map(([f, a, r, h, e]) => [f, a, r, h, e]);
  const T = keys.map(([f, a, r, h, e, th, tr]) => [f, a, tr !== undefined ? tr : r + 1.25, th !== undefined ? th : h, e]);
  H.push([total, null]); T.push([total, null]);
  return { handR: H, tipR: T };
}

const AIM = {
  handL: [[0, -20, 0.4, 1.1], [5, 0, 0.9, 1.45, 'out'], [16, 0, 0.9, 1.45], [24, -10, 0.5, 1.2], [30, null]],
  handR: [[0, 20, 0.4, 1.1], [5, 5, 0.35, 1.45, 'out'], [9, 5, 0.25, 1.45], [10, 0, 0.75, 1.45, 'snap'], [24, 10, 0.45, 1.2], [30, null]],
};

export default defineCharacter({
  id: 'slingshot_sniper',
  name: 'Slingshot Sniper',
  title: 'The Legendary Marksman (Self-Proclaimed)',
  style: 'Long-Range Tactician',
  personality: 'Comedic, cowardly-brave, clever and inventive.',
  desc: 'A boastful inventor with a giant slingshot and a backpack full of gadgets. Snipes from across the arena, lobs bombs, plants spring traps and grapples back from anywhere — but hates being up close.',
  palette: { primary: '#bc6c25', secondary: '#fefae0', accent: '#2a9d8f', ui: '#e9c46a' },
  ratings: { power: 3, speed: 3, range: 5, defense: 2, recovery: 4, difficulty: 3 },
  stats: {
    weight: 90, runSpeed: 10.3, walkSpeed: 4.8, groundAccel: 60, friction: 56,
    airSpeed: 8.5, airAccel: 30, airFriction: 6, gravity: 42, fallSpeed: 14, fastFall: 22,
    jumpVel: 17.5, djumpVel: 16, airJumps: 1, radius: 0.44, height: 1.76, weapons: 'slingshot',
  },
  throwName: 'Panic Toss', throwDmg: 8,
  abilities: [{ key: 'Q', move: 'sp1' }, { key: 'E', move: 'sp2' }, { key: 'R', move: 'sp3' }, { key: 'F', move: 'ult' }],
  ai: { range: 2.0, projectile: 'sp1', projRange: [5, 22], poke: 'sp2', pokeRange: [5, 10], kill: 'fwdHeavy', antiAir: 'nair', setup: 'upHeavy', combo: 'jab1', ultRange: 14, keepAway: 3.2 },
  projectiles: {
    pellet: { r: 0.32, speed: 40, life: 42, grav: 0, dmg: 6.5, ang: 35, bkb: 32, kbg: 80, el: 'pellet', dir: 'proj', ground: 'die' },
    bomb: { r: 0.42, speed: 14, life: 120, grav: 26, dmg: 4, ang: 50, bkb: 30, kbg: 40, el: 'fire', dir: 'proj', ground: 'die', expireExplode: true,
      explode: { r: 2.2, dmg: 13.5, ang: 55, bkb: 45, kbg: 75, el: 'fire', dur: 5 } },
    minibomb: { r: 0.35, speed: 0, life: 90, grav: 34, dmg: 3, ang: 70, bkb: 30, kbg: 40, el: 'fire', dir: 'proj', ground: 'die', expireExplode: true,
      explode: { r: 1.5, dmg: 8, ang: 70, bkb: 40, kbg: 65, el: 'fire', dur: 4 } },
    trap: { r: 0.5, speed: 0, life: 900, grav: 30, dmg: 0, el: 'trap', ground: 'stick', trap: { arm: 30, trigger: 1.25 },
      explode: { r: 1.6, dmg: 9, ang: 88, bkb: 72, kbg: 58, el: 'trap', dur: 4 } },
    meteor: { r: 0.5, speed: 0, life: 80, grav: 0, dmg: 4, ang: 70, bkb: 40, kbg: 50, el: 'fire', dir: 'radial', ground: 'die', ult: true, expireExplode: true,
      explode: { r: 1.9, dmg: 7, ang: 72, bkb: 48, kbg: 72, el: 'fire', dur: 4, ult: true } },
  },
  moves: {
    jab1: {
      name: 'Slingshot Bonk', total: 18,
      fx: { handL: [[0, -20, 0.4, 1.1], [3, 0, 1.1, 1.4, 'snap'], [7, 0, 1.05, 1.35], [12, -15, 0.45, 1.15], [18, null]] },
      pose: [[0, { twist: 10 }], [3, { twist: -20, lean: 8 }], [18, { twist: 0, lean: 0 }]],
      hb: [{ f: [3, 6], at: 'handL', r: 0.55, dmg: 2.5, ang: 25, bkb: 10, kbg: 35, el: 'punch' }],
      next: { move: 'jab2', btn: 'ATTACK', from: 4, to: 17 },
      sfx: [[2, 'whoosh_light']],
    },
    jab2: {
      name: 'Panicked Kick', desc: 'A flailing front kick to make some space.', total: 28,
      fx: { footR: [[0, 0, 0.3, 0.3], [4, 0, 0.4, 0.9], [7, 0, 1.4, 1.0, 'snap'], [11, 0, 1.35, 1.0], [28, null]] },
      pose: [[0, { lean: 0 }], [7, { lean: -18 }], [28, { lean: 0 }]],
      hb: [{ f: [6, 9], at: 'footR', r: 0.65, dmg: 6, ang: 40, bkb: 48, kbg: 72, el: 'kick' }],
      sfx: [[5, 'kick_light']],
    },
    dash: {
      name: 'Pratfall Slide', desc: 'Trips forward on purpose. Probably.', total: 36,
      fx: { footR: [[0, 0, 0.3, 0.3], [5, 0, 1.2, 0.35, 'snap'], [18, 0, 1.15, 0.35], [36, null]], footL: [[0, -10, 0.3, 0.3], [5, -10, 1.0, 0.3], [18, -10, 1.0, 0.3], [36, null]] },
      pose: [[0, { lean: 0 }], [5, { lean: -55, crouch: 0.7 }], [18, { lean: -55, crouch: 0.7 }], [36, { lean: 0, crouch: 0 }]],
      mv: [{ f: [2, 15], fwd: 14 }, { f: [16, 22], fwd: 4 }],
      hb: [{ f: [5, 15], p: [0, 0.8, 0.35], r: 0.8, dmg: 8, ang: 70, bkb: 60, kbg: 45, el: 'kick' }],
      sfx: [[3, 'whoosh_med']],
    },
    upHeavy: {
      name: 'Pop Trap', desc: 'Sets a spring trap on the ground. It launches the first foe to step on it. (Max 2.)', total: 34, cooldown: 200,
      fx: { handR: [[0, 20, 0.4, 1.1], [8, 10, 0.8, 0.4], [16, 10, 0.8, 0.35], [34, null]], handL: [[0, -20, 0.4, 1.1], [8, -10, 0.7, 0.5], [16, -10, 0.7, 0.45], [34, null]] },
      pose: [[0, { crouch: 0 }], [8, { crouch: 0.7, lean: 30 }], [18, { crouch: 0.6, lean: 25 }], [34, { crouch: 0, lean: 0 }]],
      events: [{ f: 14, fn: (w, f) => {
        const mine = w.projectiles.filter((p) => p.owner === f.id && p.kind === 'trap' && !p.dead);
        if (mine.length >= 2) w.endProjectile(mine[0], 'fizzle');
        shoot(w, f, 'trap', [0, 1.3, 0.4]);
      } }],
      dmgReadout: 9, projectileFrame: 14,
      sfx: [[12, 'trap_set']],
    },
    fwdHeavy: {
      name: 'Ten-Ton Mallet', desc: 'Pulls out a comically huge toy mallet and brings it down. Hard.', total: 54,
      charge: { at: 8, max: 60, btn: BTN.HEAVY },
      fx: hammer([[0, 20, 0.4, 1.2, 'io', 2.2, 0.3], [8, 5, 0.3, 2.0, 'out', 3.3, 0.1], [15, 0, 0.9, 1.0, 'snap', 0.35, 2.1], [22, 0, 0.85, 0.95, 'lin', 0.3, 2.05], [36, 10, 0.5, 1.2, 'io', 2.0, 0.6]], 54),
      pose: [[0, { lean: 0, mallet: 1 }], [8, { lean: -20, mallet: 1 }], [15, { lean: 35, crouch: 0.3, mallet: 1 }], [36, { lean: 10, mallet: 1 }], [54, { lean: 0, crouch: 0, mallet: 0 }]],
      hb: [{ f: [13, 17], at: 'tipR', r: 0.95, dmg: 18, ang: 40, bkb: 34, kbg: 96, el: 'punch', hitlag: 1.3 }],
      sfx: [[7, 'whoosh_heavy'], [14, 'monster_thud']],
    },
    nair: {
      name: 'Spinning Sling', kind: 'air', total: 30, landLag: 7,
      fx: { handL: [[0, -60, 0.5, 1.2], [4, -90, 1.0, 1.15, 'out'], [14, 270, 1.0, 1.15, 'lin'], [20, 290, 0.5, 1.2], [30, null]] },
      pose: [[0, { spin: 0 }], [4, { spin: 0 }], [14, { spin: 360 }, 'lin'], [30, { spin: 360 }]],
      hb: [{ f: [4, 13], at: 'handL', r: 0.7, dmg: 8, ang: 70, bkb: 38, kbg: 75, el: 'punch' }],
      sfx: [[3, 'whoosh_med']],
    },
    fair: {
      name: 'Sling Swat', kind: 'air', total: 34, landLag: 11,
      fx: { handL: [[0, -40, 0.4, 1.5], [4, -60, 0.6, 1.9, 'out'], [9, 20, 1.2, 1.0, 'snap'], [13, 30, 1.1, 0.9], [34, null]] },
      pose: [[0, { twist: 0 }], [4, { twist: 25 }], [9, { twist: -25, lean: 15 }], [34, { twist: 0, lean: 0 }]],
      hb: [{ f: [7, 10], at: 'handL', r: 0.65, dmg: 11, ang: 40, bkb: 32, kbg: 88, el: 'punch' }],
      sfx: [[6, 'whoosh_med']],
    },
    dair: {
      name: 'Bomb Drop', desc: 'Drops a little bomb straight down.', kind: 'air', total: 34, landLag: 10,
      fx: { handR: [[0, 20, 0.4, 1.1], [6, 0, 0.3, 0.2], [14, 0, 0.3, 0.2], [34, null]] },
      pose: [[0, { tuck: 0.3 }], [6, { tuck: 0.6 }], [34, { tuck: 0 }]],
      events: [{ f: 8, fn: (w, f) => { const p = shoot(w, f, 'minibomb', [0, 0.2, 0.1]); p.vy = -6; } }],
      projectileFrame: 8, dmgReadout: 11,
      sfx: [[7, 'pellet_pop']],
    },
    sp1: {
      name: 'Precision Shot', desc: 'Q — hold to draw the slingshot; release a lightning-fast pellet. Charging nearly doubles damage.', kind: 'any', total: 30, cooldown: 22, aim: 'far', gravity: 0.5,
      charge: { at: 9, max: 50, btn: BTN.SP1 },
      fx: AIM,
      pose: [[0, { twist: 0 }], [5, { twist: -10, aim: 1 }], [16, { twist: -10, aim: 1 }], [30, { twist: 0, aim: 0 }]],
      events: [{ f: 10, fn: (w, f) => { const c = f.charge / 50; shoot(w, f, 'pellet', [0, 1.0, 1.45], { over: { dmgMult: 1 + 1.2 * c, speed: 40 + 12 * c } }); } }],
      projectileFrame: 10, dmgReadout: 5,
      sfx: [[4, 'sling_twang'], [10, 'pellet_pop']],
    },
    sp2: {
      name: 'Boom Pellet', desc: 'E — lobs an explosive pellet in an arc. Blows up on contact.', kind: 'any', total: 34, cooldown: 90, aim: 'far', gravity: 0.5,
      fx: { handL: AIM.handL.map((k) => (k[1] === null ? k : [k[0], k[1], k[2], k[3] + 0.3, k[4]])), handR: AIM.handR.map((k) => (k[1] === null ? k : [k[0], k[1], k[2], k[3] + 0.3, k[4]])) },
      pose: [[0, { twist: 0 }], [5, { twist: -10, lean: -15, aim: 1 }], [16, { twist: -10, lean: -15, aim: 1 }], [34, { twist: 0, lean: 0, aim: 0 }]],
      events: [{ f: 10, fn: (w, f) => {
        // auto-range the lob toward the nearest enemy in front
        const t = w.nearestEnemy(f, 16);
        let sp = 14;
        if (t) { const d = Math.hypot(t.pos.x - f.pos.x, t.pos.z - f.pos.z); sp = Math.max(9, Math.min(17, Math.sqrt(d * 26 / Math.sin(1.0)) * 0.95)); }
        shoot(w, f, 'bomb', [0, 0.9, 1.7], { pitch: 0.5, over: { speed: sp } });
      } }],
      projectileFrame: 10, dmgReadout: 16,
      sfx: [[4, 'sling_twang'], [10, 'pellet_pop']],
    },
    sp3: {
      name: 'Grapple Hook', desc: 'R — fires a grappling hook at the nearest ledge and reels in. Without a ledge in reach, it gives a small boost.', kind: 'any', total: 50, helpless: true, landLag: 14, ledgeGrab: 8, gravity: 0.3,
      fx: { handL: [[0, -20, 0.4, 1.1], [6, 0, 0.9, 1.7, 'snap'], [30, 0, 0.9, 1.7], [50, null]] },
      pose: [[0, { lean: 0 }], [6, { lean: -10, aim: 1 }], [30, { aim: 1 }], [50, { aim: 0, lean: 0 }]],
      events: [{ f: 8, fn: (w, f) => {
        if (!startTether(w, f, 12, 120)) {
          f.vel.y = 17; f.leaveGround();
          const p = localToWorld(f.pos, f.facing, 0, 4, 3);
          w.emit('fx', { name: 'hookMiss', id: f.id, x: p.x, y: p.y, z: p.z });
        }
      } }],
      tick: (w, f, m, mf) => { if (mf >= 9 && f.mvars.tether) tetherTick(w, f, 23); },
      hb: [{ f: [8, 12], p: [0, 2.2, 1.6], r: 0.6, dmg: 4, ang: 30, bkb: 40, kbg: 40, el: 'punch' }],
      sfx: [[7, 'grapple_fire'], [12, 'grapple_reel']],
    },
    ult: {
      name: 'Meteor Barrage', desc: 'F — fires a volley into the sky that rains down as a carpet of exploding pellets ahead.', kind: 'any', ult: true, cinematic: 36, total: 118, gravity: 0, airControl: 0, aim: 'far',
      tele: { shape: 'square', size: 9, ahead: 7 },
      fx: { handL: [[0, -20, 0.4, 1.1], [20, 0, 0.6, 2.2], [66, 0, 0.6, 2.2], [80, null]], handR: [[0, 20, 0.4, 1.1], [20, 0, 0.25, 2.0], [40, 0, 0.3, 2.3, 'snap'], [66, 0, 0.3, 2.0], [80, null]] },
      pose: [[0, { lean: 0 }], [20, { lean: -30, aimUp: 1 }], [66, { lean: -30, aimUp: 1 }], [80, { lean: 0, aimUp: 0 }]],
      tick: (w, f, m, mf) => {
        if (mf === 40) {
          const c = localToWorld(f.pos, f.facing, 0, 7, 0);
          f.mvars.center = { x: c.x, z: c.z, y: f.pos.y };
          f.mvars.rng = 12345 + w.frame;
        }
        if (mf >= 46 && mf <= 88 && (mf - 46) % 3 === 0 && f.mvars.center) {
          let s = f.mvars.rng = (f.mvars.rng * 1103515245 + 12345) & 0x7fffffff;
          const rx = ((s % 1000) / 1000 - 0.5) * 9;
          s = f.mvars.rng = (f.mvars.rng * 1103515245 + 12345) & 0x7fffffff;
          const rz = ((s % 1000) / 1000 - 0.5) * 9;
          const C = f.mvars.center;
          const p = w.spawnProjectile(f, 'meteor', { x: C.x + rx, y: C.y + 15, z: C.z + rz }, 0, 0);
          p.vx = 0; p.vz = 0; p.vy = -30;
        }
      },
      dmgReadout: 40,
      sfx: [[0, 'ult_sniper']],
    },
  },
});
