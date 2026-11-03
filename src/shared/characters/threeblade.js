// THREEBLADE — heavy three-sword fighter. Huge disjointed range and power; weak, mostly vertical recovery.
import { defineCharacter } from './common.js';
import { BTN } from '../sim/constants.js';
import { shoot } from './helpers.js';

const BLADE = 1.2;

/** Horizontal sword swing: hand & tip tracks share angles (blade points outward). */
function swing(side, keys, total) {
  const hand = side === 'R' ? 'handR' : 'handL', tip = side === 'R' ? 'tipR' : 'tipL';
  const H = keys.map(([f, a, r, h, e]) => [f, a, r, h, e]);
  const T = keys.map(([f, a, r, h, e, th]) => [f, a, r + BLADE, th !== undefined ? th : h, e]);
  H.push([total, null]); T.push([total, null]);
  return { [hand]: H, [tip]: T };
}

const nairKeysR = [], nairKeysL = [];
for (let i = 0; i <= 6; i++) {
  const f = 4 + i * 3, a = 90 + i * 90;
  nairKeysR.push([f, a, 0.8, 1.15, 'lin']);
  nairKeysL.push([f, a + 180, 0.8, 1.0, 'lin']);
}
const NAIR = { ...swing('R', [[0, 60, 0.5, 1.2], ...nairKeysR, [28, 640, 0.5, 1.1]], 34), ...swing('L', [[0, -60, 0.5, 1.1], ...nairKeysL, [28, 820, 0.5, 1.0]], 34) };

// Ultimate: rapid flurry tracks
const flurryR = [[0, 30, 0.5, 1.2], [36, 40, 0.5, 1.6]], flurryL = [[0, -30, 0.5, 1.2], [36, -40, 0.5, 1.6]];
for (let i = 0; i < 14; i++) {
  const f = 54 + i * 3;
  flurryR.push([f, (i % 2 ? 70 : -60), 1.0, 1.0 + (i % 3) * 0.4, 'snap']);
  flurryL.push([f, (i % 2 ? -70 : 60), 1.0, 1.6 - (i % 3) * 0.4, 'snap']);
}
flurryR.push([98, 160, 0.9, 2.0], [106, -40, 1.1, 0.8, 'snap'], [116, -40, 1.0, 0.9]);
flurryL.push([98, -160, 0.9, 2.0], [106, 40, 1.1, 0.8, 'snap'], [116, 40, 1.0, 0.9]);
const ULT = { ...swing('R', flurryR, 124), ...swing('L', flurryL, 124) };

export default defineCharacter({
  id: 'threeblade',
  name: 'Threeblade',
  title: 'The Three-Path Swordmaster',
  style: 'Heavy Sword Fighter',
  personality: 'Serious, powerful and disciplined.',
  desc: 'A stern master of a three-sword style. Every swing carves a wide, disjointed arc and hits like a cannonball — but his recovery is short and mostly vertical.',
  palette: { primary: '#2e5c4f', secondary: '#c9c3b2', accent: '#c0392b', ui: '#3fae8c' },
  ratings: { power: 5, speed: 2, range: 4, defense: 4, recovery: 2, difficulty: 3 },
  stats: {
    weight: 112, runSpeed: 9.8, walkSpeed: 4.4, groundAccel: 56, friction: 52,
    airSpeed: 7.1, airAccel: 24, airFriction: 5, gravity: 46, fallSpeed: 15.5, fastFall: 24,
    jumpVel: 17.6, djumpVel: 15.4, airJumps: 1, radius: 0.5, height: 1.92, weapons: 'threeSwords',
  },
  throwName: 'Shoulder Throw', throwDmg: 10, throwKbg: 70,
  abilities: [{ key: 'Q', move: 'sp1' }, { key: 'E', move: 'sp2' }, { key: 'R', move: 'sp3' }, { key: 'F', move: 'ult' }],
  ai: { range: 2.4, poke: 'sp2', pokeRange: [4, 8], kill: 'fwdHeavy', antiAir: 'upHeavy', combo: 'jab1', ultRange: 9 },
  projectiles: {
    slashWave: { r: 0.9, speed: 23, life: 32, grav: 0, dmg: 9, ang: 40, bkb: 45, kbg: 70, el: 'slash', dir: 'proj', pierce: true, ground: 'pass' },
  },
  moves: {
    jab1: {
      name: 'First Path', desc: 'Right blade cuts right-to-left.', total: 22,
      fx: swing('R', [[0, 70, 0.5, 1.3], [3, 75, 0.75, 1.25, 'out'], [7, -55, 0.8, 1.15, 'snap'], [10, -65, 0.75, 1.15], [17, -30, 0.5, 1.2]], 22),
      pose: [[0, { twist: 25 }], [7, { twist: -30, lean: 8 }], [22, { twist: 0, lean: 0 }]],
      hb: [{ f: [5, 8], seg: ['handR', 'tipR', 3], r: 0.42, dmg: 4, ang: 30, bkb: 18, kbg: 40, el: 'slash' }],
      next: { move: 'jab2', btn: 'ATTACK', from: 6, to: 21 },
      sfx: [[4, 'slash_light']],
    },
    jab2: {
      name: 'Second Path', desc: 'Left blade answers left-to-right.', total: 22,
      fx: swing('L', [[0, -70, 0.5, 1.3], [3, -75, 0.75, 1.3, 'out'], [7, 55, 0.8, 1.2, 'snap'], [10, 65, 0.75, 1.2], [17, 30, 0.5, 1.2]], 22),
      pose: [[0, { twist: -25 }], [7, { twist: 30, lean: 8 }], [22, { twist: 0, lean: 0 }]],
      hb: [{ f: [5, 8], seg: ['handL', 'tipL', 3], r: 0.42, dmg: 4, ang: 30, bkb: 18, kbg: 42, el: 'slash' }],
      next: { move: 'jab3', btn: 'ATTACK', from: 6, to: 21 },
      sfx: [[4, 'slash_light']],
    },
    jab3: {
      name: 'Third Path', desc: 'Both blades crash down from overhead.', total: 36,
      fx: {
        handR: [[0, 15, 0.4, 1.3], [5, 10, 0.3, 2.0, 'out'], [10, 8, 0.9, 0.75, 'snap'], [16, 8, 0.85, 0.7], [36, null]],
        tipR: [[0, 15, 0.6, 2.4], [5, 5, 0.1, 3.2, 'out'], [10, 6, 2.05, 0.5, 'snap'], [16, 6, 2.0, 0.45], [36, null]],
        handL: [[0, -15, 0.4, 1.3], [5, -10, 0.3, 2.0, 'out'], [10, -8, 0.9, 0.75, 'snap'], [16, -8, 0.85, 0.7], [36, null]],
        tipL: [[0, -15, 0.6, 2.4], [5, -5, 0.1, 3.2, 'out'], [10, -6, 2.05, 0.5, 'snap'], [16, -6, 2.0, 0.45], [36, null]],
      },
      pose: [[0, { lean: -5 }], [5, { lean: -18, lift: 0.1 }], [10, { lean: 25, crouch: 0.35 }], [20, { lean: 18, crouch: 0.3 }], [36, { lean: 0, crouch: 0 }]],
      hb: [{ f: [8, 12], seg: ['handR', 'tipR', 3], r: 0.5, dmg: 8, ang: 50, bkb: 50, kbg: 85, el: 'slash', hitlag: 1.1 },
           { f: [8, 12], seg: ['handL', 'tipL', 3], r: 0.5, dmg: 8, ang: 50, bkb: 50, kbg: 85, el: 'slash', hitlag: 1.1 }],
      sfx: [[7, 'slash_heavy'], [10, 'sword_ring']],
    },
    dash: {
      name: 'Lunging Thrust', total: 36,
      fx: swing('R', [[0, 40, 0.4, 1.1], [4, 30, 0.35, 1.15], [7, 0, 0.95, 1.15, 'snap'], [14, 0, 0.9, 1.15], [24, 20, 0.5, 1.1]], 36),
      pose: [[0, { lean: 10 }], [7, { lean: 28, crouch: 0.3 }], [20, { lean: 18, crouch: 0.2 }], [36, { lean: 0, crouch: 0 }]],
      mv: [{ f: [3, 11], fwd: 14 }, { f: [12, 18], fwd: 5 }],
      hb: [{ f: [6, 12], seg: ['handR', 'tipR', 3], r: 0.45, dmg: 11, ang: 40, bkb: 55, kbg: 60, el: 'slash' }],
      sfx: [[5, 'slash_light']],
    },
    upHeavy: {
      name: 'Rising Crescent', desc: 'Charge, then sweep a blade from the ground to the sky.', total: 48,
      charge: { at: 5, max: 60, btn: BTN.HEAVY },
      fx: {
        handR: [[0, 20, 0.5, 1.0], [5, 5, 0.8, 0.45], [10, 0, 0.95, 1.6, 'snap'], [13, 0, 0.45, 2.05], [20, 0, 0.4, 2.0], [48, null]],
        tipR: [[0, 20, 1.6, 0.6], [5, 5, 1.95, 0.15], [10, 0, 1.8, 2.6, 'snap'], [13, 0, 0.6, 3.25], [20, 0, 0.5, 3.2], [48, null]],
      },
      pose: [[0, { crouch: 0.1 }], [5, { crouch: 0.5, lean: 20 }], [11, { crouch: 0, lean: -15, lift: 0.15 }], [22, { lean: -10, lift: 0 }], [48, { lean: 0 }]],
      hb: [{ f: [8, 13], seg: ['handR', 'tipR', 3], r: 0.55, dmg: 15, ang: 86, bkb: 40, kbg: 95, el: 'slash', hitlag: 1.1 }],
      sfx: [[4, 'sword_ring'], [9, 'slash_heavy']],
    },
    fwdHeavy: {
      name: 'Twin Fang Cleave', desc: 'Both swords drawn back, then cleaved forward in an X.', total: 54,
      charge: { at: 7, max: 60, btn: BTN.HEAVY },
      fx: {
        ...swing('R', [[0, 40, 0.5, 1.3], [7, 125, 0.7, 1.7, 'out', 2.4], [12, 60, 0.9, 1.4, 'in', 1.9], [15, -35, 0.95, 0.95, 'snap', 0.8], [22, -45, 0.9, 0.9, 'lin', 0.7], [34, -10, 0.5, 1.1]], 54),
        ...swing('L', [[0, -40, 0.5, 1.3], [7, -125, 0.7, 1.7, 'out', 2.4], [12, -60, 0.9, 1.4, 'in', 1.9], [15, 35, 0.95, 0.95, 'snap', 0.8], [22, 45, 0.9, 0.9, 'lin', 0.7], [34, 10, 0.5, 1.1]], 54),
      },
      pose: [[0, { lean: 0 }], [7, { lean: -12, crouch: 0.2 }], [15, { lean: 28, crouch: 0.35 }], [28, { lean: 18, crouch: 0.25 }], [54, { lean: 0, crouch: 0 }]],
      mv: [{ f: [12, 15], fwd: 7 }],
      hb: [
        { f: [13, 16], seg: ['handR', 'tipR', 3], r: 0.55, dmg: 18, ang: 36, bkb: 35, kbg: 94, el: 'slash', hitlag: 1.25 },
        { f: [13, 16], seg: ['handL', 'tipL', 3], r: 0.55, dmg: 18, ang: 36, bkb: 35, kbg: 94, el: 'slash', hitlag: 1.25 },
      ],
      sfx: [[6, 'sword_ring'], [13, 'slash_heavy']],
    },
    nair: {
      name: 'Whirlwind Blades', desc: 'A spinning aerial with both swords: two cuts and a launcher.', kind: 'air', total: 34, landLag: 10,
      fx: NAIR,
      pose: [[0, { spin: 0, tuck: 0.3 }], [4, { spin: 0 }], [22, { spin: 540, tuck: 0.4 }, 'lin'], [28, { spin: 540, tuck: 0.1 }], [34, { spin: 540, tuck: 0 }]],
      hb: [
        { f: [4, 9], seg: ['handR', 'tipR', 2], r: 0.5, dmg: 4, ang: 80, bkb: 30, kbg: 20, el: 'slash', grp: 0 },
        { f: [4, 9], seg: ['handL', 'tipL', 2], r: 0.5, dmg: 4, ang: 80, bkb: 30, kbg: 20, el: 'slash', grp: 0 },
        { f: [10, 15], seg: ['handR', 'tipR', 2], r: 0.5, dmg: 4, ang: 80, bkb: 30, kbg: 20, el: 'slash', grp: 1 },
        { f: [10, 15], seg: ['handL', 'tipL', 2], r: 0.5, dmg: 4, ang: 80, bkb: 30, kbg: 20, el: 'slash', grp: 1 },
        { f: [16, 21], seg: ['handR', 'tipR', 2], r: 0.55, dmg: 6, ang: 45, bkb: 40, kbg: 85, el: 'slash', grp: 2 },
        { f: [16, 21], seg: ['handL', 'tipL', 2], r: 0.55, dmg: 6, ang: 45, bkb: 40, kbg: 85, el: 'slash', grp: 2 },
      ],
      sfx: [[3, 'slash_light'], [10, 'slash_light'], [16, 'slash_heavy']],
    },
    fair: {
      name: 'Falling Moon', kind: 'air', total: 36, landLag: 12,
      fx: {
        handR: [[0, 10, 0.4, 1.4], [4, 5, 0.35, 2.1, 'out'], [9, 0, 1.0, 0.65, 'snap'], [13, 0, 0.9, 0.6], [36, null]],
        tipR: [[0, 10, 0.6, 2.5], [4, 0, 0.3, 3.3, 'out'], [9, 0, 2.05, -0.05, 'snap'], [13, 0, 1.95, -0.1], [36, null]],
      },
      pose: [[0, { lean: 0 }], [4, { lean: -15 }], [9, { lean: 30, flip: 30 }], [20, { lean: 10, flip: 10 }], [36, { lean: 0, flip: 0 }]],
      hb: [{ f: [7, 10], seg: ['handR', 'tipR', 3], r: 0.5, dmg: 13, ang: 45, bkb: 30, kbg: 95, el: 'slash' }],
      sfx: [[6, 'slash_heavy']],
    },
    dair: {
      name: 'Earthsplitter Drop', desc: 'Plunges both blades straight down — a spike, but a risky dive.', kind: 'air', total: 40, landLag: 18,
      fx: {
        handR: [[0, 20, 0.4, 1.3], [5, 15, 0.35, 0.9], [26, 15, 0.35, 0.9], [40, null]],
        tipR: [[0, 20, 0.6, 2.3], [5, 10, 0.4, -0.35, 'snap'], [26, 10, 0.4, -0.35], [40, null]],
        handL: [[0, -20, 0.4, 1.3], [5, -15, 0.35, 0.9], [26, -15, 0.35, 0.9], [40, null]],
        tipL: [[0, -20, 0.6, 2.3], [5, -10, 0.4, -0.35, 'snap'], [26, -10, 0.4, -0.35], [40, null]],
      },
      pose: [[0, { tuck: 0.3 }], [5, { tuck: 0.6, lean: 10 }], [26, { tuck: 0.6 }], [40, { tuck: 0 }]],
      mv: [{ f: [6, 22], up: -24, grav: 0 }],
      hb: [{ f: [6, 22], seg: ['handR', 'tipR', 2], r: 0.55, dmg: 12, ang: -60, bkb: 30, kbg: 80, el: 'slash' }],
      sfx: [[5, 'slash_heavy']],
    },
    sp1: {
      name: 'Charged Slash', desc: 'Q — hold to charge. A sweeping slash; strong charges release a flying blade wave.', kind: 'any', total: 42, cooldown: 90, gravity: 0.4, chargeDmg: 0.6,
      charge: { at: 6, max: 60, btn: BTN.SP1 },
      fx: swing('R', [[0, 30, 0.5, 1.3], [6, 120, 0.7, 1.5, 'out'], [10, 60, 0.9, 1.3, 'in'], [13, -70, 0.95, 1.1, 'snap'], [18, -80, 0.9, 1.1], [30, -20, 0.5, 1.2]], 42),
      pose: [[0, { twist: 0 }], [6, { twist: 50, crouch: 0.3 }], [13, { twist: -45, lean: 15, crouch: 0.2 }], [42, { twist: 0, lean: 0, crouch: 0 }]],
      hb: [{ f: [11, 14], seg: ['handR', 'tipR', 3], r: 0.55, dmg: 13, ang: 38, bkb: 50, kbg: 85, el: 'slash' }],
      events: [{ f: 11, fn: (w, f) => { if (f.charge >= 25) shoot(w, f, 'slashWave', [0, 1.2, 1.1], { over: { dmgMult: 0.5 + f.charge / 60 } }); } }],
      sfx: [[5, 'sword_ring'], [11, 'slash_heavy']],
    },
    sp2: {
      name: 'Lion Dash', desc: 'E — blitzes forward, cutting through anything in the way. Usable in the air for distance.', kind: 'any', total: 36, cooldown: 100, edgeStop: false,
      fx: swing('R', [[0, 30, 0.5, 1.2], [4, 140, 0.6, 1.3], [8, -40, 0.95, 1.1, 'snap'], [16, -50, 0.9, 1.1], [26, -20, 0.5, 1.2]], 36),
      pose: [[0, { lean: 0 }], [4, { lean: 30, crouch: 0.3 }], [16, { lean: 30, crouch: 0.3 }], [36, { lean: 0, crouch: 0 }]],
      mv: [{ f: [4, 14], fwd: 26, up: 0, grav: 0 }, { f: [15, 20], fwd: 6, grav: 0.3 }],
      hb: [{ f: [5, 14], p: [0, 0.6, 1.0], r: 0.9, dmg: 10, ang: 45, bkb: 55, kbg: 60, el: 'slash' }],
      sfx: [[3, 'slash_light'], [8, 'slash_heavy']],
    },
    sp3: {
      name: 'Ascending Dragon', desc: 'R — a rising cyclone of steel. Mostly vertical.', kind: 'any', total: 46, helpless: true, landLag: 18, ledgeGrab: 14,
      fx: { ...swing('R', [[0, 60, 0.5, 1.2], [5, 90, 0.8, 1.6, 'out'], [24, 900, 0.8, 1.9, 'lin'], [30, 900, 0.5, 1.5]], 46),
            ...swing('L', [[0, -60, 0.5, 1.2], [5, 270, 0.8, 1.4, 'out'], [24, 1080, 0.8, 1.7, 'lin'], [30, 1080, 0.5, 1.4]], 46) },
      pose: [[0, { crouch: 0.4 }], [5, { crouch: 0, spin: 0 }], [24, { spin: 810 }, 'lin'], [46, { spin: 810 }]],
      mv: [{ f: [5, 24], up: 23, fwd: 3.2, grav: 0 }],
      hb: [
        { f: [5, 22], p: [0, 0.7, 1.2], r: 1.1, dmg: 2.5, ang: 90, bkb: 40, kbg: 100, setKb: 0, rehit: 5, el: 'slash', grp: 0, hits: 4 },
        { f: [23, 26], p: [0, 0.7, 1.6], r: 1.25, dmg: 6, ang: 75, bkb: 60, kbg: 70, el: 'slash', grp: 1 },
      ],
      sfx: [[4, 'slash_heavy'], [12, 'slash_light'], [20, 'slash_light']],
    },
    ult: {
      name: 'Nine-Path Tempest', desc: 'F — draws the third blade, blitzes forward and shreds the first foe caught in a storm of cuts.', kind: 'any', ult: true, cinematic: 36, total: 124, gravity: 0, airControl: 0, edgeStop: false,
      tele: { shape: 'line', len: 9, width: 2.6 },
      fx: ULT,
      pose: [[0, { crouch: 0 }], [30, { crouch: 0.5, lean: 20, thirdBlade: 1 }], [40, { lean: 35, crouch: 0.4, thirdBlade: 1 }], [52, { lean: 10, thirdBlade: 1 }], [96, { spin: 0, thirdBlade: 1 }], [106, { spin: 360, lean: 30, crouch: 0.4, thirdBlade: 1 }], [124, { spin: 360, lean: 0, crouch: 0, thirdBlade: 0 }]],
      mv: [{ f: [40, 50], fwd: 40, up: 0, grav: 0 }, { f: [51, 53], fwd: 0, up: 0, grav: 0 }],
      hb: [
        { f: [40, 50], p: [0, 0.8, 1.0], r: 1.3, dmg: 6, ang: 50, bkb: 70, kbg: 70, el: 'slash', capture: [0, 1.7, 0.25], grp: 0 },
        { f: [54, 96], p: [0, 1.6, 1.0], r: 1.3, dmg: 2.2, el: 'slash', onlyCaptured: true, rehit: 4, grp: 1, hits: 10 },
        { f: [104, 107], p: [0, 1.6, 1.0], r: 1.6, dmg: 12, ang: 48, bkb: 95, kbg: 92, el: 'slash', onlyCaptured: true, release: true, hitlag: 1.6, grp: 2 },
      ],
      sfx: [[0, 'ult_threeblade']],
    },
  },
});
