// CAPTAIN RUBBER — elastic brawler. Long stretchy reach, bouncy movement, explosive ultimate.
import { defineCharacter, thrust } from './common.js';
import { BTN } from '../sim/constants.js';
import { rapidKeys, startTether, tetherTick } from './helpers.js';

const gatling = rapidKeys('handR', 'handL', 8, 40, { every: 2, reach: 2.1, h: 1.3, spread: 22, hSpread: 0.35, seed: 11 });
gatling.handR.push([44, 150, 0.9, 1.3], [50, 0, 2.6, 1.3, 'snap'], [56, 0, 2.6, 1.3], [68, null]);
gatling.handL.push([44, -30, 0.5, 1.2], [68, null]);

export default defineCharacter({
  id: 'captain_rubber',
  name: 'Captain Rubber',
  title: 'The Boundless Captain',
  style: 'Elastic Brawler',
  personality: 'Energetic, playful and completely unpredictable.',
  desc: 'A grinning young captain whose body stretches like rubber. Pummels from long range, snaps back into close combos and launches himself across the sky.',
  palette: { primary: '#ffb627', secondary: '#1f8a9e', accent: '#e8443a', ui: '#ffb627' },
  ratings: { power: 4, speed: 4, range: 5, defense: 3, recovery: 4, difficulty: 2 },
  stats: {
    weight: 96, runSpeed: 12, walkSpeed: 5, groundAccel: 72, friction: 56,
    airSpeed: 8.3, airAccel: 32, airFriction: 6, gravity: 42, fallSpeed: 14, fastFall: 22,
    jumpVel: 17.6, djumpVel: 16.2, airJumps: 1, radius: 0.45, height: 1.75, stretchy: true,
  },
  abilities: [
    { key: 'Q', move: 'sp1' }, { key: 'E', move: 'sp2' }, { key: 'R', move: 'sp3' }, { key: 'F', move: 'ult' },
  ],
  ai: { range: 2.0, poke: 'sp1', pokeRange: [3.5, 7.2], kill: 'fwdHeavy', antiAir: 'upHeavy', combo: 'sp2', ultRange: 9 },
  moves: {
    jab1: {
      name: 'Snap Jab', desc: 'A rubbery jab that snaps out and back.', total: 18,
      fx: { handR: [...thrust('handR', { a: 0, h: 1.3, r0: 0.4, r1: 1.65, start: 0, ext: 3, hold: 3, back: 7 }), [18, null]] },
      pose: [[0, { twist: -10 }], [3, { twist: 22, lean: 6 }], [18, { twist: 0 }]],
      hb: [{ f: [3, 6], at: 'handR', r: 0.5, dmg: 2.5, ang: 25, bkb: 10, kbg: 35, el: 'punch' }],
      next: { move: 'jab2', btn: 'ATTACK', from: 4, to: 17 },
      sfx: [[2, 'rubber_snap']],
    },
    jab2: {
      name: 'Snap Hook', total: 20,
      fx: { handL: [...thrust('handL', { a: -5, h: 1.32, r0: 0.4, r1: 1.75, start: 0, ext: 3, hold: 3, back: 8 }), [20, null]] },
      pose: [[0, { twist: 20 }], [3, { twist: -24, lean: 8 }], [20, { twist: 0 }]],
      hb: [{ f: [3, 6], at: 'handL', r: 0.5, dmg: 2.5, ang: 28, bkb: 12, kbg: 40, el: 'punch' }],
      next: { move: 'jab3', btn: 'ATTACK', from: 4, to: 19 },
      sfx: [[2, 'rubber_snap']],
    },
    jab3: {
      name: 'Rubber Bell', desc: 'Both palms stretch out in a ringing double strike.', total: 32,
      fx: {
        handR: [[0, 30, 0.35, 1.2], [5, 160, 0.8, 1.3], [9, 8, 2.5, 1.25, 'snap'], [13, 8, 2.4, 1.25], [22, 20, 0.5, 1.2], [32, null]],
        handL: [[0, -30, 0.35, 1.2], [5, -160, 0.8, 1.3], [9, -8, 2.5, 1.25, 'snap'], [13, -8, 2.4, 1.25], [22, -20, 0.5, 1.2], [32, null]],
      },
      pose: [[0, { lean: -10 }], [5, { lean: -18, crouch: 0.2 }], [9, { lean: 18, crouch: 0.1 }], [32, { lean: 0, crouch: 0 }]],
      hb: [
        { f: [9, 12], at: 'handR', r: 0.65, dmg: 5.5, ang: 40, bkb: 45, kbg: 80, el: 'punch' },
        { f: [9, 12], at: 'handL', r: 0.65, dmg: 5.5, ang: 40, bkb: 45, kbg: 80, el: 'punch' },
      ],
      sfx: [[4, 'rubber_stretch'], [9, 'rubber_boing']],
    },
    dash: {
      name: 'Bounding Tackle', desc: 'Bounces forward shoulder-first.', total: 34,
      fx: { handR: [[0, 60, 0.4, 1.0], [6, 100, 0.5, 0.9], [26, 100, 0.5, 0.9], [34, null]], handL: [[0, -60, 0.4, 1.0], [6, -100, 0.5, 0.9], [26, -100, 0.5, 0.9], [34, null]] },
      pose: [[0, { lean: 10 }], [4, { lean: 38, crouch: 0.25, lift: 0.3 }], [14, { lean: 30, lift: 0.1 }], [34, { lean: 0, lift: 0 }]],
      mv: [{ f: [2, 13], fwd: 14 }, { f: [14, 20], fwd: 6 }],
      hb: [{ f: [4, 12], p: [0, 0.6, 1.0], r: 0.75, dmg: 9, ang: 45, bkb: 50, kbg: 55, el: 'punch' }],
      sfx: [[2, 'rubber_boing']],
    },
    upHeavy: {
      name: 'Skyrocket Uppercut', desc: 'Charge, then stretch an uppercut far overhead. Launches upward.', total: 46,
      charge: { at: 6, max: 60, btn: BTN.HEAVY },
      fx: { handR: [[0, 30, 0.4, 1.0], [6, 20, 0.5, 0.5], [11, 0, 0.7, 1.6, 'snap'], [15, 0, 0.5, 3.4, 'snap'], [20, 0, 0.45, 3.3], [32, 20, 0.4, 1.2], [46, null]] },
      pose: [[0, { crouch: 0.1 }], [6, { crouch: 0.55, lean: 12 }], [12, { crouch: 0, lean: -12, lift: 0.25 }], [20, { lean: -8, lift: 0.1 }], [46, { lean: 0, lift: 0 }]],
      hb: [
        { f: [10, 12], p: [0, 0.6, 1.3], r: 0.75, dmg: 10, ang: 88, bkb: 40, kbg: 85, el: 'punch' },
        { f: [12, 17], at: 'handR', r: 0.8, dmg: 14, ang: 86, bkb: 38, kbg: 98, el: 'punch' },
      ],
      sfx: [[10, 'rubber_stretch'], [13, 'whoosh_heavy']],
    },
    fwdHeavy: {
      name: 'Rubber Cannon', desc: 'Winds the arm far behind, then fires a devastating stretched punch.', total: 50,
      charge: { at: 7, max: 60, btn: BTN.HEAVY },
      fx: { handR: [[0, 40, 0.4, 1.2], [7, 168, 1.9, 1.3], [12, 120, 0.9, 1.3], [15, 0, 3.5, 1.25, 'snap'], [21, 0, 3.4, 1.25], [34, 20, 0.5, 1.2], [50, null]] },
      pose: [[0, { twist: -10 }], [7, { twist: -60, lean: -10 }], [14, { twist: 30, lean: 22 }], [24, { twist: 20, lean: 12 }], [50, { twist: 0, lean: 0 }]],
      hb: [
        { f: [14, 19], at: 'handR', r: 0.85, dmg: 17, ang: 38, bkb: 34, kbg: 97, el: 'punch', hitlag: 1.2 },
        { f: [14, 16], p: [0, 1.4, 1.25], r: 0.75, dmg: 13, ang: 40, bkb: 32, kbg: 90, el: 'punch' },
      ],
      sfx: [[6, 'rubber_stretch'], [14, 'rubber_snap'], [15, 'whoosh_heavy']],
    },
    nair: {
      name: 'Rubber Pinwheel', kind: 'air', total: 30, landLag: 7,
      fx: {
        handR: [[0, 90, 0.5, 1.2], [4, 90, 1.85, 1.15, 'out'], [15, 450, 1.85, 1.15, 'lin'], [22, 470, 0.5, 1.2], [30, null]],
        handL: [[0, -90, 0.5, 1.2], [4, -90, 1.85, 1.15, 'out'], [15, 270, 1.85, 1.15, 'lin'], [22, 290, 0.5, 1.2], [30, null]],
      },
      pose: [[0, { spin: 0, tuck: 0.3 }], [4, { spin: 0 }], [15, { spin: 360, tuck: 0.4 }, 'lin'], [30, { spin: 360, tuck: 0 }]],
      hb: [
        { f: [4, 14], at: 'handR', r: 0.65, dmg: 9, ang: 50, bkb: 30, kbg: 72, el: 'punch' },
        { f: [4, 14], at: 'handL', r: 0.65, dmg: 9, ang: 50, bkb: 30, kbg: 72, el: 'punch' },
      ],
      sfx: [[3, 'whoosh_med']],
    },
    fair: {
      name: 'Elastic Whip Kick', desc: 'The leg stretches into a long, whipping aerial kick.', kind: 'air', total: 34, landLag: 12,
      fx: { footR: [[0, 0, 0.4, 0.7], [4, 20, 0.3, 1.0], [8, 0, 2.7, 0.95, 'snap'], [12, 0, 2.6, 0.9], [24, 0, 0.4, 0.5], [34, null]] },
      pose: [[0, { lean: 0 }], [4, { lean: 10, tuck: 0.5 }], [8, { lean: -22, tuck: 0 }], [24, { lean: -5 }], [34, { lean: 0 }]],
      hb: [{ f: [7, 11], at: 'footR', r: 0.75, dmg: 14, ang: 40, bkb: 32, kbg: 92, el: 'kick' }],
      sfx: [[6, 'rubber_stretch'], [8, 'whoosh_med']],
    },
    dair: {
      name: 'Stamp Stomp', kind: 'air', total: 38, landLag: 14,
      fx: {
        footR: [[0, 10, 0.3, 0.4], [5, 10, 0.3, 0.9], [9, 5, 0.4, -1.7, 'snap'], [14, 5, 0.4, -1.6], [26, 10, 0.3, 0.2], [38, null]],
        footL: [[0, -10, 0.3, 0.4], [5, -10, 0.3, 0.9], [9, -5, 0.4, -1.7, 'snap'], [14, -5, 0.4, -1.6], [26, -10, 0.3, 0.2], [38, null]],
      },
      pose: [[0, { tuck: 0.2 }], [5, { tuck: 0.8 }], [9, { tuck: 0, lean: 5 }], [38, { lean: 0 }]],
      hb: [{ f: [9, 12], at: 'footR', r: 0.85, dmg: 12, ang: -70, bkb: 25, kbg: 80, el: 'kick' }],
      sfx: [[8, 'rubber_stretch']],
    },
    sp1: {
      name: 'Stretch Pistol', desc: 'Q — winds up and fires a punch that stretches across the arena.', kind: 'any', total: 38, cooldown: 45, aim: 'far', gravity: 0.35,
      fx: { handR: [[0, 20, 0.4, 1.3], [5, 160, 0.9, 1.35], [8, 120, 0.7, 1.3], [13, 0, 7.2, 1.25, 'snap'], [17, 0, 7.0, 1.25], [27, 0, 0.6, 1.3, 'in'], [38, null]] },
      pose: [[0, { twist: 0 }], [5, { twist: -45, lean: -8 }], [12, { twist: 25, lean: 14 }], [28, { twist: 10, lean: 4 }], [38, { twist: 0, lean: 0 }]],
      hb: [{ f: [10, 17], at: 'handR', r: 0.75, dmg: 12, ang: 35, bkb: 45, kbg: 72, el: 'punch' }],
      sfx: [[4, 'rubber_stretch'], [11, 'rubber_snap'], [24, 'rubber_boing']],
    },
    sp2: {
      name: 'Gatling Rush', desc: 'E — a blur of rubber punches, finished by a launching blast. Mash to extend.', kind: 'any', total: 68, cooldown: 150, gravity: 0.25, airControl: 0.15,
      fx: gatling,
      pose: [[0, { lean: 5 }], [8, { lean: 18, crouch: 0.15 }], [40, { lean: 18, crouch: 0.15 }], [44, { lean: -10, twist: -40 }], [50, { lean: 22, twist: 25 }], [68, { lean: 0, twist: 0, crouch: 0 }]],
      loop: { from: 26, to: 40, btn: 'SP2', max: 2 },
      hb: [
        { f: [8, 40], p: [0, 1.6, 1.25], r: 1.05, dmg: 1.2, ang: 8, bkb: 18, kbg: 100, setKb: 0, rehit: 4, el: 'punch', hitlag: 0.5, hits: 8, grp: 0, dir: 'facing' },
        { f: [50, 54], at: 'handR', r: 0.95, dmg: 6, ang: 40, bkb: 60, kbg: 88, el: 'punch', grp: 1 },
      ],
      sfx: [[6, 'gatling'], [24, 'gatling'], [49, 'rubber_snap']],
    },
    sp3: {
      name: 'Rubber Rocket', desc: 'R — stretches toward the nearest ledge and slingshots there, or rockets upward.', kind: 'any', total: 42, helpless: true, landLag: 14, ledgeGrab: 10, gravity: 0.2,
      fx: {
        handR: [[0, 20, 0.4, 1.3], [8, 6, 2.6, 4.2, 'snap'], [22, 6, 1.2, 2.6], [30, 10, 0.5, 2.0], [42, null]],
        handL: [[0, -20, 0.4, 1.3], [8, -6, 2.6, 4.2, 'snap'], [22, -6, 1.2, 2.6], [30, -10, 0.5, 2.0], [42, null]],
      },
      pose: [[0, { crouch: 0.4 }], [8, { crouch: 0.6, lean: -5 }], [11, { crouch: 0, stretchY: 1.35, lean: 10 }], [24, { stretchY: 1.0 }], [42, { lean: 0 }]],
      events: [{ f: 8, fn: (w, f) => { startTether(w, f, 10, 110); } }],
      tick: (w, f, m, mf) => {
        if (mf >= 10 && f.mvars.tether) { tetherTick(w, f, 25); return; }
        if (mf >= 10 && mf <= 24) {
          const fx = Math.sin(f.facing), fz = Math.cos(f.facing);
          const steer = f.stick > 0.3 ? 1 : 0;
          f.vel.x = (steer ? f.mx / f.stick : fx) * 8.5; f.vel.z = (steer ? f.mz / f.stick : fz) * 8.5;
          f.vel.y = 22;
          f.leaveGround();
        }
      },
      hb: [{ f: [10, 22], p: [0, 0, 1.2], r: 0.9, dmg: 7, ang: 80, bkb: 50, kbg: 60, el: 'punch' }],
      sfx: [[6, 'rubber_stretch'], [10, 'rubber_boing']],
    },
    ult: {
      name: 'Titan Rubber Fist', desc: 'F — inflates his arm to colossal size and drives a giant fist through everything ahead.', kind: 'any', ult: true, cinematic: 40, total: 86, gravity: 0, aim: 'far', airControl: 0,
      tele: { shape: 'line', len: 10.5, width: 4.8 },
      fx: {
        handR: [[0, 30, 0.5, 1.4], [20, 170, 1.4, 2.0], [44, 176, 2.2, 2.6], [50, 0, 9.2, 1.7, 'snap'], [62, 0, 9.0, 1.7], [76, 10, 0.8, 1.5, 'in'], [86, null]],
        handL: [[0, -30, 0.4, 1.2], [40, -60, 0.8, 1.3], [62, -50, 0.6, 1.2], [86, null]],
        anchor: [[0, 0, 1.0, 1.5], [86, 0, 1.0, 1.5]],
      },
      pose: [[0, { armScaleR: 1 }], [36, { armScaleR: 3.4, twist: -50, lean: -12 }], [44, { armScaleR: 3.6, twist: -60 }], [50, { armScaleR: 3.6, twist: 35, lean: 24 }], [66, { armScaleR: 3.2, twist: 20 }], [86, { armScaleR: 1, twist: 0, lean: 0 }]],
      hb: [
        { f: [49, 60], at: 'handR', r: 2.5, dmg: 32, ang: 40, bkb: 72, kbg: 88, el: 'punch', shield: 3, hitlag: 1.4, ult: true, grp: 0 },
        { f: [49, 58], seg: ['anchor', 'handR', 6], r: 1.7, dmg: 28, ang: 40, bkb: 72, kbg: 86, el: 'punch', shield: 3, ult: true, grp: 0 },
      ],
      sfx: [[0, 'ult_rubber']],
    },
  },
});
