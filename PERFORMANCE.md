# Path Protocol V2 Performance

## Targets

- Hardware-accelerated desktop gameplay: 60 rendered frames per second under
  normal load.
- Fixed simulation: 60 updates per second, independent of render cadence.
- Maximum active trail samples: 512.
- Maximum retained ghost trails: 2.
- React HUD publication: no more than approximately 12 updates per second.

## Automated profile

`tests/e2e/release.spec.js` starts Level 23 with four tracking hazards, activates
the fixed-step simulation, measures browser animation frames for 1.5 seconds,
and records the unmasked WebGL renderer. The test also verifies:

- Pixi publishes a nonzero rendered-FPS diagnostic.
- tracking entities remain active;
- trail storage stays within its configured cap;
- the simulation remains responsive to keyboard activation.

Headless Windows Chromium commonly selects a software ANGLE/SwiftShader
renderer. Its automated threshold is therefore a stall detector (5 FPS), not
the hardware release target. A release candidate must still be checked at 60
FPS on a hardware-accelerated desktop using `?dev=1`.

## Applied performance controls

- Pointer events only update desired input state; simulation and moving hazards
  continue on the fixed-step loop.
- External SVG text and Pixi `GraphicsContext` objects are cached across levels.
- Pixi entities are built once and updated imperatively instead of recreated by
  React.
- HUD snapshots are throttled independently from render frames.
- Trails are compacted and capped; only two ghost attempts are retained.
- Moving hazards are derived from simulation time and tracking hazards use
  bounded fixed-step acceleration and turning.
- Reduced motion omits nonessential ghost rendering.

No measured application-specific bottleneck justified a Web Worker, spatial
index, or texture conversion in this release. Those optimizations remain
measurement-driven follow-up work.
