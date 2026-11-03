// Node-side unit tests for the audio module (no Web Audio here): import safety, API no-ops before
// unlock, required SFX names, music data validity. Run: node --test tests/audio/audio-node.test.js
// The browser render/playback tests live in tests/audio/run-audio-tests.mjs (headless Chromium).
import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine, audio, SFX_NAMES, MUSIC_TRACKS, AMBIENCE_IDS, EAGER_SFX, isUiSound, trackInfo } from '../../src/client/audio/audio.js';
import { parseMelody, parseChords, compileTrack, getTrack } from '../../src/client/audio/music.js';
import { SFX } from '../../src/client/audio/sfx.js';
import { createSimAudio, ULT_SFX, ARENA_AUDIO } from '../../src/client/audio/simEvents.js';

const REQUIRED_SFX = `
ui_move ui_select ui_back ui_start ui_error char_hover char_pick ready countdown go game_set time_up crowd_cheer crowd_ooh victory_fanfare defeat_sting
jump djump land land_hard dodge airdodge run_step ledge_grab respawn tech
whoosh_light whoosh_med whoosh_heavy hit_light hit_med hit_heavy hit_deadly shield_on shield_hit shield_break parry clank grab throw ko_blast ko_star
charge ult_ready ult_activate explosion_small explosion_big hazard_warn cannon_fire wind_gust geyser splash lava_splash
punch_light punch_heavy kick_light kick_heavy slash_light slash_heavy sword_ring fire_whoosh fire_burst fireball flame_roar lightning_zap thunder spark
rubber_stretch rubber_snap rubber_boing gatling spatial_hum spatial_cut teleport_out teleport_in domain_open monster_roar monster_thud transform
sling_twang pellet_pop trap_set trap_snap grapple_fire grapple_reel storm_wind
ult_rubber ult_threeblade ult_blaze ult_spatial ult_ember ult_tempest ult_monster ult_sniper`.trim().split(/\s+/);

test('every required SFX name exists', () => {
  const missing = REQUIRED_SFX.filter((n) => !SFX_NAMES.includes(n));
  assert.deepEqual(missing, []);
  for (const n of EAGER_SFX) assert.ok(SFX_NAMES.includes(n), n);
});

test('SFX recipes are sane', () => {
  for (const n of SFX_NAMES) {
    const r = SFX[n];
    assert.equal(typeof r.fn, 'function', n);
    assert.ok(r.dur > 0 && r.dur <= 3.5, `${n} dur ${r.dur}`);
    assert.ok(r.level > 0 && r.level <= 1.2, `${n} level`);
  }
  for (const n of SFX_NAMES.filter((x) => x.startsWith('ult_') && !['ult_ready', 'ult_activate'].includes(x))) {
    assert.ok(SFX[n].dur >= 1.5 && SFX[n].dur <= 2.6, `${n} ultimate length ${SFX[n].dur}`);
  }
  assert.ok(isUiSound('ui_move') && isUiSound('victory_fanfare'));
  assert.ok(!isUiSound('hit_light') && !isUiSound('nope'));
});

test('music track ids match the architecture contract', () => {
  assert.deepEqual([...MUSIC_TRACKS].sort(), ['marine_fortress', 'menu', 'pirate_haven', 'results', 'select', 'sky_kingdom', 'tournament', 'volcanic_island']);
  assert.deepEqual([...AMBIENCE_IDS], ['ocean', 'fortress', 'sky', 'volcano']);
});

test('every track compiles with a 16-32 bar loop and multiple sections', () => {
  for (const id of MUSIC_TRACKS) {
    const info = trackInfo(id);
    const loopBars = info.bars - info.loopStartBar;
    assert.ok(loopBars >= 16 && loopBars <= 32, `${id}: loop of ${loopBars} bars`);
    assert.ok(new Set(info.sections).size >= 2, `${id}: sections ${info.sections}`);
    assert.ok(info.bpm >= 90 && info.bpm <= 170, `${id}: bpm`);
    const T = getTrack(id);
    const notes = T.events.reduce((s, e) => s + (e ? e.length : 0), 0);
    assert.ok(notes > info.bars * 8, `${id}: only ${notes} events`);
  }
  assert.equal(trackInfo('pirate_haven').stepsPerBar, 6, 'pirate_haven is in 6/8');
});

test('pattern language validates bar lengths', () => {
  assert.equal(parseMelody('C5*4 D5*4 | E5*8 |', 2, 8).length, 3);
  assert.throws(() => parseMelody('C5*3 | D5*8', 2, 8), /bar line/);
  assert.throws(() => parseMelody('C5*4', 2, 8), /expected 16/);
  assert.equal(parseChords('Dm | Gm A7', 2, 16).length, 32);
  assert.throws(() => parseChords('Dm | Gm', 3, 16), /expected 3/);
  assert.throws(() => compileTrack({ id: 'x', bpm: 120, form: ['A'], sections: { A: { bars: 1, chords: 'C', drums: { k: 'x..' } } } }), /pattern length/);
});

test('engine API is a safe no-op before unlock (and in Node)', async () => {
  const e = new AudioEngine();
  assert.equal(e.ready, false);
  assert.equal(e.play('hit_light'), null);
  const warn = console.warn;
  let warnings = 0;
  console.warn = () => { warnings++; };
  try {
    e.play('definitely_not_a_sound');
    e.play('definitely_not_a_sound');
  } finally { console.warn = warn; }
  assert.equal(warnings, 1, 'unknown names warn once');
  e.playMusic('menu');
  e.setAmbience('ocean');
  e.setAmbience(null);
  e.duck(0.5, 1);
  e.stopMusic();
  e.setVolumes({ music: 0.25 });
  e.setVolumes({ sfx: 2, music: NaN });
  assert.deepEqual(e.volumes, { music: 0.25, sfx: 1, ambience: 1, master: 1 });
  assert.equal(await e.unlock(), false, 'no window/AudioContext in node');
  assert.ok(audio instanceof AudioEngine);
});

test('sim event glue maps events to existing sounds', () => {
  const calls = [];
  const mock = {
    play: (name, o) => { calls.push([name, o]); return null; },
    duck: (a, s) => calls.push(['duck', a, s]), playMusic: (id) => calls.push(['music', id]), setAmbience: (id) => calls.push(['amb', id]),
  };
  const sa = createSimAudio(mock);
  sa.handle([
    { type: 'hit', x: 14, dmg: 12, el: 'slash', heavy: true, deadly: false },
    { type: 'hit', x: -3, dmg: 2, el: 'punch' },
    { type: 'hit', x: 0, dmg: 20, el: 'fire', deadly: true },
    { type: 'ko', x: 0, style: 'water' }, { type: 'ultStart', id: 0, char: 'tempest' },
    { type: 'jump', id: 1, air: true }, { type: 'land', id: 1, hard: true }, { type: 'sfx', name: 'gatling', id: 1 },
    { type: 'hazard', kind: 'geyser', x: 2 }, { type: 'countdown', n: 3 }, { type: 'go' }, { type: 'gameSet' },
  ], { cameraX: 0, halfWidth: 14, posOf: () => ({ x: -14 }) });
  const names = calls.filter((c) => typeof c[1] === 'object').map((c) => c[0]);
  for (const n of names) assert.ok(SFX_NAMES.includes(n), `unknown sfx ${n}`);
  assert.deepEqual(names.slice(0, 4), ['hit_heavy', 'slash_heavy', 'hit_light', 'punch_light']);
  assert.ok(names.includes('hit_deadly') && names.includes('ko_blast') && names.includes('splash') && names.includes('ult_tempest'));
  assert.ok(names.includes('djump') && names.includes('land_hard') && names.includes('geyser') && names.includes('game_set'));
  assert.equal(calls[0][1].pan, 0.75, 'world x at the right edge pans right');
  assert.equal(calls.find((c) => c[0] === 'gatling')[1].pan, -0.75, 'posOf() pans id-only events');
  assert.ok(calls.some((c) => c[0] === 'duck'));
  for (const u of Object.values(ULT_SFX)) assert.ok(SFX_NAMES.includes(u), u);
  for (const a of Object.values(ARENA_AUDIO)) { assert.ok(MUSIC_TRACKS.includes(a.music)); assert.ok(AMBIENCE_IDS.includes(a.ambience)); }
  sa.enterArena('sky_kingdom');
  assert.deepEqual(calls.slice(-2), [['music', 'sky_kingdom'], ['amb', 'sky']]);
});
