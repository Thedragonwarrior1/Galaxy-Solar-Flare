import { World } from '../src/shared/sim/world.js';
import { CpuController } from '../src/shared/sim/ai.js';
const [a, b] = [process.argv[2] || 'captain_rubber', process.argv[3] || 'monster_doctor'];
const use = {}, hit = {};
for (let n = 0; n < 6; n++) {
  const w = new World({ arena: 'pirate_haven', mode: '1v1', stocks: 3, time: 300, players: [{ char: a }, { char: b }], seed: n, skipCountdown: true });
  const ais = w.fighters.map((f) => new CpuController(w, f.id, 7, 'cpu', n + 1));
  while (w.phase !== 'ended' && w.frame < 60 * 300) {
    w.step(ais.map((c) => c.think()));
    for (const e of w.events) {
      if (e.type === 'move' && e.id === 0) use[e.move] = (use[e.move] || 0) + 1;
      if (e.type === 'hit' && e.a === 0) { const m = w.fighters[0].move || '?'; hit[m] = (hit[m] || 0) + 1; }
    }
  }
  console.log('game', n, w.results.rows.map(r => r.char + ' p' + r.place + ' kos' + r.kos).join(' | '), (w.frame/60).toFixed(0)+'s');
}
console.log('uses', use); console.log('hits', hit);
