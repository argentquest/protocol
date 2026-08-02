# AGENTS.md

## Purpose

This file provides repository instructions for coding agents working on
**Path Protocol V2**.

Path Protocol is a 100-level desktop browser precision game. React owns the
application UI, PixiJS renders the real-time arena through WebGL, a pure
fixed-step engine owns gameplay, and Howler.js owns audio.

V2 is a new architecture on `feature/pixijs-rearchitecture`. Do not preserve
the V1 React/SVG renderer or synthesized Web Audio implementation for backward
compatibility.

## Sources of truth

Read these files before architectural or gameplay changes:

1. [`architecturev2.md`](architecturev2.md) — authoritative V2 product and
   technical architecture.
2. [`sprintv2.md`](sprintv2.md) — live implementation sequence and task status.
3. `src/config/schemas/*.json` — authoritative configuration contracts.
4. `src/config/levels/*.json` — level-specific gameplay configuration.
5. Generated media manifests — resolved default and theme asset contracts once
   implemented.

`architecture.md` and `sprints.md` describe V1 and are historical references.
When V1 and V2 disagree, follow the V2 documents.

Update `sprintv2.md` in the same change that completes a tracked task. A sprint
must pass its relevant automated checks and meet its exit criteria before work
moves to the next sprint.

## Required technology

- React 19 for screens, navigation, dialogs, HUD, settings, and shops.
- Vite for development and production builds.
- Modern JavaScript with ES modules.
- PixiJS using WebGL only for gameplay rendering.
- One imperative Pixi canvas mounted and disposed by React.
- A framework-neutral fixed 60 Hz game engine.
- External SVG source media loaded initially as Pixi vector
  `GraphicsContext` objects.
- Howler.js for effects and looping ambience.
- WAV audio masters with generated WebM and MP3 delivery files.
- JSON and versioned JSON Schema for levels, media, themes, audio, game settings,
  and powers.
- Versioned `localStorage` for browser-local progress and settings.
- Vitest and React Testing Library for unit and component tests.
- Playwright for critical browser journeys.

Do not add TypeScript, multiplayer, a physics engine, WebGPU, touch gameplay, or
another state-management library without an explicit product decision. The
Theme Workshop backend is approved: Express owns same-origin theme APIs and
persistent JSON theme folders.

## Theme Workshop server rules

- The source-controlled default theme and campaign are read-only.
- A clone copies level JSON only; media overrides are deferred.
- Store mutable themes under the configurable persistent data directory.
- Store accounts and hashed sessions in SQLite; never store plaintext passwords
  or browser-readable session credentials.
- Require an authenticated owner for private reads and every mutation.
- Development registration activates immediately without email confirmation.
- Keep unpublished themes out of public listings.
- Validate schema and generated gameplay before every level write.
- Store 1–200 levels per theme with immutable internal IDs.
- Reordering updates campaign IDs and numbers without changing internal IDs.
- Namespace browser progress by theme ID and internal level ID.
- Keep server/filesystem imports out of the engine and browser bundles.

## Architecture boundaries

The engine:

- Must not import React, PixiJS, Howler, browser DOM APIs, or persistence code.
- Owns the gameplay state machine, fixed-step updates, movement, collision,
  targets, bonuses, hazards, coins, powers, and score inputs.
- Emits discrete gameplay events and throttled serializable HUD snapshots.

The Pixi adapter:

- Owns the WebGL application, viewport, scene graph, external SVG contexts,
  entity display objects, trails, effects, and debug overlays.
- Must not own scoring, progression, persistence, or gameplay decisions.
- Must create stable display objects and update their transforms without
  rebuilding the scene every frame.

React:

- Owns startup, menus, navigation, HUD presentation, dialogs, settings, results,
  level selection, and the Power Lab.
- Must not receive raw pointer movement or frame-by-frame entity transforms.
- Mounts exactly one imperative Pixi canvas for the arena.

Howler:

- Is accessed through a renderer-independent audio manager.
- Responds to logical game events rather than component details.
- Starts only after a user interaction unlocks browser audio.

## Core gameplay contracts

Preserve these rules unless the user explicitly changes them:

- The logical world is 1600 × 900.
- The viewport scales uniformly and centers the world without distorting
  gameplay objects.
- The pointer controls the desired center position of the token.
- The token moves toward the pointer using configured acceleration, maximum
  speed, and deceleration; it does not snap to the pointer.
- The token has real dimensions, fixed orientation, and no rotation.
- Pointer play starts by pressing the token and finishes by releasing.
- Keyboard play starts with Space, steers with arrow keys, and finishes with
  Space.
- Number keys activate configured consumable powers.
- `R` restarts the same level layout.
- A target is reached when any part of the token touches it.
- The complete token must remain inside the arena.
- The complete token is tested against every obstacle.
- A collision applies a configured penalty, defaults to 20%, and restores the
  last safe position.
- One continuous overlap counts as one collision event.
- The timer and traveled distance continue after a collision.
- The third collision restarts the same level.
- The deterministic layout does not regenerate on restart.
- The actual token-center path remains visible.
- Ordered bonus targets appear one at a time.
- A pursued bonus restarts control from the target just reached while continuing
  the attempt clock, distance, and trail.
- All required generated courses must be solvable for the configured token.
- All players use the same seed for a released level version.

## Scoring contract

The default score is:

```text
attainableMaximum = baseMaximum + earnedBonusMaximum

timeFactor = min(1, parTime / elapsedTime)
routeFactor = min(1, directDistance / actualDistance)

performanceScore =
  attainableMaximum
  × ((timeWeight × timeFactor) + (distanceWeight × routeFactor))

collisionPenalty =
  attainableMaximum
  × collisionPenaltyRate
  × collisionCount

finalScore =
  round(clamp(
    performanceScore - collisionPenalty - bonusFailurePenalty,
    0,
    attainableMaximum
  ))
```

Direct distance is the sum of straight segments from the start through every
ordered target reached. Do not duplicate scoring formulas in UI or renderer
modules.

## Configuration rules

- Gameplay values belong in level, game, or power JSON.
- Presentation and playback values belong in media, theme, or audio JSON.
- JSON files contain data only.
- Validate all configuration before creating a level session.
- Reject invalid defaults with actionable development errors and a safe
  production error screen.
- Require stable unique IDs.
- Require a registered theme-neutral `mediaId` for every renderable object.
- Use the shared seeded random service; never use `Math.random()` for gameplay.
- Manual level elements take priority over generated elements.
- Authored coordinates use the 1600 × 900 logical world.

## Default and theme media rules

The default media library is complete and mandatory. Themes contain optional
per-element overrides.

Resolution occurs independently for each visual and sound:

```text
valid theme override → valid default → fatal default-media error
```

- Missing theme files use defaults.
- Invalid theme files use defaults.
- Invalid theme overrides warn only in development.
- Missing or invalid default assets fail validation.
- A theme never needs to duplicate a complete category.
- Future Lab initially inherits defaults and adds only distinct overrides.
- PublicMedia is a read-only, licensed authoring catalog. A selected external
  asset must be validated and copied into the editable theme's media folder;
  deployed themes must never reference a catalog file in place.

Generated manifests are the result of scanning standardized filenames. Do not
hand-maintain a second list that can drift from the files.

## SVG rules

- Store gameplay artwork in external `.svg` files.
- Use transparent backgrounds and centered `viewBox="0 0 100 100"` artwork.
- Keep visual colors and supported effects inside each SVG.
- Do not use global DOM CSS dependencies, embedded bitmaps, or SVG text.
- Default assets use explicit `renderMode: "vector"`.
- A valid theme-level PNG with the registered media basename resolves as
  `renderMode: "texture"`; invalid or missing PNGs fall back per element.
- Cache each texture once and preserve aspect ratio for proportion-sensitive
  objects. Collision geometry remains JSON-owned.
- Vector assets must avoid SVG features unsupported by Pixi parsing, including
  blur/drop-shadow filters and unsupported patterns.
- Collision geometry comes from JSON, never from artwork bounds.
- Rectangular objects may stretch to configured width and height. Tokens,
  circles, coins, and other proportion-sensitive objects preserve aspect ratio.

## Audio rules

- WAV is the canonical source.
- Runtime order is WebM first and MP3 second.
- Each logical sound uses separate files; do not introduce audio sprites before
  profiling demonstrates a need.
- Normal conversion creates only missing delivery files and never overwrites an
  existing WebM or MP3.
- `npm run media:audio:force` intentionally regenerates delivery files.
- Playback behavior belongs in `audio.json`.
- A theme playback entry must be complete; missing or invalid entries use the
  complete default entry without property-level merging.
- Default ambience is required, begins after Start Game, loops continuously,
  and continues between levels.
- Rate-limit collision and other frequently repeated effects.
- Record the provenance and license of every audio asset.
- Normalize Theme Workshop audio imports to a stereo 44.1 kHz 16-bit WAV
  master and generate WebM/Opus plus MP3 delivery files inside the theme.

## Fixed-step and input rules

- Run game simulation at exactly 60 updates per second.
- Use a clamped accumulator so an inactive tab cannot create an update spiral.
- Render independently through the Pixi ticker.
- Use a monotonic real-time clock for scoring.
- Raw pointer and keyboard handlers only update input state.
- Never perform collision, hazard updates, score calculation, or React state
  updates directly in pointer-move handlers.
- Convert canvas coordinates through one shared viewport module.

## Collision and movement rules

- Test the complete token shape, not only its center.
- Support circle, rectangle, polygon/diamond, and later flattened-path geometry.
- Use swept tests between safe and requested positions to prevent tunneling.
- Restore the last safe transform after collision.
- Derive moving hazards from simulation time.
- Tracking hazards start only after the attempt starts, accelerate and turn
  gradually, and remain inside their configured zones.
- Path validation must account for token dimensions.
- Never weaken collision rules just to make a level pass; correct the level,
  placement, geometry, or fallback route.

## Persistence rules

- Store progress in one versioned local-storage record.
- Validate and migrate stored data.
- Recalculate cumulative score from per-level best scores.
- Replace a saved level score only when a new completed score is higher.
- Prevent repeat farming of course coins and one-time rewards.
- Persist power inventory and audio settings.
- Do not persist active attempts or raw pointer history.
- Confirm before resetting progress.

## Performance expectations

- Target 60 rendered frames per second on a representative current desktop.
- Parse each resolved vector SVG once and reuse its `GraphicsContext`.
- Precompute static collision geometry.
- Avoid hot-loop allocation where practical.
- Reuse Pixi display objects and effects.
- Bound trail and ghost-trail samples.
- Do not add workers, spatial indexes, texture mode, or audio sprites before
  profiling identifies a need.

## Accessibility

- Keep React menus and dialogs keyboard accessible.
- Maintain visible focus.
- Provide Space and arrow-key gameplay.
- Never use sound or color as the sole feedback for important events.
- Respect reduced-motion settings without changing gameplay rules.
- Give the Pixi canvas an accessible name and nearby instructions.

## Testing and sprint gates

Every task needs tests proportional to its risk. Prioritize:

- JSON Schema and media validation.
- Manifest determinism and fallback.
- Audio conversion skip and force behavior.
- Fixed-step accumulation and state transitions.
- Movement, collision, containment, and swept geometry.
- Scoring, direct distance, bonuses, and score caps.
- Moving/tracking hazard determinism.
- Coin non-farmability and power consumption.
- Viewport transforms and undistorted sizing.
- Audio unlock, cooldown, fallback, and ambience looping.
- Persistence validation and migration.

Critical Playwright journeys include startup, mouse play, keyboard play, restart,
collisions, bonuses, powers, progression, and reload.

Before moving to the next sprint:

1. Complete every task required by the sprint exit criteria.
2. Update task and sprint status in `sprintv2.md`.
3. Run focused tests while implementing.
4. Run the full unit suite.
5. Run lint and production build when the sprint changes executable code.
6. Run relevant browser tests for gameplay or integration changes.
7. Do not mark the sprint complete if a required check is failing.

## Repository hygiene

- Preserve unrelated user changes.
- Use `apply_patch` for hand-authored edits.
- Keep generated outputs reproducible.
- Do not commit secrets, machine-specific paths, build output, browser profiles,
  or test reports.
- Record new dependency and asset licenses.
- Update documentation and schemas with contract changes.
- Avoid destructive Git or filesystem commands unless explicitly requested.

## Definition of done

V2 work is complete when:

- PixiJS WebGL is the only gameplay renderer.
- React owns no frame-by-frame gameplay state.
- The engine is deterministic and framework-neutral.
- All 100 levels and every default media asset validate.
- Theme overrides resolve one element at a time.
- External vector media preload and reuse cached contexts.
- Howler uses WebM first with MP3 fallback and looping default ambience.
- Pointer and keyboard controls are smooth and consistent.
- Score, progression, coins, powers, and persistence match the architecture.
- Unit, browser, production build, and Docker checks pass.
- `architecturev2.md`, `sprintv2.md`, README, schemas, and license records match
  the implementation.

## Documentation
- JSDoc Annotation Guidelines: All non-trivial functions, custom hooks, utilities, and entity behaviors must be documented with JSDoc comments.

- Key Rules
- Specify Units: Always state physical units in comments (e.g., pixels/sec, ms, radians).
- Define Custom Types: Use @typedef for complex structures like entity configs, state snapshots, or collision bounds.
- Pure Functions First: Mark pure functions or side-effect-free math helpers where applicable.

### README.md Structure Template
- Every major game module or root repository should maintain a README.md using the following sections:
- Title & Banner – Short description and status badge.
- Quickstart – Commands to install, run locally (npm run dev), and build.
- Architecture Overview – High-level diagram or description of how the React UI communicates with the game engine loop.
- Controls & Gameplay – Key bindings and supported input devices (Keyboard, Touch, Gamepad).
- Directory Map – Brief summary of where key features reside.
- Performance & Profiling – Notes on memory management, asset preloading, and target FPS.
