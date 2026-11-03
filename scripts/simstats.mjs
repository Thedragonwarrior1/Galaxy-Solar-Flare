// CPU-vs-CPU batch simulation: sanity + balance statistics.
import { World } from '../src/shared/sim/world.js';
import { CpuController } from '../src/shared/sim/ai.js';
import { CHARACTER_IDS } from '../src/shared/characters/index.js';
import { ARENA_IDS } from '../src/shared/sim/arenas.js';
const N = +process.argv[2] || 2;
const lvl = +process.argv[3] || 7;
const stats = {}; for (const c of CHARACTER_IDS) stats[c] = { games: 0, wins: 0, kos: 0, falls: 0, sds: 0, koPcts: [], dealt: 0 };
let total = 0, frames = 0, timeouts = 0;
const t0 = Date.now();
for (let n = 0; n < N; n++) for (let i = 0; i < CHARACTER_IDS.length; i++) for (let j = i + 1; j < CHARACTER_IDS.length; j++) {
  const a = CHARACTER_IDS[i], b = CHARACTER_IDS[j];
  const arena = ARENA_IDS[(i + j + n) % ARENA_IDS.length];
  const w = new World({ arena, mode: '1v1', stocks: 3, time: 300, players: [{ char: a }, { char: b }], seed: n * 100 + i * 10 + j, skipCountdown: true });
  const ais = w.fighters.map((f) => new CpuController(w, f.id, lvl, 'cpu', n + 1));
  const pctAtKo = [];
  while (w.phase !== 'ended' && w.frame < 60 * 320) {
    for (const f of w.fighters) if (f.state !== 'dead') f._lastPct = f.pct;
    w.step(ais.map((c) => c.think()));
    for (const e of w.events) if (e.type === 'ko') pctAtKo.push([w.fighters[e.id].charId, w.fighters[e.id]._lastPct, e.by]);
  }
  total++; frames += w.frame;
  if (w.endReason === 'time') timeouts++;
  const res = w.results;
  for (const r of res.rows) { const s = stats[r.char]; s.games++; if (r.place === 1) s.wins++; s.kos += r.kos; s.falls += r.falls; s.sds += r.sds; s.dealt += r.dmgDealt; }
  for (const [c, p, by] of pctAtKo) if (by >= 0) stats[c].koPcts.push(p);
}
console.log(`${total} matches, avg ${(frames / total / 60).toFixed(1)}s, timeouts ${timeouts}, sim time ${Date.now() - t0}ms`);
for (const c of CHARACTER_IDS) { const s = stats[c]; const avg = s.koPcts.length ? s.koPcts.reduce((a, b) => a + b, 0) / s.koPcts.length : 0;
  console.log(c.padEnd(18), 'win', (s.wins / s.games * 100).toFixed(0).padStart(3) + '%', 'KOs', s.kos, 'falls', s.falls, 'SDs', s.sds, 'avgKO%', avg.toFixed(0), 'dmg/g', (s.dealt / s.games).toFixed(0)); }
