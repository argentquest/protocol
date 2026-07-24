# Path Protocol — Sprint Plan

## Planning assumptions

- Sprints are intended to be one to two weeks, depending on team size.
- T-shirt sizes are relative estimates, not calendar commitments.
- Each sprint should end with a testable build.
- Automated tests are created alongside features instead of being deferred until the end.
- Tasks should be split further during sprint planning if an assignee believes they are larger than estimated.

### Size guide

| Size | General meaning |
|---|---|
| XS | A small, isolated update with little uncertainty. |
| S | A straightforward task affecting one area. |
| M | A multi-part task with some integration or testing. |
| L | A substantial feature crossing multiple modules. |
| XL | Too large or uncertain for implementation; split before starting. |

---

## Sprint 1 — Project Foundation

**Outcome:** A deployable React/Vite shell with working navigation, quality checks, and the initial configuration contracts.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S1-01 | Create React/Vite application | S | Initialize the JavaScript application, development server, production build, and base folder structure. |
| S1-02 | Add application screens | M | Create placeholder Main Menu, Level Select, Instructions, Game, and Results screens with navigation. |
| S1-03 | Establish global styling | S | Add CSS foundations, typography, responsive layout rules, and initial futuristic-lab color variables. |
| S1-04 | Add code-quality tooling | S | Configure formatting, linting, and consistent npm scripts for local and CI use. |
| S1-05 | Configure unit testing | S | Add Vitest and React Testing Library with a basic application smoke test. |
| S1-06 | Configure browser testing | M | Add Playwright and a smoke test that opens the application and navigates between screens. |
| S1-07 | Define level JSON Schema | M | Specify valid level metadata, arena, token, targets, obstacles, generation, scoring, and bonus settings. |
| S1-08 | Define theme JSON Schema | S | Specify colors, effects, animation values, sound references, and volume defaults. |
| S1-09 | Build configuration loader | M | Load and validate level and theme JSON with clear developer-facing errors. |
| S1-10 | Add initial configuration fixtures | S | Create a minimal Level 1 configuration and the first `themeConfig.json`. |

### Sprint 1 exit criteria

- The application runs locally and creates a production build.
- Navigation between placeholder screens works.
- Invalid level or theme configuration produces a readable error.
- Unit and browser smoke tests pass.

---

## Sprint 2 — SVG Arena and Pointer Control

**Outcome:** The player can press and drag a correctly scaled token through a responsive SVG arena.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S2-01 | Build coordinate transform | M | Map the logical 1000 × 1000 grid to the available screen area and back. |
| S2-02 | Preserve object shapes | M | Scale positions independently while keeping circles, squares, tokens, targets, and hazards undistorted. |
| S2-03 | Create SVG layer system | M | Add ordered layers for arena, obstacles, trails, targets, token, and effects. |
| S2-04 | Render arena shapes | M | Support rectangular, rounded, polygonal, and path-based arena boundaries. |
| S2-05 | Render token shapes | M | Support configurable circle, rectangle, and polygon tokens with fixed orientation. |
| S2-06 | Render targets and obstacles | M | Render the initial target and stationary obstacle primitives from level configuration. |
| S2-07 | Implement pointer capture | L | Start a drag only on the token, capture mouse input, and release it safely on attempt completion or failure. |
| S2-08 | Hide the native cursor | XS | Hide the cursor during active play so the visible token represents pointer position. |
| S2-09 | Add animation-frame input loop | M | Process high-frequency pointer movement through `requestAnimationFrame` without rerendering the React tree each event. |
| S2-10 | Test responsive geometry | M | Verify transforms and object proportions at wide, square, and tall desktop dimensions. |

### Sprint 2 exit criteria

- A mouse-down at the token center begins an active drag.
- The token follows the pointer smoothly while the button remains held.
- Token position remains correct when the play area changes size.
- Gameplay objects do not become visually distorted.

---

## Sprint 3 — Gameplay State, Trails, and Static Collisions

**Outcome:** A complete attempt can succeed or fail, with accurate trails, collision penalties, and restart behavior.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S3-01 | Implement gameplay state machine | L | Add explicit ready, dragging, target-reached, complete, failed, and restarting states. |
| S3-02 | Track the active trail | M | Record and render the token-center path throughout an attempt. |
| S3-03 | Simplify rendered trails | M | Reduce unnecessary SVG trail points without changing the measured travel distance. |
| S3-04 | Add ghost trails | S | Retain a configurable number of failed-attempt paths with reduced opacity. |
| S3-05 | Build primitive collision tests | L | Detect circle, rectangle, and polygon intersections for tokens and stationary obstacles. |
| S3-06 | Add arena containment tests | L | Confirm the complete token remains inside rectangular and irregular arena boundaries. |
| S3-07 | Add swept collision checks | L | Test movement between samples so fast pointer motion cannot tunnel through an obstacle. |
| S3-08 | Store last safe position | S | Track and restore the last valid token position after a collision. |
| S3-09 | Apply collision rules | M | Apply a 20% penalty per hit, continue the clock, and restart the level on the third collision. |
| S3-10 | Handle interrupted input | M | Treat early release, lost pointer capture, window exit, and focus loss as defined attempt failures. |
| S3-11 | Test core attempt behavior | L | Cover target contact, release rules, collision counting, snap-back, and restart transitions. |

### Sprint 3 exit criteria

- Touching a target with any part of the token registers success.
- Releasing before reaching the main target restarts the attempt.
- The first two collisions apply penalties and snap the token back.
- The third collision restarts the same level.
- The active and previous ghost trails are visible.

---

## Sprint 4 — Timing, Scoring, HUD, and Results

**Outcome:** Every attempt produces a transparent, capped score based on speed, route efficiency, and penalties.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S4-01 | Implement attempt timer | S | Start timing on valid mouse-down and keep the clock running through collisions. |
| S4-02 | Implement distance tracker | M | Measure actual logical-grid travel from the token-center path. |
| S4-03 | Calculate direct distance | S | Calculate the start-to-target segment distance and support ordered multi-target segment totals. |
| S4-04 | Implement score calculator | L | Combine 50% time and 50% route efficiency, subtract penalties, and cap at the attainable maximum. |
| S4-05 | Add live score estimation | M | Recalculate a throttled current estimate while the player drags. |
| S4-06 | Build in-level HUD | L | Show time, distance, score, maximum, collision count, level best, cumulative score, and target status. |
| S4-07 | Build results screen | M | Break down final score, time, efficiency, penalties, bonus value, and new-best status. |
| S4-08 | Add replay and next actions | S | Allow the player to replay, proceed to the next unlocked level, or return to level selection. |
| S4-09 | Test scoring edge cases | M | Test par performance, caps, zero floors, penalties, and unusually long routes or times. |

### Sprint 4 exit criteria

- The live HUD reflects the current attempt.
- A completed attempt displays a reproducible score breakdown.
- Full performance cannot exceed the configured maximum.
- Collision penalties are visible in both the HUD and results.

---

## Sprint 5 — Persistence and Game Progression

**Outcome:** Players can leave and return without losing settings, unlocked levels, or best scores.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S5-01 | Create versioned progress model | M | Define the local player, per-level score, unlock, attempt, and settings record. |
| S5-02 | Implement local storage service | M | Load, validate, save, and safely recover browser-local progress. |
| S5-03 | Add storage migrations | M | Upgrade older saved records when the persistence schema changes. |
| S5-04 | Save per-level best scores | S | Replace a stored level score only when the new completed score is higher. |
| S5-05 | Calculate cumulative score | S | Sum the best completed score from each level and repair stale stored totals on load. |
| S5-06 | Implement level unlocking | M | Unlock the next level after completion while preserving access to completed levels. |
| S5-07 | Complete level-select screen | M | Show locked, available, and completed levels with best scores and possible points. |
| S5-08 | Add progress reset | S | Provide a confirmed, recoverability-aware action that removes local progress and settings. |
| S5-09 | Test persistence behavior | M | Cover reload, malformed data, migrations, improved scores, lower replay scores, and reset. |

### Sprint 5 exit criteria

- Reloading restores completed levels, best scores, cumulative score, and settings.
- A lower replay score never reduces the cumulative score.
- Completing a level unlocks the next level.
- Reset requires confirmation and returns the game to its initial state.

---

## Sprint 6 — Deterministic Level Generation

**Outcome:** JSON generation rules create the same fair and solvable course for every player.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S6-01 | Implement seeded random service | M | Produce stable pseudo-random values from a level's fixed shared seed. |
| S6-02 | Add hybrid placement model | L | Combine exact manual coordinates with generated elements in one level. |
| S6-03 | Generate start and main target | M | Place points inside configured regions while respecting distance and clearance constraints. |
| S6-04 | Generate static obstacles | L | Place configured shape counts and sizes without invalid overlap or blocked start/target areas. |
| S6-05 | Build clearance geometry | L | Expand obstacles and shrink arenas according to the token's fixed shape and dimensions. |
| S6-06 | Implement path validator | L | Use a navigation grid or equivalent search to confirm the main target is reachable. |
| S6-07 | Add retry and fallback behavior | M | Retry invalid generation up to a configured limit and use a known-valid manual fallback. |
| S6-08 | Add generation diagnostics | S | Provide development overlays and logs for seeds, clearance, rejected placements, and validated paths. |
| S6-09 | Suggest par values | M | Calculate development-time path length and complexity data to help tune par distance and time. |
| S6-10 | Add deterministic generation tests | L | Confirm stable layouts, valid clearance, preserved manual elements, and guaranteed reachability. |

### Sprint 6 exit criteria

- The same level version and seed always produce the same course.
- Manual elements appear at their configured coordinates.
- Generated elements obey configuration constraints.
- No level starts unless its main target is reachable for the configured token.

---

## Sprint 7 — Bonus Targets and Levels 1–5

**Outcome:** The first five tuned levels are playable, and players can choose whether to risk pursuing ordered bonus targets.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S7-01 | Implement bonus-offer calculation | M | Use current score percentage and deterministic random values to decide whether to offer a target. |
| S7-02 | Show one bonus target at a time | M | Reveal only the next ordered target after the current target is reached. |
| S7-03 | Implement bank-or-continue choice | L | Let the player release at a reached target to bank points or keep dragging toward the offered bonus. |
| S7-04 | Add bonus maximum scores | M | Increase the attainable maximum when the player reaches a configured bonus target. |
| S7-05 | Add bonus failure behavior | M | End the bonus run and apply its configured 20% penalty when an accepted target is not reached. |
| S7-06 | Add bonus HUD states | S | Show offer, current target order, risk, earned bonus value, and remaining possible targets. |
| S7-07 | Author Level 1 — Calibration | S | Introduce basic dragging, static barriers, and collision feedback without bonuses. |
| S7-08 | Author Level 2 — Deflection | S | Add mixed obstacle shapes and meaningful route choice. |
| S7-09 | Author Level 3 — Tight Tolerances | M | Add narrower clearances and the first possible bonus target. |
| S7-10 | Author Level 4 — Bent Chamber | M | Introduce an irregular arena and polygon obstacles. |
| S7-11 | Author Level 5 — Long Route | M | Add competing paths and up to two ordered bonus targets. |
| S7-12 | Playtest and tune Levels 1–5 | L | Adjust sizes, clearances, par values, scores, and bonus rates using recorded results. |

### Sprint 7 exit criteria

- Bonus targets are optional, sequential, and displayed one at a time.
- Releasing at a reached target banks the attempt.
- Bonus rewards and failures are included correctly in results.
- Levels 1–5 form a clear and fair difficulty progression.

---

## Sprint 8 — Moving Hazards and Levels 6–10

**Outcome:** Later levels introduce fixed-orientation token variants and predictable moving obstacles without compromising collision accuracy.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S8-01 | Define obstacle motion schema | M | Configure path type, range, speed, direction, phase, easing, and timing offsets. |
| S8-02 | Implement moving obstacle engine | L | Update hazard positions from elapsed level time so motion remains frame-rate independent. |
| S8-03 | Add moving swept collisions | L | Detect collisions between the moving token and moving obstacle geometry between frames. |
| S8-04 | Validate motion envelopes | L | Ensure moving hazards remain within allowed regions and leave a valid opportunity for passage. |
| S8-05 | Add motion telegraphing | M | Visually communicate movement paths, direction, or timing without giving away the solution. |
| S8-06 | Author Level 6 — Shape Test | M | Introduce a non-circular, fixed-orientation token and tighter clearance rules. |
| S8-07 | Author Level 7 — Motion Detected | M | Introduce one slow, predictable moving obstacle. |
| S8-08 | Author Level 8 — Crossing Signals | M | Combine multiple moving hazards with different timing offsets. |
| S8-09 | Author Level 9 — Containment | L | Combine irregular boundaries, narrow geometry, movement, and bonus-risk choices. |
| S8-10 | Author Level 10 — Final Protocol | L | Combine all established mechanics into the highest-value course. |
| S8-11 | Playtest and tune Levels 6–10 | L | Tune motion, clearance, scoring, pars, and bonus chains for difficulty and fairness. |

### Sprint 8 exit criteria

- Moving obstacles behave identically at different frame rates.
- Their complete movement envelopes remain valid.
- Collision and snap-back behavior works while hazards move.
- All ten configured levels are playable and solvable.

---

## Sprint 9 — Theme, Audio, and Menu Completion

**Outcome:** Path Protocol has a polished futuristic-lab presentation with configurable visual effects and audio.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S9-01 | Complete futuristic-lab SVG theme | L | Add laboratory arena styling, grids, hazard treatments, targets, and token visuals without bitmap dependencies. |
| S9-02 | Add configurable SVG effects | M | Implement theme-driven glow, pulse, trail, collision, success, and bonus effects. |
| S9-03 | Build audio manager | M | Manage browser audio unlock, loading, looping, playback, mute, and independent volume channels. |
| S9-04 | Add background music | M | Integrate a seamless futuristic loop with licensing and attribution information. |
| S9-05 | Add gameplay sound effects | M | Add feedback for drag start, collisions, targets, bonuses, failure, and completion. |
| S9-06 | Persist audio settings | S | Save music and effects enablement and volume levels locally. |
| S9-07 | Complete Main Menu | M | Finish Play, Continue, Level Select, Instructions, settings, and reset interactions. |
| S9-08 | Complete Instructions screen | S | Explain token size, dragging, collisions, targets, bonuses, scoring, and release behavior. |
| S9-09 | Add reduced-motion behavior | M | Reduce nonessential animation and intense effects based on system preference or player setting. |
| S9-10 | Audit third-party licenses | S | Record licenses and attributions for all audio, libraries, fonts, and external assets. |

### Sprint 9 exit criteria

- Visual styling is controlled by `themeConfig.json`.
- Music and effects work after the first user interaction.
- Audio and reduced-motion settings persist.
- All menus and instructions are complete.
- Every external asset has compatible license documentation.

---

## Sprint 10 — Quality, Performance, and Release

**Outcome:** The game is production-ready, tested across supported desktop browsers, and deployable as a static web application.

| ID | Task | Size | Short description |
|---|---|---:|---|
| S10-01 | Complete unit-test coverage | L | Cover geometry, collisions, scoring, state transitions, generation, transforms, and persistence edge cases. |
| S10-02 | Complete end-to-end journeys | L | Test first play, failure, completion, bonus pursuit, replay, unlocks, reload, settings, and reset. |
| S10-03 | Run visual regression checks | M | Check arena, HUD, menus, results, and object proportions at supported desktop sizes. |
| S10-04 | Profile gameplay performance | M | Measure pointer processing, SVG rendering, collision work, trail growth, and animation-frame stability. |
| S10-05 | Optimize SVG effects and trails | M | Reduce expensive filters, reuse effects, and bound trail and ghost-trail complexity. |
| S10-06 | Test supported browsers | M | Verify current Chrome, Edge, Firefox, and Safari desktop behavior where available. |
| S10-07 | Complete accessibility audit | M | Verify keyboard menus, focus visibility, contrast, non-color state indicators, and reduced motion. |
| S10-08 | Balance all levels | L | Review completion data and tune par values, maximum scores, penalties, gaps, motion, and bonuses. |
| S10-09 | Configure production deployment | M | Create the static production build, hosting configuration, error handling, and cache rules. |
| S10-10 | Prepare release checklist | S | Document validation, testing, licensing, configuration, storage migration, and rollback checks. |
| S10-11 | Publish version 1.0 | S | Build, deploy, smoke-test production, and record the released configuration and generator versions. |

### Sprint 10 exit criteria

- Supported desktop browsers pass the critical gameplay journeys.
- Gameplay maintains the target frame rate on a representative desktop.
- All ten levels have final validated configurations.
- Production is deployed and smoke-tested.
- Version 1.0 configuration, seeds, schemas, and licenses are recorded.

---

## Cross-sprint definition of done

A task is complete only when:

- Its implementation matches `architecture.md` and the relevant JSON contracts.
- Relevant automated tests are added and passing.
- Error and interruption states are handled.
- Configuration values are not unnecessarily hard-coded.
- Mouse input remains smooth and does not introduce avoidable React rerenders.
- New visual behavior is checked at multiple desktop aspect ratios.
- New assets or dependencies have compatible license information.
- The production build succeeds.

## Dependency summary

```text
Sprint 1: Foundation
  -> Sprint 2: SVG and input
    -> Sprint 3: State, trails, and collisions
      -> Sprint 4: Scoring and HUD
        -> Sprint 5: Persistence and progression
        -> Sprint 6: Generation and validation
          -> Sprint 7: Bonuses and Levels 1–5
            -> Sprint 8: Moving hazards and Levels 6–10
              -> Sprint 9: Presentation and audio
                -> Sprint 10: Release hardening
```

Some work can overlap after its dependencies are stable. For example, persistence work can begin while generation is developed, and audio asset selection can begin before final level authoring.
