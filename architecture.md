# Path Protocol — Game Architecture

## 1. Purpose

Path Protocol is a desktop, browser-based precision game built with React, Vite, JavaScript, and web-optimized vector graphics. The player clicks and holds a visible token, drags it through a generated obstacle course, and reaches one or more targets without releasing the mouse.

The game rewards:

- Fast completion.
- Efficient travel compared with the direct route.
- Avoiding obstacles and arena boundaries.
- Judiciously pursuing optional bonus targets.
- Improving previous scores on replayed levels.

This document is the source of truth for the initial ten-level version. Gameplay values belong in configuration files so that levels and themes can be tuned without rewriting the game engine.

## 2. Product Scope

### 2.1 Initial release

The initial release will include:

- Ten progressively more difficult levels.
- Deterministically generated courses.
- Optional manually placed elements within generated levels.
- Stationary obstacles in early levels.
- Moving obstacles in later levels.
- Circular, rectangular, polygonal, and custom-path arenas and obstacles.
- Tokens with configurable shapes and dimensions.
- Ordered, optional bonus targets.
- Per-level and cumulative scoring.
- Local browser progress and high-score storage.
- A futuristic laboratory theme.
- SVG or equivalent web-native vector graphics.
- Sound effects and looping background music.
- Desktop mouse and trackpad support.

### 2.2 Not included in the initial release

- Touchscreen gameplay.
- User accounts or cloud synchronization.
- Multiplayer.
- Server-side services.
- Token rotation.
- Bitmap-dependent gameplay graphics.
- A level editor.

These features may be added later without changing the core level-data model.

## 3. Technology

| Area | Choice |
|---|---|
| Application | React |
| Build tooling | Vite |
| Language | Modern JavaScript using ES modules |
| Gameplay graphics | SVG and web-native vector effects |
| Menus and HUD | React and CSS |
| Animation loop | `requestAnimationFrame` |
| Input | Pointer Events restricted to mouse/trackpad |
| Audio | Web Audio API and optimized audio files |
| Configuration | JSON |
| Persistence | `localStorage` |
| Automated tests | Vitest and React Testing Library |
| Browser tests | Playwright |

No game framework is required initially. The game has a focused interaction model, and direct SVG rendering gives better control over vector shapes, collision geometry, trails, and responsive scaling. A small, permissively licensed geometry or audio library may be added if it materially reduces complexity. Any third-party asset or library must have its license recorded.

## 4. Core Gameplay

### 4.1 Attempt flow

1. The level engine loads the level definition and its fixed seed.
2. The generator creates the arena, start, main target, obstacles, and any configured manual elements.
3. The validator confirms that the token has at least one valid path to the main target.
4. The player presses and holds the center of the token at the start point.
5. The timer and distance tracking start on valid mouse-down.
6. The normal cursor is hidden inside the play area; the token becomes the visible cursor.
7. The token follows the pointer while the mouse button remains held.
8. The player reaches the main target by touching it with any part of the token.
9. The player may release while at the reached target to complete the level, or continue if a bonus target is offered.
10. Releasing before the main target is reached ends the attempt and restarts the level.

The same generated course remains in place for retries. A retry must not silently create an easier or harder layout.

### 4.2 Token behavior

- The pointer controls the center of the token.
- The token has real width, height, and shape used by collision detection.
- The token does not rotate.
- Token size and shape may change by level.
- A token touches a target when any part of its collision geometry overlaps the target.
- The full token must remain inside the arena.
- The full token is tested against every obstacle.

### 4.3 Trail behavior

- A visible line records the actual center path of the token.
- The active trail remains visible for the entire attempt.
- After an unsuccessful attempt, the previous path remains as a faint ghost trail.
- Only a small configurable number of ghost trails should be retained to avoid visual clutter and excess DOM nodes.
- Trail samples are simplified for rendering, but unsimplified or sufficiently precise samples are used for scoring.

### 4.4 Collision behavior

Touching an obstacle or the arena boundary causes a collision.

On the first and second collisions:

- Add one collision to the attempt.
- Apply a penalty equal to 20% of the level's currently attainable maximum score.
- Snap the token back to its last safe position.
- Keep the mouse captured and allow the attempt to continue.
- Do not stop or rewind the clock.
- Preserve the distance already traveled.
- Play visual and audio feedback.

On the third collision:

- End the attempt.
- Restart the same level layout.
- Reset the attempt timer, distance, collision count, and active trail.
- Preserve the failed attempt as an optional ghost trail.

A continuous overlap must count as only one collision. Another collision can be registered only after the token has returned to a safe position and subsequently enters a hazard again.

### 4.5 Mouse release behavior

- Releasing before reaching the main target fails the attempt and restarts the level.
- Once a required target has been reached, releasing while the token is still touching that target banks the score and completes the attempt.
- If a bonus target has been accepted by moving away from the last reached target, releasing before touching the bonus target ends the bonus run and applies its configured 20% penalty.
- Losing pointer capture, leaving the browser window, or losing page focus is treated as a mouse release.

### 4.6 Bonus targets

- A level can configure zero or more possible bonus targets.
- Bonus targets are optional.
- Only one bonus target is displayed at a time.
- Bonus targets are ordered.
- After the main target or current bonus target is reached, the game calculates whether another bonus target is offered.
- The default offer probability is the player's current score percentage. For example, an 80% score produces an 80% offer chance.
- The player can release at the currently reached target to bank the score.
- If the player keeps holding and moves toward the offered target, the same drag, timer, distance, and trail continue.
- Reaching a bonus target raises the maximum score attainable during that attempt by the amount configured for that target.
- Failing an accepted bonus target costs 20% of the level score, as configured.
- The chain stops when the player releases, fails a pursued target, no bonus is offered, or the configured maximum bonus count is reached.

All probability, penalty, bonus-value, and maximum-chain values are configurable by level. Random decisions use the deterministic level random-number service rather than `Math.random()`.

## 5. Coordinate and Rendering Model

### 5.1 Logical coordinates

All levels use a logical 1000 × 1000 grid.

- Generated and manual coordinates use this grid.
- Scoring distances are calculated in logical coordinates for consistency.
- Level JSON may specify exact coordinates, generated coordinates, or a mixture.
- The arena may fill a non-square region on the screen.

### 5.2 Responsive scaling without object distortion

The arena layout may stretch horizontally or vertically to use the available desktop space, but gameplay objects must preserve their intended shapes.

Rendering therefore separates position scaling from shape scaling:

- Logical X positions map to the available width.
- Logical Y positions map to the available height.
- Local object dimensions use a uniform scale derived from the smaller screen-axis scale.
- A circle remains a circle and a square remains a square.
- Strokes use non-scaling behavior where appropriate.
- Collision geometry is derived from the final rendered geometry, while travel metrics use logical coordinates.

The arena boundary itself may stretch as part of the level layout. Tokens, targets, and obstacles must not be distorted by that stretch.

### 5.3 SVG structure

The play field uses ordered SVG layers:

1. Arena background and clipping/masking.
2. Decorative laboratory grid and effects.
3. Static obstacles.
4. Moving obstacles.
5. Ghost trails.
6. Active trail.
7. Targets and target indicators.
8. Token.
9. Collision and completion effects.

React owns level state and screen composition. High-frequency pointer updates should not trigger a full React render. The input loop updates mutable runtime data and SVG element references through `requestAnimationFrame`; React receives throttled HUD updates and discrete game events.

## 6. Application State Machine

The game should use explicit states to prevent ambiguous input behavior:

```text
BOOT
  -> MAIN_MENU
  -> LEVEL_SELECT
  -> LEVEL_LOADING
  -> LEVEL_READY
  -> DRAGGING_TO_MAIN
  -> TARGET_REACHED
       -> BONUS_OFFERED
       -> LEVEL_COMPLETE
  -> DRAGGING_TO_BONUS
       -> TARGET_REACHED
       -> BONUS_FAILED
  -> ATTEMPT_FAILED
  -> LEVEL_RESTARTING
```

Important transitions:

- `LEVEL_READY -> DRAGGING_TO_MAIN`: valid mouse-down on token.
- `DRAGGING_TO_MAIN -> ATTEMPT_FAILED`: early release or third collision.
- `DRAGGING_TO_MAIN -> TARGET_REACHED`: token touches main target.
- `TARGET_REACHED -> LEVEL_COMPLETE`: player releases at the reached target.
- `TARGET_REACHED -> DRAGGING_TO_BONUS`: bonus is offered and player leaves the safe target while holding.
- `DRAGGING_TO_BONUS -> BONUS_FAILED`: early release or other configured bonus failure.

Pause, focus loss, and pointer-capture loss must have explicit transitions and tests.

## 7. Scoring

### 7.1 Score inputs

Each attempt tracks:

- Base maximum score.
- Maximum-score bonuses earned from bonus targets.
- Elapsed time.
- Par time.
- Actual token-center travel distance.
- Direct-distance benchmark.
- Collision count.
- Bonus-failure penalties.

For a multi-target run, direct distance is the sum of the straight-line distances for the targets actually reached in order:

```text
start -> main target -> bonus target 1 -> bonus target 2 -> ...
```

### 7.2 Default formula

The default score is divided evenly between time and route efficiency:

```text
attainableMaximum = baseMaximum + earnedBonusMaximum

timeFactor =
  min(1, parTime / elapsedTime)

routeFactor =
  min(1, directDistance / actualDistance)

performanceScore =
  attainableMaximum
  * ((0.50 * timeFactor) + (0.50 * routeFactor))

penalty =
  attainableMaximum
  * penaltyRate
  * penaltyEvents

finalScore =
  round(clamp(performanceScore - penalty, 0, attainableMaximum))
```

Default `penaltyRate` is `0.20`. The score never exceeds the currently attainable maximum. Beating par time or matching the direct route does not create an uncapped score.

The implementation should expose the time/distance weights and penalty model in configuration so they can be tuned without changing scoring code.

### 7.3 Level and cumulative scores

- The HUD shows the current estimated level score during play.
- Completion shows the final attempt score.
- Each level stores its highest completed score.
- Replaying a level replaces its stored score only when the new score is higher.
- The cumulative score is the sum of the best stored scores for all completed levels.
- The HUD and menus display both the relevant level score and cumulative score.

## 8. Level Configuration

### 8.1 Configuration strategy

Each level is defined by JSON. The schema supports:

- Fixed seed shared by every player.
- Generation objectives and complexity rules.
- Exact coordinates for manually designed elements.
- Generated elements.
- Overrides of generated elements.
- Scoring and bonus rules.
- Arena, token, target, and obstacle definitions.

Configuration is data only. It must not contain executable JavaScript.

### 8.2 Proposed level JSON

```json
{
  "schemaVersion": 1,
  "id": "level-01",
  "number": 1,
  "name": "Calibration",
  "seed": "path-protocol-level-01",
  "objective": {
    "description": "Reach the main target while avoiding the barriers.",
    "difficulty": 1
  },
  "arena": {
    "shape": "roundedRect",
    "manual": {
      "x": 40,
      "y": 40,
      "width": 920,
      "height": 920,
      "cornerRadius": 40
    }
  },
  "token": {
    "shape": "circle",
    "size": {
      "width": 32,
      "height": 32
    },
    "start": {
      "mode": "generated",
      "region": {
        "x": 80,
        "y": 700,
        "width": 200,
        "height": 180
      }
    }
  },
  "mainTarget": {
    "shape": "circle",
    "size": {
      "width": 52,
      "height": 52
    },
    "position": {
      "mode": "generated",
      "region": {
        "x": 720,
        "y": 100,
        "width": 180,
        "height": 200
      }
    }
  },
  "obstacles": {
    "generated": {
      "count": 3,
      "allowedShapes": ["rect", "circle"],
      "sizeRange": {
        "min": 80,
        "max": 180
      },
      "minimumGap": 55,
      "movingCount": 0
    },
    "manual": [
      {
        "id": "teaching-barrier",
        "shape": "rect",
        "x": 420,
        "y": 420,
        "width": 180,
        "height": 60,
        "motion": null
      }
    ]
  },
  "generation": {
    "minimumStartTargetDistance": 650,
    "maximumAttempts": 100,
    "pathValidationResolution": 10
  },
  "scoring": {
    "baseMaximum": 1000,
    "parTimeMs": 7000,
    "parDistance": 900,
    "timeWeight": 0.5,
    "distanceWeight": 0.5,
    "collisionPenaltyRate": 0.2,
    "maximumCollisions": 3
  },
  "bonuses": {
    "maximumTargets": 0,
    "offerChanceMode": "currentScorePercent",
    "failurePenaltyRate": 0.2,
    "targets": []
  },
  "theme": "future-lab"
}
```

Manual position-bearing objects should use the same shape definitions as generated objects. A position can be:

- `manual`: exact logical coordinates.
- `generated`: a seeded position selected within constraints.
- `generatedWithFallback`: generated first, then a configured manual position if validation fails.

### 8.3 Schema validation

At application startup and in automated tests:

- Validate every level against a JSON Schema.
- Reject unknown shape or motion types.
- Require scoring weights to total `1`.
- Require coordinates to be valid for the 1000 × 1000 logical grid.
- Require penalties and probabilities to be within `0` and `1`.
- Require unique IDs.
- Require `maximumTargets` to agree with available bonus definitions.
- Produce developer-readable error messages.

Invalid production levels should show a safe error screen rather than crashing the application.

## 9. Ten-Level Progression

Exact counts and values will be tuned through playtesting.

| Level | Primary lesson and complexity |
|---|---|
| 1 — Calibration | Large circular token, simple arena, few stationary rectangles, no bonus target. |
| 2 — Deflection | More obstacles and mixed circle/rectangle shapes; introduces meaningful route choice. |
| 3 — Tight Tolerances | Larger token or narrower clearances; first possible bonus target. |
| 4 — Bent Chamber | Irregular arena boundary; polygon obstacles and up to one bonus target. |
| 5 — Long Route | Several competing paths, higher maximum score, and up to two ordered bonus targets. |
| 6 — Shape Test | Non-circular fixed-orientation token and more demanding clearance validation. |
| 7 — Motion Detected | Introduces one slow, predictable moving obstacle. |
| 8 — Crossing Signals | Multiple moving obstacles with configured paths and timing offsets. |
| 9 — Containment | Complex irregular arena, tight static geometry, moving hazards, and bonus-risk decisions. |
| 10 — Final Protocol | Combines token shape, irregular boundary, static and moving obstacles, and the largest bonus chain. |

Increasing complexity raises the level's base maximum score. Difficulty is produced through configuration rather than special-case level code.

## 10. Course Generation and Validation

### 10.1 Deterministic generation

- Every level has a fixed, human-readable seed.
- All players use the same seed for a given level version.
- Use a seeded pseudo-random number generator.
- Never use `Math.random()` for course or bonus decisions.
- Generated results must be stable for the same schema version, level data, and seed.
- If generation logic changes materially, bump the level or generator version to prevent silent layout changes.

### 10.2 Generation order

1. Create the arena.
2. Place manual elements.
3. Place or generate the token start.
4. Place or generate the main target.
5. Add generated stationary obstacles.
6. Add moving obstacles and their motion envelopes.
7. Generate possible bonus-target locations.
8. Check clearances and overlaps.
9. Validate required reachability.
10. Calculate or verify par distance and par time.

Manual elements always take priority. Generated elements must respect their reserved space and configured clearance.

### 10.3 Solvability

Every generated course must have a valid route for its configured token.

The validator should:

- Shrink the valid arena by the token footprint.
- Expand obstacles by the token footprint.
- Account for the token's fixed, non-rotating shape.
- Use a navigation grid or visibility graph to search for a path.
- Include moving-obstacle motion envelopes when static safe passage is required.
- Reject layouts with no valid main-target route.
- Retry generation up to the configured limit.
- Use a known-valid manual fallback if deterministic generation repeatedly fails.

For polygonal and path-based geometry, collision shapes may be flattened to polygons at a documented tolerance.

### 10.4 Par calculation

Each level defines a par time and par distance. These can be manually tuned. Development tooling may calculate a suggested par distance from the validated route and derive a suggested par time from expected pointer speed plus complexity allowances.

The direct-distance score benchmark remains the straight-line segment sum, as specified in the scoring section. The pathfinder's valid route length is used for validation and tuning, not as the player's route-efficiency denominator in the first release.

## 11. Collision System

The collision system operates on rendered token and hazard geometry and supports:

- Circle against circle, rectangle, polygon, and arena path.
- Rectangle against circle, rectangle, polygon, and arena path.
- Polygon against polygon using separating-axis or equivalent tests.
- Token containment inside irregular arena polygons/paths.
- Swept movement checks between frames to prevent tunneling at high pointer speeds.

Pointer samples can jump several pixels between frames. Collision must test the swept token path, not only its final position. The engine stores the last safe transform and restores it after a collision.

Moving obstacles update from elapsed level time, making their positions independent of frame rate.

## 12. Theme Configuration

The first theme is `future-lab`. Theme data belongs in `themeConfig.json`, separate from gameplay rules.

The theme uses:

- Dark laboratory background.
- Cyan and blue energy effects.
- Amber hazards.
- Magenta bonus targets.
- High-contrast token, target, and trail states.

### Proposed theme structure

```json
{
  "schemaVersion": 1,
  "themes": {
    "future-lab": {
      "name": "Future Lab",
      "colors": {
        "background": "#050914",
        "panel": "#0b1426",
        "grid": "#17345d",
        "token": "#68f7ff",
        "mainTarget": "#38e8b0",
        "bonusTarget": "#ff4fe1",
        "hazard": "#ffb020",
        "danger": "#ff465d",
        "text": "#eaf7ff"
      },
      "effects": {
        "glowIntensity": 0.8,
        "trailWidth": 5,
        "ghostTrailOpacity": 0.2,
        "targetPulseDurationMs": 900,
        "collisionFlashDurationMs": 180
      },
      "audio": {
        "music": {
          "src": "/audio/future-lab-loop.ogg",
          "defaultVolume": 0.35
        },
        "effects": {
          "dragStart": "/audio/drag-start.ogg",
          "targetReached": "/audio/target-reached.ogg",
          "bonusOffered": "/audio/bonus-offered.ogg",
          "collision": "/audio/collision.ogg",
          "attemptFailed": "/audio/attempt-failed.ogg",
          "levelComplete": "/audio/level-complete.ogg"
        },
        "effectsDefaultVolume": 0.65
      }
    }
  }
}
```

Future themes can replace visual and audio tokens without altering level mechanics. A level may select a theme, while the player may later be allowed to use unlocked theme variants.

## 13. Audio

- Include looping futuristic background music and gameplay sound effects.
- Audio starts only after a user interaction to comply with browser autoplay rules.
- Music and effects have separate volume and mute controls.
- Settings persist locally.
- Loops must be seamless and compressed for the web.
- Frequently played effects should be preloaded.
- Collision audio should be rate-limited so rapid events do not create noise spikes.
- Open-source audio must have a compatible license and attribution record.
- Web Audio synthesis may be used for simple effects to reduce asset size.

## 14. User Interface

### 14.1 Main menu

- Play or Continue.
- Level Select.
- Instructions.
- Music and effects controls.
- Progress reset.

Progress reset requires confirmation because it removes local scores and unlocks.

### 14.2 Level select

Each level card shows:

- Level number and name.
- Locked, available, or completed status.
- Best level score.
- Maximum base score and possible bonus value.
- Completion indicator.

Completing a level unlocks the next level. Previously completed levels remain replayable.

### 14.3 In-level HUD

The HUD displays:

- Level number and name.
- Live elapsed time and par time.
- Actual distance and par/direct benchmark.
- Current estimated score and maximum available score.
- Collision count out of three.
- Current level best score.
- Cumulative score.
- Main or bonus target status.
- Music and effects controls.

The HUD must not cover the arena or intercept pointer input during a drag.

### 14.4 Results

The completion screen shows:

- Final score.
- Previous best and new-best indication.
- Time score.
- Route-efficiency score.
- Penalties.
- Bonus points earned.
- Cumulative score.
- Replay Level.
- Next Level.
- Level Select.

## 15. Persistence

Use a single versioned `localStorage` record:

```json
{
  "schemaVersion": 1,
  "player": {
    "highestUnlockedLevel": 1,
    "cumulativeBestScore": 0
  },
  "levels": {
    "level-01": {
      "completed": false,
      "bestScore": 0,
      "bestTimeMs": null,
      "bestDistance": null,
      "attempts": 0
    }
  },
  "settings": {
    "musicEnabled": true,
    "musicVolume": 0.35,
    "effectsEnabled": true,
    "effectsVolume": 0.65,
    "reducedMotion": false
  }
}
```

Requirements:

- Recalculate cumulative score from per-level best scores when loading.
- Validate stored data before use.
- Recover safely from malformed or outdated storage.
- Support schema migrations.
- Do not store active pointer state or mid-attempt progress.

## 16. Suggested Source Layout

```text
path-protocol/
  public/
    audio/
    licenses/
  src/
    app/
      App.jsx
      routes.js
    components/
      menus/
      hud/
      results/
    game/
      GameView.jsx
      engine/
        gameStateMachine.js
        inputController.js
        animationLoop.js
      geometry/
        shapes.js
        collisions.js
        sweptCollision.js
        coordinateTransform.js
      generation/
        seededRandom.js
        levelGenerator.js
        placement.js
        pathValidator.js
      scoring/
        scoreCalculator.js
        distanceTracker.js
      rendering/
        SvgArena.jsx
        SvgLayers.jsx
        trailRenderer.js
      audio/
        audioManager.js
    config/
      levels/
        level-01.json
        ...
        level-10.json
      schemas/
        level.schema.json
        theme.schema.json
      themeConfig.json
    persistence/
      progressStore.js
      migrations.js
    styles/
    tests/
  architecture.md
  package.json
  vite.config.js
```

## 17. Performance Requirements

- Target 60 frames per second on a typical current desktop browser.
- Process pointer input once per animation frame.
- Use pointer capture during dragging.
- Avoid React state updates for each raw pointer event.
- Simplify long SVG trails using a line-simplification algorithm.
- Pool or reuse transient SVG effects.
- Keep decorative filters modest; SVG blur and glow filters can be expensive.
- Precompute static collision geometry.
- Use spatial indexing if later levels contain enough hazards to justify it.
- Pause animation and audio when the tab is hidden, while treating focus loss as an ended attempt.

## 18. Accessibility and Usability

Although gameplay is mouse-based, menus should support keyboard navigation.

- Provide high contrast between token, hazards, arena, and targets.
- Never communicate state through color alone.
- Include visible collision-count and target-state indicators.
- Provide independent music and effects controls.
- Respect reduced-motion preferences and provide a setting override.
- Provide concise instructions before Level 1.
- Prevent text selection and browser drag behavior inside the arena.
- Show a desktop-input message on touch-only devices.

## 19. Testing Strategy

### 19.1 Unit tests

- Seeded random generation is deterministic.
- Score formula, caps, bonuses, and penalties.
- Direct-distance calculations for ordered targets.
- Coordinate transforms under different aspect ratios.
- Shape intersection and containment.
- Swept collision behavior.
- Three-collision restart rule.
- Local-storage validation and migration.

### 19.2 Property and generation tests

- Generate each level repeatedly from its fixed seed and confirm stable output.
- Assert no initial overlap among token, target, and obstacles.
- Assert that the main target is reachable.
- Assert valid clearance for the configured token.
- Assert manual elements remain unchanged.
- Assert moving-obstacle envelopes remain inside allowed regions.

### 19.3 Browser tests

- Start a drag only from the token.
- Hide the cursor and move the token from its center.
- Reach a target by edge contact.
- Release early and restart.
- Apply collision penalties and snap back safely.
- Restart after the third collision.
- Preserve the timer through a collision.
- Offer, pursue, bank, and fail bonus targets.
- Save only improved high scores.
- Unlock the next level.
- Replay a completed level.
- Restore progress and audio settings after reload.

### 19.4 Visual checks

- Objects remain undistorted at wide and tall desktop aspect ratios.
- Trails line up with token centers.
- SVG filters do not obscure collision boundaries.
- HUD never covers critical play space.
- Every configured theme color has sufficient contrast.

## 20. Implementation Milestones

### Milestone 1 — Foundation

- Create the React/Vite application.
- Add navigation, menus, and configuration loading.
- Define and validate level and theme schemas.
- Implement local persistence.

### Milestone 2 — Playable core

- Render the responsive SVG arena.
- Implement mouse capture, token dragging, cursor hiding, and trails.
- Add static shapes, boundary checks, collision penalties, snap-back, and restart behavior.
- Implement the state machine.

### Milestone 3 — Generation and scoring

- Add seeded hybrid course generation.
- Add path validation.
- Implement timer, distance tracking, par values, score calculation, HUD, and results.
- Save per-level best and cumulative scores.

### Milestone 4 — Progression

- Author all ten JSON level definitions.
- Add irregular arenas, token variants, ordered bonus targets, and level unlocks.
- Add moving obstacles for later levels.

### Milestone 5 — Presentation

- Complete the futuristic-lab theme.
- Add SVG effects, ghost trails, music, and sound effects.
- Add instructions, settings, reduced-motion behavior, and polished results screens.

### Milestone 6 — Verification and tuning

- Complete unit, generation, and browser tests.
- Test responsive desktop sizes.
- Tune obstacle clearances, par values, maximum scores, and bonus rates.
- Audit performance, asset licenses, and production build output.

## 21. Design Principles

- **Configuration first:** level difficulty and presentation belong in JSON.
- **Fair generation:** every required course is solvable for its actual token geometry.
- **Deterministic play:** the same level version and seed produce the same layout.
- **Immediate feedback:** collisions, score changes, target contact, and bonus choices are always visible and audible.
- **Risk with consent:** bonus targets increase rewards only when the player chooses to continue.
- **Smooth input:** animation-frame processing and direct SVG updates keep dragging responsive.
- **Replay value:** ghost trails and best-score replacement make improvement visible.
- **Extensible themes:** gameplay geometry does not depend on a particular visual theme.

