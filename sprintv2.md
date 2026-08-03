# Path Protocol — V2 Sprint Plan

## 1. Purpose

This file is the live implementation tracker for the Path Protocol V2
rearchitecture described in [`architecturev2.md`](architecturev2.md).

V2 is treated as a new codebase inside the existing repository. It replaces the
V1 SVG renderer and synthesized audio implementation with:

- React 19 for screens and discrete UI.
- One imperative PixiJS WebGL canvas for gameplay.
- A framework-neutral fixed-step game engine.
- External SVG media loaded as Pixi vector graphics.
- Default-first, per-element theme inheritance.
- Howler.js audio with WAV sources, WebM delivery, and MP3 fallback.

## 2. Status and sizing conventions

### Status

| Status | Meaning |
|---|---|
| `TODO` | Work has not started. |
| `IN PROGRESS` | Work is actively being implemented. |
| `BLOCKED` | Work cannot continue until a dependency or decision is resolved. |
| `DONE` | Implementation, relevant tests, and documentation are complete. |

Only mark a task `DONE` when its implementation and proportional verification
are complete. Update this file in the same change that completes the task.

### Shirt sizes

| Size | Expected scope |
|---|---|
| `XS` | Very small, isolated change. |
| `S` | Small change with limited tests. |
| `M` | Several related changes or a new focused module. |
| `L` | Cross-module feature with substantial tests. |
| `XL` | Major subsystem or broad migration requiring staged verification. |

Sizes express relative complexity and risk, not calendar estimates.

## 3. Current progress summary

| Sprint | Outcome | Status |
|---|---|---|
| Sprint 0 | V2 decisions and branch foundation | `DONE` |
| Sprint 1 | Configuration contracts and registries | `DONE` |
| Sprint 2 | Default SVG media library | `DONE` |
| Sprint 3 | Audio source and conversion pipeline | `DONE` |
| Sprint 4 | Generated manifests and theme resolution | `DONE` |
| Sprint 5 | Framework-neutral engine foundation | `DONE` |
| Sprint 6 | Input, movement, and collision | `DONE` |
| Sprint 7 | Targets, scoring, bonuses, and trails | `DONE` |
| Sprint 8 | Hazards, coins, and powers | `DONE` |
| Sprint 9 | PixiJS WebGL renderer | `DONE` |
| Sprint 10 | React, Howler, and persistence integration | `DONE` |
| Sprint 11 | Campaign migration and validation | `DONE` |
| Sprint 12 | Quality, Docker, and release readiness | `IN PROGRESS` |
| Sprint 13 | Campaign expansion to 70 levels | `DONE` |
| Sprint 14 | Dynamic obstacle variety and Micro Protocols | `DONE` |
| Sprint 15 | 16:9 world and 100-level mechanic campaign | `DONE` |
| Sprint 16 | Seeded full-board campaign diversity | `DONE` |
| Sprint 17 | Server-backed Theme Workshop | `DONE` |
| Sprint 18 | SQLite accounts and theme ownership | `DONE` |
| Sprint 19 | Open-media texture proof theme | `DONE` |
| Sprint 20 | Theme media library and player theme selection | `DONE` |

---

## Sprint 0 — V2 Decisions and Branch Foundation

**Outcome:** The V2 direction is documented and isolated from main development.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S0-01 | Create V2 feature branch | XS | `DONE` | Create and switch to `feature/pixijs-rearchitecture`. |
| V2-S0-02 | Record renderer decision | XS | `DONE` | Select PixiJS with WebGL only and one imperative canvas mounted by React. |
| V2-S0-03 | Record simulation decision | XS | `DONE` | Select a deterministic fixed 60 Hz engine with animation-frame rendering. |
| V2-S0-04 | Record media inheritance decision | S | `DONE` | Define complete defaults and per-element theme overrides for SVG and audio. |
| V2-S0-05 | Record SVG rendering strategy | XS | `DONE` | Use explicit vector mode first and reserve texture mode for a later phase. |
| V2-S0-06 | Record audio strategy | S | `DONE` | Select Howler, WAV masters, WebM preferred delivery, MP3 fallback, and looping ambience. |
| V2-S0-07 | Create Architecture V2 | L | `DONE` | Create `architecturev2.md` as the technical and product source of truth. |
| V2-S0-08 | Create live V2 sprint tracker | M | `DONE` | Create this file with task sizes, statuses, dependencies, and completion rules. |
| V2-S0-09 | Update repository agent instructions | M | `DONE` | Replace conflicting V1 technology guidance in `AGENTS.md` with V2 rules. |
| V2-S0-10 | Update project README direction | S | `DONE` | Describe the V2 branch, new stack, media commands, and development workflow. |
| V2-S0-11 | Capture dependency licenses | S | `DONE` | Record PixiJS, Howler, and future tooling licenses in the repository. |

### Sprint 0 exit criteria

- V2 architectural decisions are documented.
- Work is isolated on the V2 branch.
- Agent and contributor guidance no longer conflicts with V2.
- New dependency license requirements are recorded.

---

## Sprint 1 — Configuration Contracts and Registries

**Outcome:** Every gameplay and presentation object has a validated,
theme-neutral contract.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S1-01 | Define media ID registry | M | `DONE` | Create the authoritative list of arena, token, obstacle, target, bonus, coin, and power media IDs. |
| V2-S1-02 | Define sound ID registry | S | `DONE` | Create the authoritative logical IDs for effects and default ambience. |
| V2-S1-03 | Design level schema V2 | L | `DONE` | Fully specify arena, object, generation, motion, tracking, reward, scoring, bonus, and media attributes. |
| V2-S1-04 | Add required media IDs to level schema | M | `DONE` | Require a valid theme-neutral `mediaId` for every renderable level object. |
| V2-S1-05 | Add movement tuning schema | S | `DONE` | Define acceleration, maximum speed, deceleration, and keyboard steering settings. |
| V2-S1-06 | Design media metadata schema | M | `DONE` | Validate `mediaId`, category, source, vector render mode, sizing behavior, and version. |
| V2-S1-07 | Design theme schema V2 | M | `DONE` | Define theme identity and optional per-element visual and audio overrides. |
| V2-S1-08 | Design audio settings schema | M | `DONE` | Validate complete per-sound volume, cooldown, loop, fade, and channel entries. |
| V2-S1-09 | Update power-up schema | M | `DONE` | Require media IDs, sound IDs, keys, prices, score gates, duration, and effect parameters. |
| V2-S1-10 | Implement configuration validator | L | `DONE` | Validate all JSON before creating a level session and return actionable diagnostics. |
| V2-S1-11 | Add safe production configuration error screen | M | `DONE` | Show a player-safe startup failure while retaining detailed development diagnostics. |
| V2-S1-12 | Add schema unit tests | L | `DONE` | Cover valid configs, missing required fields, unknown IDs, invalid ranges, and additional properties. |

### Sprint 1 exit criteria

- Every configuration type has a versioned JSON Schema.
- Every renderable object requires a registered media ID.
- Invalid defaults stop startup with a useful error.
- Schema behavior is covered by automated tests.

---

## Sprint 2 — Default SVG Media Library

**Outcome:** Current code-generated visuals become complete, external,
vector-compatible default SVG assets.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S2-01 | Create default media directory structure | S | `DONE` | Add standardized category folders under `public/media/default`. |
| V2-S2-02 | Define SVG authoring contract | S | `DONE` | Document transparent centered `0 0 100 100` SVG requirements and supported vector features. |
| V2-S2-03 | Create default token SVGs | L | `DONE` | Convert current circle, rectangle, and diamond token treatments into external assets. |
| V2-S2-04 | Create default obstacle SVGs | L | `DONE` | Create static barrier assets for supported obstacle geometry. |
| V2-S2-05 | Create moving-obstacle SVGs | M | `DONE` | Add visually distinct media for moving hazards. |
| V2-S2-06 | Create tracking-obstacle SVGs | M | `DONE` | Add visually distinct pursuit media with centered tracking details. |
| V2-S2-07 | Create start and main-target SVGs | M | `DONE` | Externalize start pad and main target visuals. |
| V2-S2-08 | Create bonus-target SVGs | M | `DONE` | Externalize ordered bonus relay visuals. |
| V2-S2-09 | Create coin SVGs | S | `DONE` | Externalize course coin presentation. |
| V2-S2-10 | Create power SVGs | L | `DONE` | Create media for shields, Slow Field, Coin Magnet, Route Scan, and unavailable feedback. |
| V2-S2-11 | Create arena and background SVGs | L | `DONE` | Convert the current laboratory grid, scanline, boundary, and chamber treatments. |
| V2-S2-12 | Add SVG compatibility validator | L | `DONE` | Reject text, unsupported filters, patterns, embedded bitmaps, invalid viewboxes, and malformed SVG. |
| V2-S2-13 | Add SVG rendering fixtures | M | `DONE` | Provide representative assets for automated Pixi parsing and sizing tests. |
| V2-S2-14 | Verify default media completeness | M | `DONE` | Ensure every registered visual media ID resolves to one valid default SVG. |

### Sprint 2 exit criteria

- The default visual library is complete.
- No gameplay artwork remains dependent on JSX-generated shapes.
- All initial assets are valid for Pixi vector mode.
- Token and object proportions are preserved.

---

## Sprint 3 — Audio Source and Conversion Pipeline

**Outcome:** The default theme has real, separately stored sound files and a
repeatable delivery-format pipeline.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S3-01 | Create audio directory structure | S | `DONE` | Add default and Future Lab audio source and delivery directories. |
| V2-S3-02 | Define audio filename convention | S | `DONE` | Map logical sound IDs directly to WAV, WebM, and MP3 filenames. |
| V2-S3-03 | Create default WAV sound effects | XL | `DONE` | Replace current synthesized tones with authored WAV masters for all required events. |
| V2-S3-04 | Create default WAV ambience loop | L | `DONE` | Produce a seamless default ambience master suitable for continuous playback. |
| V2-S3-05 | Create default audio settings | M | `DONE` | Define complete playback entries for effects and ambience. |
| V2-S3-06 | Implement FFmpeg discovery | S | `DONE` | Detect FFmpeg and provide a clear error when conversion is required but unavailable. |
| V2-S3-07 | Implement normal audio conversion | L | `DONE` | Generate only missing WebM and MP3 files from WAV masters. |
| V2-S3-08 | Implement forced audio conversion | M | `DONE` | Add `npm run media:audio:force` to intentionally overwrite generated formats. |
| V2-S3-09 | Add WebM-first source generation | S | `DONE` | Ensure generated Howler source arrays prefer WebM before MP3. |
| V2-S3-10 | Add audio validation | M | `DONE` | Validate WAV masters, converted formats, required defaults, and complete playback entries. |
| V2-S3-11 | Add conversion tests | L | `DONE` | Cover skip-existing, missing-only generation, force behavior, failures, and filenames. |
| V2-S3-12 | Record audio provenance and licenses | M | `DONE` | Document whether each sound is original, generated, or third-party and record its license. |

### Sprint 3 exit criteria

- Every required default sound has a WAV master.
- Missing WebM and MP3 files generate automatically outside the browser.
- Existing conversions remain untouched during normal builds.
- The force command regenerates both formats.
- Default ambience loops seamlessly.

---

## Sprint 4 — Generated Manifests and Theme Resolution

**Outcome:** Visual and audio assets resolve deterministically from optional
theme overrides to complete defaults.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S4-01 | Implement media directory scanner | L | `DONE` | Scan default and theme category folders using standardized filenames. |
| V2-S4-02 | Generate Pixi asset manifest | L | `DONE` | Produce deterministic aliases and vector asset entries for resolved SVG media. |
| V2-S4-03 | Generate Howler audio manifest | M | `DONE` | Produce WebM-first source mappings and playback settings for each logical sound. |
| V2-S4-04 | Add media version aliases | S | `DONE` | Include `mediaVersion` in generated asset URLs or aliases for cache invalidation. |
| V2-S4-05 | Implement per-element visual fallback | L | `DONE` | Resolve each missing or invalid theme SVG independently to its default. |
| V2-S4-06 | Implement per-element audio fallback | L | `DONE` | Resolve each theme sound and complete settings entry independently to defaults. |
| V2-S4-07 | Add development-only warnings | M | `DONE` | Report invalid theme overrides during development and suppress them in production. |
| V2-S4-08 | Make invalid defaults fatal | M | `DONE` | Stop manifest generation or startup when required default media is invalid or absent. |
| V2-S4-09 | Add startup progress reporting | M | `DONE` | Report configuration, manifest, SVG parse, and audio preload progress. |
| V2-S4-10 | Add manifest generation scripts | M | `DONE` | Integrate scanning and validation with development and production commands. |
| V2-S4-11 | Add deterministic manifest tests | L | `DONE` | Cover ordering, aliases, fallback, invalid overrides, and default failures. |
| V2-S4-12 | Add Future Lab override fixture | S | `DONE` | Verify a theme can replace exactly one media element while inheriting all others. |

### Sprint 4 exit criteria

- Manifests are generated from files rather than hand-maintained lists.
- Defaults are complete and mandatory.
- Themes override one element at a time.
- Invalid theme elements fall back safely.
- Asset loading exposes real progress.

---

## Sprint 5 — Framework-Neutral Engine Foundation

**Outcome:** Core gameplay can run and be tested without React, Pixi, Howler, or
the DOM.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S5-01 | Create engine module boundary | M | `DONE` | Establish pure engine folders and prevent UI/renderer/audio imports. |
| V2-S5-02 | Implement game event bus | M | `DONE` | Emit discrete typed-by-convention gameplay events to adapters. |
| V2-S5-03 | Implement state machine | L | `DONE` | Encode ready, active, target, bonus, completion, failure, restart, and pause transitions. |
| V2-S5-04 | Implement fixed-step loop | L | `DONE` | Add accumulator, delta clamping, pause, resume, and interpolation support. |
| V2-S5-05 | Create level session factory | L | `DONE` | Convert validated level data into isolated mutable runtime state. |
| V2-S5-06 | Port deterministic random service | S | `DONE` | Preserve stable seeded randomness without using `Math.random()`. |
| V2-S5-07 | Port level generation | L | `DONE` | Generate mixed manual and deterministic placements from V2 configs. |
| V2-S5-08 | Port route validation | L | `DONE` | Verify target reachability for configured token dimensions and arena geometry. |
| V2-S5-09 | Add engine snapshots | M | `DONE` | Produce throttled serializable HUD snapshots without exposing mutable runtime objects. |
| V2-S5-10 | Add engine lifecycle tests | L | `DONE` | Cover initialization, update order, restart, level disposal, and deterministic replay. |

### Sprint 5 exit criteria

- The engine runs without browser or rendering APIs.
- Fixed-step updates are deterministic.
- State transitions and events are testable.
- A validated level can produce a complete runtime session.

---

## Sprint 6 — Input, Movement, and Collision

**Outcome:** Mouse and keyboard input drive smooth, dimension-aware movement
without blocking hazard updates.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S6-01 | Implement input state model | M | `DONE` | Store desired pointer position, activation state, pressed directions, and power requests. |
| V2-S6-02 | Implement pointer adapter | M | `DONE` | Capture pointer input and convert canvas coordinates through the shared viewport. |
| V2-S6-03 | Implement keyboard adapter | M | `DONE` | Support Space toggle, arrow steering, `R`, and numbered power keys. |
| V2-S6-04 | Implement accelerated pointer following | L | `DONE` | Move toward desired position using configured acceleration, maximum speed, and deceleration. |
| V2-S6-05 | Implement keyboard movement | M | `DONE` | Apply normalized arrow-key steering through the same movement model. |
| V2-S6-06 | Port collision geometry | L | `DONE` | Support circle, rectangle, diamond/polygon, arena containment, and target overlap. |
| V2-S6-07 | Port swept collision | L | `DONE` | Prevent tunneling between fixed simulation updates, apply the configured token tolerance, and render its exact collision-edge guide. |
| V2-S6-08 | Implement collision latching | M | `DONE` | Count one event for continuous contact and restore the last safe position. |
| V2-S6-09 | Implement collision penalties | M | `DONE` | Apply configured score penalty and restart on the third collision. |
| V2-S6-10 | Handle interruption states | M | `DONE` | Resolve pointer capture loss, focus loss, visibility changes, and manual restart. |
| V2-S6-11 | Add movement and collision tests | XL | `DONE` | Cover pointer smoothing, keyboard control, shapes, boundaries, sweeps, shields, and restarts. |

### Sprint 6 exit criteria

- Raw events only update input state.
- Pointer and keyboard controls use one movement model.
- Token dimensions and arena boundaries are respected.
- Collisions remain deterministic at different render frame rates.

---

## Sprint 7 — Targets, Scoring, Bonuses, and Trails

**Outcome:** Complete attempts, score calculation, ordered bonus decisions, and
visible path recording operate through the engine.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S7-01 | Port score calculator | M | `DONE` | Preserve time, route, collision, bonus, maximum, and clamp rules as pure functions. |
| V2-S7-02 | Implement scoring clock | M | `DONE` | Use monotonic elapsed real time without allowing slow-device advantage. |
| V2-S7-03 | Implement traveled-distance tracking | M | `DONE` | Accumulate actual simulated center movement independently from rendered samples. |
| V2-S7-04 | Implement target edge contact | M | `DONE` | Reach a target when any part of the token touches it. |
| V2-S7-05 | Implement deterministic bonus offers | L | `DONE` | Use current score percentage and seeded randomness to offer one ordered bonus. |
| V2-S7-06 | Implement bonus popup transition | M | `DONE` | Emit a UI event and anchor the token at the reached target. |
| V2-S7-07 | Implement pursue-from-checkpoint | L | `DONE` | Require reactivation at the reached target and continue the attempt clock and route. |
| V2-S7-08 | Implement bonus banking and failure | M | `DONE` | Bank voluntarily or apply the configured failure penalty when pursuit fails. |
| V2-S7-09 | Implement trail model | M | `DONE` | Store accurate path state and bounded renderer samples separately. |
| V2-S7-10 | Implement ghost trails | S | `DONE` | Retain a configured small number of faint failed routes. |
| V2-S7-11 | Add target, bonus, score, and trail tests | XL | `DONE` | Cover ordering, chance, checkpoints, penalties, caps, direct distance, and sampling. |

### Sprint 7 exit criteria

- Main targets and bonuses follow the agreed state flow.
- Score uses real time and accurate distance.
- Bonus order is enforced and one target is visible at a time.
- Trails remain visible without unbounded growth.

---

## Sprint 8 — Hazards, Coins, and Powers

**Outcome:** Advanced course behavior, one-time rewards, and consumable powers
are fully engine-driven.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S8-01 | Implement deterministic moving hazards | L | `DONE` | Derive motion from simulation time, axis, amplitude, phase, and speed. |
| V2-S8-02 | Implement tracking hazard steering | XL | `DONE` | Add gradual acceleration and turning toward the token within configured zones. |
| V2-S8-03 | Implement moving-hazard collisions | L | `DONE` | Test the token against each animated hazard's current rendered transform without making its movement envelope solid. |
| V2-S8-04 | Validate movement envelopes | L | `DONE` | Keep hazards inside valid regions and preserve intended traversal opportunities. |
| V2-S8-05 | Implement one-time course coins | M | `DONE` | Detect token contact and emit claim events without replay farming. |
| V2-S8-06 | Implement completion and bonus rewards | M | `DONE` | Award configured coins once for eligible campaign achievements. |
| V2-S8-07 | Implement power inventory requests | M | `DONE` | Validate available charges before immediate one-use consumption. |
| V2-S8-08 | Implement obstacle shield | L | `DONE` | Ignore obstacle collisions for the configured duration. |
| V2-S8-09 | Implement full shield | L | `DONE` | Ignore obstacle and boundary collisions and recover safely on expiration. |
| V2-S8-10 | Implement Slow Field | M | `DONE` | Apply configured hazard time scaling without changing score time. |
| V2-S8-11 | Implement Coin Magnet | M | `DONE` | Collect eligible nearby course coins within the configured radius. |
| V2-S8-12 | Implement Route Scan | M | `DONE` | Expose the validated route for a configured duration. |
| V2-S8-13 | Add hazard, coin, and power tests | XL | `DONE` | Cover determinism, bounds, claims, purchases, consumption, effects, and expiration. |

### Sprint 8 exit criteria

- Moving and tracking hazards remain smooth during input.
- Tracking starts only after play begins.
- Coins cannot be farmed.
- All five powers are configuration-driven and consumable.

---

## Sprint 9 — PixiJS WebGL Renderer

**Outcome:** The complete game arena renders through one responsive PixiJS
WebGL canvas using external vector assets.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S9-01 | Install PixiJS | S | `DONE` | Add the pinned compatible PixiJS dependency and record its license. |
| V2-S9-02 | Create WebGL-only application factory | M | `DONE` | Initialize, resize, stop, and dispose a Pixi application without WebGPU fallback. |
| V2-S9-03 | Create imperative React canvas mount | M | `DONE` | Mount exactly one Pixi canvas and dispose it cleanly on unmount. |
| V2-S9-04 | Implement 1000 × 1000 viewport | M | `DONE` | Uniformly scale and center the logical world and convert pointer coordinates. |
| V2-S9-05 | Implement vector SVG loader | L | `DONE` | Load resolved external SVGs as cached reusable `GraphicsContext` objects. |
| V2-S9-06 | Implement Pixi entity factory | L | `DONE` | Create correctly anchored and sized display objects from media and JSON geometry. |
| V2-S9-07 | Build ordered scene layers | M | `DONE` | Create arena, debug, trail, obstacle, target, coin, effect, and token layers. |
| V2-S9-08 | Render arena and mask | L | `DONE` | Draw configured arena boundaries and clip presentation without changing collision geometry. |
| V2-S9-09 | Render static and moving objects | L | `DONE` | Create stable instances and update transforms without reconstruction. |
| V2-S9-10 | Render token and power effects | L | `DONE` | Render shape-preserving token media, shields, and active power feedback. |
| V2-S9-11 | Render active and ghost trails | L | `DONE` | Draw bounded path samples without React state updates. |
| V2-S9-12 | Render development diagnostics | M | `DONE` | Draw hitboxes, routes, zones, velocity vectors, seed, and FPS, default local testing to Dev mode, and provide a home-screen toggle. |
| V2-S9-13 | Connect renderer to engine snapshots | L | `DONE` | Apply frame transforms and discrete scene changes through a renderer adapter. |
| V2-S9-14 | Add renderer tests | L | `DONE` | Cover WebGL selection, transforms, sizing, scene order, asset reuse, and disposal. |
| V2-S9-15 | Remove V1 SVG renderer | M | `DONE` | Delete obsolete arena components after Pixi parity is verified. |

### Sprint 9 exit criteria

- Gameplay renders only through PixiJS WebGL.
- The world scales without object distortion.
- External SVG contexts are parsed once and reused.
- Pointer input does not freeze moving objects.
- V1 rendering code is removed.

---

## Sprint 10 — React, Howler, and Persistence Integration

**Outcome:** Players can load, hear, play, complete, and resume the V2 game
through the React application.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S10-01 | Install Howler.js | S | `DONE` | Add the pinned Howler dependency and record its license. |
| V2-S10-02 | Implement theme-aware AudioManager | L | `DONE` | Load resolved sources and complete settings without coupling to React or Pixi. |
| V2-S10-03 | Implement Start Game audio unlock | M | `DONE` | Unlock browser audio and begin ambience after explicit interaction. |
| V2-S10-04 | Implement looping ambience | M | `DONE` | Continue the resolved default or theme ambience across levels. |
| V2-S10-05 | Implement effect playback and cooldowns | M | `DONE` | Play logical sound events with volume, cooldown, fades, and concurrent instances. |
| V2-S10-06 | Implement audio settings UI | M | `DONE` | Control ambience/effect enablement and volume. |
| V2-S10-07 | Build startup loading screen | L | `DONE` | Show initialization messaging, real progress, error state, and Start Game action. |
| V2-S10-08 | Connect React HUD snapshots | M | `DONE` | Display current level score, cumulative score, time, travel, collisions, and powers. |
| V2-S10-09 | Connect bonus dialog | M | `DONE` | Handle bank and pursue events without embedding game rules in React. |
| V2-S10-10 | Connect results and navigation | M | `DONE` | Complete levels, replay old levels, and unlock next-level navigation. |
| V2-S10-11 | Connect Power Lab | L | `DONE` | Buy charges with coins and display score gates and inventory. |
| V2-S10-12 | Update persistence schema | L | `DONE` | Migrate best scores, unlocks, coins, claims, powers, and audio preferences. |
| V2-S10-13 | Add reduced-motion integration | M | `DONE` | Reduce nonessential Pixi effects while preserving gameplay. |
| V2-S10-14 | Remove synthesized audio manager | S | `DONE` | Delete V1 oscillator-based audio after Howler parity is verified. |
| V2-S10-15 | Add integration tests | XL | `DONE` | Cover loading, unlock, HUD events, dialogs, settings, persistence, and disposal. |

### Sprint 10 exit criteria

- Startup loading and audio unlock work reliably.
- Default ambience loops through Howler.
- Theme-neutral game events trigger resolved theme sounds.
- React receives no frame-by-frame entity state.
- Progress and settings survive reload.

---

## Sprint 11 — Campaign Migration and Validation

**Outcome:** The original 30 levels conform to V2 schemas, media contracts, deterministic
generation, and gameplay expectations.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S11-01 | Migrate Levels 1–5 | L | `DONE` | Add complete V2 attributes and tune introductory static courses. |
| V2-S11-02 | Migrate Levels 6–10 | L | `DONE` | Add token variation and predictable moving hazards. |
| V2-S11-03 | Migrate Levels 11–15 | L | `DONE` | Add early tracking hazards and varied token media. |
| V2-S11-04 | Migrate Levels 16–20 | L | `DONE` | Combine larger tokens, gates, and overlapping pursuit zones. |
| V2-S11-05 | Migrate Levels 21–25 | L | `DONE` | Add advanced pursuit, coin routes, and power opportunities. |
| V2-S11-06 | Migrate Levels 26–30 | XL | `DONE` | Combine irregular arenas, trackers, powers, coins, and ordered bonuses. |
| V2-S11-07 | Validate all fixed seeds | L | `DONE` | Confirm stable generation output for every released level version. |
| V2-S11-08 | Validate initial placement | L | `DONE` | Reject token, target, bonus, coin, and obstacle overlaps. |
| V2-S11-09 | Validate bonus placement | M | `DONE` | Ensure no bonus target is inside an obstacle or invalid boundary area. |
| V2-S11-10 | Validate token clearance | L | `DONE` | Account for configured token dimensions in every route and gap. |
| V2-S11-11 | Validate moving envelopes | L | `DONE` | Ensure moving and tracking hazards remain within configured areas. |
| V2-S11-12 | Run automated solvability suite | XL | `DONE` | Verify every required main and ordered target route. |
| V2-S11-13 | Tune score maxima and pars | L | `DONE` | Balance increasing difficulty, time, route efficiency, and bonus maxima. |
| V2-S11-14 | Tune pointer and keyboard movement | M | `DONE` | Confirm responsive but controlled movement across token sizes and shapes. |

### Sprint 11 exit criteria

- All 30 levels pass V2 schemas.
- All renderable objects have valid media IDs.
- No target or bonus is placed inside an obstacle.
- Every required target is solvable for its configured token.
- Released seeds remain deterministic.

---

## Sprint 12 — Quality, Docker, and Release Readiness

**Outcome:** V2 is performant, accessible, reproducible, and ready for local or
containerized deployment.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S12-01 | Complete unit-test suite | XL | `DONE` | Run and close gaps across config, media, engine, geometry, scoring, audio, and persistence. |
| V2-S12-02 | Complete Playwright journeys | XL | `DONE` | Cover startup, mouse, keyboard, collisions, attempt resets, bonuses, powers, progression, and reload. |
| V2-S12-03 | Add visual regression coverage | L | `DONE` | Verify Pixi scenes, HUD, dialogs, and proportions at representative desktop sizes. |
| V2-S12-04 | Profile WebGL gameplay | L | `IN PROGRESS` | Automated WebGL/FPS profiling is complete; the 60 FPS hardware sign-off remains manual. |
| V2-S12-05 | Optimize measured bottlenecks | L | `DONE` | Apply pooling, batching, culling, or trail optimization only where profiling supports it. |
| V2-S12-06 | Test current desktop browsers | L | `DONE` | Chrome and Edge pass where available; Firefox and Safari manual checks are recorded. |
| V2-S12-07 | Complete accessibility audit | L | `DONE` | Verify keyboard UI, focus, non-color feedback, instructions, and reduced motion. |
| V2-S12-08 | Update Docker build stage | M | `DONE` | Add media validation, audio preparation, manifest generation, and FFmpeg. |
| V2-S12-09 | Keep runtime container minimal | S | `DONE` | Ensure FFmpeg and Node remain absent from the final Nginx stage. |
| V2-S12-10 | Validate production caching | M | `DONE` | Verify hashed application assets and `mediaVersion` invalidation behavior. |
| V2-S12-11 | Run production smoke test | M | `DONE` | Build and play the critical journey through the production container. |
| V2-S12-12 | Remove obsolete V1 files | M | `DONE` | Delete remaining unused renderer, audio, styles, tests, and documentation references. |
| V2-S12-13 | Finalize README and operations docs | M | `DONE` | Document install, conversion, development, testing, Docker, and troubleshooting commands. |
| V2-S12-14 | Complete license audit | M | `DONE` | Verify all code, SVG, font, and audio licenses and attributions. |
| V2-S12-15 | Prepare V2 release checklist | S | `DONE` | Record schema, seed, manifest, test, build, Docker, cache, and rollback checks. |

### Sprint 12 exit criteria

- Unit and critical browser tests pass.
- Production build and Docker smoke test pass.
- Gameplay meets the target frame rate on a representative desktop.
- Audio conversion and media manifests are reproducible.
- Accessibility and license audits are complete.
- Obsolete V1 implementation code is removed.

---

## Sprint 13 — Campaign Expansion

**Outcome:** The campaign expands from 30 to 70 deterministic, validated
levels with a balanced standard tier and a new apex tier.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S13-01 | Author Levels 31–60 | XL | `DONE` | Add three new deterministic courses at every difficulty from 1 through 10. |
| V2-S13-02 | Author Levels 61–70 | XL | `DONE` | Add ten difficulty-15 apex courses with denser layouts and overclocked hazards. |
| V2-S13-03 | Extend difficulty schema | S | `DONE` | Allow standard difficulties 1–10 and the explicit apex value 15. |
| V2-S13-04 | Extend progression persistence | M | `DONE` | Raise unlock sanitization and completion progression through Level 70. |
| V2-S13-05 | Add apex level presentation | M | `DONE` | Distinguish difficulty-15 cards while keeping the standard difficulty scale readable. |
| V2-S13-06 | Lock expansion seeds | L | `DONE` | Record deterministic fingerprints for every new released layout. |
| V2-S13-07 | Validate full campaign | XL | `DONE` | Pass schema, placement, envelope, ordered-route, unit, build, and browser gates for all 70 levels. |

### Sprint 13 exit criteria

- Levels 31–60 contain exactly three courses at each difficulty 1–10.
- Levels 61–70 all use difficulty 15.
- All 70 levels pass schema, placement, media, and solvability checks.
- Progression and Dev mode expose every level through Level 70.
- Released seeds and generation fingerprints remain deterministic.

---

## Sprint 14 — Dynamic Obstacle Variety and Micro Protocols

**Outcome:** Repeated expansion layouts gain distinct timing, prediction,
precision, and route-planning decisions, while optional post-completion
challenges teach each behavior in isolation.

| ID | Task | Size | Status | Short description |
|---|---|---:|---|---|
| V2-S14-01 | Sweep dynamic collision relatively | L | `DONE` | Test token and hazard movement across the complete fixed-step interval. |
| V2-S14-02 | Add dynamic behavior contract | L | `DONE` | Validate and resolve phase, orbit, pulse, and switch obstacle behaviors. |
| V2-S14-03 | Implement phase gates | L | `DONE` | Add solid, warning, and open states with shared engine/renderer geometry. |
| V2-S14-04 | Implement orbit and pulse hazards | L | `DONE` | Add elliptical movement and time-varying authoritative dimensions. |
| V2-S14-05 | Implement contact switches | L | `DONE` | Support once, timed, and toggle switches with linked barriers. |
| V2-S14-06 | Add default visual media | M | `DONE` | Add phase, orbit, pulse, barrier, and switch-pad SVG assets and manifests. |
| V2-S14-07 | Add Micro Protocol flow | XL | `DONE` | Offer optional short challenges from results through the single Pixi canvas. |
| V2-S14-08 | Persist Micro Protocol records | M | `DONE` | Migrate storage and retain separate bests and one-time rewards. |
| V2-S14-09 | Diversify expansion chambers | L | `DONE` | Replace repeated seeded-only variants with new obstacle decisions. |
| V2-S14-10 | Complete release verification | XL | `DONE` | Run full unit, lint, build, and relevant browser gates. |

### Sprint 14 exit criteria

- Dynamic obstacles remain deterministic at the fixed 60 Hz simulation rate.
- Collision covers complete token and hazard motion between updates.
- Phase, orbit, pulse, and switch behavior share validated configuration.
- Micro Protocol records never alter cumulative campaign score.
- Default media, configuration, unit, build, and browser checks pass.

---

## Sprint 15 — 16:9 world and 100-level mechanic campaign

**Status:** `DONE`

| ID | Task | Size | Status | Acceptance |
|---|---|---:|---|---|
| V2-S15-01 | Migrate logical world to 1600 × 900 | L | `DONE` | Engine containment, pathfinding, Pixi masks, viewport transforms, and pointer mapping share 16:9 bounds. |
| V2-S15-02 | Add environmental force fields | L | `DONE` | Conveyor, repulsor, and attractor acceleration is deterministic and engine-owned. |
| V2-S15-03 | Add rotating spinners | L | `DONE` | Collision and rendering share rotation and swept angular motion cannot tunnel through the token. |
| V2-S15-04 | Replace campaign with 100 levels | XL | `DONE` | Ten contiguous tiers introduce static, moving, phase, pulse, orbit, switch, current, radial, rotation, and convergence play. |
| V2-S15-05 | Expand Micro Protocol mastery | M | `DONE` | Seven mechanic-matched challenges unlock with their campaign tier and award one-time tier coins. |
| V2-S15-06 | Validate release | XL | `DONE` | Schema, media, unit, lint, build, solvability, and browser gates pass. |

### Sprint 15 exit criteria

- The authored world and desktop canvas use a distortion-free 16:9 transform.
- All 100 campaign levels and seven Micro Protocols validate and generate.
- Every new mechanic is introduced before it appears in convergence levels.
- Force-field and spinner rules remain framework-neutral and fixed-step.
- Campaign, media, build, and browser checks pass.

---

## Sprint 16 — Seeded full-board campaign diversity

**Status:** `DONE`

| ID | Task | Size | Status | Acceptance |
|---|---|---:|---|---|
| V2-S16-01 | Remove repeated route lanes | L | `DONE` | Every campaign start and target pair is unique and the campaign covers all twelve coarse arena regions. |
| V2-S16-02 | Seed spatial composition | XL | `DONE` | Released seeds deterministically vary endpoint, pickup, static, moving, dynamic, force-field, switch, and tracker placement. |
| V2-S16-03 | Vary mechanic mixtures | L | `DONE` | Tiers emphasize their primary mechanic while selecting different earlier-mechanic combinations and entity counts. |
| V2-S16-04 | Validate diversity and solvability | L | `DONE` | All layouts remain deterministic, distinct, fully contained, overlap-free, and route-solvable. |

### Sprint 16 exit criteria

- Restarts reproduce the released seed instead of rerolling the attempt.
- Starts, targets, and obstacles cover the full safe 16:9 arena.
- Every campaign fingerprint is unique.
- Every level contains at least one seed-generated obstacle.
- Configuration and campaign validation pass.

---

## Sprint 17 — Server-backed Theme Workshop

**Status:** `DONE`

| ID | Task | Size | Status | Acceptance |
|---|---|---:|---|---|
| V2-S17-01 | Add persistent Express runtime | XL | `DONE` | Node serves the built app and same-origin API with a configurable filesystem data directory. |
| V2-S17-02 | Implement theme package API | XL | `DONE` | Clone, private access, ownership, publish, delete, level CRUD, ordering, and automatic renumbering are API-tested. |
| V2-S17-03 | Isolate theme progress | M | `DONE` | Browser progress is namespaced by theme and immutable level ID. |
| V2-S17-04 | Build Theme Workshop management UI | L | `DONE` | Players browse, clone, resume, publish, play, and delete themes. |
| V2-S17-05 | Build visual level editor | XL | `DONE` | The 10-unit grid supports entity manipulation, full properties, undo/redo, validation, autosave, and manual save. |
| V2-S17-06 | Add live playtest and sequence editing | L | `DONE` | Pixi playtest, regeneration, duplication, deletion, ordering, and renumbering work from the workshop. |
| V2-S17-07 | Validate full release | XL | `DONE` | Unit, API, lint, build, Docker, and browser gates pass. |

### Sprint 17 exit criteria

- The default campaign remains read-only.
- Clones initially contain level JSON and no copied media.
- Private themes require their owning account and public themes are playable by all.
- Invalid levels cannot autosave or save manually.
- Themes contain 1–200 levels with stable internal IDs.
- Production data survives container replacement through a mounted volume.
- Full automated and browser validation passes.

---

## Sprint 18 — SQLite accounts and theme ownership

**Status:** `DONE`

| ID | Task | Size | Status | Acceptance |
|---|---|---:|---|---|
| V2-S18-01 | Add account and session persistence | L | `DONE` | SQLite stores unique usernames/emails, salted scrypt password hashes, and hashed expiring sessions. |
| V2-S18-02 | Replace edit keys with ownership | L | `DONE` | Authenticated owners can clone and mutate themes; private data stays hidden from other accounts. |
| V2-S18-03 | Build registration and login UI | M | `DONE` | Workshop registration, login, session restore, and logout use an HTTP-only cookie. |
| V2-S18-04 | Persist and validate deployment data | M | `DONE` | Docker mounts themes and SQLite under one persistent data volume; the runtime image builds and passes API health checks. |

### Sprint 18 exit criteria

- Registration requires username, email address, and an 8-character minimum password.
- Development accounts are usable immediately without email confirmation.
- Plaintext passwords and session tokens are never stored in SQLite.
- Public play stays anonymous; authoring requires the owning account.
- Unit, API, lint, build, Docker, and browser validation pass.

---

## Sprint 19 — Open-media texture proof theme

**Status:** `DONE`

| ID | Task | Size | Status | Acceptance |
|---|---|---:|---|---|
| V2-S19-01 | Acquire and preserve selected CC0 media | M | `DONE` | Eight original archives from six packs are stored with source URLs, SHA-256 hashes, included licenses, and safe extraction. |
| V2-S19-02 | Add PNG theme override resolution | L | `DONE` | Valid registered PNG basenames resolve per element with cached Pixi textures and mandatory SVG fallback. |
| V2-S19-03 | Build Celestial Foundry proof theme | M | `DONE` | The theme replaces 29 gameplay visuals from five selected media libraries while inheriting arena SVGs and audio. |
| V2-S19-04 | Validate release gates | M | `DONE` | Configuration, manifest, renderer, build, full unit, and WebGL browser checks pass. |

### Sprint 19 exit criteria

- Every downloaded archive has a recorded source, license, and SHA-256 digest.
- PNG theme overrides never alter gameplay collision geometry.
- Invalid or missing texture overrides fall back independently to valid SVGs.
- The proof theme renders through WebGL with stable visual snapshots.
- Full unit, lint, build, and relevant browser checks pass.

---

## Sprint 20 — Theme media library and player theme selection

**Status:** `DONE`

| ID | Task | Size | Status | Acceptance |
|---|---|---:|---|---|
| V2-S20-01 | Audit configured themes | M | `DONE` | Every configured theme validates and resolves a complete visual and audio manifest. |
| V2-S20-02 | Add player theme selection | M | `DONE` | Settings lists every configured presentation theme and persists the selection. |
| V2-S20-03 | Build licensed PublicMedia API | L | `DONE` | The server exposes only cataloged assets with license, credit, and source provenance. |
| V2-S20-04 | Materialize visual overrides | L | `DONE` | Selected images are validated, normalized when needed, and copied into the owned theme package. |
| V2-S20-05 | Normalize audio overrides | L | `DONE` | Selected audio becomes a 44.1 kHz stereo WAV master plus WebM and MP3 theme files. |
| V2-S20-06 | Build Workshop media editor | L | `DONE` | Authors can search, preview, target, and apply catalog images and sounds. |
| V2-S20-07 | Validate release gates | M | `DONE` | API, component, manifest, lint, build, Docker runtime, and browser checks pass. |
| V2-S20-08 | Add element-first visual media browsing | M | `DONE` | Authors choose a theme element before browsing folder-filtered thumbnail previews from PublicMedia. |
| V2-S20-09 | Add schema-aware popup JSON editor | M | `DONE` | Full-level JSON can be formatted and must pass server-side schema and gameplay validation before it is applied. |
| V2-S20-10 | Add recursive media file browser | M | `DONE` | Every supported catalog file is reachable through folders and breadcrumbs with direct image or audio preview. |

### Sprint 20 exit criteria

- PublicMedia remains a read-only, provenance-bearing source catalog.
- Every selected external asset is copied into the theme folder system.
- Dynamic manifests preserve independent default fallback and cache versioning.
- Players can select every configured source-controlled presentation theme.
- Unit, API, lint, production build, and relevant browser checks pass.

---

## Sprint 21 — Per-entity media overrides

**Status:** `DONE`

| ID | Task | Size | Status | Acceptance |
|---|---|---:|---|---|
| V2-S21-01 | Add level override contracts | M | `DONE` | Renderable entities accept optional server-issued visual and audio override IDs. |
| V2-S21-02 | Materialize owned entity media | L | `DONE` | The API copies selected catalog files into the owned theme and rejects unavailable references on save. |
| V2-S21-03 | Resolve overrides at runtime | L | `DONE` | Pixi and supported gameplay events use an entity override with deterministic base-media fallback. |
| V2-S21-04 | Add selected-object authoring UI | L | `DONE` | Authors can choose, preview, apply, and clear image or supported event-sound overrides for one entity. |
| V2-S21-05 | Document and validate release gates | M | `DONE` | Author reference, architecture, tests, lint, and production build match the implementation. |

### Sprint 21 exit criteria

- Two entities with the same base type can resolve different owned visuals and sounds.
- Level JSON never stores a direct PublicMedia path.
- Missing, invalid, or cleared per-entity media falls back to the registered base.
- Clone-without-media cannot retain dangling entity override IDs.
- Unit, API, documentation, lint, and production build checks pass.

---

## 4. Dependency sequence

```text
Sprint 0: Decisions and branch
  → Sprint 1: Contracts and registries
    → Sprint 2: Default SVG media
    → Sprint 3: Audio pipeline
      → Sprint 4: Generated manifests and fallback
        → Sprint 5: Engine foundation
          → Sprint 6: Input and collision
            → Sprint 7: Targets, scoring, bonuses, trails
            → Sprint 8: Hazards, coins, powers
              → Sprint 9: PixiJS renderer
                → Sprint 10: React, Howler, persistence
                  → Sprint 11: Campaign migration
                    → Sprint 12: Quality and release
                      → Sprint 13: Campaign expansion
                        → Sprint 14: Dynamic obstacles and Micro Protocols
                          → Sprint 15: 16:9 world and 100-level campaign
                            → Sprint 16: Seeded full-board diversity
                              → Sprint 17: Server-backed Theme Workshop
                                → Sprint 18: SQLite accounts
                                  → Sprint 19: Texture proof theme
                                    → Sprint 20: Theme media library
                                      → Sprint 21: Per-entity media overrides
```

Some tasks may overlap after their contracts stabilize. For example, WAV asset
authoring can proceed while schemas are implemented, and engine tests can
continue while external SVG artwork is refined.

## 5. Cross-sprint completion checklist

Before marking any implementation task `DONE`:

- The code matches `architecturev2.md`.
- Configuration values are not unnecessarily hard-coded.
- Relevant unit or component tests pass.
- Gameplay behavior has proportional browser verification when applicable.
- Default media failures remain fatal.
- Theme failures fall back safely.
- Frame-by-frame state remains outside React.
- New dependencies or assets have recorded licenses.
- Documentation and schemas are updated with the implementation.
- This sprint file is updated in the same change.

## 6. Required validation commands

The exact scripts may evolve as V2 is implemented. The completed project must
provide commands equivalent to:

```powershell
npm install
npm run media:audio
npm run media:audio:force
npm run media:manifests
npm run config:validate
npm run dev
npm run lint
npm run test
npm run test:e2e
npm run build
```

If a task cannot run its required validation, it remains `IN PROGRESS` or
`BLOCKED`; it is not marked `DONE`.
