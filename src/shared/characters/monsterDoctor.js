// MONSTER DOCTOR — friendly medic who transforms into a towering monster. Heavy, armored, slow.
import { defineCharacter, thrust } from './common.js';
import { BTN } from '../sim/constants.js';
import { zoneAt } from './helpers.js';

function shockwave(w, f, r, dmg, mult = 1) {
  const z = zoneAt(w, f, 'shockwave', [0, 0, 0.3], { r, life: 8, visual: 'shockwave', hit: { dmg, ang: 72, bkb: 48, kbg: 82, el: 'punch', dir: 'radial', from: 0, to: 4 } });
  z.dmgMult = mult * (f.transform > 0 ? 1.3 : 1);
  w.emit('fx', { name: 'groundSlam', id: f.id, x: f.pos.x, y: f.pos.y, z: f.pos.z, r });
}

export default defineCharacter({
  id: 'monster_doctor',
  name: 'Monster Doctor',
  title: 'The Gentle Giant of the Infirmary',
  style: 'Transformation Brawler',
  personality: 'Kind-hearted and friendly — until he transforms.',
  desc: 'A cheerful ship\'s doctor with a secret formula. Hits like a landslide with armored punches and ground slams, and his ultimate turns him into a towering, super-armored monster.',
  palette: { primary: '#2d6a4f', secondary: '#f1faee', accent: '#e76f51', ui: '#52b788' },
  ratings: { power: 5, speed: 2, range: 3, defense: 5, recovery: 3, difficulty: 1 },
  stats: {
    weight: 118, runSpeed: 9.2, walkSpeed: 4.2, groundAccel: 50, friction: 50,
    airSpeed: 7, airAccel: 24, airFriction: 5, gravity: 47, fallSpeed: 16, fastFall: 25,
    jumpVel: 18, djumpVel: 15.2, airJumps: 1, radius: 0.52, height: 1.8, scale: 1,
  },
  grabReach: 1.4, throwName: 'Bear Hug Toss', throwDmg: 11, throwKbg: 72,
  abilities: [{ key: 'Q', move: 'sp1' }, { key: 'E', move: 'sp2' }, { key: 'R', move: 'sp3' }, { key: 'F', move: 'ult' }],
  ai: { range: 2.0, poke: 'sp2', pokeRange: [3, 6.5], kill: 'sp1', antiAir: 'upHeavy', combo: 'jab1', ultRange: 30 },
  moves: {
    jab1: {
      name: 'Checkup Jab', total: 20,
      fx: { handL: [...thrust('handL', { a: -5, h: 1.25, r0: 0.45, r1: 1.4, ext: 4, hold: 3, back: 7 }), [20, null]] },
      pose: [[0, { twist: 10 }], [4, { twist: -20, lean: 6 }], [20, { twist: 0, lean: 0 }]],
      hb: [{ f: [4, 6], at: 'handL', r: 0.6, dmg: 3, ang: 25, bkb: 12, kbg: 35, el: 'punch' }],
      next: { move: 'jab2', btn: 'ATTACK', from: 5, to: 19 },
      sfx: [[3, 'punch_light']],
    },
    jab2: {
      name: 'Diagnosis Hook', total: 22,
      fx: { handR: [[0, 70, 0.5, 1.2], [3, 80, 0.8, 1.3, 'out'], [7, -10, 1.3, 1.25, 'snap'], [10, -20, 1.2, 1.25], [22, null]] },
      pose: [[0, { twist: -15 }], [7, { twist: 30, lean: 8 }], [22, { twist: 0, lean: 0 }]],
      hb: [{ f: [5, 8], at: 'handR', r: 0.6, dmg: 3.5, ang: 30, bkb: 14, kbg: 40, el: 'punch' }],
      next: { move: 'jab3', btn: 'ATTACK', from: 6, to: 21 },
      sfx: [[4, 'punch_light']],
    },
    jab3: {
      name: 'Hammer Fist', total: 36,
      fx: {
        handR: [[0, 10, 0.4, 1.3], [6, 5, 0.3, 2.2, 'out'], [11, 0, 1.15, 0.6, 'snap'], [16, 0, 1.1, 0.55], [36, null]],
        handL: [[0, -10, 0.4, 1.3], [6, -5, 0.3, 2.2, 'out'], [11, 0, 1.1, 0.65, 'snap'], [16, 0, 1.05, 0.6], [36, null]],
      },
      pose: [[0, { lean: 0 }], [6, { lean: -18 }], [11, { lean: 30, crouch: 0.3 }], [36, { lean: 0, crouch: 0 }]],
      hb: [{ f: [10, 13], at: 'handR', r: 0.8, dmg: 8, ang: 55, bkb: 50, kbg: 82, el: 'punch', hitlag: 1.1 }],
      sfx: [[10, 'monster_thud']],
    },
    dash: {
      name: 'Ward Rush', total: 36,
      fx: { handR: [[0, 60, 0.4, 1.0], [5, 30, 0.7, 1.1], [24, 30, 0.7, 1.1], [36, null]], handL: [[0, -60, 0.4, 1.0], [5, -30, 0.7, 1.1], [24, -30, 0.7, 1.1], [36, null]] },
      pose: [[0, { lean: 10 }], [5, { lean: 32, crouch: 0.2 }], [20, { lean: 25 }], [36, { lean: 0, crouch: 0 }]],
      mv: [{ f: [3, 14], fwd: 13 }, { f: [15, 20], fwd: 5 }],
      hb: [{ f: [5, 14], p: [0, 0.6, 1.0], r: 0.9, dmg: 11, ang: 40, bkb: 60, kbg: 58, el: 'punch' }],
      sfx: [[3, 'whoosh_heavy']],
    },
    upHeavy: {
      name: 'Ground Slam', desc: 'Charge, then pound the ground with both fists — a shockwave hits all around.', total: 52,
      charge: { at: 6, max: 60, btn: BTN.HEAVY },
      fx: {
        handR: [[0, 20, 0.4, 1.2], [6, 15, 0.4, 2.5, 'out'], [14, 10, 0.9, 0.05, 'snap'], [24, 10, 0.9, 0.05], [52, null]],
        handL: [[0, -20, 0.4, 1.2], [6, -15, 0.4, 2.5, 'out'], [14, -10, 0.9, 0.05, 'snap'], [24, -10, 0.9, 0.05], [52, null]],
      },
      pose: [[0, { lean: 0 }], [6, { lean: -20, lift: 0.2 }], [14, { lean: 45, crouch: 0.6, lift: 0 }], [28, { lean: 35, crouch: 0.5 }], [52, { lean: 0, crouch: 0 }]],
      hb: [{ f: [13, 15], p: [0, 0.9, 0.3], r: 1.0, dmg: 15, ang: 80, bkb: 45, kbg: 88, el: 'punch' }],
      events: [{ f: 14, fn: (w, f) => shockwave(w, f, 2.7, 12, 1 + 0.45 * f.charge / 60) }],
      sfx: [[13, 'monster_thud']],
    },
    fwdHeavy: {
      name: 'Bone-Setter Haymaker', desc: 'A colossal wind-up haymaker. Slow, but devastating.', total: 54,
      charge: { at: 8, max: 60, btn: BTN.HEAVY },
      fx: { handR: [[0, 40, 0.4, 1.2], [8, 160, 0.8, 1.5], [13, 110, 0.7, 1.4], [16, 0, 1.6, 1.3, 'snap'], [22, -10, 1.5, 1.25], [36, 20, 0.5, 1.2], [54, null]] },
      pose: [[0, { twist: 0 }], [8, { twist: -60, lean: -10, crouch: 0.2 }], [16, { twist: 35, lean: 22, crouch: 0.25 }], [32, { twist: 15, lean: 10 }], [54, { twist: 0, lean: 0, crouch: 0 }]],
      mv: [{ f: [13, 16], fwd: 6 }],
      hb: [{ f: [14, 18], at: 'handR', ext: 0.2, r: 0.9, dmg: 19, ang: 36, bkb: 36, kbg: 97, el: 'punch', hitlag: 1.3 }],
      armor: { f: [6, 16], kb: 40 },
      sfx: [[7, 'whoosh_heavy'], [15, 'punch_heavy']],
    },
    nair: {
      name: 'Belly Bounce', kind: 'air', total: 30, landLag: 8,
      fx: { handR: [[0, 50, 0.4, 1.2], [5, 100, 0.8, 1.3], [16, 100, 0.8, 1.3], [30, null]], handL: [[0, -50, 0.4, 1.2], [5, -100, 0.8, 1.3], [16, -100, 0.8, 1.3], [30, null]] },
      pose: [[0, { tuck: 0.2 }], [5, { tuck: 0, bellyOut: 1 }], [16, { bellyOut: 1 }], [30, { bellyOut: 0 }]],
      hb: [{ f: [5, 15], p: [0, 0, 0.95], r: 1.25, dmg: 9, ang: 50, bkb: 35, kbg: 72, el: 'punch', dir: 'radial' }],
      sfx: [[4, 'rubber_boing']],
    },
    fair: {
      name: 'Double Axe', kind: 'air', total: 40, landLag: 14,
      fx: {
        handR: [[0, 10, 0.4, 1.4], [6, 0, 0.3, 2.4, 'out'], [11, 0, 1.25, 0.6, 'snap'], [15, 0, 1.15, 0.5], [40, null]],
        handL: [[0, -10, 0.4, 1.4], [6, 0, 0.3, 2.4, 'out'], [11, 0, 1.2, 0.65, 'snap'], [15, 0, 1.1, 0.55], [40, null]],
      },
      pose: [[0, { lean: 0 }], [6, { lean: -22 }], [11, { lean: 30 }], [40, { lean: 0 }]],
      hb: [{ f: [10, 13], at: 'handR', r: 0.9, dmg: 14, ang: 40, bkb: 32, kbg: 95, el: 'punch', hitlag: 1.15 }],
      sfx: [[9, 'whoosh_heavy']],
    },
    dair: {
      name: 'Meteor Stomp', desc: 'Plummets feet-first and sends a shockwave out on landing.', kind: 'air', total: 46, landCancel: false,
      fx: { footR: [[0, 10, 0.3, 0.5], [8, 10, 0.35, -0.45, 'snap'], [40, 10, 0.35, -0.45], [46, null]], footL: [[0, -10, 0.3, 0.5], [8, -10, 0.35, -0.45, 'snap'], [40, -10, 0.35, -0.45], [46, null]] },
      pose: [[0, { tuck: 0.6 }], [8, { tuck: 0 }], [46, { tuck: 0 }]],
      mv: [{ f: [8, 34], up: -28, fwd: 0, grav: 0 }],
      hb: [{ f: [8, 34], p: [0, 0, -0.2], r: 0.9, dmg: 12, ang: -60, bkb: 28, kbg: 80, el: 'punch' }],
      onLand: (w, f) => {
        if (f.mf >= 8 && f.mf <= 40 && !f.mvars.slammed) {
          f.mvars.slammed = true;
          shockwave(w, f, 2.5, 8);
          f.setState('land', 16);
        } else {
          f.setState('land', 12);
        }
      },
      sfx: [[7, 'whoosh_heavy']],
    },
    sp1: {
      name: 'Monster Punch', desc: 'Q — his arm swells into a monstrous fist. Super armor during the wind-up.', kind: 'any', total: 50, cooldown: 150, gravity: 0.4,
      fx: { handR: [[0, 40, 0.4, 1.2], [8, 150, 0.9, 1.5], [14, 120, 0.7, 1.4], [17, 0, 1.9, 1.3, 'snap'], [24, 0, 1.85, 1.3], [38, 20, 0.5, 1.2], [50, null]] },
      pose: [[0, { armScaleR: 1 }], [8, { armScaleR: 2.1, twist: -55, crouch: 0.2 }], [17, { armScaleR: 2.3, twist: 30, lean: 22 }], [36, { armScaleR: 1.6, twist: 10 }], [50, { armScaleR: 1, twist: 0, lean: 0, crouch: 0 }]],
      armor: { f: [4, 17], kb: 70 },
      mv: [{ f: [14, 17], fwd: 8 }],
      hb: [{ f: [16, 20], at: 'handR', ext: 0.3, r: 1.05, dmg: 18, ang: 40, bkb: 45, kbg: 90, el: 'punch', hitlag: 1.3 }],
      sfx: [[3, 'transform'], [16, 'punch_heavy'], [17, 'monster_thud']],
    },
    sp2: {
      name: 'Rampage Charge', desc: 'E — lowers his head and charges with armor, bowling foes over.', kind: 'any', total: 40, cooldown: 120, edgeStop: true,
      fx: { handR: [[0, 60, 0.4, 1.0], [8, 40, 0.8, 0.9], [26, 40, 0.8, 0.9], [40, null]], handL: [[0, -60, 0.4, 1.0], [8, -40, 0.8, 0.9], [26, -40, 0.8, 0.9], [40, null]] },
      pose: [[0, { crouch: 0.3 }], [8, { lean: 40, crouch: 0.3 }], [26, { lean: 40, crouch: 0.3 }], [40, { lean: 0, crouch: 0 }]],
      armor: { f: [6, 24], kb: 55 },
      mv: [{ f: [8, 24], fwd: 18, grav: 0.6 }],
      hb: [{ f: [8, 24], p: [0, 0.6, 1.0], r: 1.0, dmg: 11, ang: 45, bkb: 60, kbg: 70, el: 'punch' }],
      sfx: [[6, 'monster_roar']],
    },
    sp3: {
      name: 'Mega Leap', desc: 'R — coils his legs and launches an enormous jump.', kind: 'any', total: 42, helpless: true, landLag: 16, ledgeGrab: 10,
      fx: { handR: [[0, 40, 0.4, 1.0], [6, 30, 0.4, 2.1], [30, 30, 0.4, 2.0], [42, null]], handL: [[0, -40, 0.4, 1.0], [6, -30, 0.4, 2.1], [30, -30, 0.4, 2.0], [42, null]] },
      pose: [[0, { crouch: 0.8 }], [6, { crouch: 0, armsUp: 1, stretchY: 1.15 }], [20, { armsUp: 1, stretchY: 1 }], [42, { armsUp: 0 }]],
      mv: [{ f: [6, 8], up: 31, fwd: 6.5, control: 'air' }, { f: [9, 30], grav: 0.7, control: 'air' }],
      airControl: 0.8,
      hb: [{ f: [6, 10], p: [0, 0, 1.0], r: 1.0, dmg: 8, ang: 80, bkb: 60, kbg: 60, el: 'punch' }],
      sfx: [[5, 'whoosh_heavy']],
    },
    ult: {
      name: 'Monster Rampage', desc: 'F — drinks the formula and becomes a towering monster for 12s: bigger, heavier, 30% stronger and super-armored.', kind: 'any', ult: true, cinematic: 50, total: 72, gravity: 0, airControl: 0,
      canUse: (f) => f.transform === 0,
      tele: { shape: 'circle', r: 4.6 },
      fx: { handR: [[0, 40, 0.4, 1.2], [20, 30, 0.6, 1.6], [50, 60, 1.0, 2.0], [56, 60, 1.2, 2.2], [72, null]], handL: [[0, -40, 0.4, 1.2], [20, -30, 0.6, 1.6], [50, -60, 1.0, 2.0], [56, -60, 1.2, 2.2], [72, null]] },
      pose: [[0, { crouch: 0 }], [20, { crouch: 0.5, lean: 20 }], [48, { crouch: 0.2, lean: -15 }], [56, { lean: -25, roar: 1 }], [72, { lean: 0, roar: 0 }]],
      events: [
        { f: 48, fn: (w, f) => { f.transform = 720; f.scale = 1.45; w.emit('transform', { id: f.id, on: true }); } },
        { f: 52, fn: (w, f) => {
          w.spawnZone(f, 'roar', { x: f.pos.x, y: f.pos.y + 1, z: f.pos.z }, { r: 4.6, life: 8, visual: 'shockwave', hit: { dmg: 12, ang: 60, bkb: 80, kbg: 62, el: 'punch', dir: 'radial', ult: true, from: 0, to: 4 } });
        } },
      ],
      dmgReadout: 12,
      sfx: [[0, 'ult_monster']],
    },
  },
});
