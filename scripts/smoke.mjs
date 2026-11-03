import { World } from '../src/shared/sim/world.js';
import { CHARACTER_IDS, CHARACTERS } from '../src/shared/characters/index.js';
const w = new World({ arena: 'pirate_haven', mode: 'ffa', stocks: 3, players: [{ char: 'captain_rubber' }, { char: 'threeblade' }], skipCountdown: true });
for (let i = 0; i < 120; i++) w.step([]);
console.log(w.fighters.map(f => [f.state, f.grounded, f.pos]));
for (const id of CHARACTER_IDS) { const c = CHARACTERS[id]; console.log(id, Object.keys(c.moves).length, Object.values(c.moves).map(m=>m.key+':'+m.startup).join(' ')); }
