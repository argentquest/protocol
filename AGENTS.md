# AGENTS.md

## Purpose

This file provides instructions for coding agents working on **Path Protocol**.

Path Protocol is a desktop browser precision game built with React, Vite, JavaScript, and SVG. The player holds and drags a visible token through a deterministic obstacle course, avoids collisions, reaches a main target, and may pursue ordered bonus targets.

The project does **not** currently contain NPCs, enemy AI, behavior trees, autonomous game agents, multiplayer simulation, or server-authoritative gameplay. Do not introduce those systems unless the product scope changes explicitly.

## Sources of truth

Read these documents before making architectural or gameplay changes:

1. [`architecture.md`](architecture.md) — product behavior, technical architecture, configuration models, scoring, and testing strategy.
2. [`sprints.md`](sprints.md) — implementation sequence, task breakdown, and completion criteria.
3. `src/config/schemas/*.json` — authoritative configuration contracts once they exist.
4. `src/config/levels/*.json` — level-specific gameplay data once they exist.
5. `src/config/themeConfig.json` — visual and audio theme data once it exists.

If code and documentation disagree, do not silently choose one. Determine whether the code contains an intentional later decision. Update the implementation and relevant documentation together.

## Project status

The repository initially contains planning documents only. Build the application incrementally in the order described by `sprints.md`. Do not create all systems as one large implementation.

The target source layout is documented in `architecture.md`. Follow it unless the existing code establishes a clearer convention.

## Required technology

- React for application screens and stateful UI.
- Vite for development and production builds.
- Modern JavaScript with ES modules.
- SVG and CSS for gameplay graphics and presentation.
- Pointer Events for mouse and trackpad input.
- `requestAnimationFrame` for high-frequency gameplay updates.
- JSON for levels and themes.
- `localStorage` for browser-local progress and settings.
- Vitest and React Testing Library for unit and component tests.
- Playwright for critical browser journeys.

Do not add TypeScript, a state-management library, a game engine, a physics engine, or a backend without an explicit project decision.

## Core gameplay contracts

Preserve these rules unless the user changes them:

- The logical level grid is 1000 × 1000.
- The play area may stretch, but tokens, targets, and obstacles must preserve their intended shapes.
- The pointer controls the center of the token.
- The token has real dimensions and fixed orientation.
- The native cursor is hidden during an active drag.
- The player must hold the mouse button throughout an attempt.
- Releasing before the main target is reached restarts the level.
- A target is reached when any part of the token touches it.
- The entire token must remain inside the arena.
- Touching an obstacle or arena boundary is a collision.
- A collision applies a configurable penalty, defaults to 20%, and snaps the token to its last safe position.
- The timer continues after a collision.
- The third collision restarts the same level.
- The generated layout does not change on restart.
- The active trail remains visible throughout the attempt.
- Failed attempts may remain as bounded, faint ghost trails.
- Bonus targets are optional, ordered, and shown one at a time.
- The player releases at a reached target to bank the current result.
- Pursuing a bonus continues the same drag, timer, distance, and trail.
- Every required generated course must be validated as solvable for the configured token.
- All players use the same fixed seed for a given level version.

## Scoring contract

The default score uses equal time and route-efficiency weights:

```text
attainableMaximum = baseMaximum + earnedBonusMaximum

timeFactor = min(1, parTime / elapsedTime)
routeFactor = min(1, directDistance / actualDistance)

performanceScore =
  attainableMaximum
  * ((timeWeight * timeFactor) + (distanceWeight * routeFactor))

penalty =
  attainableMaximum
  * penaltyRate
  * penaltyEvents

finalScore =
  round(clamp(performanceScore - penalty, 0, attainableMaximum))
```

Default values:

- `timeWeight`: `0.5`
- `distanceWeight`: `0.5`
- `collisionPenaltyRate`: `0.2`
- `maximumCollisions`: `3`

For ordered targets, direct distance is the sum of straight-line segments from the start through each target actually reached.

Do not duplicate scoring rules in components. Keep scoring in pure, testable modules and read tunable values from level configuration.

## Configuration rules

### General

- Gameplay values belong in level JSON, not JSX or CSS.
- Theme values belong in `themeConfig.json`, not level files.
- Configuration files contain data only and must never contain executable JavaScript.
- Validate configurations against versioned JSON Schemas.
- Reject invalid configurations with useful development errors and a safe production error screen.
- Use stable, unique IDs for levels and game objects.
- Document schema changes and add migrations or compatibility handling where required.

### Coordinates

- Store authored coordinates in the logical 1000 × 1000 space.
- Support manual, generated, and generated-with-fallback placement.
- Manual objects take priority over generated objects.
- Convert pointer positions to logical coordinates through the shared coordinate-transform module.
- Do not calculate responsive transforms independently in individual components.

### Randomness

- Use the shared seeded random-number service.
- Do not use `Math.random()` for course generation, obstacle behavior, or bonus offers.
- Identical level data, generator version, and seed must produce identical layouts.
- Bump the relevant version when generator changes intentionally alter a released course.

## React and runtime-state rules

React owns:

- Menus and navigation.
- Level loading.
- Discrete gameplay states.
- HUD and results.
- Settings and persistence.

The animation loop owns:

- Current pointer position.
- Token transform.
- Moving-obstacle transforms.
- Active trail samples.
- Per-frame collision checks.

Do not call React state setters for every raw pointer event. Use mutable runtime state and SVG element references inside `requestAnimationFrame`, then send throttled HUD updates and discrete events to React.

Represent gameplay flow with explicit state transitions. Do not distribute conflicting boolean flags such as `isDragging`, `isComplete`, and `isFailed` across unrelated components.

## SVG and rendering rules

- Keep gameplay elements in ordered SVG layers.
- Preserve geometric clarity; visual filters must not obscure collision boundaries.
- Keep collision geometry separate from decorative effects.
- Prefer CSS variables and theme tokens for colors and effects.
- Use non-scaling strokes where appropriate.
- Bound the number of trail and ghost-trail points.
- Avoid embedding large base64 bitmap assets.
- Do not use bitmaps for interactive collision geometry.
- Decorative bitmap assets require a demonstrated need and an appropriate license.

## Collision and movement rules

- Collision detection uses the token's complete shape, not only its center.
- Support circle, rectangle, polygon, and flattened SVG path geometry as required.
- Test the swept movement between the last safe position and requested position to prevent tunneling.
- Restore the last safe token transform after a collision.
- Count a continuous overlap as one collision event.
- Moving obstacles derive their position from elapsed level time, not accumulated frame movement.
- Keep geometry calculations in pure modules wherever practical.
- Path validation must account for token dimensions and fixed orientation.

Never weaken collision rules merely to make a generated level pass. Fix the placement constraints, geometry, or configured fallback.

## Persistence rules

- Store progress in one versioned `localStorage` record.
- Validate data read from storage.
- Recover safely from malformed or obsolete values.
- Add migration logic for schema changes.
- Recalculate cumulative score from per-level best scores on load.
- Replace a level's saved score only when a new completed score is higher.
- Do not persist an in-progress drag or raw pointer history.
- Confirm with the player before resetting progress.

## Audio rules

- Respect browser autoplay restrictions; initialize or resume audio after user interaction.
- Keep music and effects on separate volume channels.
- Persist enablement and volume settings.
- Rate-limit frequently triggered collision sounds.
- Record the source and license of every third-party audio asset.
- Prefer compressed web formats and seamless loops.

## Accessibility and input

- Gameplay targets desktop mouse and trackpad input in the initial release.
- Do not add touch gameplay unless requested.
- Menus must remain keyboard accessible.
- Maintain visible focus states.
- Do not communicate collisions, bonuses, or completion by color alone.
- Respect reduced-motion preferences and the in-game reduced-motion setting.
- Prevent browser-native text selection and drag behavior inside the arena.
- Treat focus loss and pointer-capture loss according to the gameplay state machine.

## Performance expectations

- Target 60 frames per second on a typical current desktop.
- Process pointer movement no more than once per animation frame.
- Precompute static collision geometry.
- Avoid per-frame object and array allocation in hot paths where practical.
- Reuse transient effect objects or nodes.
- Simplify rendered trails while retaining accurate scoring distance.
- Keep SVG blur and glow filters modest.
- Add spatial indexing only when profiling demonstrates a need.
- Do not add Web Workers before measuring a main-thread bottleneck.

## Testing requirements

Every feature change must include tests proportional to its risk.

### Unit tests

Prioritize tests for:

- Coordinate transforms.
- Seeded random generation.
- Score calculations and caps.
- Direct-distance calculations.
- Collision and containment geometry.
- Swept collision behavior.
- State transitions.
- Persistence validation and migration.

### Generation tests

For every level, verify:

- Stable output for the configured seed.
- No invalid initial overlap.
- Valid token and target placement.
- Preservation of manual elements.
- Required target reachability.
- Valid movement envelopes for moving hazards.

### Browser tests

Cover critical player journeys:

- Begin a valid drag.
- Reject a drag that does not start on the token.
- Reach a target by edge contact.
- Release early and restart.
- Apply a collision penalty and snap back.
- Restart after the third collision.
- Pursue, bank, and fail bonus targets.
- Save only improved scores.
- Unlock and replay levels.
- Restore progress and settings after reload.

Do not rely only on snapshot tests for geometry or gameplay behavior.

## Expected commands

Inspect `package.json` before running commands because scripts may evolve. Once the application is initialized, the project should provide commands equivalent to:

```powershell
npm install
npm run dev
npm run lint
npm run test
npm run test:e2e
npm run build
```

Before handing off an implementation:

1. Run the most relevant focused tests.
2. Run the full unit-test suite when practical.
3. Run linting.
4. Run the production build.
5. Run critical browser tests for changes to gameplay flow or persistence.

If a command cannot run, report the exact limitation instead of claiming verification.

## Repository hygiene

- Preserve unrelated user changes.
- Keep commits and patches focused on the requested task.
- Do not commit build output, test reports, browser profiles, or local environment files.
- Do not store secrets or machine-specific absolute paths.
- Avoid adding dependencies for functionality that can be implemented clearly with existing browser APIs.
- Record third-party dependency and asset licenses.
- Update documentation when behavior, schema, scripts, or architecture changes.

## Change discipline

When implementing a task:

1. Read the relevant architecture and sprint sections.
2. Inspect existing implementation and tests.
3. Make the smallest coherent change.
4. Add or update tests.
5. Validate configuration and responsive behavior.
6. Run appropriate checks.
7. Update documentation if the contract changed.

Ask for direction before making a change that would:

- Alter agreed gameplay rules.
- Change the score formula.
- Add a backend or online account system.
- Add touch support.
- Add multiplayer or autonomous NPC agents.
- Replace SVG gameplay with Canvas, WebGL, or bitmap rendering.
- Change released seeds or generated layouts.
- Introduce a major framework or game engine.

## Definition of done

Work is complete when:

- It matches the agreed gameplay and architecture.
- Values that belong in configuration are not hard-coded.
- Relevant tests pass.
- The production build succeeds when applicable.
- Pointer movement remains smooth.
- Responsive object geometry remains undistorted.
- Error, interruption, and restart states are handled.
- Documentation and schemas reflect any contract changes.
- New dependencies and assets have compatible recorded licenses.

