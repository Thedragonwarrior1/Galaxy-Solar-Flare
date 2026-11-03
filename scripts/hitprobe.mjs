// For every move of every character: does it hit a pinned dummy placed at some plausible offset?
import { World } from '../src/shared/sim/world.js';
import { CHARACTER_IDS, CHARACTERS } from '../src/shared/characters/index.js';
import { BTN } from '../src/shared/sim/constants.js';
const SKIP = new Set(['throw', 'ledgeAttack', 'getupAttack', 'grab']);
export function probe(charId, key, { dist, dy = 0, air = false, frames = 200 }) {
  const w = new World({ arena: 'marine_fortress', mode: 'training', players: [{ char: charId }, { char: 'monster_doctor' }], skipCountdown: true });
  const A = w.fighters[0], D = w.fighters[1];
  const y0 = air ? 4 : 0;
  A.spawnAt([0, y0, -3], 0); D.spawnAt([0, y0 + dy, -3 + dist], Math.PI);
  if (!air) { w.settle(A); w.settle(D); } else { A.setState('air'); }
  D.pinned = true; if (air || dy) { D.setState('air'); D.grounded = false; }
  A.ult = 100;
  if (key === 'ult' || key === 'sp1' || key === 'sp2' || key === 'sp3') A.cd = {};
  const ok = A.startMove(key);
  if (!ok) return { ok: false, err: 'could not start' };
  if (air) A.pinned = !CHARACTERS[charId].moves[key].mv && !['sp3','ult','sp2','sp1'].includes(key);
  let hits = 0, dmg = 0;
  for (let i = 0; i < frames; i++) {
    w.step([{ mx: 0, mz: 0, b: 0 }, {}]);
    for (const e of w.events) if (e.type === 'hit' && e.t === 1) { hits++; dmg += e.dmg; }
    if (A.state !== 'move' && A.state !== 'holding' && w.projectiles.length === 0 && w.zones.length === 0 && i > 10) break;
  }
  return { ok: true, hits, dmg: Math.round(dmg * 10) / 10 };
}
const results = [];
for (const id of CHARACTER_IDS) {
  const c = CHARACTERS[id];
  for (const key of Object.keys(c.moves)) {
    if (SKIP.has(key) || key.endsWith('Air') || key.endsWith('Mon')) continue;
    const m = c.moves[key];
    const air = m.kind === 'air';
    let best = null;
    const dys = key === 'upHeavy' ? [0, 1.5, 2.2] : key === 'dair' ? [-1.6, -1, 0] : [0];
    for (const dist of [0.9, 1.4, 2.0, 2.8, 3.6, 4.5, 6, 7.5, 9]) for (const dy of dys) {
      const r = probe(id, key, { dist, dy, air });
      if (r.hits > 0 && (!best || r.dmg > best.dmg)) best = { ...r, dist, dy };
    }
    results.push([id, key, best ? `HIT x${best.hits} ${best.dmg}% @${best.dist}${best.dy ? ' dy' + best.dy : ''}` : 'MISS']);
  }
}
for (const r of results) console.log(r[0].padEnd(18), r[1].padEnd(9), r[2]);
console.log('misses:', results.filter(r => r[2] === 'MISS').length);
