# Path Protocol V2 — Gameplay Expansion Design Review

## Purpose

This document reviews the current V2 implementation and proposes gameplay expansion work that fits the existing fixed-step engine, JSON configuration, geometry, Pixi rendering, scoring, and persistence boundaries.

The primary recommendations are:

1. Add contact-reactive obstacle surfaces for new route-planning choices.
2. Connect the existing Micro Protocol system to campaign completion as an optional post-level challenge.
3. Add an opt-in kinetic shot mode: aim, launch, ricochet, lose speed, and come to an exact stop before the next shot.

No proposal changes the behavior of an existing level when its new optional configuration is absent.

---

## 1. Verified Current Architecture

### Existing gameplay systems

The current repository is further along than the earlier draft of this review suggested.

| Area | Current implementation |
|---|---|
| Campaign | 100 authored level configurations |
| Micro-levels | Seven separately configured Micro Protocol levels (`level-201` through `level-207`) |
| Arena geometry | Rectangle, ellipse, and polygon arenas in a 1600 × 900 logical world |
| Token geometry | Circle, rectangle, and diamond |
| Static obstacles | Circle, rectangle, and diamond |
| Moving hazards | Sinusoidal motion and tracking movement |
| Dynamic obstacles | Phase, orbit, pulse, switch-controlled, and rotate behaviors |
| Environmental forces | Conveyor, repulsor, and attractor fields |
| Interactive elements | One-shot, timed, and toggle switches |
| Simulation | Framework-neutral fixed-step engine at 60 Hz |
| Collision | Complete-token containment and sampled swept collision against moving/rotating shapes |
| Rendering | Stable Pixi display objects updated from engine-owned state |
| Completion | Campaign results plus independently launched/persisted Micro Protocols |

### Important integration facts

- `MovementSystem.js` computes a desired velocity from pointer or keyboard intent and approaches it using acceleration/deceleration. It is guided movement, not ballistic motion.
- `CollisionSystem.js` calls `sweepShape()` and currently treats a blocked sweep as a penalized collision: restore the last safe position and zero velocity.
- `geometry.js` already supports rotated rectangles/diamonds and interpolates moving and rotating obstacles during a sweep.
- `GameEngine.js` is the correct owner for shot state, deterministic impact response, target checks, distance, and events.
- Raw input must continue to record intent only. A launch must be consumed on a fixed simulation step, not applied from a pointer handler.
- Pixi should render aim previews, impact feedback, and transforms, but must not calculate a trajectory or decide a rebound.
- Existing Micro Protocols already use full level configurations, the normal engine, reward persistence, and a registry. A completion challenge should build on this rather than introduce a second mini-level format.

### Corrections to the earlier concept draft

The following are already implemented and should not be proposed as new systems:

- rotating obstacles;
- pulsing obstacles;
- phase-shifting obstacles;
- switch-controlled gates;
- conveyor fields;
- repulsor fields;
- attractor fields;
- standalone mini-levels/Micro Protocols.

New work should extend these systems or create contact behavior they do not currently provide.

---

## 2. Design Goals

The expansion should:

- make route selection and obstacle contact strategically meaningful;
- preserve deterministic simulation and released-level seeds;
- support pointer and keyboard play;
- keep scoring and gameplay decisions inside the engine;
- retain the complete-token collision rule;
- preserve normal guided controls on every existing level;
- allow the generator and campaign validator to prove conservative clearance;
- expose serializable state and discrete events to rendering/audio;
- use theme-neutral `mediaId` values and per-element fallback;
- avoid a general-purpose physics engine.

The kinetic mechanic is deliberately a small deterministic collision-response system, not a conversion of Path Protocol into a physics simulation.

---

## 3. New Contact-Reactive Obstacle Types

These surfaces matter most in kinetic shot levels, but several can also be used in guided levels. They should live in one optional `kineticSurfaces` array rather than many top-level arrays. Each entry has normal collision geometry plus a response descriptor.

### 3.1 Rebound Rail

A rectangle or diamond that reflects the incoming velocity around its contact normal.

```json
{
  "id": "rail-bank-a",
  "mediaId": "obstacle-rebound-rail",
  "shape": "rect",
  "x": 720,
  "y": 360,
  "width": 260,
  "height": 28,
  "rotationDegrees": -25,
  "response": {
    "type": "rebound",
    "restitution": 0.82,
    "minimumExitSpeed": 80
  }
}
```

Use cases:

- authored bank shots around a blind corner;
- narrow approach-angle puzzles;
- safe teaching surfaces with a visible normal/chevron treatment.

`restitution` scales speed after reflection. It should normally remain at or below `1`; values above `1` belong to bumpers.

### 3.2 Bumper

A circular surface that rebounds and can add a bounded speed boost.

```json
{
  "id": "bumper-a",
  "mediaId": "obstacle-bumper",
  "shape": "circle",
  "x": 980,
  "y": 440,
  "size": 76,
  "response": {
    "type": "bumper",
    "restitution": 1.08,
    "maximumExitSpeed": 780
  }
}
```

Use cases:

- reach pockets that a normal launch cannot enter;
- reverse direction in compact spaces;
- create optional high-speed shortcuts.

The speed cap is mandatory so repeated bumper loops cannot accelerate forever.

### 3.3 Arrestor / Catch Pad

A surface or zone that stops the token immediately with velocity exactly `{x: 0, y: 0}` and permits a new shot.

```json
{
  "id": "catch-a",
  "mediaId": "obstacle-arrestor",
  "shape": "rect",
  "x": 1220,
  "y": 650,
  "width": 150,
  "height": 90,
  "response": { "type": "stop" }
}
```

Use cases:

- provide a stable setup point before a difficult second bank;
- divide a course into understandable shot puzzles;
- prevent slow, frustrating drift near a target.

An arrestor is not a penalty collision. It is intentional course geometry.

### 3.4 Redirector

A surface that sends the token along a configured direction instead of reflecting it physically.

```json
{
  "id": "redirect-a",
  "mediaId": "obstacle-redirector",
  "shape": "diamond",
  "x": 810,
  "y": 620,
  "size": 70,
  "response": {
    "type": "redirect",
    "directionDegrees": 315,
    "speedScale": 0.75
  }
}
```

Use cases:

- deterministic pinball-style route changes;
- readable puzzle logic that does not require estimating a normal;
- one-way access to isolated chambers.

The renderer should show the exit direction. Direction must never be hidden in artwork alone.

### 3.5 Fragile Barrier

A wall with engine-owned integrity. Contact either cracks it and rebounds/stops the token or breaks it and makes it non-solid.

```json
{
  "id": "fragile-a",
  "mediaId": "obstacle-fragile-wall",
  "shape": "rect",
  "x": 1080,
  "y": 260,
  "width": 120,
  "height": 36,
  "response": {
    "type": "fragile",
    "integrity": 2,
    "onSurvive": "rebound",
    "restitution": 0.45
  }
}
```

Use cases:

- require multiple shots to open a route;
- trade distance/time for a shortcut;
- create stateful layouts without changing the released seed.

Integrity resets on attempt restart. If campaign designs later need permanent destruction, that is a separate persistence decision.

### 3.6 Hazard Cushion

A soft obstacle that absorbs most speed and applies the normal collision penalty without restoring the token all the way to the old last-safe checkpoint.

This is the highest-risk proposal because the core gameplay contract currently says collisions restore the last safe position. It should therefore be deferred unless product explicitly approves a kinetic-mode exception. Rebound rails, bumpers, arrestors, redirectors, and fragile barriers do not need that exception because their contacts are interactions rather than `collision.started` events.

---

## 4. Kinetic Shot / Ricochet Mode

### 4.1 Player Experience

The token begins stationary. The player chooses an angle and launch strength, then releases a shot. While the token is moving:

- steering is locked;
- the token follows a straight deterministic trajectory between impacts;
- arena boundaries and configured surfaces change its direction and speed;
- travel drag and impact restitution reduce speed;
- once speed is below the stop threshold, velocity becomes exactly zero;
- there is no residual sliding or creeping;
- the player may then aim and launch the next shot.

The goal is to reach targets through bank shots and controlled rebounds, including chambers that cannot be reached in a direct line.

The home-screen movement toggle applies this mode to any campaign level through
an immutable runtime projection. Authored `shotMechanic` values override the
global defaults; Guided mode removes the mechanic without changing source JSON.

### 4.2 Implemented optional level configuration

```json
{
  "shotMechanic": {
    "inputStyle": "drag-release",
    "minimumAimDistance": 8,
    "minimumLaunchSpeed": 260,
    "maximumLaunchSpeed": 820,
    "aimDistanceForMaximumSpeed": 260,
    "dragPerSecond": 260,
    "stopSpeed": 36,
    "restitution": 0.78,
    "maximumImpactsPerStep": 4
  },
  "shotGoals": {
    "perfectShots": 2,
    "par": 4,
    "maximumShots": 8
  }
}
```

Both objects are optional and preserve the existing level schema. `shotGoals`
requires an authored `shotMechanic`; global Ricochet projection may still apply
movement defaults to levels that omit both objects.

### 4.3 Input contract

Pointer:

1. Press the stationary token to enter aiming.
2. Pull opposite the desired launch direction to define direction and strength.
3. Release to queue the shot.
4. Pointer movement during flight has no gameplay effect.

Keyboard:

1. Arrow keys rotate the aim direction while stationary.
2. Optional Up/Down strength adjustment is allowed only if it does not conflict with angle controls; the simpler first release uses a fixed configured keyboard speed.
3. Space queues the shot.
4. Space during flight does not stop the token.

Accessibility:

- expose angle and power as nearby React text while aiming;
- provide a visible direction line and power markers;
- never communicate bumper/stop/redirect behavior by color alone;
- respect reduced motion by reducing particles and camera effects, not trajectory feedback.

The raw input layer records `aimDirection`, `aimStrength`, and `launchRequested`. `GameEngine.step()` consumes `launchRequested` at the next fixed step and clears it. This makes launch timing deterministic even when browser input arrives between simulation ticks.

### 4.4 Session state

Add an engine-owned kinetic block only for configured shot levels:

```js
session.kinetic = {
  phase: 'resting', // resting | aiming | in-flight
  aimDirection: { x: 1, y: 0 },
  aimStrength: 0,
  launchRequested: false,
  shotsTaken: 0,
  impactsThisShot: 0,
  aimStart: { x: 0, y: 0 },
}
```

The token also owns `lastRestPosition`, updated only at exact rest or a target
checkpoint. A `reset` kinetic surface returns to this checkpoint without
introducing residual momentum.

The global game state machine does not need `aiming` and `in-flight` states. It should remain in `active-main` or `active-bonus`; kinetic phase is a movement substate. This avoids duplicating all target, bonus, pause, restart, and completion transitions.

The first accepted launch transitions `ready → active-main` and starts the real-time attempt clock. Later shots occur inside `active-main`. Coming to rest does not pause the clock.

If `maximumShots` is configured, the engine counts each launch immediately but
does not fail while the final shot is moving. Target sweeps resolve first; only
a final shot that comes to rest without reaching the required target restarts
the attempt. Completions are rated Perfect, Under Par, Par, or Over Par.

### 4.5 Deterministic motion

Implement a new pure helper rather than adding conditionals throughout `advanceTokenMotion()`:

```text
advanceKineticMotion(position, velocity, stepSeconds, drag)
  speed = length(velocity)
  nextSpeed = max(0, speed - drag * stepSeconds)
  if nextSpeed <= stopSpeed:
    return same position or the final integrated position, velocity = (0, 0), stopped = true
  direction = normalize(velocity)
  nextVelocity = direction * nextSpeed
  nextPosition = position + nextVelocity * stepSeconds
```

Use a documented semi-implicit or trapezoidal integration rule and freeze it with tests. Do not derive motion from render delta time.

The stop rule must assign literal zero components. An epsilon-only definition would leave visible drift and unstable aim availability.

### 4.6 Impact resolution

The existing `sweepShape()` reports safe/blocked and an approximate collision point, but it does not return:

- time of impact within the movement segment;
- contact normal;
- impacted obstacle ID;
- remaining step time.

Ricochet therefore needs a richer geometry query, for example:

```js
traceFirstImpact({ from, to, tokenShape, arena, obstacles, previousObstacles })
// => { hit, fraction, point, normal, kind, obstacleId }
```

On impact, the normal rebound formula is:

```text
reflectedVelocity = velocity - 2 × dot(velocity, normal) × normal
exitVelocity = reflectedVelocity × restitution
```

Resolution for one fixed step:

1. Find the earliest impact along the requested segment.
2. Move to the last non-penetrating position immediately before contact.
3. Resolve the configured response.
4. Offset outward by a small geometry epsilon to avoid immediate re-contact.
5. Continue through the unused fraction of the same fixed step.
6. Stop after `maximumImpactsPerStep`; set velocity to zero and emit a diagnostic event if the cap is reached.

Continuing through remaining step time prevents low frame-rate/fixed-step artifacts where every rebound loses an entire tick. The impact cap prevents pathological corner loops.

Normals by geometry:

- rectangle/diamond/polygon: outward normal of the contacted edge;
- circle: normalized vector from circle center to token contact center;
- rectangle arena: inward normal of the crossed boundary;
- ellipse arena: normalized gradient of the ellipse equation at contact;
- polygon arena: inward normal of the contacted boundary edge.

Corner ties must have a stable rule, such as choosing the candidate with the earliest fraction and then the lowest stable edge index. Never resolve a tie using object iteration order that schema transformations might change.

### 4.7 Collision semantics

An intentional rebound is not a normal collision penalty. Emit separate events:

- `shot.launched`;
- `shot.impacted`;
- `shot.stopped`;
- `surface.broken`;
- `shot.limit-reached`.

Reserve `collision.started` for penalized hazards. This preserves score meaning, collision limits, audio cooldowns, and existing analytics.

Suggested response matrix:

| Contact | Kinetic result | Counts as collision? |
|---|---|---|
| Arena boundary | Reflect and scale speed | No |
| Normal obstacle in shot mode | Use `defaultObstacleResponse` | No |
| Rebound rail | Reflect and scale speed | No |
| Bumper | Reflect, boost, cap speed | No |
| Arrestor | Exact zero velocity | No |
| Redirector | Set configured direction and scaled speed | No |
| Fragile barrier | Damage, then rebound or pass through on break | No |
| Existing explicit hazard | Restore/penalize according to existing contract | Yes |

If designers need both rebound obstacles and lethal hazards, the schema must identify them explicitly. Do not infer behavior from `mediaId`.

### 4.8 Target behavior

Keep the existing “any part of the token touches the target” rule. A target is reached during the swept path, not merely at the end of a tick. The impact trace should consider target contact along each subsegment before resolving a later wall impact.

Two useful authored variants can be added later:

- `target.capture: "touch"` — current behavior; reaching at speed completes immediately;
- `target.capture: "rest"` — token must overlap the target and be at exact rest.

The first release should use `touch` only. A rest-capture cup requires careful handling so the token does not rebound away after valid entry.

### 4.9 Scoring

The canonical time/distance/collision formula can remain unchanged:

- elapsed real time continues across every aim and shot;
- actual distance includes every traveled subsegment, including rebounds;
- direct distance remains the straight benchmark through reached targets;
- penalized hazards still affect `collisionCount`;
- intentional surface contacts do not.

Add `shotsTaken` as a result statistic, not a score term, for the first release. A separate par-shots formula would create two competing score contracts. If playtesting later shows that shot efficiency matters, add a schema-versioned scoring weight and update the single engine calculator.

### 4.10 Powers and forces

For the first kinetic release:

- disable consumable powers unless individually audited;
- do not apply conveyor/attractor/repulsor acceleration during flight;
- permit dynamic obstacles only after moving-surface impact tests exist;
- keep the route preview visual-only and engine-derived.

This is an authoring restriction, not an architectural limitation. Combining continuous force fields, moving surfaces, shields, and multi-impact motion before the core mechanic is stable would make validation and player prediction unnecessarily difficult.

### 4.11 Renderer and audio

Pixi reads engine state and events:

- aim line from token center along `aimDirection`;
- power shown by line length/markers;
- optional one-bounce preview generated by an engine geometry helper;
- impact flash at the engine-provided contact point;
- surface state/integrity from session snapshots;
- distinct trail samples at impact points so bank shots remain legible.

Howler responds to logical events:

- launch;
- rebound with optional speed-to-volume mapping;
- bumper;
- arrestor stop;
- fragile crack/break;
- target capture.

Audio mapping and cooldowns belong in `audio.json`. Simulation must not query audio state.

---

## 5. Campaign Completion Mini-Level System

### 5.1 Build on Micro Protocols

The repository already has a good mini-level abstraction:

- dedicated validated level JSON;
- `microProtocols.json` metadata;
- full engine reuse;
- unlock levels and tiers;
- first-clear/tier rewards;
- separate best-score persistence;
- seven existing challenge types.

The missing feature is presentation at the campaign-completion seam. Instead of embedding a generated “breach” object in each campaign level, add an optional reference:

```json
{
  "completionChallenge": {
    "protocolId": "spinner-sync",
    "offer": "after-bank",
    "failurePolicy": "keep-campaign-result"
  }
}
```

This is backward-compatible: an absent property produces the current results flow.

### 5.2 Recommended flow

1. Campaign `GameEngine` completes and calculates the canonical result.
2. `App` persists that campaign result immediately.
3. If the level references an unlocked completion challenge, show **Banked — Attempt Protocol?**
4. **Skip** opens normal campaign results.
5. **Attempt** creates a new `GameEngine` for the registered Micro Protocol level.
6. Success is recorded through the existing `recordMicroProtocolResult()` path.
7. Failure or early exit returns to the already-banked campaign results with no loss.

This should be orchestration in React/application state because it swaps between two independent level sessions. It should not add breach states to the campaign `GameStateMachine`.

### 5.3 Reward policy

Do not multiply the already-calculated campaign score. Doing so would make the same campaign execution worth different scores based on optional content and complicate best-score replacement.

Use the existing Micro Protocol rewards:

- first-clear coins;
- tier-clear coins;
- independent protocol best score;
- optional cosmetic/badge unlock later.

The campaign record and protocol record remain separate and idempotent, preventing reward farming.

### 5.4 Content strategy

Not every campaign level needs a unique mini-level. A protocol can be offered after several levels, while its normal unlock remains available from the level-select screen.

Recommended cadence:

- introduce a protocol immediately after the campaign tier teaches its mechanic;
- keep completion offers optional and under roughly 15–25 seconds of expected play;
- use handcrafted layouts for signature mechanics;
- only add generated variants after solvability validation supports the relevant dynamic and kinetic envelopes.

Ricochet is a player-selected movement mode for campaign and Micro Protocol
sessions, not a separate Micro Protocol. Existing dynamic protocols provide
focused layouts in which players can practice rebound routes without a
duplicate kinetic-only challenge.

---

## 6. Schema and Validation Plan

### Optional additions

```json
{
  "shotMechanic": { "$ref": "#/$defs/shotMechanic" },
  "kineticSurfaces": {
    "type": "array",
    "items": { "$ref": "#/$defs/kineticSurface" },
    "default": []
  },
  "completionChallenge": {
    "$ref": "#/$defs/completionChallenge"
  }
}
```

Existing required properties stay unchanged. Existing JSON files require no migration.

### Relationship validation

Add actionable checks for:

- globally unique IDs across obstacles, dynamic obstacles, switches, force fields, and kinetic surfaces;
- every kinetic surface has registered `mediaId` and valid dimensions;
- `minimumLaunchSpeed <= maximumLaunchSpeed`;
- restitution, drag, stop speed, impact cap, and shot cap are bounded;
- redirect directions are finite;
- fragile integrity is a positive integer;
- a `completionChallenge.protocolId` exists in the Micro Protocol registry;
- kinetic levels do not use unsupported power/force/dynamic combinations in the first release;
- every spawn and required target has complete-token clearance;
- a deterministic kinetic route exists within `maximumShots`, when a shot limit is configured.

### Kinetic solvability

The current grid pathfinder proves steerable clearance, not bank-shot solvability. It must not be used to claim a kinetic course is solvable.

For initial handcrafted micro-levels, validate using a deterministic bounded search:

1. Quantize launch angles and strengths.
2. Simulate each candidate with the production kinetic resolver.
3. Treat every exact-rest location as a node for the next shot.
4. Deduplicate rest nodes by a documented spatial grid and remaining fragile state.
5. Search to `maximumShots`.
6. Save a known solution fixture and verify it remains valid in tests.

This validator is build/test tooling. Runtime gameplay uses the normal engine and released JSON only.

---

## 7. Implementation Seams

| Module | Proposed responsibility |
|---|---|
| `level.schema.json` | Optional shot, kinetic surface, and completion challenge contracts |
| `validateConfig.js` | Cross-reference IDs, bounds, unsupported combinations |
| `levelGenerator.js` | Normalize kinetic shapes; reserve their full envelopes |
| `createLevelSession.js` | Initialize kinetic phase, shot count, surface integrity |
| `InputController.js` | Record aim/launch intent through a control-profile adapter |
| `KineticMovementSystem.js` | Pure drag, stop, reflection, redirect, and response math |
| `geometry.js` | Earliest-impact fraction, contact normal, stable tie-breaking |
| `CollisionSystem.js` | Dispatch guided collision or kinetic multi-impact trace |
| `GameEngine.js` | Consume launch requests, advance shots, emit events, target/scoring integration |
| `EngineSnapshot.js` | Serializable kinetic phase, aim, shots, and surface states |
| `PixiSceneRenderer.js` | Stable surface displays, aim line, impact feedback |
| `GameView.jsx` | Select input control profile and relay logical audio/events |
| `App.jsx` | Post-bank completion challenge orchestration |
| `progressStore.js` | Reuse Micro Protocol records; optionally record campaign-to-protocol clear badge |

Avoid placing rebound math in `PixiSceneRenderer`, pointer handlers, or React state.

---

## 8. Test Plan

### Pure motion and geometry

- launch speed clamps at minimum and maximum;
- identical inputs produce identical trajectories;
- drag is applied in documented units per second;
- speed below threshold becomes exactly zero on both axes;
- horizontal, vertical, angled, circle, ellipse, and polygon normals reflect correctly;
- restitution changes only speed magnitude, not reflection direction;
- moving/rotating surface interpolation remains deterministic;
- earliest impact wins and corner ties are stable;
- multiple impacts in one fixed step consume remaining time;
- impact cap prevents infinite corner loops;
- no tunneling at maximum launch speed.

### Engine behavior

- launch requests are consumed only on a fixed step;
- steering input cannot alter an in-flight token;
- the clock continues while resting/aiming after the first shot;
- distance includes every rebound segment;
- intentional rebounds do not increment collision count;
- penalized hazards still restore/count according to the existing contract;
- arrestors stop exactly and allow another shot;
- bumper speed cannot exceed its cap;
- fragile integrity resets on restart;
- target contact along a subsegment completes before a later impact;
- pause/resume cannot duplicate a queued launch;
- restart preserves the deterministic layout.

### Configuration and generation

- all existing levels validate unchanged;
- invalid response objects fail with entity IDs in messages;
- completion challenge references are validated;
- kinetic surface envelopes remain inside the arena;
- known kinetic solution fixtures clear their levels within the shot limit.

### UI and browser journeys

- pointer aim/release launches once;
- keyboard aim and Space launch are fully playable;
- aim preview agrees with the first engine impact;
- no aim controls respond during flight;
- campaign result is banked before a protocol offer;
- skipping, succeeding, failing, and exiting a protocol all return correctly;
- reload does not duplicate campaign or protocol rewards;
- reduced-motion mode retains necessary trajectory feedback.

---

## 9. Recommended Delivery Sequence

### Phase 1 — Geometry spike

- Add pure earliest-impact and normal queries.
- Prove rectangle, circle, ellipse-arena, and polygon-arena rebounds.
- Add deterministic multi-impact tests at the maximum supported speed.

Exit criterion: a headless token can bank predictably without penetration or drift.

### Phase 2 — Kinetic engine mode

- Add optional schema/config.
- Add kinetic session state and fixed-step launch consumption.
- Add exact stopping, distance, target, restart, and events.
- Disable unsupported feature combinations through validation.

Exit criterion: one headless kinetic level is fully completable by pointer-equivalent and keyboard-equivalent intent.

### Phase 3 — First obstacle set and Pixi feedback

- Ship rebound rail, bumper, and arrestor.
- Add stable display objects, aim line, one-bounce preview, and audio events.
- Author three Micro Protocol levels with known solution fixtures.

Exit criterion: the complete mouse and keyboard Playwright journeys pass.

### Phase 4 — Completion integration

- Add optional campaign-to-protocol reference.
- Bank campaign results before offering the protocol.
- Reuse existing protocol persistence and rewards.

Exit criterion: skip/success/failure/reload paths are idempotent.

### Phase 5 — Advanced contact behavior

- Add redirector and fragile barrier.
- Audit moving obstacles, forces, shields, and powers one feature at a time.
- Profile collision traces before considering any spatial index.

---

## 10. Final Recommendation

The best near-term expansion is not another set of purely time-driven obstacle animations; the engine already has a strong selection of them. The meaningful gap is **contact-reactive geometry**.

Build kinetic shot mode as an opt-in movement profile with deterministic multi-impact tracing and exact rest. Launches should be fixed-step intents, rebounds should be non-penalty interaction events, and existing guided levels should never enter the new code path unless `shotMechanic` is present.

For mini-level completion, reuse the shipped Micro Protocol system. Persist the campaign result first, offer a referenced protocol, and keep its reward/record separate. This gives the game a satisfying post-completion beat without duplicating engine sessions, scoring formulas, level formats, or persistence logic.
