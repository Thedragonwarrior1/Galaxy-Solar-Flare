// BLAZE KICK — the fastest fighter. Fire-wreathed kicks only; triple jump; light and combo-heavy.
import { defineCharacter, thrust } from './common.js';
import { BTN } from '../sim/constants.js';
import { rapidKeys } from './helpers.js';

const storm = rapidKeys('footR', 'footL', 6, 24, { every: 3, reach: 1.45, h: 1.15, spread: 25, hSpread: 0.35, seed: 5 });
storm.footR.push([27, 0, 0.6, 1.0], [30, 0, 1.6, 1.25, 'snap'], [34, 0, 1.55, 1.25], [44, null]);
storm.footL.push([27, -10, 0.3, 0.1], [44, null]);

const spinR = [], spinL = [];
for (let i = 0; i <= 10; i++) { spinR.push([4 + i * 3, 90 + i * 120, 1.25, 0.9, 'lin']); spinL.push([4 + i * 3, 270 + i * 120, 1.2, 1.3, 'lin']); }

export default defineCharacter({
  id: 'blaze_kick',
  name: 'Blaze Kick',
  title: 'The Burning Gale',
  style: 'Fire Martial Artist',
  personality: 'Confident, flashy and extremely fast.',
  desc: 'A lightning-quick martial artist who never uses his hands. Fire-wreathed kicks, a triple jump and blistering ground speed — but he is light and easy to launch.',
  palette: { primary: '#7b2cbf', secondary: '#f4f1de', accent: '#ff7b00', ui: '#ff7b00' },
  ratings: { power: 3, speed: 5, range: 2, defense: 2, recovery: 5, difficulty: 3 },
  stats: {
    weight: 86, runSpeed: 14.2, walkSpeed: 5.8, groundAccel: 92, friction: 62,
    airSpeed: 9.6, airAccel: 38, airFriction: 7, gravity: 50, fallSpeed: 17, fastFall: 26,
    jumpVel: 19, djumpVel: 16.6, airJumps: 2, radius: 0.42, height: 1.82, kicker: true,
  },
  throwName: 'Flame Heel Toss', throwDmg: 9,
  abilities: [{ key: 'Q', move: 'sp1' }, { key: 'E', move: 'sp2' }, { key: 'R', move: 'sp3' }, { key: 'F', move: 'ult' }],
  ai: { range: 1.8, poke: 'sp2', pokeRange: [3, 6.5], kill: 'fwdHeavy', antiAir: 'upHeavy', combo: 'jab1', ultRange: 10 },
  moves: {
    jab1: {
      name: 'Snap Kick', total: 18,
      fx: { footR: [...thrust('footR', { a: 0, h: 1.1, r0: 0.3, r1: 1.4, start: 0, ext: 3, hold: 3, back: 7, chamberH: 0.8 }), [18, null]] },
      pose: [[0, { lean: 0 }], [3, { lean: -12, twist: 15 }], [18, { lean: 0, twist: 0 }]],
      hb: [{ f: [3, 5], at: 'footR', r: 0.5, dmg: 2.5, ang: 25, bkb: 10, kbg: 35, el: 'kick' }],
      next: { move: 'jab2', btn: 'ATTACK', from: 4, to: 17 },
      sfx: [[2, 'kick_light']],
    },
    jab2: {
      name: 'Crescent Sweep', total: 20,
      fx: { footL: [[0, -60, 0.3, 0.3], [3, -70, 1.1, 1.2, 'out'], [7, 50, 1.3, 1.35, 'snap'], [10, 60, 1.2, 1.3], [20, null]] },
      pose: [[0, { twist: -20 }], [7, { twist: 30, lean: -10 }], [20, { twist: 0, lean: 0 }]],
      hb: [{ f: [4, 8], at: 'footL', r: 0.55, dmg: 3, ang: 30, bkb: 12, kbg: 40, el: 'kick' }],
      next: { move: 'jab3', btn: 'ATTACK', from: 5, to: 19 },
      sfx: [[3, 'kick_light']],
    },
    jab3: {
      name: 'Hundred Heel Storm', desc: 'A storm of rapid kicks. Hold or mash to extend; ends in a burning launch kick.', total: 44,
      fx: storm,
      pose: [[0, { lean: -8 }], [6, { lean: -15, tilt: 10 }], [24, { lean: -15, tilt: 10 }], [30, { lean: -20, tilt: 0, twist: 20 }], [44, { lean: 0, twist: 0, tilt: 0 }]],
      loop: { from: 9, to: 21, btn: 'ATTACK', max: 4 },
      hb: [
        { f: [6, 24], p: [0, 1.25, 1.15], r: 0.85, dmg: 1, ang: 10, bkb: 18, kbg: 100, setKb: 0, rehit: 3, el: 'fire', hitlag: 0.5, grp: 0, hits: 6 },
        { f: [30, 33], at: 'footR', r: 0.7, dmg: 4.5, ang: 40, bkb: 55, kbg: 92, el: 'fire', grp: 1 },
      ],
      sfx: [[6, 'kick_light'], [12, 'kick_light'], [18, 'kick_light'], [29, 'fire_burst']],
    },
    dash: {
      name: 'Sliding Flame', desc: 'A low slide that pops foes up for juggles.', total: 32,
      fx: { footR: [[0, 0, 0.3, 0.3], [4, 0, 1.25, 0.3, 'snap'], [16, 0, 1.2, 0.3], [32, null]], footL: [[0, -10, 0.2, 0.2], [4, -10, 0.2, 0.25], [32, null]] },
      pose: [[0, { lean: 0 }], [4, { lean: -40, crouch: 0.7 }], [16, { lean: -38, crouch: 0.7 }], [32, { lean: 0, crouch: 0 }]],
      mv: [{ f: [2, 14], fwd: 16 }, { f: [15, 20], fwd: 6 }],
      hb: [{ f: [4, 14], at: 'footR', r: 0.7, dmg: 8, ang: 72, bkb: 62, kbg: 45, el: 'fire' }],
      sfx: [[3, 'fire_whoosh']],
    },
    upHeavy: {
      name: 'Rising Flame Axe', desc: 'Charge, then a flipping kick arcs straight overhead.', total: 44,
      charge: { at: 4, max: 60, btn: BTN.HEAVY },
      fx: { footR: [[0, 0, 0.3, 0.3], [4, 0, 0.6, 0.3], [8, 0, 1.25, 1.6, 'snap'], [11, 0, 0.55, 2.9, 'snap'], [16, 0, 0.3, 2.6], [44, null]] },
      pose: [[0, { crouch: 0.2 }], [4, { crouch: 0.5 }], [9, { flip: -70, lift: 0.4 }], [14, { flip: -150, lift: 0.5 }], [22, { flip: -360, lift: 0.1 }], [44, { flip: -360, lift: 0 }]],
      hb: [{ f: [8, 13], at: 'footR', r: 0.75, dmg: 14, ang: 88, bkb: 42, kbg: 96, el: 'fire' }],
      sfx: [[7, 'fire_whoosh']],
    },
    fwdHeavy: {
      name: 'Blazing Spear Kick', desc: 'A chambered thrust kick that erupts in flame.', total: 46,
      charge: { at: 7, max: 60, btn: BTN.HEAVY },
      fx: { footR: [[0, 0, 0.3, 0.4], [7, 10, 0.3, 1.0], [12, 0, 1.85, 1.2, 'snap'], [17, 0, 1.8, 1.2], [28, 0, 0.4, 0.4], [46, null]] },
      pose: [[0, { twist: 0 }], [7, { twist: 40, lean: 10, crouch: 0.15 }], [12, { twist: -20, lean: -25 }], [24, { lean: -10, twist: 0 }], [46, { lean: 0 }]],
      mv: [{ f: [10, 13], fwd: 7 }],
      hb: [{ f: [11, 15], at: 'footR', r: 0.75, dmg: 16, ang: 36, bkb: 32, kbg: 98, el: 'fire', hitlag: 1.15 }],
      sfx: [[6, 'fire_whoosh'], [11, 'fire_burst']],
    },
    nair: {
      name: 'Spiral Flame', kind: 'air', total: 28, landLag: 6,
      fx: { footR: [[0, 90, 0.4, 0.6], [4, 90, 1.3, 0.85, 'out'], [12, 450, 1.3, 0.85, 'lin'], [18, 470, 0.4, 0.6], [28, null]] },
      pose: [[0, { spin: 0, tilt: 0 }], [4, { tilt: -25 }], [12, { spin: 360, tilt: -25 }, 'lin'], [28, { spin: 360, tilt: 0 }]],
      hb: [{ f: [4, 12], at: 'footR', r: 0.65, dmg: 8, ang: 45, bkb: 30, kbg: 72, el: 'fire' }],
      sfx: [[3, 'fire_whoosh']],
    },
    fair: {
      name: 'Meteor Fire Kick', desc: 'Dives at an angle feet-first, trailing fire.', kind: 'air', total: 32, landLag: 12,
      fx: { footR: [[0, 0, 0.3, 0.6], [5, 0, 1.15, -0.15, 'snap'], [20, 0, 1.1, -0.15], [32, null]], footL: [[0, -20, 0.3, 0.6], [5, -15, 0.3, 0.7], [32, null]] },
      pose: [[0, { lean: 0 }], [5, { lean: -45, tuck: 0.3 }], [20, { lean: -45 }], [32, { lean: 0, tuck: 0 }]],
      mv: [{ f: [6, 20], fwd: 14, up: -13, grav: 0 }],
      hb: [{ f: [6, 20], at: 'footR', r: 0.8, dmg: 12, ang: 40, bkb: 38, kbg: 86, el: 'fire' }],
      sfx: [[5, 'fire_whoosh']],
    },
    dair: {
      name: 'Inferno Heel Drop', kind: 'air', total: 36, landLag: 14,
      fx: { footR: [[0, 0, 0.4, 1.0], [4, 0, 0.6, 2.3, 'out'], [8, 0, 0.75, -0.45, 'snap'], [12, 0, 0.7, -0.4], [36, null]] },
      pose: [[0, { lean: 0 }], [4, { lean: -25, flip: -20 }], [8, { lean: 20, flip: 15 }], [20, { lean: 5, flip: 0 }], [36, { lean: 0 }]],
      hb: [{ f: [7, 10], at: 'footR', r: 0.8, dmg: 13, ang: -80, bkb: 30, kbg: 80, el: 'fire' }],
      sfx: [[7, 'fire_burst']],
    },
    sp1: {
      name: 'Flaming Spin Kick', desc: 'Q — a spinning cyclone of burning kicks that drags foes in. Steerable; slows your fall.', kind: 'any', total: 46, cooldown: 120, gravity: 0.35, turn: 0.06,
      fx: { footR: [[0, 60, 0.4, 0.6], ...spinR, [40, 1290, 0.4, 0.7], [46, null]], footL: [[0, -60, 0.4, 0.6], ...spinL, [40, 1470, 0.4, 0.7], [46, null]] },
      pose: [[0, { spin: 0 }], [4, { spin: 0, tilt: 0 }], [34, { spin: 1200, tilt: -20 }, 'lin'], [40, { spin: 1200, tilt: 0 }], [46, { spin: 1200 }]],
      mv: [{ f: [4, 34], fwd: 6, mode: 'stick', control: 'none' }],
      hb: [
        { f: [6, 32], p: [0, 0, 1.0], r: 1.6, dmg: 2, ang: 50, bkb: 30, kbg: 100, setKb: 0, rehit: 6, el: 'fire', dir: 'pull', grp: 0, hits: 5 },
        { f: [34, 36], p: [0, 0, 1.0], r: 1.8, dmg: 6, ang: 45, bkb: 62, kbg: 85, el: 'fire', dir: 'radial', grp: 1 },
      ],
      sfx: [[4, 'fire_whoosh'], [14, 'fire_whoosh'], [24, 'fire_whoosh'], [33, 'fire_burst']],
    },
    sp2: {
      name: 'Blaze Step', desc: 'E — an explosive dash that ends in a flaming kick. Great for crossing gaps.', kind: 'any', total: 30, cooldown: 80, edgeStop: false,
      fx: { footR: [[0, 0, 0.3, 0.4], [6, 10, 0.3, 0.9], [9, 0, 1.35, 1.0, 'snap'], [14, 0, 1.3, 1.0], [30, null]] },
      pose: [[0, { lean: 20, crouch: 0.3 }], [6, { lean: 35, crouch: 0.2 }], [9, { lean: -20 }], [30, { lean: 0, crouch: 0 }]],
      mv: [{ f: [2, 10], fwd: 23, up: 0, grav: 0 }, { f: [11, 15], fwd: 6, grav: 0.4 }],
      hb: [{ f: [6, 13], at: 'footR', r: 0.75, dmg: 9, ang: 40, bkb: 50, kbg: 65, el: 'fire' }],
      sfx: [[2, 'fire_whoosh'], [9, 'kick_heavy']],
    },
    sp3: {
      name: 'Phoenix Ascent', desc: 'R — a rising spiral of fire with good steering.', kind: 'any', total: 44, helpless: true, landLag: 14, ledgeGrab: 12, airControl: 0.7,
      fx: { footR: [[0, 0, 0.3, 0.3], [4, 90, 1.1, 0.4], [26, 900, 1.1, 0.5, 'lin'], [32, 900, 0.4, 0.4], [44, null]] },
      pose: [[0, { crouch: 0.4 }], [4, { crouch: 0, spin: 0, flip: 0 }], [26, { spin: 990, flip: 0 }, 'lin'], [44, { spin: 990 }]],
      mv: [{ f: [4, 26], up: 24.5, grav: 0, control: 'air' }],
      hb: [
        { f: [4, 24], p: [0, 0, 1.0], r: 1.05, dmg: 3, ang: 85, bkb: 40, kbg: 100, setKb: 0, rehit: 6, el: 'fire', grp: 0, hits: 3 },
        { f: [25, 28], p: [0, 0, 1.3], r: 1.2, dmg: 7, ang: 80, bkb: 70, kbg: 70, el: 'fire', grp: 1 },
      ],
      sfx: [[3, 'fire_burst'], [14, 'fire_whoosh']],
    },
    ult: {
      name: 'Inferno Meteor Heel', desc: 'F — leaps sky-high, then crashes down heel-first as a meteor, detonating a sea of fire.', kind: 'any', ult: true, cinematic: 34, total: 104, gravity: 0, airControl: 0, edgeStop: false, landCancel: false,
      tele: { shape: 'circle', r: 5.5, ahead: 7 },
      fx: { footR: [[0, 0, 0.3, 0.3], [36, 0, 0.4, 0.2], [54, 0, 0.5, 2.0], [58, 0, 1.0, -0.4, 'snap'], [80, 0, 1.0, -0.4], [92, 0, 0.3, 0.2], [104, null]] },
      pose: [[0, { crouch: 0 }], [30, { crouch: 0.6 }], [36, { crouch: 0, flip: 0 }], [54, { flip: -720 }, 'lin'], [58, { flip: -720, lean: 40 }], [80, { flip: -720, lean: 40 }], [92, { flip: -720, lean: 0, crouch: 0.5 }], [104, { flip: -720, crouch: 0 }]],
      mv: [{ f: [36, 52], up: 30, fwd: 3, grav: 0 }, { f: [53, 56], up: 0, fwd: 0, grav: 0 }, { f: [57, 79], up: -34, fwd: 20, grav: 0 }, { f: [80, 104], up: 0, fwd: 0, grav: 0 }],
      hb: [{ f: [57, 79], at: 'footR', r: 1.2, dmg: 10, ang: 50, bkb: 70, kbg: 60, el: 'fire', grp: 0 }],
      events: [{ f: 80, fn: (w, f) => blazeBoom(w, f) }],
      onLand: (w, f) => {
        if (f.mf >= 56 && f.mf < 80) { f.mf = 79; f.mvars.evDone = 79; f.vel.x = f.vel.z = 0; }
      },
      sfx: [[0, 'ult_blaze']],
    },
  },
});

function blazeBoom(w, f) {
  w.explode(f, f.pos.x, f.pos.y + 0.6, f.pos.z, { r: 5.6, dmg: 30, ang: 62, bkb: 82, kbg: 80, el: 'fire', dur: 8, shield: 3 });
  w.emit('fx', { name: 'meteorImpact', id: f.id, x: f.pos.x, y: f.pos.y, z: f.pos.z });
}
