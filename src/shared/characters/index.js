// Character registry. ALL fighters are available from the start — no unlocks, no paywalls.
import captainRubber from './captainRubber.js';
import threeblade from './threeblade.js';
import blazeKick from './blazeKick.js';
import spatialSwordsman from './spatialSwordsman.js';
import emberKing from './emberKing.js';
import tempest from './tempest.js';
import monsterDoctor from './monsterDoctor.js';
import slingshotSniper from './slingshotSniper.js';

export const ROSTER = [captainRubber, threeblade, blazeKick, spatialSwordsman, emberKing, tempest, monsterDoctor, slingshotSniper];
export const CHARACTERS = Object.fromEntries(ROSTER.map((c) => [c.id, c]));
export const CHARACTER_IDS = ROSTER.map((c) => c.id);
export const MOVE_LABELS = {
  jab1: 'Basic (LMB)', dash: 'Dash Attack (LMB while running)', upHeavy: 'Neutral Heavy (RMB)', fwdHeavy: 'Directional Heavy (RMB + move)',
  nair: 'Air Basic (LMB in air)', fair: 'Air Heavy (RMB in air)', dair: 'Down Air (C + attack in air)',
  sp1: 'Special (Q)', sp2: 'Special (E)', sp3: 'Recovery (R)', ult: 'Ultimate (F)',
};
