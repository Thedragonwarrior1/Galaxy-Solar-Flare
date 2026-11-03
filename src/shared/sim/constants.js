// Core tuning constants for the GRAND BRAWL combat simulation.
export const FPS = 60;
export const DT = 1 / FPS;

// Input button bits (held state). Edges are derived inside the sim.
export const BTN = {
  JUMP: 1 << 0,
  ATTACK: 1 << 1, // basic attack (LMB / X)
  HEAVY: 1 << 2, // heavy / smash attack (RMB)
  SP1: 1 << 3, // special Q
  SP2: 1 << 4, // special E
  SP3: 1 << 5, // recovery special R
  ULT: 1 << 6, // ultimate F
  DODGE: 1 << 7, // Shift
  SHIELD: 1 << 8, // G (block / parry); in air acts as air dodge
  DOWN: 1 << 9, // fast fall / drop through platforms
};
export const BTN_ALL = (1 << 10) - 1;
export const BTN_NAMES = Object.keys(BTN);

export const INPUT_BUFFER = 8; // frames a press stays buffered

// Knockback (Smash-style formula; see knockback.js)
export const KB = {
  LAUNCH_SCALE: 0.255, // launch speed (u/s) per knockback unit
  DECAY: 25, // u/s^2 deceleration of launch velocity
  HITSTUN_MULT: 0.4, // hitstun frames per knockback unit
  TUMBLE: 80, // knockback above which the victim tumbles
  HITLAG_BASE: 4,
  HITLAG_PER_DMG: 0.38,
  HITLAG_MAX: 20,
  DI_YAW: 0.26, // radians of max horizontal directional influence
  DI_PITCH: 0.17, // radians of max vertical influence
};

export const SHIELD = {
  MAX: 50,
  DECAY: 0.14, // per frame held
  REGEN: 0.08, // per frame released
  PARRY_WINDOW: 5, // frames after raising shield that count as a parry
  DROP_LAG: 7,
  BREAK_STUN: 200,
  MIN_TO_RAISE: 6,
};

export const LEDGE = {
  INV_FIRST: 40,
  MAX_HANG: 300,
  REGRAB_CD: 26,
  CLIMB: 22,
  ROLL: 30,
  JUMP_INV: 4,
};

export const RULES = {
  DEFAULT_STOCKS: 3,
  RESPAWN_DELAY: 80,
  RESPAWN_PLATFORM_MAX: 150,
  RESPAWN_INV: 120,
  KO_CREDIT_FRAMES: 480,
  COUNTDOWN: 180,
  END_DELAY: 100,
  ULT_MAX: 100,
  ULT_GAIN_DEALT: 0.9,
  ULT_GAIN_TAKEN: 0.55,
  ULT_GAIN_PASSIVE: 0.012, // per frame, slow trickle so every match sees ultimates
  PCT_MAX: 999,
};

export const DEG = Math.PI / 180;
