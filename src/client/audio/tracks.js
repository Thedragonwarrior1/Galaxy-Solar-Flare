// GRAND BRAWL audio — original procedural music compositions.
// Notation (see music.js): melodies are step tokens ("D5*4" = D5 held 4 steps, ".*2" = rest,
// "|" = bar line, validated), chords are one or more symbols per bar, drum patterns are
// per-step strings (X accent, x hit, o ghost, r/R roll) repeating every bar (or every N bars).
// `parts` = [instrument, style, options] accompaniment generators driven by the chords.

const MENU_A = `
  D5*6 A4*2 D5*2 E5*2 F5*4 | G5*4 F5*2 E5*2 D5*4 F5*4 | C5*6 A4*2 C5*2 F5*2 A5*4 | G5*8 E5*4 C5*4 |
  D5*6 A4*2 D5*2 E5*2 F5*4 | G5*4 A5*2 Bb5*2 A5*4 G5*4 | Bb5*4 G5*2 Bb5*2 A5*4 E5*2 C#5*2 | D5*12 .*4 |`;
const MENU_B = `
  F5*4 D5*4 Bb4*4 D5*4 | C5*8 A4*4 C5*4 | E5*4 G5*4 C6*6 Bb5*2 | A5*12 F5*4 |
  F5*4 G5*2 F5*2 D5*4 Bb4*4 | C5*4 F5*4 A5*8 | G5*4 F5*4 Bb5*4 A5*4 | A5*8 E5*4 C#5*4 |`;

const SELECT_A = `
  B4*2 D5*2 .*2 G5*4 F#5*2 G5*2 A5*2 | B5*4 G5*2 E5*2 .*4 E5*2 F#5*2 | G5*2 E5*2 C5*2 E5*2 G5*4 A5*2 G5*2 | F#5*8 .*4 D5*2 E5*2 |
  B4*2 D5*2 .*2 G5*4 F#5*2 G5*2 B5*2 | C6*4 B5*2 G5*2 .*4 E5*2 G5*2 | A5*4 C6*2 B5*2 A5*4 F#5*4 | G5*8 .*8 |`;
const SELECT_B = `E5*8 G5*8 | F#5*8 A5*8 | D5*8 F#5*8 | G5*8 B5*8 | C6*8 A5*8 | F#5*8 D5*8 | G5*8 B5*8 | A5*16 |`;

const JIG_A = `
  D5*2 A4 D5 E5 F5 | E5*2 C5 G4 C5 E5 | F5 E5 D5 A5*2 F5 | E5 D5 C#5 A4*3 |
  D5*2 A4 D5 E5 F5 | G5 F5 E5 C5 D5 E5 | F5 E5 D5 C#5 B4 C#5 | D5*4 .*2 |`;
const JIG_B = `
  C5 F5 A5 A5 G5 F5 | G5*2 E5 C5*2 E5 | F5 D5 Bb4 D5 F5 Bb5 | A5*3 F5 G5 A5 |
  C6 A5 F5 A5 G5 F5 | E5 G5 C6 G5 E5 C5 | D5 G5 Bb5 A5 E5 C#5 | D5*4 .*2 |`;

const MARCH_A = `
  G4*3 G4 G4*4 D5*6 C5*2 | Bb4*3 A4 G4*4 D4*8 | Eb5*3 D5 C5*4 Bb4*4 G4*4 | F4*3 G4 A4*4 C5*8 |
  G4*3 G4 G4*4 D5*6 F5*2 | G5*6 F5*2 Eb5*4 D5*4 | C5*3 D5 Eb5*4 D5*4 F#4*4 | G4*12 .*4 |`;
const MARCH_B = `
  Bb4*4 Eb5*4 G5*6 F5*2 | F5*8 D5*4 Bb4*4 | C5*4 F5*4 A5*6 G5*2 | G5*12 D5*4 |
  Eb5*4 G5*4 Bb5*6 G5*2 | F5*8 D5*4 F5*4 | Eb5*4 D5*4 C5*4 Eb5*4 | D5*8 A4*4 F#4*4 |`;

const SKY_A = `
  E5*4 A5*4 C#6*6 B5*2 | B5*8 G#5*4 E5*4 | F#5*4 A5*4 C#6*4 E6*4 | D6*12 .*2 C#6*2 |
  C#6*4 B5*2 A5*2 E5*4 A5*4 | G#5*4 B5*4 E6*6 D6*2 | C#6*4 B5*4 A5*4 G#5*4 | A5*12 .*4 |`;
const SKY_B = `
  F#5*3 A5*3 D6*2 .*2 C#6*2 D6*2 E6*2 | C#6*8 A5*4 E5*4 | D5*3 F#5*3 B5*2 .*2 A5*2 B5*2 C#6*2 | A5*8 F#5*4 C#5*4 |
  F#5*3 A5*3 D6*2 .*2 E6*2 F#6*2 E6*2 | C#6*8 E6*4 C#6*4 | D6*4 C#6*4 B5*4 G#5*4 | B5*16 |`;
const SKY_C = `C#6*8 A5*8 | F#5*8 A5*8 | E5*8 A5*8 | B5*16 | C#6*8 E6*8 | D6*8 A5*8 | B5*8 G#5*8 | E5*16 |`;

const VOLC_B = `
  B4*2 E5*2 G5*2 B5*4 A5*2 G5*2 F#5*2 | G5*4 E5*4 C5*4 E5*4 | D5*2 G5*2 B5*2 D6*4 C6*2 B5*2 A5*2 | A5*8 F#5*4 D5*4 |
  B4*2 E5*2 G5*2 B5*4 C6*2 B5*2 G5*2 | E6*6 D6*2 C6*4 G5*4 | A5*4 C6*4 E6*4 C6*4 | B5*8 D#5*4 F#5*4 |`;
const VOLC_C = `E4*16 | G4*8 E4*8 | A4*16 | B4*8 F#4*8 | E4*8 G4*8 | C5*8 B4*8 | A4*8 C5*8 | B4*16 |`;

const RESULTS_A = `
  D5*6 F5*2 Bb5*8 | A5*4 G5*2 F5*2 C5*8 | D5*6 G5*2 Bb5*6 A5*2 | G5*12 .*4 |
  D5*6 F5*2 Bb5*6 C6*2 | C6*4 A5*4 F5*8 | G5*4 Bb5*4 A5*4 C6*4 | Bb5*12 .*4 |`;
const RESULTS_B = `G5*8 Bb5*8 | A5*8 C6*8 | F5*8 A5*8 | D5*8 G5*8 | Eb5*8 G5*8 | F5*8 A5*8 | G5*8 Eb5*8 | F5*16 |`;

const TOUR_B = `
  C5*6 D5*2 Eb5*8 | C5*6 Bb4*2 Ab4*8 | F4*4 Ab4*4 C5*4 F5*4 | D5*8 B4*8 |
  G5*6 F5*2 Eb5*8 | Eb5*6 F5*2 C5*8 | Ab5*4 G5*4 F5*4 Eb5*4 | D5*8 G4*4 B4*4 |`;
const TOUR_C = `
  Eb5*4 Ab5*4 C6*6 Bb5*2 | Bb5*8 F5*4 D5*4 | G5*4 Bb5*4 C6*4 Eb6*4 | C6*12 .*2 Bb5*2 |
  Ab5*4 G5*2 F5*2 C5*4 F5*4 | D5*4 G5*4 B5*8 | C6*4 Bb5*2 Ab5*2 G5*4 Eb5*4 | D5*8 B4*4 G4*4 |`;

export const TRACKS = {
  // Rousing title theme: D minor heroics, brass + accordion + driving drums
  menu: {
    id: 'menu', bpm: 130, meter: [4, 4], master: 0.8,
    delay: { beats: 0.75, fb: 0.25, g: 0.4 },
    patterns: {
      intro: { k: 'X.......X.......', t3: '........x...x.x.' },
      adventure: { k: 'X.....x.X.....x. X.....x.X..x..x.', s: '....X.......X... ....X.......X..o', h: 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.xo', sh: '.o.o.o.o.o.o.o.o' },
      adventure2: { k: 'X.....x.X.x...x.', s: '....X..o....X.o.', o: '..x...x...x...x.', sh: 'oooooooooooooooo' },
      toms: { k: 'X...X...X...X...', s: '....X.......X...', t3: 'x.x.....x.x.....', t2: '....x.x.....x.x.' },
    },
    sections: {
      I: { bars: 2, chords: 'Dm | A', drums: 'intro', fill: 'build',
        parts: [['stab', 'stabs', { pat: 'X.....X.....X...', low: 57 }], ['timpani', 'roots', { pat: 'X.......x.x.x.x.', low: 38, len: 3 }], ['bass', 'pedal']] },
      A: { bars: 8, chords: 'Dm | Bb | F | C | Dm | Bb | Gm A7 | Dm', melody: MENU_A, lead: 'lead', double: ['accordion', 0, 0.55],
        drums: 'adventure', crash: true, fill: 'tom',
        parts: [['bass', 'root8'], ['pluck', 'arp8', { low: 57, vel: 0.7 }], ['pad', 'pad', { low: 50, vel: 0.6 }]] },
      B: { bars: 8, chords: 'Bb | F | C | Dm | Bb | F | Gm | A', melody: MENU_B, lead: 'brass', harmony: 'brass',
        drums: 'adventure2', crash: true, fill: 'snare',
        parts: [['bass', 'syncop'], ['accordion', 'offbeat', { low: 57, vel: 0.6 }], ['pad', 'pad', { low: 50, vel: 0.5 }]] },
      A2: { bars: 8, chords: 'Dm | Bb | F | C | Dm | Bb | Gm A7 | Dm', melody: MENU_A, lead: 'saw', harmony: 'accordion', double: ['brass', -1, 0.45],
        drums: 'adventure', crash: true, fill: 'big',
        parts: [['bass', 'gallop'], ['stab', 'stabs', { pat: 'X...............', low: 55 }], ['pluck', 'arp16', { low: 62, vel: 0.45 }], ['pad', 'pad', { low: 50, vel: 0.6 }]] },
      C: { bars: 4, chords: 'Bb | C | Dm | A', drums: 'toms', fill: 'build',
        parts: [['stab', 'stabs', { pat: 'X..X..X...X.X...', low: 55 }], ['bass', 'drive16'], ['timpani', 'roots', { pat: 'X...X...X...X...', low: 38, len: 2 }], ['choir', 'pad', { low: 52 }]] },
    },
    form: ['I', 'A', 'B', 'A2', 'C'], loopTo: 1,
  },

  // Light, bouncy character-select loop in G major
  select: {
    id: 'select', bpm: 138, meter: [4, 4], swing: 0.1, master: 0.85,
    delay: { beats: 0.75, fb: 0.22, g: 0.35 },
    patterns: {
      light: { k: 'X.....x...X.....', cl: '....x.......x...', h: '..x...x...x...x.', sh: 'xoxoxoxoxoxoxoxo' },
      light2: { k: 'X.........X.....', r: '....x.......x..o', sh: 'xoxoxoxoxoxoxoxo', o: '..............x.' },
    },
    sections: {
      A: { bars: 8, chords: 'G | Em | C | D | G | Em | Am D | G', melody: SELECT_A, lead: 'lead', drums: 'light', fill: 'tom',
        parts: [['bass', 'syncop'], ['marimba', 'offbeat', { low: 60, vel: 0.8 }], ['pluck', 'arp8', { low: 55, vel: 0.5 }]] },
      B: { bars: 8, chords: 'C | D | Bm | Em | Am | D | G | D', counter: SELECT_B, counterInst: 'bell', drums: 'light2', fill: 'snare',
        parts: [['bass', 'walk'], ['pluck', 'arp16', { low: 60, vel: 0.5 }], ['pad', 'pad', { low: 52, vel: 0.6 }]] },
      A2: { bars: 8, chords: 'G | Em | C | D | G | Em | Am D | G', melody: SELECT_A, lead: 'flute', double: ['bell', 1, 0.35], harmony: 'pluck',
        drums: 'light', crash: true, fill: 'tom',
        parts: [['bass', 'syncop'], ['marimba', 'offbeat', { low: 60, vel: 0.7 }], ['pad', 'pad', { low: 52, vel: 0.45 }]] },
    },
    form: ['A', 'B', 'A2'], loopTo: 0,
  },

  // Jaunty 6/8 sea-shanty jig: accordion + fiddle, D minor / F major
  pirate_haven: {
    id: 'pirate_haven', bpm: 116, meter: [2, 3], master: 0.85,
    reverb: { secs: 1.8, decay: 3, g: 0.5 },
    patterns: {
      jig: { b: 'X..x..', sh: 'xooxoo' },
      jig2: { b: 'X..X.o', tb: '.ox.ox', sh: 'xooxoo', cl: '...x..' },
    },
    sections: {
      I: { bars: 2, chords: 'Dm | A', drums: 'jig', fill: 'jig',
        parts: [['bass', 'jig'], ['accordion', 'oompah', { low: 57, vel: 0.7 }]] },
      A: { bars: 8, chords: 'Dm | C | Dm | A | Dm | C | Bb A | Dm', melody: JIG_A, lead: 'accordion', drums: 'jig', fill: 'jig',
        parts: [['bass', 'jig'], ['pluck', 'oompah', { low: 55, vel: 0.85 }]] },
      A2: { bars: 8, chords: 'Dm | C | Dm | A | Dm | C | Bb A | Dm', melody: JIG_A, lead: 'fiddle', harmony: 'accordion', drums: 'jig2', fill: 'jig',
        parts: [['bass', 'jigwalk'], ['accordion', 'oompah', { low: 53, vel: 0.5 }], ['pluck', 'oompah', { low: 57, vel: 0.5 }]] },
      B: { bars: 8, chords: 'F | C | Bb | F | F | C | Gm A | Dm', melody: JIG_B, lead: 'fiddle', double: ['accordion', -1, 0.45], drums: 'jig2', fill: 'jig',
        parts: [['bass', 'jig'], ['accordion', 'oompah', { low: 55, vel: 0.55 }], ['pluck', 'arp', { every: 1, low: 60, vel: 0.35, shape: [0, 2, 1, 3, 2, 1] }]] },
      B2: { bars: 8, chords: 'F | C | Bb | F | F | C | Gm A | Dm', melody: JIG_B, lead: 'accordion', harmony: 'fiddle', drums: 'jig2', fill: 'jig',
        parts: [['bass', 'jigwalk'], ['pluck', 'oompah', { low: 55, vel: 0.8 }], ['pad', 'pad', { low: 50, vel: 0.4 }]] },
    },
    form: ['I', 'A', 'A2', 'B', 'B2'], loopTo: 1,
  },

  // Martial, snare-driven march with brass, G minor
  marine_fortress: {
    id: 'marine_fortress', bpm: 112, meter: [4, 4], master: 0.8,
    patterns: {
      cadence: { s: 'X.ooX.ooX.x.x.x. X.ooX.oorrrrRRRR', k: 'X.......X....... X.......X.......' },
      march: { k: 'X.......X....... X.......X...x...', s: 'X.o.x.o.X.o.x.rr X.o.x.o.X.oox.RR' },
      march2: { k: 'X...x...X...x...', s: 'X.oox.ooX.oorrrr X.oox.ooX.ooRRRR', h: '..x...x...x...x.' },
      roll: { k: 'X...X...X...X...', s: 'rrrrrrrrrrrrrrrr', t3: 'X.......X.......' },
    },
    sections: {
      I: { bars: 2, chords: 'Gm | D', drums: 'cadence',
        parts: [['timpani', 'roots', { pat: 'X.......X.......', low: 38, len: 4 }], ['bass', 'pedal']] },
      A: { bars: 8, chords: 'Gm | Gm | Eb | F | Gm | Eb | Cm D | Gm', melody: MARCH_A, lead: 'brass', double: ['fiddle', 1, 0.35],
        drums: 'march', crash: true, fill: 'snare',
        parts: [['bass', 'march'], ['strings', 'ostinato', { low: 43, vel: 0.7 }], ['stab', 'stabs', { pat: 'X.......x.x.....', low: 55 }]] },
      B: { bars: 8, chords: 'Eb | Bb | F | Gm | Eb | Bb | Cm | D', melody: MARCH_B, lead: 'brass', harmony: 'brass',
        drums: 'march2', fill: 'build',
        parts: [['bass', 'march'], ['strings', 'ostinato', { low: 43, vel: 0.7 }], ['pad', 'pad', { low: 50, vel: 0.55 }], ['timpani', 'roots', { pat: 'X.......x.......', low: 38, len: 4 }]] },
      A2: { bars: 8, chords: 'Gm | Gm | Eb | F | Gm | Eb | Cm D | Gm', melody: MARCH_A, lead: 'lead', leadOct: 1, double: ['brass', -1, 0.6],
        drums: 'march2', crash: true, fill: 'tom',
        parts: [['bass', 'march'], ['strings', 'ostinato', { low: 43, vel: 0.7 }], ['stab', 'stabs', { pat: 'X.......x.x.....', low: 55 }], ['timpani', 'roots', { pat: 'X.......X.......', low: 38, len: 4 }]] },
      C: { bars: 4, chords: 'Gm | Eb | Cm | D', drums: 'roll', fill: 'big',
        parts: [['lowbrass', 'stabs', { pat: 'X..X..X.X..X..X.', low: 43, len: 2 }], ['bass', 'pulse8'], ['timpani', 'roots', { pat: 'X...X...X...X...', low: 38, len: 2 }], ['choir', 'pad', { low: 55 }]] },
    },
    form: ['I', 'A', 'B', 'A2', 'C'], loopTo: 1,
  },

  // Airy, fast A-major adventure with bell arps
  sky_kingdom: {
    id: 'sky_kingdom', bpm: 152, meter: [4, 4], master: 0.8,
    delay: { beats: 0.75, fb: 0.32, g: 0.45 }, reverb: { secs: 2.6, decay: 2.4, g: 0.6, bright: 0.6 },
    patterns: {
      sky: { k: 'X...x...X...x...', cl: '....X.......X...', h: 'xxXxxxXxxxXxxxXx' },
      sky2: { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', sh: 'oxoxoxoxoxoxoxox' },
      sparse: { k: 'X...............', h: '..x...x...x...x.' },
    },
    sections: {
      A: { bars: 8, chords: 'A | E | F#m | D | A | E | D E | A', melody: SKY_A, lead: 'saw', drums: 'sky', crash: true, fill: 'snare',
        parts: [['bass', 'root8'], ['bell', 'arp16', { low: 64, vel: 0.6 }], ['pad', 'pad', { low: 57, vel: 0.6 }]] },
      B: { bars: 8, chords: 'D | A | Bm | F#m | D | A | Bm E | E', melody: SKY_B, lead: 'flute', double: ['bell', 0, 0.4], drums: 'sky2', fill: 'tom',
        parts: [['bass', 'syncop'], ['pluck', 'arp8', { low: 60, vel: 0.6 }], ['pad', 'pad', { low: 57, vel: 0.55 }]] },
      A2: { bars: 8, chords: 'A | E | F#m | D | A | E | D E | A', melody: SKY_A, lead: 'lead', harmony: 'saw', drums: 'sky', crash: true, fill: 'big',
        parts: [['bass', 'gallop'], ['bell', 'arp16', { low: 64, vel: 0.55 }], ['stab', 'stabs', { pat: 'X...........x...', low: 57 }]] },
      C: { bars: 8, chords: 'F#m | D | A | E | F#m | D | E | E', counter: SKY_C, counterInst: 'bell', drums: 'sparse', fill: 'build',
        parts: [['bell', 'arp16', { low: 64, vel: 0.45 }], ['pad', 'pad', { low: 54, vel: 0.7 }], ['bass', 'half']] },
    },
    form: ['A', 'B', 'A2', 'C'], loopTo: 0,
  },

  // Intense, driving E-minor battle track: toms, low brass, choir
  volcanic_island: {
    id: 'volcanic_island', bpm: 160, meter: [4, 4], master: 0.78, mix: { bass: 0.42, lowbrass: 0.5, strings: 1.3, choir: 1.2 },
    reverb: { secs: 2.0, decay: 2.8, g: 0.5, bright: 0.35 },
    patterns: {
      tomsIntro: { k: 'X...............', t3: 'X.....X.....X...', t2: '..............x.' },
      drive: { k: 'X..x..X...X.x...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', t3: 'x...............' },
      drive2: { k: 'X.xx..X.X.xx..X.', s: '....X.......X..o', h: 'xxxxxxxxxxxxxxxx', t3: '..x.......x.....' },
      heavy: { k: 'X.......X.......', t3: 'X.....X...X.....', t2: '....X.......X..x', s: '........X.......' },
    },
    sections: {
      I: { bars: 4, chords: 'Em | Em | C | B', drums: 'tomsIntro', fill: 'big',
        parts: [['lowbrass', 'roots', { pat: 'X...........X...', low: 40, len: 10 }], ['bass', 'pedal'], ['choir', 'pad', { low: 52, vel: 0.8 }]] },
      A: { bars: 8, chords: 'Em | Em | C | D | Em | Em | C | B', drums: 'drive', crash: true, fill: 'tom',
        parts: [['lowbrass', 'stabs', { pat: 'X..X..X...X.X...', low: 40, len: 1.5 }], ['bass', 'drive16'], ['strings', 'ostinato', { low: 52, vel: 0.7 }]] },
      B: { bars: 8, chords: 'Em | C | G | D | Em | C | Am | B', melody: VOLC_B, lead: 'saw', drums: 'drive2', crash: true, fill: 'big',
        parts: [['bass', 'drive16'], ['lowbrass', 'stabs', { pat: 'X.......X.......', low: 40, len: 3 }], ['strings', 'ostinato', { low: 52, vel: 0.6 }], ['choir', 'pad', { low: 55, vel: 0.6 }]] },
      C: { bars: 8, chords: 'Em | C | Am | B | Em | C | Am | B', melody: VOLC_C, lead: 'lowbrass', drums: 'heavy', fill: 'build',
        parts: [['choir', 'pad', { low: 55 }], ['bass', 'half'], ['timpani', 'roots', { pat: 'X.......X.......', low: 40, len: 4 }], ['strings', 'ostinato', { low: 52, vel: 0.5 }]] },
      D: { bars: 4, chords: 'C | D | Em | B', drums: 'drive2', fill: 'big',
        parts: [['lowbrass', 'stabs', { pat: 'X.X.X.X.X.X.X.X.', low: 40, len: 1.2 }], ['bass', 'drive16'], ['choir', 'pad', { low: 55 }], ['timpani', 'roots', { pat: 'X...X...X...X...', low: 40, len: 2 }]] },
    },
    form: ['I', 'A', 'B', 'C', 'D'], loopTo: 1,
  },

  // Triumphant but relaxed results loop, Bb major
  results: {
    id: 'results', bpm: 100, meter: [4, 4], swing: 0.12, master: 0.85,
    patterns: {
      chill: { k: 'X.......x.x.....', r: '....x.......x...', sh: 'xoxoxoxoxoxoxoxo' },
    },
    sections: {
      A: { bars: 8, chords: 'Bb | F/A | Gm | Eb | Bb | F | Eb F | Bb', melody: RESULTS_A, lead: 'brass', leadVel: 0.85, drums: 'chill',
        parts: [['bass', 'walk'], ['pluck', 'strum', { pat: 'x.....x...x.....', low: 55, vel: 0.7 }], ['pad', 'pad', { low: 50, vel: 0.55 }]] },
      B: { bars: 8, chords: 'Eb | F | Dm | Gm | Cm | F | Eb | F', counter: RESULTS_B, counterInst: 'bell', drums: 'chill', fill: 'tom',
        parts: [['bass', 'walk'], ['marimba', 'arp8', { low: 58, vel: 0.7 }], ['pad', 'pad', { low: 50, vel: 0.6 }]] },
    },
    form: ['A', 'B'], loopTo: 0,
  },

  // Dramatic tournament bracket theme: builds from pulsing strings to full band, C minor
  tournament: {
    id: 'tournament', bpm: 122, meter: [4, 4], master: 0.8, mix: { bass: 0.38, timpani: 0.35, strings: 1.3 },
    reverb: { secs: 2.4, decay: 2.5, g: 0.55 },
    patterns: {
      pulse: { k: 'X.......X.......', h: '..x...x...x...x.' },
      tour: { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
      tour2: { k: 'X.....x.X.x...x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', t3: '..............xx', o: '......x.........' },
      climax: { k: 'X..X..X.X..X..X.', s: '....X.......X...', t3: 'X..X..X.X..X..X.', h: 'x.x.x.x.x.x.x.x.' },
    },
    sections: {
      A: { bars: 8, chords: 'Cm | Ab | Fm | G | Cm | Ab | Fm | G', drums: 'pulse', fill: 'build',
        parts: [['strings', 'ostinato', { low: 53, vel: 0.75, pat: ['r', 'r', '5', 'r', '8', 'r', '5', 'r'] }], ['timpani', 'roots', { pat: 'X.......x.......', low: 36, len: 4 }], ['pad', 'pad', { low: 55, vel: 0.5 }], ['bass', 'pedal']] },
      B: { bars: 8, chords: 'Cm | Ab | Fm | G | Cm | Ab | Fm | G', melody: TOUR_B, lead: 'brass', drums: 'tour', crash: true, fill: 'snare',
        parts: [['strings', 'ostinato', { low: 48, vel: 0.7 }], ['bass', 'pulse8'], ['timpani', 'roots', { pat: 'X.......x.......', low: 36, len: 4 }], ['pad', 'pad', { low: 48, vel: 0.5 }]] },
      C: { bars: 8, chords: 'Ab | Bb | Gm Cm | Ab | Fm | G | Ab | G', melody: TOUR_C, lead: 'saw', double: ['brass', -1, 0.55], drums: 'tour2', crash: true, fill: 'big',
        parts: [['bass', 'gallop'], ['strings', 'ostinato', { low: 48, vel: 0.6 }], ['stab', 'stabs', { pat: 'X.....X.....X...', low: 55 }], ['timpani', 'roots', { pat: 'X.......X.......', low: 36, len: 4 }], ['choir', 'pad', { low: 55, vel: 0.6 }]] },
      D: { bars: 4, chords: 'Cm | Ab | Bb | G', drums: 'climax', fill: 'build',
        parts: [['stab', 'stabs', { pat: 'X..X..X.X..X..X.', low: 55 }], ['bass', 'drive16'], ['timpani', 'roots', { pat: 'X.X.X.X.X...X...', low: 36, len: 1.5 }], ['choir', 'pad', { low: 55 }]] },
    },
    form: ['A', 'B', 'C', 'D'], loopTo: 1,
  },
};
