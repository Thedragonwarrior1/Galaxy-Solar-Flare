// Character framework: move normalisation, generic moves (grab/throw/ledge/getup), and authoring helpers.
import { BTN } from '../sim/constants.js';

/** Fill defaults + derive frame-data info (startup / active frames / total damage) for UI readouts. */
export function finalizeMove(key, m) {
  m.key = key;
  m.kind = m.kind || 'ground';
  if (m.air === undefined) m.air = m.kind === 'air';
  if (m.edgeStop === undefined) m.edgeStop = m.kind === 'ground';
  if (m.charge && typeof m.charge.btn === 'number') {
    m.charge.btn = Object.keys(BTN).find((k) => BTN[k] === m.charge.btn);
  }
  m.hb = m.hb || [];
  // Auto-align tracked hitboxes with the strike: if a hitbox starts part-way through a fast (snap/out)
  // key segment of its effector, start it right as that segment begins so the visible swing always hits.
  for (const h of m.hb) {
    const limb = h.at || (h.seg && h.seg[1]);
    const tr = limb && m.fx && m.fx[limb];
    if (!tr) continue;
    for (let i = 0; i < tr.length - 1; i++) {
      const k0 = tr[i], k1 = tr[i + 1];
      if (k0[1] === null || k1[1] === null || k0[1] === undefined) continue;
      const fast = k1[4] === 'snap' || k1[4] === 'out';
      if (fast && h.f[0] > k0[0] + 1 && h.f[0] <= k1[0] + 1) { h.f[0] = k0[0] + 1; break; }
    }
  }
  for (const h of m.hb) {
    if (h.ang === undefined) h.ang = 361;
    if (h.kbg === undefined) h.kbg = 100;
    if (h.bkb === undefined) h.bkb = 0;
    h.el = h.el || 'punch';
  }
  let startup = Infinity, lastActive = -1, dmg = 0;
  const grpSeen = new Set();
  for (const h of m.hb) {
    startup = Math.min(startup, h.f[0]);
    lastActive = Math.max(lastActive, h.f[1]);
    const g = (h.grp || 0) + ':' + h.f[0];
    if (!grpSeen.has(g)) { grpSeen.add(g); dmg = Math.max(dmg, 0) + 0; }
  }
  // damage readout: sum of distinct groups' max damage (multi-hits count each group once)
  const byGrp = new Map();
  for (const h of m.hb) {
    const g = h.grp || 0;
    byGrp.set(g, Math.max(byGrp.get(g) || 0, h.dmg || 0) * (h.hits || 1));
  }
  for (const v of byGrp.values()) dmg += v;
  m.startup = Number.isFinite(startup) ? startup : (m.projectileFrame || null);
  m.activeFrames = lastActive >= 0 ? `${startup}-${lastActive}` : (m.projectileFrame ? `proj @${m.projectileFrame}` : '-');
  m.totalDmg = m.dmgReadout !== undefined ? m.dmgReadout : Math.round(dmg * 10) / 10;
  return m;
}

/** Build a character def: finalize moves, add generic moves where missing. */
export function defineCharacter(c) {
  const st = c.stats;
  st.walkSpeed = st.walkSpeed || st.runSpeed * 0.45;
  st.radius = st.radius || 0.45;
  st.height = st.height || 1.8;
  st.shortHop = st.shortHop || st.jumpVel * 0.66;
  const generic = genericMoves(c);
  for (const k in generic) if (!c.moves[k]) c.moves[k] = generic[k];
  for (const k in c.moves) finalizeMove(k, c.moves[k]);
  c.projectiles = c.projectiles || {};
  return c;
}

function genericMoves(c) {
  const reach = c.grabReach || 1.25;
  return {
    grab: {
      name: 'Grab', kind: 'ground', total: 30,
      fx: { handR: [[0, 20, 0.45, 1.1], [5, 5, reach, 1.0, 'snap'], [9, 5, reach, 1.0], [18, 20, 0.5, 1.0], [30, null]],
            handL: [[0, -20, 0.45, 1.1], [5, -5, reach, 1.0, 'snap'], [9, -5, reach, 1.0], [18, -20, 0.5, 1.0], [30, null]] },
      pose: [[0, { lean: 0 }], [5, { lean: 18 }], [14, { lean: 6 }], [30, { lean: 0 }]],
      hb: [{ f: [5, 8], p: [0, reach * 0.8, 1.0], r: 0.6, dmg: 0, grab: true }],
      sfx: [[4, 'whoosh_light']],
    },
    throw: {
      name: c.throwName || 'Toss', kind: 'any', total: 26, aim: 'none',
      fx: { handR: [[0, 0, 0.9, 1.1], [6, -30, 1.3, 1.4, 'snap'], [12, -60, 0.6, 1.2], [26, null]] },
      pose: [[0, { twist: 25 }], [6, { twist: -35, lean: 12 }], [26, { twist: 0, lean: 0 }]],
      hb: [{ f: [6, 7], p: [0, 1.1, 1.0], r: 1.1, dmg: c.throwDmg || 8, ang: 42, bkb: 60, kbg: c.throwKbg || 62, onlyCaptured: true, release: true, el: 'punch', hitlag: 0.8 }],
      sfx: [[6, 'throw']],
    },
    ledgeAttack: {
      name: 'Ledge Attack', kind: 'ground', total: 34, inv: [0, 10], aim: 'none',
      fx: { footR: [[0, 0, 0.3, 0.2], [10, 0, 1.3, 0.5, 'snap'], [16, 0, 1.3, 0.5], [34, null]] },
      pose: [[0, { crouch: 0.6 }], [10, { crouch: 0.2, lean: -10 }], [34, { crouch: 0 }]],
      hb: [{ f: [10, 14], at: 'footR', r: 0.75, dmg: 9, ang: 40, bkb: 55, kbg: 50, el: 'kick' }],
      sfx: [[9, 'whoosh_med']],
    },
    getupAttack: {
      name: 'Getup Attack', kind: 'ground', total: 36, inv: [0, 12], aim: 'none',
      fx: { footR: [[0, 0, 0.4, 0.2], [12, 60, 1.2, 0.4], [18, -60, 1.2, 0.4], [24, -170, 1.2, 0.4], [36, null]] },
      pose: [[0, { crouch: 0.8 }], [12, { crouch: 0.6, spin: 0 }], [24, { spin: -200, crouch: 0.4 }], [36, { spin: -360, crouch: 0 }]],
      hb: [{ f: [12, 22], p: [0, 0, 0.5], r: 1.5, dmg: 7, ang: 30, bkb: 60, kbg: 40, el: 'kick', dir: 'radial' }],
      sfx: [[11, 'whoosh_med']],
    },
  };
}

// ---------- authoring helpers ----------

/** A straight thrust for an effector: chamber -> extend -> hold -> release. */
export function thrust(limb, { a = 0, h = 1.25, r0 = 0.35, r1 = 1.35, start = 0, ext = 4, hold = 4, back = 8, total, chamberA, chamberH, side = 0 }) {
  const ca = chamberA !== undefined ? chamberA : a + (side || 0);
  const ch = chamberH !== undefined ? chamberH : h;
  const t = [
    [start, ca, r0, ch],
    [start + ext, a, r1, h, 'snap'],
    [start + ext + hold, a, r1 * 0.97, h],
    [start + ext + hold + back, a, r0 + 0.15, h, 'io'],
  ];
  if (total !== undefined) t.push([total, null]);
  return t;
}

/** A sweeping arc for an effector from angle a0 to a1 (degrees) at radius r. */
export function arc(a0, a1, { r = 1.3, h0 = 1.2, h1 = 1.2, start = 0, wind = 4, swing = 5, hold = 3, back = 10, total, r0 = 0.5 }) {
  const t = [
    [start, a0 - (a1 - a0) * 0.12, r0 + 0.3, h0],
    [start + wind, a0, r, h0, 'out'],
    [start + wind + swing, a1, r, h1, 'snap'],
    [start + wind + swing + hold, a1 + (a1 - a0) * 0.05, r * 0.95, h1],
    [start + wind + swing + hold + back, a1 * 0.5, r0, (h0 + h1) / 2, 'io'],
  ];
  if (total !== undefined) t.push([total, null]);
  return t;
}

/** Hitboxes sampled along an arc track during frames [f0,f1] (sweeping hitbox following the limb). */
export function sweepHits(at, f0, f1, props, n = 1) {
  const out = [];
  const step = Math.max(1, Math.floor((f1 - f0 + 1) / n));
  for (let i = 0; i < n; i++) {
    const a = f0 + i * step, b = i === n - 1 ? f1 : a + step - 1;
    out.push({ ...props, f: [a, b], at });
  }
  return out;
}

/** Standard air-dodge style limb-tuck pose keys, etc. */
export const POSE = {
  tuck: { crouch: 0.4, lean: 15 },
};
