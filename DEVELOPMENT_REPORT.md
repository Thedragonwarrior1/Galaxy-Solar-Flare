# GRAND BRAWL — Development Report

## 1. Engine and technology choice

**Choice:** Three.js (WebGL2) in the browser, with a Node.js authoritative WebSocket server. One shared simulation module runs on both.

The deciding factor was the build environment, a headless Linux cloud container:

- **Godot, Unity and Unreal could not be used.** The Godot download was blocked by the network policy, Unity and Unreal can't be installed or run headless there, and none of them could be visually tested in that environment.
- **A browser engine could be fully tested.** The container has headless Chromium with WebGL2 (SwiftShader). That let me run the real game, screenshot every screen and drive automated end-to-end tests: two-browser online matches, a simulated gamepad and a phone-sized touch viewport.

Against the brief's criteria:

| Requirement | How the stack covers it |
|---|---|
| 3D rendering | Three.js gives toon materials, shadows, bloom post-processing and instancing. |
| Physics and knockback | A purpose-built 60 Hz platform-fighter simulation in plain JavaScript. It is deterministic, has no rendering dependency, and runs ~100k steps/s in Node. A generic rigid-body engine would have fought fighting-game rules, not helped. |
| Animation | Procedural keyed effector tracks plus inverse kinematics, sharing data with the hitboxes. |
| Multiplayer | Node + `ws`, with the identical sim module running server-side. That makes server authority straightforward and the server testable in-process. |
| Controller support | Browser Gamepad API (standard mapping). |
| UI | HTML/CSS overlay. |
| Running and distribution | No install: runs in any modern browser, including phones and tablets, and can be published as a static web page. |

## 2. Architecture

- **`src/shared/sim`** — the authoritative, deterministic combat simulation:
  - world, fighter state machine, collision
  - knockback (Smash-style formula plus directional influence)
  - hazards, CPU AI
  - arena collision data
- **`src/shared/characters`** — eight data-driven fighters:
  - stats and per-move frame data
  - hitboxes and limb/weapon effector tracks
  - per-frame scripted events (teleports, tethers, projectiles, zones, transformation)
  - cooldowns and ultimates
- **`src/client`** — the browser front end:
  - renderer (procedural models, animator, VFX, camera)
  - audio (procedural synthesis)
  - input (keyboard/mouse, gamepad, touch)
  - UI (all screens)
  - net client (snapshot interpolation)
- **`server`** — static hosting and rooms/lobby, running the same `World` at 60 Hz with 30 Hz snapshots.

**Key design decision: one data source for hitboxes and animation.** Each attack defines *effector tracks*: keyed paths of hands, feet and weapon tips in fighter-local space.

- The **sim** evaluates the tracks to place hitboxes, sampling at sub-frame steps so fast swings can't pass through a target between frames.
- The **renderer** evaluates the same tracks as IK targets for the limbs.
- A shared **reach clamp** keeps the tracks physically reachable for non-stretchy bodies, and enlarges the hitbox by whatever was clamped.

Hitbox start frames are auto-aligned with fast strike segments. As a result, attack animations line up with their hitboxes by construction. A unit test drives every move of every character against a dummy, and the in-game training mode can draw the live hitboxes.

## 3. What was implemented

**Core gameplay**
- Percentage damage, plus knockback built from damage, percent, weight, base and scaling knockback.
- Launch angles: fixed, automatic ("Sakurai"), radial, pull and spikes. Directional influence bends the launch.
- Launch velocity decays independently of gravity, which is capped at fall speed.
- Combat timing: hitstun, tumbling, hitstop (with an extra freeze on KO-worthy hits), move recovery and landing lag.
- Movement: acceleration, ground friction, fast turnarounds, short hop / full hop, double or triple jumps, fast fall, air control and drop-through platforms.
- Defence: rolls, spot dodges and directional air dodges, each with intangibility frames. Shields wear down and can break; there is a parry window, grabs/throws, and clanks between attacks.
- Ledges: auto-grab with diminishing invulnerability, plus climb, jump, roll and attack options. Moving platforms are supported.
- Ring-outs on all six sides of the arena, with KO credit going to the last attacker. Respawn on a platform with invulnerability.
- Anti-stuck handling: a fighter deep inside solid geometry is popped onto its top, and a fighter coming up from below bonks off the underside.
- Simultaneous hits resolve symmetrically: everything is collected first, then applied, so trades and clanks don't depend on processing order.
- One hit per hit-group per target, unless a move is explicitly a multi-hit (`rehit`).

**Fighters**
- 8 fighters, each with: a 2–3 hit jab combo, dash attack, neutral heavy, directional heavy, neutral/forward/down aerials, three specials, an ultimate, grab/throw, and ledge and getup attacks.
- Distinct stats for each: weight, speeds, gravity, fall speed, jumps and size.
- Each one's listed signature abilities are implemented, including teleports, ledge-seeking tethers, a slowing domain, storm-cloud and spring traps, chargeable projectiles, explosions, and a 12-second super-armored transformation.
- **Ultimates:** a 34–50-frame cinematic in which the other fighters freeze, a camera close-up, a ground telegraph of the area, a name banner, and a unique effect and sound for each fighter.

**Arenas**
- Pirate Haven, Marine Fortress, Sky Kingdom and Volcanic Island, built from procedural geometry with painted canvas textures, water/lava/cloud shaders, animated flags, sails, waterfalls, smoke and embers.
- Optional hazards (cannons, barrages, wind, geysers) are simulated authoritatively and are off by default.

**Modes**
- Free for All (2–4 fighters, any mix of players and CPUs, CPU levels 1–9).
- 1v1, and 2v2 with team colours and optional friendly fire.
- Tournament: an 8-fighter single-elimination bracket. The CPU-vs-CPU matches really run in headless simulation.
- Training: dummy behaviours, dummy % slider, position reset, a hitbox/hurtbox overlay, frame-data readout, combo counter and infinite ultimate.
- Online: rooms with codes, lobby, host rules and CPU fill.

**UI**
- Animated 3D main menu and mode select.
- Match setup: players, devices and rules.
- Character select:
  - all 8 portraits (rendered from the actual models at startup) and an animated 3D lineup
  - name, title, style, personality and description, plus six rating bars
  - ability list with hover-to-preview on the 3D model
  - player indicators, gamepad cursors for P2–P4, and CPU picks
- Arena select with a live 3D preview, results screen, tournament bracket, pause menu, credits and settings.
- Settings: music/SFX volume, quality presets, resolution scale, VFX intensity, screen shake, camera sensitivity, fullscreen, touch-control mode, and keyboard rebinding. They are saved to localStorage.

**HUD**
- Player cards: portrait, large colour-ramped damage % with a pop animation, a high-% warning pulse, stocks, ultimate meter with a "ULT READY" flash, and Q/E/R cooldown rings (R shows "used" in the air).
- Timer, countdown, "GAME!"/"TIME!" banners, KO notifications, ultimate banner with speed lines, and floating player tags that clamp to the screen edge.
- The results screen shows winner, rankings, stocks, damage dealt/taken, KOs, falls, best combo and match duration, with Rematch, Character select and Main menu buttons.

**VFX**
- Pooled GPU particles, velocity-stretched sparks, anime impact stars and flashes, shockwave rings, explosions, and weapon/limb ribbon trails coloured per fighter.
- Lightning bolts, and visuals for the domain/sever domes, fire pillars, tornado, storm cloud, ground slams and every projectile.
- Knockback smoke trails, high-% steam, KO blast beams with water/lava splashes, and respawn effects.
- Hit effects vary by element (punch, slash, fire, lightning, spatial…). Camera shake scales with hit strength and can be turned off. Particle density scales with quality and the VFX-intensity setting.

**Audio**
- 94 synthesized sound effects: UI, movement, combat, elements, character-specific sets and one ultimate sound per fighter.
- 8 procedural music tracks (menu, select, one per arena, results, tournament) and 4 ambience beds.
- Stereo panning follows world position, music ducks during ultimates and KOs, and volume controls are provided.
- Attack sounds are cued from move frame data, so they land on the animation.

**Multiplayer**
- What it handles: match creation and joining, synced lobby state (fighters, ready, teams, rules), and authoritative 60 Hz server simulation streamed as 30 Hz snapshots.
- Client side: snapshot interpolation with an ~83 ms buffer, and events replayed in sync with render time.
- Disconnects: a CPU takes over a disconnected fighter.
- What the server rejects:
  - invalid fighter IDs and malformed or unknown messages
  - non-host rule changes or starts
  - replayed input sequence numbers
  - over-long stick vectors (clamped) and unknown button bits (masked)
  - floods: rate limit plus disconnect
- Clients cannot send damage, stocks, positions or results at all; there is no message type for them.
- Cooldowns, attack ranges and movement speeds live entirely in the server sim.

## 4. What was tested (and how)

**`npm test` — 41 Node tests, all passing**
- **Simulation (18):**
  - Roster completeness and distinct movesets/stats.
  - Knockback scaling with percent and weight.
  - No double registration from multi-hitbox moves; designed multi-hits; symmetric simultaneous attacks.
  - Shield blocking and parry.
  - Ring-out + KO credit + respawn invulnerability; falling under every arena ends in a ring-out, and fighters are never left inside geometry.
  - Double/triple jump, drop-through and landing; one recovery per airtime; cooldowns; ledge grab and climb.
  - **Every damaging move of every fighter connects with its hitboxes.**
  - Ultimate meter gating and freezing.
  - Monster transformation on and off.
  - Full CPU matches finishing cleanly on all 4 arenas × FFA/1v1/2v2 (with and without hazards).
  - Friendly fire off; time-out ranking.
- **Online (3):** real WebSocket clients against the server:
  - Lobby sync; name sanitising; rejected invalid fighters, garbage JSON, fake "damage" messages and non-host settings/start.
  - Ready gating.
  - A full authoritative match:
    - identical snapshot state and identical results on both clients
    - clamped impossible stick input (no abnormal speed)
    - masked unknown button bits and ignored replayed sequence numbers
    - server-registered hits and KOs
  - Rematch.
  - Rate-limit disconnect, bot takeover on disconnect, and empty-room cleanup.
  - 3 clients + CPU fill playing 2v2 to completion.
- **Arena contract (13)** and **audio (7)**, from the arena/audio work.
- One timing note: the first online test drives a scripted client in real time. It failed once while the 6-browser e2e suite was running on the same 4-core machine, and passed on every isolated run (3 of 3).

**`npm run test:e2e` — 6 browser flows in headless Chromium, all passing**
1. Main menu → mode → setup → character select → arena → FFA match, driven by real keyboard and mouse input.
2. 1v1 to "GAME!" → results table → Rematch → pause → quit; training (dummy % slider, hitbox overlay, frame data); settings persistence; tournament (bracket → match → results → round 2, with the 3 other quarterfinals simulated).
3. Combat and ultimate capture: heavy impact, launch, special, ultimate cinematic and multi-hit combo.
4. **Online with two separate browsers:** create room, join by code, pick fighters, ready, host starts, both see identical fighters, guest self-destructs, both show the same server-decided winner, with no console errors.
5. Phone landscape (iPhone 13 profile, touch): the layout fits and the virtual buttons drive the fighter.
6. Simulated standard gamepad: D-pad/A menu navigation, plus the stick and X button in a match.

**Visual review.** Screenshots were reviewed for all screens, all four arenas (each quality level and orbit angle), every fighter's model, idle and attack poses, and the ultimates of every fighter.

**Audio verification (headless).** Every SFX, music track and ambience bed was rendered offline and checked for silence, NaN, clipping, loudness balance and loop-point continuity.

**Balance (CPU-vs-CPU, 112 matches, CPU level 7)**
- Matches average about 2.4 minutes for 3 stocks. KOs happen at an average of 111–138%. There are almost no self-destructs.
- Win rates: Ember King 71%, Threeblade 64%, Blaze Kick 64%, Monster Doctor 57%, Spatial Swordsman 54%, Tempest 46%, Captain Rubber 29%, Slingshot Sniper 14%.
- These reflect how well the *CPU* plays each kit as much as the kit itself. The Sniper relies on spacing and keep-away that the CPU doesn't use well. Human playtesting should drive further tuning.

**Performance**
- The simulation costs 0.04–0.14 ms per frame for 4 fighters.
- A 4-fighter match on High quality is about 440–590 draw calls (including the shadow pass) and 150–230k triangles.
- Arenas alone are 45–83 draw calls.
- The production bundle is 1.05 MB of JavaScript.

## 5. What remains unfinished / known limitations (honest list)

- **Art pipeline.** Characters are *procedurally sculpted* from primitives with cel shading, painted face textures and outlines. They are original and consistent, but they are not hand-sculpted, rigged models from a DCC tool such as Blender, which wasn't available. Animation is likewise *procedural*: keyed limb tracks + IK + per-state poses, not motion capture or hand-keyed rig animation. It is real animation that lines up with the hitboxes, but a professional animator would add squash/stretch, secondary motion and more nuanced timing.
- **No human playtesting.** All tuning was done with automated CPU matches and frame-data reasoning; nobody has played it by hand. Game feel (speeds, hitstun, knockback curve) should be playtested and tuned, and Slingshot Sniper especially needs it.
- **Online.** The client renders from interpolated server snapshots with no client-side prediction, so there is roughly RTT + ~83 ms of input delay on remote connections. That's fine on LAN, noticeable on high-ping links. There is no matchmaking, NAT traversal, accounts or reconnection; the host shares a room code and everyone connects to the same server. Online modes are FFA/1v1/2v2; there are no online tournaments.
- **Real-hardware performance was not measured.** The container only has a software GPU, which runs about 2–10 fps. The draw-call and triangle budgets above are typical of smooth 60 fps on mid-range GPUs, but this wasn't measured on real hardware. On low-end or mobile devices, use Low or Medium.
- **Browsers and devices.** Only Chromium was tested. Firefox and Safari use the same standard APIs but were not run. Gamepad support was verified with a simulated standard-mapping pad, not a physical controller.
- **Audio.** Audio was verified numerically, not by ear. The full SFX bank holds about 30 MB of decoded audio in memory.
- **Minor.** Only keyboard bindings are rebindable (gamepad uses a fixed standard layout). The tournament is player-vs-CPU only. There is no "Exit" button in the browser build, except when the page was opened by a script or installed as an app.

## 6. How to launch

The commands are `npm install` and then `npm start`; then open http://localhost:8080. The README has controls, modes and online-play steps.
