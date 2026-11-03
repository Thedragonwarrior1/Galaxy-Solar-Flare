# Visual & animation polish update

Every screenshot below comes from the game's own code. Gameplay frames are rendered by the Luau renderer. UI screens are flattened from the real GUI tree built by the client running headlessly (`tests/uisnap.luau`, rendered with `tools/uisnap2png.py`). The fonts in the UI snapshots are a stand-in, because Roblox renders its own Arcade and Luckiest Guy fonts.

## Phase 1: weaknesses found before the update

1. **Faces:** tiny 2×3 dot eyes, nearly identical across fighters, few readable expressions. Gear 2's face read as an orange blob.
2. **Hands:** single round blobs with no knuckles, fingers or thumb. Doflamingo's puppeteer hands were three stubs.
3. **Hair:** flat filled shapes with no strand clusters or highlights.
4. **Clothing:** almost no folds or creases, and a plain zigzag coat edge.
5. **Anatomy:** limbs were straight tubes with no shoulder, elbow or knee masses.
6. **Idles:** all seven used the same breathing template. Only Gear 4 bounced, and only by moving his feet. No Gear 5 laugh pose, no idle effects beyond Gear 2's steam.
7. **Attacks:** 4–6 frames each, mostly straight blends between two poses. No anticipation, overshoot or smear frames.
8. **Hit reactions:** two frames, with no difference between face and body hits, and a basic knockdown.
9. **Effects:** one generic spark burst for most hits.
10. **Main menu:** plain buttons over a demo fight, no title artwork, no PLAY / SETTINGS structure.
11. **Character select:** previews without character effects, no Power/Speed/Range ratings, no transitions.
12. **HUD:** basic bars, no damage flash, no animated KO, round start or combo pop.

## What changed

### Character art (Phase 2)

- **Face kit** (`tools/spritegen/faces.py`): character-specific eyes (round, narrow, droopy, sharp, toon with red rings), brows, mouths and scars for neutral, angry, shout, grin, hurt, KO and laugh. Doflamingo has shades; Katakuri has the stitched, toothed mouth.
- **Hands:** knuckle ridge, finger crease and thumb on fists. Open hands have fanned fingers; claws have curled second joints; there's also a pointing finger.
- **Anatomy:** deltoid shoulder caps and rounded elbow and knee joints.
- **Hair:** strand clusters and highlights. Bandana knot folds for Zoro; fabric creases on trousers and sleeves.
- **Clean silhouettes:** a pass fills pinholes and removes stray pixels, so outlines stay consistent with no gaps or floating clusters.
- **Scale:** rigs are 3–12% larger, with stance spacing scaled to match, so faces and hands have more pixels. Proportions stay identical across every frame because they come from one rig.

`art/screenshots/before_after_idle.png` compares the previous version (left) with the new one (right).

### Seven unique idle loops (Phases 3–7)

The poses are in `tools/spritegen/idles.py` (10–12 drawn frames each). The effect layers that run on their own timing are in `Render/CharacterFx.luau`.

| Fighter | Idle |
|---|---|
| Gear 2 | Boxer bounce on the balls of the feet, rolling shoulders, pumping fists. Separate steam wisps curl upward and fade around his arms, shoulders and back. |
| Gear 4 | Continuous bounce: compressed landing (squash), push-off, tucked airborne pose, extension, landing. Dust fires on each landing frame. His x position never drifts. |
| Gear 5 | Crouched low, one hand over his face, laughing. Shoulders shake, the head bobs, the hair bounces and the free hand slaps the floor. The floor itself bends under him: a separate visual layer that pushes the ground pixels down, with ripples and dust. |
| Doflamingo | Relaxed lean with weight shifts and a tilted head, fingers twitching between claw and open. Strings extend from his fingertips, sway and retract. |
| Enel | Head tipped back, hand on hip, staff swaying, drums bobbing, earlobes swinging. Arcs jump between the drums and the staff, with sparks and a faint glow. |
| Zoro | Controlled breathing, blade tips slowly circling, a grip re-adjustment, bandana tails moving. A glint travels along the blade. |
| Katakuri | Heavy breathing, trident sway, the free hand flexing. Mochi stretches from his forearm and snaps back. |

**State priority** is enforced by the fighter state machine (`Shared/Sim/Fighter.luau`): the idle animation only plays in the `idle` state. Attack, block, jump, damage and movement are separate states, so the idle can never interrupt them. When an action ends, the fighter returns to its own idle loop.

### Attacks (Phase 8)

Every attack, special and super is rebuilt with this structure (`enrich_attack` in `tools/spritegen/build.py`):

1. **Anticipation:** a counter-pose before the wind-up.
2. **Execution:** drawn in-between poses.
3. **Contact:** the active frames, the only frames that carry a hitbox.
4. **Follow-through:** an overshoot pose (recovery phase, so it has no hitbox).
5. **Recovery and settle:** a return to the stance.

**Smear frames** trace the striking fist or foot from its previous position, and blades sweep their whole arc. Fighters went from about 120 to 210–226 frames each. The tests still prove that every move first hits on an active frame and never outside it.

### Hit reactions and effects (Phase 9)

- **New hit reactions:** a gut hit (doubles over) for body-height contacts, and a face hit (head snaps back) for high contacts. Heavy hits stagger, the knockdown bounces with dust, the get-up runs 5 frames and landing has squash frames.
- **Character-specific impacts** (`Render/Effects.luau`): Gear 2 steam bursts, Gear 4 haki shockwave ring with smoke, Gear 5 cartoon star pop, Doflamingo string rays, Enel electric burst, Zoro cross-slashes and Katakuri mochi splat with droplets.
- **Scaling and timing:** effects scale from light to heavy to special to super, with debris on heavy hits. Hit-stop and screen shake are kept, and shake can be turned off in Settings.

### Menu, character select, HUD and transitions (Phases 10–12)

- **Main menu** (`UI/MainMenu.luau`):
  - a large gold gradient title over a **live showcase**: two fighters idle with all their effects and take turns showing off moves, and the pair and stage rotate
  - a vignette, and slim entries with a sliding gold bar and hover/selection animation
  - **PLAY** (Online 1v1 / VS CPU / 2 Players), **CHARACTER SELECT**, **TRAINING** and **SETTINGS** (screen shake, renderer, CPU level, round time)
- **Character select** (`UI/CharacterSelect.luau` + `UI/CharacterPreviewController.luau`):
  - animated P1 and P2 previews with the character effects (steam, bounce, laughing floor, strings, sparks, mochi)
  - name, title, style tag, **Power / Speed / Range** pips and description
  - a portrait strip with pop and selection highlight, a VS emblem, stage select
  - inspect mode, which cycles each fighter's attacks next to a docked move list
- **HUD** (`UI/FightingHUD.luau`): framed portraits, bevelled segmented health bars with a red trail, white hit flash and bar shake, nameplates, round gems, the AWAKENING meter under each bar, a double-framed timer that flashes under 10 s, combo pop, and sliding / zooming / slamming banners.
- **Results** (`UI/ResultsScreen.luau`): the winner performs a live victory animation.
- **Transitions** (`UI/TransitionController.luau`): a fast (~0.25 s) bar wipe on every screen change.
- **Training panel:** a compact bar below the fighters' feet.

## Requested controllers → modules

| Requested | Module |
|---|---|
| CharacterIdleController | `Render/CharacterFx.luau` (idle effect layers, frame events, ground bounce) + `tools/spritegen/idles.py` (idle frame sequences) |
| CharacterAnimationController | `Shared/Sim/Timeline.luau` + `Fighter.animRow` (state → animation, priorities) |
| AttackAnimationController | `enrich_attack` in the sprite build + phase-mapped playback in `Timeline.moveRow` |
| ParticleEffectController | `Render/Effects.luau` + `Render/CharacterFx.luau` |
| SpriteRenderer | `Render/Renderer.luau`, `Render/Raster.luau` / `Render/GuiRaster.luau`, `Render/SpriteLibrary.luau` |
| CharacterPreviewController | `UI/CharacterPreviewController.luau` |
| MenuController | `UI/MainMenu.luau` |
| HUDController | `UI/FightingHUD.luau` |
| TransitionController | `UI/TransitionController.luau` |

Effects never touch hitboxes or damage: all hit logic stays in the shared simulation. Effect lists are capped and recycled, the GUI backend pools its frames, and stage layers that are no longer shown are destroyed.

## Testing done for this update

- **Full suite:** all 42 tests pass, run with `lune run tests/run.luau`. That covers every normal hitting only in its active window for all seven fighters, L→M→H chains for every fighter, every special and super, blocking heights, rounds, CPU matches and fuzzing. It also runs the full headless client: menu (PLAY submenu, SETTINGS toggles), character select, training, a local match to the results screen, rematch, and online against the real server.
- **GUI-frames renderer:** the same client run in `tests/run_gui.luau`, with EditableImage disabled.
- **Idle showcase:** `tests/idle_shots.luau` renders every fighter's idle in-engine.
- **UI snapshots:** `art/screenshots/ui_*.png`.

Not verifiable here: real Roblox Studio rendering, touch hardware and live network latency.
