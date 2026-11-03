// Network protocol: message validation (server side) and compact snapshot encoding.
// Clients only ever send INPUTS and lobby choices. Damage, stocks, knockouts and results are computed
// exclusively by the server's authoritative simulation.
import { BTN_ALL } from './sim/constants.js';
import { CHARACTER_IDS } from './characters/index.js';
import { ARENA_IDS } from './sim/arenas.js';

export const PROTOCOL_VERSION = 1;
export const SNAPSHOT_EVERY = 2; // ticks per snapshot (30 Hz)
export const MAX_INPUT_QUEUE = 8;
export const MAX_NAME = 16;
export const MODES = ['ffa', '1v1', '2v2'];

const STATES = ['idle', 'air', 'jumpsquat', 'land', 'move', 'shield', 'shieldstun', 'shieldDrop', 'rebound', 'parried', 'getup', 'tech', 'dizzy',
  'knockdown', 'spotdodge', 'roll', 'airdodge', 'hitstun', 'helpless', 'ledge', 'ledgeClimb', 'ledgeRoll', 'captured', 'holding', 'respawn', 'victory', 'frozen', 'dead'];
const STATE_IDX = Object.fromEntries(STATES.map((s, i) => [s, i]));

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

export function sanitizeName(n) {
  if (typeof n !== 'string') return 'Pirate';
  const s = n.replace(/[^\p{L}\p{N} _\-.!?]/gu, '').trim().slice(0, MAX_NAME);
  return s || 'Pirate';
}

/** Parse and validate a raw client message. Returns a clean object or null (rejected). */
export function parseClientMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  let m;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'hello': return { t: 'hello', name: sanitizeName(m.name), v: m.v | 0 };
    case 'create': return { t: 'create' };
    case 'join': return typeof m.code === 'string' && /^[A-Z0-9]{4}$/.test(m.code.toUpperCase()) ? { t: 'join', code: m.code.toUpperCase() } : null;
    case 'leave': return { t: 'leave' };
    case 'char': return CHARACTER_IDS.includes(m.char) ? { t: 'char', char: m.char } : null;
    case 'team': return m.team === 0 || m.team === 1 ? { t: 'team', team: m.team } : null;
    case 'ready': return { t: 'ready', v: !!m.v };
    case 'settings': {
      const s = {};
      if (MODES.includes(m.mode)) s.mode = m.mode;
      if (m.arena === 'random' || ARENA_IDS.includes(m.arena)) s.arena = m.arena;
      if (Number.isInteger(m.stocks) && m.stocks >= 1 && m.stocks <= 5) s.stocks = m.stocks;
      if (Number.isInteger(m.time) && (m.time === 0 || (m.time >= 60 && m.time <= 900))) s.time = m.time;
      if (typeof m.hazards === 'boolean') s.hazards = m.hazards;
      if (Number.isInteger(m.cpus) && m.cpus >= 0 && m.cpus <= 3) s.cpus = m.cpus;
      return { t: 'settings', s };
    }
    case 'start': return { t: 'start' };
    case 'rematch': return { t: 'rematch' };
    case 'in': {
      if (!Array.isArray(m.m) || m.m.length !== 2) return null;
      let mx = +m.m[0], mz = +m.m[1];
      if (!Number.isFinite(mx) || !Number.isFinite(mz)) return null;
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; } // impossible stick magnitudes are clamped
      const b = (m.b | 0) & BTN_ALL;
      const s = m.s >>> 0;
      return { t: 'in', mx, mz, b, s };
    }
    case 'ping': return { t: 'ping', c: +m.c || 0 };
    default: return null;
  }
}

/** Server -> client snapshot of the authoritative world. */
export function encodeSnapshot(w, events) {
  return {
    t: 'snap', f: w.frame, ph: w.phase, cd: w.countdown, tm: w.timer, el: w.elapsed,
    cine: w.cine ? [w.cine.id, w.cine.left] : null,
    F: w.fighters.map((f) => [
      f.id, r3(f.pos.x), r3(f.pos.y), r3(f.pos.z), r3(f.facing),
      r2(f.vel.x), r2(f.vel.y), r2(f.vel.z), r2(f.kb.x), r2(f.kb.y), r2(f.kb.z),
      STATE_IDX[f.state] ?? 0, f.sf, f.move || '', f.mf, f.charge, f.grounded ? 1 : 0,
      r2(f.pct), f.stocks, r2(f.ult), f.cd.sp1 | 0, f.cd.sp2 | 0, f.cd.sp3 | 0, f.recUsed ? 1 : 0,
      r3(f.scale), f.transform, r2(f.shieldHP),
      (f.intangible() ? 1 : 0) | (f.flash > 0 ? 2 : 0) | (f.tumble ? 4 : 0) | (f.eliminated ? 8 : 0) | (f.hitlag > 0 ? 16 : 0),
      f.lag | 0, f.rollDir ? r2(f.rollDir.x) : 0, f.rollDir ? r2(f.rollDir.z) : 0, f.jumpsLeft, f.place | 0,
    ]),
    P: w.projectiles.map((p) => [p.pid, p.kind, p.owner, r3(p.x), r3(p.y), r3(p.z), r2(p.vx), r2(p.vy), r2(p.vz), r3(p.r), p.armed ? 1 : 0]),
    Z: w.zones.map((z) => [z.zid, z.kind, z.owner, r3(z.x), r3(z.y), r3(z.z), r3(z.r), r3(z.h), z.age, z.life]),
    H: w.hazards.map((h) => [h.hid, h.kind, r3(h.x), r3(h.y), r3(h.z), h.phase, h.t, h.warn, r3(h.dir)]),
    E: events,
  };
}

export function decodeFighter(a) {
  return {
    id: a[0], pos: { x: a[1], y: a[2], z: a[3] }, facing: a[4], vel: { x: a[5], y: a[6], z: a[7] }, kb: { x: a[8], y: a[9], z: a[10] },
    state: STATES[a[11]] || 'idle', sf: a[12], move: a[13] || null, mf: a[14], charge: a[15], grounded: !!a[16],
    pct: a[17], stocks: a[18], ult: a[19], cd: { sp1: a[20], sp2: a[21], sp3: a[22] }, recUsed: !!a[23],
    scale: a[24], transform: a[25], shieldHP: a[26],
    inv: !!(a[27] & 1), flash: a[27] & 2 ? 10 : 0, tumble: !!(a[27] & 4), eliminated: !!(a[27] & 8), hitlag: a[27] & 16 ? 1 : 0,
    lag: a[28], rollDir: a[29] || a[30] ? { x: a[29], y: 0, z: a[30] } : null, jumpsLeft: a[31], place: a[32],
  };
}

export function decodeProjectile(a) { return { pid: a[0], kind: a[1], owner: a[2], x: a[3], y: a[4], z: a[5], vx: a[6], vy: a[7], vz: a[8], r: a[9], armed: !!a[10] }; }
export function decodeZone(a) { return { zid: a[0], kind: a[1], owner: a[2], x: a[3], y: a[4], z: a[5], r: a[6], h: a[7], age: a[8], life: a[9] }; }
export function decodeHazard(a) { return { hid: a[0], kind: a[1], x: a[2], y: a[3], z: a[4], phase: a[5], t: a[6], warn: a[7], dir: a[8] }; }

export function makeRoomCode(rng = Math.random) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(rng() * A.length)];
  return s;
}
