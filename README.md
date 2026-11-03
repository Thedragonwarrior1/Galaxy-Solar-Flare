# GRAND BRAWL

A 3D anime-style pirate **platform fighting game** for the browser: Smash-style percentage damage and knockback, eight original fighters, four arenas, local and online multiplayer.

- **8 fighters, all unlocked from the start.** No unlock grind and no paywalls.
- **Game modes:** Free for All (up to 4), 1v1, 2v2, an 8-fighter Tournament, and Training.
- **Online play:** an authoritative Node.js server that runs the only real simulation.
- **Controls:** keyboard + mouse, gamepads (standard mapping) and touch.
- **All original content:** every character, arena, sound effect and music track is generated procedurally. No third-party art or audio is used.

---

## Quick start

You need **Node.js 18 or newer** and a WebGL2-capable browser (current Chrome, Edge, Firefox or Safari).

```bash
npm install
```

```bash
npm start
```

Then open **http://localhost:8080**. `npm start` builds the game into `dist/` and starts the server. The same server hosts online rooms at `ws://<host>:8080/ws`.

To use another port:

```bash
PORT=9000 npm start
```

### Other commands

| Command | What it does |
|---|---|
| `npm run build` | Production bundle → `dist/` (esbuild, minified) |
| `npm run dev` | Unminified build with source maps, then serve |
| `npm run serve` | Serve the existing `dist/` without rebuilding |
| `npm test` | All Node tests: combat sim, online server, arena contract, audio (41 tests) |
| `npm run test:e2e` | Browser end-to-end flows with Playwright/Chromium (needs Playwright installed) |
| `node scripts/simstats.mjs 3 7` | CPU-vs-CPU balance statistics (3 rounds of every pairing, CPU level 7) |
| `node tests/audio/run-audio-tests.mjs` | Renders and checks every SFX, music track and ambience in headless Chromium |

---

## Controls

All keyboard bindings can be changed in **Settings → Keyboard & mouse**. Movement is relative to the camera.

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move | `W A S D` | Left stick | Virtual stick |
| Jump / double jump | `Space` | A / Cross | JUMP |
| Basic attack (combo, dash attack, aerial) | Left click or `J` | X / Square | ATK |
| Heavy attack (hold to charge; neutral = launcher, with direction = smash) | Right click or `K` | RT | HVY |
| Special 1 | `Q` | Y / Triangle | Q |
| Special 2 | `E` | LB | E |
| Recovery special | `R` | LT | R |
| Ultimate (needs a full meter) | `F` | R3 or D-pad ↑ | ULT |
| Dodge (roll / spot dodge / air dodge) | `Shift` | B / Circle | DODGE |
| Block / parry (tap just before a hit to parry); attack while blocking = grab | `G` | RB | GUARD |
| Fast fall / drop through platforms / down-aerial | `C` | D-pad ↓ | ▼ |
| Rotate camera | `←` `→` | Right stick | — |
| Pause | `Esc` | Start | — |

**Ledges.** You grab ledges automatically when falling past an edge. While hanging: move toward the stage to climb, jump to jump, attack for a getup attack, dodge to roll in, or move away / `C` to let go.

**Local multiplayer.** P1 uses keyboard and mouse. P2–P4 use gamepads, assigned in order on the setup screen.

---

## How it plays

- **Damage and knockback.** Every hit raises the target's damage %. The higher it is, the further they fly. Knockback uses a Smash-style formula built from damage, percent, weight, base and scaling knockback, plus directional influence.
- **Ring-outs.** You win by knocking rivals past the arena's blast zones, not by reducing health to zero. Each fighter has a set number of stocks (default 3) and respawns on a floating platform with brief invulnerability.
- **Combat feel.** Hitstop freezes both fighters on impact. Hitstun and tumbling follow strong hits, and you can tech a landing with a well-timed block/dodge press.
- **Defence.** The shield wears down over time and can break. Parrying stuns the attacker. Clashing attacks cancel each other out, and projectiles can be destroyed.
- **Recovery.** Recovery specials can be used once per airtime and leave you helpless afterwards, so there is no infinite recovery.
- **Ultimate meter.** It fills from damage dealt and taken, plus a slow passive trickle. Ultimates freeze everyone briefly (about 0.6–0.8 s) for a short cinematic. A ground telegraph shows the area of effect.
- **Hazards.** Ship cannons, fortress barrages, sky winds and lava geysers are optional and off by default.

### The crew

| Fighter | Style | Q | E | R (recovery) | F (ultimate) |
|---|---|---|---|---|---|
| **Captain Rubber** | Elastic brawler | Stretch Pistol (long-range punch) | Gatling Rush (rapid punches) | Rubber Rocket (stretches to the ledge) | Titan Rubber Fist |
| **Threeblade** | Heavy sword fighter | Charged Slash (+ flying wave) | Lion Dash | Ascending Dragon (upward sword spin) | Nine-Path Tempest (multi-slash) |
| **Blaze Kick** | Fast fire martial artist | Flaming Spin Kick | Blaze Step (fire dash kick) | Phoenix Ascent | Inferno Meteor Heel |
| **Spatial Swordsman** | Tactical teleporter | Domain (slowing area control) | Phase Step (short teleport) | Spatial Shift (teleport) | Dimension Severance |
| **Ember King** | Fire projectile specialist | Fireball (chargeable) | Fire Dash | Eruption Leap (flame explosion) | Sovereign Sun |
| **Tempest** | Lightning & weather | Lightning Bolt | Weather Trap (storm cloud) | Lightning Dash | Eye of the Storm |
| **Monster Doctor** | Transformation brawler | Monster Punch (armored) | Rampage Charge | Mega Leap | Monster Rampage (12 s transformation) |
| **Slingshot Sniper** | Long-range tactician | Precision Shot (chargeable) | Boom Pellet (explosive) | Grapple Hook (tethers to ledges) | Meteor Barrage |

Every fighter also has a jab combo, a dash attack, two heavies, three aerials, grabs/throws and ledge/getup attacks. Each has unique stats: weight, run and air speed, gravity, fall speed and number of jumps. Character select shows each fighter's ratings, and you can hover an ability to watch it performed.

### Arenas

**Pirate Haven** (harbour docks, ships, ocean) · **Marine Fortress** (stone ramparts on several levels, towers) · **Sky Kingdom** (floating, bobbing islands, waterfalls, crystals) · **Volcanic Island** (basalt over a lava sea).

---

## Online play

1. One person runs `npm start` on a machine the others can reach (LAN IP, or a host with port 8080 open).
2. Everyone opens `http://<that-host>:8080` → **Online**. The server address is filled in automatically, and you can change it.
3. The host clicks **Create room** and shares the 4-letter code. Others enter it and click **Join**.
4. Everyone picks a fighter. Guests press **Ready**. The host sets the rules (mode, arena, stocks, time, hazards, CPU fill) and presses **Start match**.

**What the server controls.** It runs the authoritative 60 Hz simulation and streams 30 Hz snapshots. Clients send only stick and button inputs. Damage, stocks, knockouts and results are computed only on the server.

**What it rejects.** Bad input is validated and dropped: invalid fighters, non-host rule changes, unknown or fake message types, replayed input sequence numbers, over-long stick vectors and unknown button bits. Message floods get rate-limited and disconnected.

**Disconnects.** If a player disconnects mid-match, a CPU takes over their fighter.

> The playable web build (static page) has no server behind it. All offline modes work there, but **Online** needs `npm start`.

---

## Project layout

```
public/            index.html + style.css (copied into dist/)
src/shared/        authoritative simulation shared by browser and server (no DOM, no Three.js)
  sim/             world, fighter state machine, collision, knockback, hazards, CPU AI, arenas (collision)
  characters/      the 8 fighters: stats, moves (frame data, hitboxes, limb tracks), projectiles, ultimates
  protocol.js      network message validation + snapshot encoding
src/client/
  render/          Three.js renderer, procedural character models, IK animator, VFX, camera, arenas/
  audio/           Web Audio engine: synthesized SFX, procedural music, ambience
  input/           keyboard/mouse (rebindable), gamepad, touch
  ui/              menus, character select, HUD, results, tournament, online lobby
  net/             WebSocket client + snapshot interpolation
server/            HTTP static host + WebSocket rooms / authoritative match loop
tests/             node:test suites, e2e/ (Playwright), visual/ (arena + character harnesses), audio/
docs/              ARCHITECTURE.md
DEVELOPMENT_REPORT.md   what was built, how it was tested, known limitations
```

## Troubleshooting

- **Black screen or "WebGL is not available":** enable hardware acceleration in your browser.
- **Low frame rate:** in Settings, set Quality to **Low** or **Medium** and lower the **Resolution scale**.
- **No sound:** browsers only allow audio after you interact with the page, so click or press a key once.
- **Online "could not reach the server":** make sure `npm start` is running and that the address in the Online screen is reachable.

## Credits and licences

- **Original work:** all game content (code, characters, arenas, audio) was created for this project.
- **Libraries:** [Three.js](https://threejs.org) (MIT), [ws](https://github.com/websockets/ws) (MIT), [esbuild](https://esbuild.github.io) (MIT).
- **Fonts:** Bangers and Rubik via Google Fonts (SIL OFL).
