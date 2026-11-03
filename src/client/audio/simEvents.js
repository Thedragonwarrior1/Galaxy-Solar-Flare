// Optional glue between the simulation and the AudioEngine: maps world.events (see
// docs/ARCHITECTURE.md "Sim events") to sounds, with stereo panning from world X and music ducking
// for ultimates / KOs. Usage (once per rendered frame, after stepping the sim):
//
//   import { createSimAudio } from './audio/simEvents.js';
//   const simAudio = createSimAudio();                 // uses the shared `audio` engine
//   simAudio.handle(world.events, { cameraX, halfWidth });
//
// Everything here is additive: callers may instead call audio.play() directly.
import { audio as sharedAudio } from './audio.js';

export const ULT_SFX = Object.freeze({
  captain_rubber: 'ult_rubber', threeblade: 'ult_threeblade', blaze_kick: 'ult_blaze', spatial_swordsman: 'ult_spatial',
  ember_king: 'ult_ember', tempest: 'ult_tempest', monster_doctor: 'ult_monster', slingshot_sniper: 'ult_sniper',
});

/** element -> [light, heavy] flavour layer played on top of the generic hit_* impact */
const ELEMENT_SFX = {
  punch: ['punch_light', 'punch_heavy'], kick: ['kick_light', 'kick_heavy'], slash: ['slash_light', 'slash_heavy'],
  fire: ['fire_burst', 'fire_burst'], lightning: ['spark', 'lightning_zap'], spatial: ['spatial_cut', 'spatial_cut'],
  pellet: ['pellet_pop', 'pellet_pop'], trap: ['trap_snap', 'trap_snap'],
};
const HAZARD_SFX = { cannon: 'cannon_fire', barrage: 'cannon_fire', wind: 'wind_gust', geyser: 'geyser' };
const KO_STYLE_SFX = { water: 'splash', lava: 'lava_splash', star: 'ko_star', cloud: 'wind_gust' };

/** Stage ambience + music for each arena id. */
export const ARENA_AUDIO = Object.freeze({
  pirate_haven: { music: 'pirate_haven', ambience: 'ocean' },
  marine_fortress: { music: 'marine_fortress', ambience: 'fortress' },
  sky_kingdom: { music: 'sky_kingdom', ambience: 'sky' },
  volcanic_island: { music: 'volcanic_island', ambience: 'volcano' },
});

export function createSimAudio(engine = sharedAudio) {
  let view = { cameraX: 0, halfWidth: 14 };
  const pan = (x) => (typeof x === 'number' ? Math.max(-1, Math.min(1, (x - (view.cameraX || 0)) / (view.halfWidth || 14))) * 0.75 : 0);
  const play = (name, x, vol = 1, rate = 1) => engine.play(name, { vol, rate, pan: pan(x) });
  const xOf = (e) => (typeof e.x === 'number' ? e.x : view.posOf && e.id !== undefined ? (view.posOf(e.id) || {}).x : undefined);

  function event(e) {
    switch (e.type) {
      case 'sfx': if (e.name) play(e.name, xOf(e), e.vol ?? 1); break;
      case 'hit': {
        const size = e.deadly ? 'hit_deadly' : e.heavy ? 'hit_heavy' : (e.dmg >= 8 ? 'hit_med' : 'hit_light');
        play(size, e.x);
        const el = ELEMENT_SFX[e.el];
        if (el) play(el[e.heavy || e.deadly ? 1 : 0], e.x, 0.75);
        if (e.deadly) engine.duck(0.45, 0.8);
        break;
      }
      case 'shieldHit': play('shield_hit', e.x); break;
      case 'shieldBreak': play('shield_break', e.x); break;
      case 'parry': play('parry', e.x); break;
      case 'clank': play('clank', e.x); break;
      case 'jump': play(e.air ? 'djump' : 'jump', xOf(e)); break;
      case 'land': play(e.hard ? 'land_hard' : 'land', xOf(e)); break;
      case 'dodge': play(e.air ? 'airdodge' : 'dodge', xOf(e)); break;
      case 'ledge': play('ledge_grab', xOf(e)); break;
      case 'respawn': play('respawn', xOf(e)); break;
      case 'ko': {
        play('ko_blast', e.x);
        const extra = KO_STYLE_SFX[e.style];
        if (extra) play(extra, e.x, 0.8);
        play('crowd_ooh', 0, 0.55);
        engine.duck(0.6, 1.6);
        break;
      }
      case 'explode': play(e.r >= 3 ? 'explosion_big' : 'explosion_small', e.x); if (e.el === 'fire') play('fire_burst', e.x, 0.5); break;
      case 'ultStart': {
        play('ult_activate', xOf(e));
        const u = ULT_SFX[e.char];
        if (u) play(u, xOf(e));
        engine.duck(0.65, 2.2);
        break;
      }
      case 'transform': if (e.on) play('transform', xOf(e)); break;
      case 'hazardWarn': play('hazard_warn', e.x, 0.8); break;
      case 'hazard': { const h = HAZARD_SFX[e.kind]; if (h) play(h, e.x); break; }
      case 'countdown': play('countdown'); break;
      case 'go': play('go'); break;
      case 'timeUp': play('time_up'); break;
      case 'gameSet': play('game_set'); engine.duck(0.7, 2.5); break;
      default: break;
    }
  }

  return {
    /** Process one frame's (or snapshot's) events. view = { cameraX, halfWidth, posOf(id) -> {x} } for panning. */
    handle(events, v) {
      if (v) view = v;
      if (!events) return;
      for (const e of events) event(e);
    },
    event,
    /** Start an arena's music + ambience. */
    enterArena(arenaId) {
      const a = ARENA_AUDIO[arenaId];
      if (!a) return;
      engine.playMusic(a.music);
      engine.setAmbience(a.ambience);
    },
  };
}
