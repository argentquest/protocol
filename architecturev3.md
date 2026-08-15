# Path Protocol V3 Architecture

## Status

V3 is the active architecture on the `v3` branch. It preserves the V2 React,
fixed-step engine, JSON configuration, Howler audio, persistence, and server
boundaries while replacing gameplay presentation with a Three.js WebGL scene
and adding optional engine-owned elevation.

Existing level JSON remains valid. A level without `verticalPhysics`, `ramps`,
`terrainSurfaces`, or authored `walls` retains flat gameplay, even though it is
presented by the 3D camera.

## Runtime ownership

```text
React screens and HUD
        │ intent / throttled serializable snapshots
        ▼
Framework-neutral fixed 60 Hz engine
        │ x/y/elevation transforms and logical events
        ├──────────────► Three.js WebGL scene
        └──────────────► Howler audio manager
```

- React mounts one imperative Three.js canvas and owns no frame-by-frame
  transforms. A WebGL initialization failure is reported as a startup error.
- The engine owns horizontal movement, vertical velocity, gravity, ramp
  activation, height-aware collision, targets, scoring, and deterministic time.
- Three.js owns the bounded perspective camera, raycasting, meshes, GLB loading,
  lighting, shadows, trails, aim indicators, and GPU resource disposal.
- Collision remains JSON-owned. A GLB model never defines gameplay bounds.

## Coordinates and camera

Authored coordinates remain the 1600 × 900 logical plane:

```text
engine x         → Three.js x - 800
engine y         → Three.js z - 450
engine elevation → Three.js y
```

The camera is perspective-projected with a documented default pose. Accessible
controls rotate it around the arena, raise or lower its bounded elevation, and
restore the default. Pointer steering raycasts onto visible terrain or the base
ground plane, while
initial token selection raycasts against the visible 3D token mesh. Camera
changes never alter engine coordinates, simulation state, or scoring.

## Backward-compatible height contract

The following level fields are optional:

- `verticalPhysics`: gravity, maximum falling speed, and ground height;
- `ramps`: contact regions with direction, approach speed, and launch velocity;
- `terrainSurfaces`: rectangular two-triangle play surfaces with four absolute
  corner elevations, optional friction, and presentation thickness;
- `elevation`: bottom elevation for supported entities;
- `collisionHeight`: vertical obstacle collision span;
- `visualHeight`: presentation extrusion independent of collision footprint.

An obstacle without `collisionHeight` is infinitely tall. This intentionally
preserves every existing V2 collision. A V3 low obstacle is ignored only when
the complete token's vertical interval no longer overlaps its configured
vertical interval.

Ramps launch only a grounded token approaching in their configured direction.
Gravity advances on the same fixed step as horizontal movement. Landing clamps
to the exact ground height and zero vertical velocity. Ricochet input remains
locked until both horizontal and vertical motion have stopped.

## Deterministic terrain surfaces

Every terrain patch uses a fixed north-west to south-east diagonal. The pure
terrain sampler and Three.js mesh therefore evaluate the same two triangles
without renderer-derived collision. At every X/Y point the sampler returns an
absolute support height, an up-facing unit normal, and the direction of steepest
descent. The flat `verticalPhysics.groundHeight` remains an always-present base
surface.

Multiple patches may overlap. Samples are ordered by height, while support
selection is constrained by the token's current elevation and
`maximumStepHeight`. A token under a bridge stays on the ground; a token arriving
above the deck lands on it. Connected slopes whose step-to-step height change is
within the threshold support the ball continuously. Leaving a platform retains
the previous elevation and begins a gravity-driven fall until the highest
crossed surface is reached.

While grounded, gravity is projected onto the current triangle. In Ricochet
mode the resulting downhill acceleration is opposed by the surface's configured
friction. Static rest is exact when friction can resist the slope; otherwise the
ball resumes deterministic rolling. Airborne motion uses `airDragPerSecond`
when configured and does not receive surface friction. Guided movement receives
the same downhill acceleration while retaining its pointer/keyboard control.

Three.js builds each deck directly from the four JSON corner elevations and
raycasts pointer movement against rendered terrain before falling back to base
ground. The Theme Workshop creates flat platform/bridge and slope templates,
resizes their X/Y footprints, and edits all four elevations on the 10-unit grid.

## Mini-golf walls

Levels may author `walls` independently from penalized obstacles. Each wall has
a JSON-owned footprint, elevation/collision height, orientation in degrees, and
a restitution coefficient. The engine uses the rotated footprint for collision
and Ricochet response; Three.js applies the same rotation to its procedural or
catalog model. Wall contact stops Guided movement and rebounds Ricochet shots
without incrementing the hazard-collision counter.

Rectangular and elliptical arenas receive deterministic generated perimeter
walls unless disabled. The Theme Workshop exposes authored interior walls as
selectable, draggable, resizable, rotatable objects with editable restitution.

## Media

V3 ships all 126 GLB models and matching preview images from Kenney's Minigolf
Kit 3.1. A deterministic build script scans the standardized filenames and
generates the public and source manifests. The schema-validated manifest owns
stable model IDs, categories, recommended roles, URLs, and token, target, ramp,
and obstacle defaults; the renderer does not maintain a second model list.

Any renderable level entity may set an optional `model3dId`. The Theme Workshop
groups the complete catalog by category, previews the selected model, and saves
that stable ID in level JSON. The renderer caches one GLB load promise per model
ID and clones the loaded scene for each entity. Collision footprints, vertical
intervals, terrain sampling, and gameplay decisions remain JSON-owned.

A main target may use optional `model3dSize` when its presentation needs to be
larger than its contact geometry. The renderer treats it as a maximum visual
dimension only; target contact continues to use `size` and `collisionHeight`.

Token, target, and ramp roles receive catalog defaults when no explicit model is
selected. Obstacles and terrain retain geometry-matching procedural visuals by
default because their arbitrary JSON dimensions cannot be inferred safely from
artwork. Explicit terrain models decorate—but never replace—the authoritative
corner-elevation mesh. Missing or failed optional GLBs fall back independently
to procedural geometry.

The pack is CC0. Its original license, provenance, complete model set, previews,
and generated manifest are stored together under `public/media/3d`.

## Migration stages

1. Render every existing level in a stable Three.js scene.
2. Validate fixed-camera raycasting and Guided/Ricochet parity.
3. Add optional deterministic elevation, ramps, low obstacles, and landing.
4. Extend theme packaging with optional owned GLB presentation overrides.
5. Add vertical route/shot solvability checks for authored terrain courses.
6. Retire the V2 Pixi adapter and keep Three.js as the only gameplay renderer.
7. Add editable, engine-owned mini-golf walls with shared collision and visual
   orientation.

## Current limitations

- Height-enabled layouts use the normal 2D route validator as a conservative
  fallback; it does not yet prove a ramp trajectory.
- Camera movement uses bounded discrete controls; free pointer-drag orbit is
  excluded because left-button input belongs to token control.
- Terrain-enabled layouts still use the conservative 2D route validator; it
  does not yet prove slope traversal, bridge-layer selection, or airborne shots.
- Catalog GLBs are built-in default V3 media; importing user-owned GLBs into a
  theme package is not yet supported.
