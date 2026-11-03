# GRAND BRAWL — Architecture

## Technology
- **Client:** Three.js 0.170 (WebGL2) + HTML/CSS UI, bundled by esbuild into `dist/game.js`.
- **Server:** Node.js (`server/server.js`): static file host + authoritative WebSocket match server (`ws`).
- **Shared simulation:** `src/shared/**` is pure JavaScript (no DOM, no Three.js). The browser runs it for
  local matches; the server runs the *same code* for online matches. Clients only ever send inputs.

## Layout
```
src/shared/sim/        deterministic 60 Hz combat simulation (world, fighter, collision, knockback, AI, hazards)
src/shared/characters/ the 8 fighters: stats + move data (frame data, hitboxes, effector tracks, VFX/SFX cues)
src/shared/protocol.js network message schema + validation
src/client/render/     Three.js renderer, toon materials, character models, procedural animator, VFX, camera
src/client/render/arenas/  the 4 arena environments (visual only; collision lives in src/shared/sim/arenas.js)
src/client/audio/      WebAudio engine: synthesized SFX + procedural music + ambience (all original, no files)
src/client/input/      keyboard/mouse, gamepad, touch -> unified per-player input frames
src/client/ui/         menus, character select, HUD, results, settings, training, tournament, online lobby
src/client/net/        WebSocket client + snapshot interpolation
server/                server.js (http + ws), rooms
tests/                 node:test unit/integration tests, tests/e2e Playwright browser tests
```

## Simulation conventions
- Fixed timestep: 60 frames per second. All timings in move data are **frames**.
- Y is up. Fighter `pos` is the centre of the feet. `facing` is a yaw angle (radians); forward vector = `(sin(facing), 0, cos(facing))`.
- Fighter-local cylindrical coordinates used by move data: `[angleDeg, radius, height]` where angle 0 = forward,
  +90 = fighter's right, radius = horizontal distance from the body axis, height above the feet.

## Sim events (world.events, emitted each frame; also relayed in online snapshots)
`move{id,move}` `hit{a,t,x,y,z,dmg,kb,el,heavy,deadly}` `shieldHit{a,t,x,y,z}` `shieldBreak{t}` `parry{a,t,x,y,z}`
`clank{x,y,z}` `jump{id,air}` `land{id,hard}` `dodge{id,air}` `ledge{id}` `ko{id,x,y,z,by,style}` `respawn{id}`
`projSpawn{pid,kind,owner}` `projEnd{pid,kind,x,y,z,reason}` `explode{x,y,z,r,el,owner}` `ultStart{id,char,move}`
`transform{id,on}` `hazardWarn{kind,x,y,z,dir}` `hazard{kind,x,y,z,dir}` `fx{name,id,x,y,z,...}` `sfx{name,id}`
`countdown{n}` `go{}` `timeUp{}` `gameEnd{}`

## Audio contract (`src/client/audio/audio.js`)
```js
export class AudioEngine {
  unlock()                          // call from a user gesture; creates/resumes AudioContext
  setVolumes({ music, sfx })        // 0..1 each
  play(name, { vol=1, rate=1, pan=0 } = {})   // one-shot SFX by name (unknown name = silent no-op)
  playMusic(trackId)                // crossfades; ids listed below
  stopMusic(fadeSeconds = 1)
  setAmbience(id | null)            // 'ocean' | 'fortress' | 'sky' | 'volcano'
  duck(amount = 0.5, seconds = 1.5) // temporarily lower music (ultimates, KOs)
}
```
Music track ids: `menu`, `select`, `pirate_haven`, `marine_fortress`, `sky_kingdom`, `volcanic_island`, `results`, `tournament`.

## Arena visual contract (`src/client/render/arenas/index.js`)
```js
export function buildArena(arenaId, ctx) -> {
  group,                 // THREE.Group with all arena visuals (caller adds to scene)
  sun,                   // main THREE.DirectionalLight (caller configures shadows); must be inside group
  platformObjects,       // { [platformId]: THREE.Object3D } positioned by caller each frame from sim (moving platforms)
  update(time, dt),      // animate water, flags, clouds, lava, particles...
  background,            // THREE.Color | THREE.Texture for scene.background
  fog,                   // THREE.Fog | null
  dispose(),
}
// ctx = { quality: 'low'|'medium'|'high', arena: ARENAS[arenaId] }
```
