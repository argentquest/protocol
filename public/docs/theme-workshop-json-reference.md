# Theme Workshop JSON Reference

This guide explains the complete level JSON document shown by **Open full-level
JSON editor** in the Theme Workshop. It is written for authors using the popup,
not for engine developers.

The application opens this reference as a formatted HTML page generated from
this Markdown source. Run `npm run docs:build` after editing the guide.

The authoritative contract is
[`src/config/schemas/level.schema.json`](../../src/config/schemas/level.schema.json).
The popup sends the whole document to the server for JSON Schema validation,
deterministic generation, placement checks, and route-solvability checks before
it can be applied or saved.

## What this JSON controls

The popup edits one playable level inside a theme:

- identity, title, seed, difficulty, and briefing;
- arena and token collision geometry;
- movement tuning;
- start and target placement;
- generated and manually placed hazards;
- moving, tracking, phase, orbit, pulse, switch, and rotating hazards;
- conveyor, repulsor, and attractor fields;
- switches, coins, rewards, scoring, and bonus targets.

It does **not** edit the theme account, publication state, level order, artwork
files, audio files, or generated media manifest. Use the normal Theme Workshop
controls for those operations. Level JSON refers to artwork through stable
`mediaId` values; changing a `mediaId` selects a logical visual, while the
theme's media overrides decide how that visual looks. The selected-object
inspector can additionally assign `visualOverrideId` and `audioOverrideId` to
one entity, allowing (for example) a 50-value coin to look and sound different
from a 10-value coin.

For a focused view, right-click an object on the placement grid and choose
**Show object JSON**. That dialog contains only the selected object, but the
server still validates the edited object inside the complete level before
applying it. The same context menu separates **Change image** and **Change
sound**. Both media actions use the same recursive folder browser, breadcrumbs,
search, preview, provenance, and license display as the Theme media selector.
Selected objects with schema-backed dimensions also expose edge and corner
handles that update these same JSON geometry fields.

## Essential rules

- JSON allows double-quoted strings only. Comments and trailing commas are not
  valid.
- Unknown properties are rejected. Property names are case-sensitive.
- The logical world is **1600 × 900 world units**. `(0, 0)` is the upper-left;
  x increases right and y increases down.
- Entity `x` and `y` values normally describe the entity's **center**. A
  `region` or tracking `zone` uses `x` and `y` as its upper-left corner.
- Dimensions, distances, gaps, radii, and amplitudes use world units.
- Speeds use world units/second. Accelerations and force values use world
  units/second². Properties ending in `Ms` use milliseconds.
- `phase` uses radians. Direction and rotation properties containing `Degrees`
  use degrees. For directions, `0` points right and `90` points down.
- Every renderable object needs a registered, theme-neutral `mediaId`.
- Collision geometry comes from JSON, never from the artwork.
- IDs must be stable and unique within their relevant collection. A switch
  barrier's `switchId` must match an entry in `switches`.
- Manual elements take priority over generated elements.
- Every start, target, pickup, obstacle, movement envelope, and tracking zone
  must fit inside the arena. Required targets must remain reachable by the
  complete configured token.
- Keep `internalId` unchanged. It is the stable progress/storage identity for a
  Workshop level.

## Document map

```text
level
├── internalId                    Workshop-owned immutable level identity
├── schemaVersion, id, number     format and campaign identity
├── name, seed, difficulty        author-facing identity and generation seed
├── briefing                     instructions shown to the player
├── arena                        playable boundary and arena media
├── token                        player collision shape and media
├── movement                     player acceleration and speed tuning
├── start                        manual point or generated region
├── mainTarget                   manual point or generated region
├── generation                   deterministic static-obstacle generation
├── manualObstacles[]            fixed solid hazards
├── movingObstacles[]            axis-aligned oscillating hazards
├── trackingObstacles[]          token-following hazards confined to zones
├── dynamicObstacles[]           phase/orbit/pulse/switch/rotate hazards
├── switches[]                   contact pads controlling switch barriers
├── forceFields[]                conveyor/repulsor/attractor acceleration
├── coins[]                      one-time course pickups
├── rewards                      completion and bonus coins
├── scoring                      score maximum, par values, and penalties
└── bonuses                      ordered optional targets and their scoring
```

## Top-level properties

| Property | Required | Type and constraint | Role |
|---|---:|---|---|
| `internalId` | Workshop levels | UUID-like string matching 36 lowercase hexadecimal/hyphen characters | Immutable internal identity. Do not edit or copy it between levels. |
| `schemaVersion` | Yes | Exactly `2` | Selects the V2 level contract. |
| `id` | Yes | `level-` plus 2–3 digits | Campaign-facing ID. The server updates it when levels are reordered. |
| `number` | Yes | Integer `1–999` | One-based campaign position. The server updates it during reorder. |
| `name` | Yes | String, 1–80 characters | Level title shown to the player. |
| `seed` | Yes | String, 1–160 characters | Seed for deterministic placement. Changing it creates a different generated layout. Restarting does not reroll it. |
| `difficulty` | Yes | `1–10` or `15` | Difficulty label. `15` is the special apex value. |
| `briefing` | Yes | String, 1–300 characters | Player-facing description and mechanic hint. |
| `arena` | Yes | Arena object | Playable boundary and arena visual. |
| `token` | Yes | Token object | Player shape, visible size, and visual. |
| `movement` | Yes | Movement object | Pointer and keyboard movement tuning. |
| `start` | Yes | Start object | Initial token-center position or generation region. |
| `mainTarget` | Yes | Target object | Required target position and diameter. |
| `generation` | Yes | Generation object | Seeded static-obstacle rules. Use `obstacleCount: 0` to disable generation. |
| `manualObstacles` | Yes | Array | Fixed solid hazards. Use `[]` when none. |
| `movingObstacles` | Yes | Array | Oscillating solid hazards. Use `[]` when none. |
| `trackingObstacles` | Yes | Array | Tracking solid hazards. Use `[]` when none. |
| `dynamicObstacles` | No | Array | Phase, orbit, pulse, switch, and rotate hazards. Prefer `[]` when none. |
| `switches` | No | Array | Contact pads. Prefer `[]` when none. |
| `forceFields` | No | Array | Non-solid environmental fields. Prefer `[]` when none. |
| `coins` | Yes | Array | One-time collectible course coins. Use `[]` when none. |
| `rewards` | Yes | Rewards object | Coins granted for completion and bonus targets. |
| `scoring` | Yes | Scoring object | Maximum score, par values, weighting, and collision rules. |
| `bonuses` | Yes | Bonuses object | Ordered optional bonus-target flow. |

## Shared value shapes

### Coordinates and dimensions

Schema coordinates are numbers from `0` through `1600`, and positive
dimensions are greater than `0` and at most `1600`. In practice, y-coordinates
must fit the 900-unit world and every complete shape must fit its arena. The
server's generated-course validation catches placements that satisfy the basic
number range but do not fit the playable boundary.

### `region`

A region is used by generated starts/targets and tracking zones.

```json
{ "x": 100, "y": 120, "width": 300, "height": 240 }
```

| Property | Type | Role |
|---|---|---|
| `x` | Number `0–1600` | Upper-left x-coordinate in world units. |
| `y` | Number `0–1600` | Upper-left y-coordinate; keep the region within world height `900`. |
| `width` | Number `>0–1600` | Region width in world units. |
| `height` | Number `>0–1600` | Region height in world units. |

### Entity dimensions

Static, moving, and dynamic obstacles must use exactly one sizing form:

- `size`: diameter/equal width and height, convenient for circles and diamonds;
- `width` and `height`: explicit dimensions, useful for rectangles.

Do not provide `size` together with `width`/`height`. Tracking obstacles always
use explicit `width` and `height`.

### Common entity properties

| Property | Type | Role |
|---|---|---|
| `id` | Non-empty string | Stable identity used by validation, events, persistence, or links. |
| `mediaId` | Lowercase hyphenated string | Logical artwork identity; it must exist in the media registry. |
| `visualOverrideId` | Optional server-issued `entity-visual-<UUID>` | Artwork copied into this theme for only this entity. The renderer falls back to `mediaId` when absent or unavailable. Do not type catalog paths here. |
| `audioOverrideId` | Optional server-issued `entity-audio-<UUID>` | Sound copied into this theme for only this entity. It currently plays for coin collection, main/bonus target contact, and switch activation; the logical event sound is the fallback. |
| `shape` | `circle`, `rect`, or `diamond` | Authoritative collision geometry. Artwork does not change it. |
| `x`, `y` | Numbers | Entity center in world units. |
| `size` | Positive number | Equal visible/collision width and height. |
| `width`, `height` | Positive numbers | Explicit visible/collision dimensions. |

## `arena`

The arena is both the complete-token containment boundary and the arena visual.
Choose exactly one shape.

### Rectangular arena

```json
{
  "shape": "rect",
  "mediaId": "arena-standard",
  "margin": 35,
  "cornerRadius": 38
}
```

| Property | Constraint | Role |
|---|---|---|
| `shape` | Exactly `rect` | Selects rectangular containment. |
| `mediaId` | Registered media ID | Normally `arena-standard`. |
| `margin` | Number `0–400` | Inset from every world edge in world units. |
| `cornerRadius` | Number `0–500` | Rounded-corner radius in world units. |

### Elliptical arena

```json
{ "shape": "ellipse", "mediaId": "arena-ellipse", "margin": 45 }
```

`margin` insets the ellipse from the world edges. The complete token must remain
inside the ellipse.

### Polygon arena

```json
{
  "shape": "polygon",
  "mediaId": "arena-polygon",
  "points": [[120, 100], [1480, 100], [1510, 760], [800, 850], [90, 760]]
}
```

`points` is an ordered array of at least three absolute `[x, y]` vertices.
List the boundary vertices consistently clockwise or counter-clockwise and do
not create self-intersecting edges.

In the visual level editor, choose **Irregular polygon** under **Arena
boundary**. Numbered corner handles appear directly on the map; drag them on
the 10-unit grid or edit the selected corner's X/Y fields. **Add corner** splits
the longest current edge, and **Remove selected corner** keeps the required
three-corner minimum. Concave outlines are valid, but crossed/touching
non-adjacent edges and degenerate areas fail validation.

## `token`

```json
{ "shape": "circle", "size": 40, "mediaId": "token-circle" }
```

| Property | Constraint | Role |
|---|---|---|
| `shape` | `circle`, `rect`, or `diamond` | Complete player collision shape; it never rotates. |
| `size` | Number `>0–1600` | Token width and height in world units. |
| `mediaId` | Registered media ID | Usually the matching `token-circle`, `token-rect`, or `token-diamond`. |

The token center follows player intent through acceleration; it does not snap to
the pointer. Larger tokens require larger gaps and make a course harder.

## `movement`

```json
{
  "maximumSpeed": 520,
  "acceleration": 1750,
  "deceleration": 2050,
  "keyboardSpeed": 390
}
```

| Property | Constraint and unit | Role |
|---|---|---|
| `maximumSpeed` | `>0–2000` world units/second | Maximum pointer-driven token speed. |
| `acceleration` | `>0–10000` world units/second² | How quickly velocity approaches the desired velocity. |
| `deceleration` | `>0–10000` world units/second² | How quickly the token slows when input reduces or reverses. |
| `keyboardSpeed` | `>0–2000` world units/second | Target speed for arrow-key steering. |

High speed with low deceleration produces a slippery course. Test pointer and
keyboard play after changing these values.

## `start`

The start defines the initial **token center**.

Manual form:

```json
{ "mode": "manual", "mediaId": "start-pad", "x": 180, "y": 450 }
```

Generated form:

```json
{
  "mode": "generated",
  "mediaId": "start-pad",
  "region": { "x": 100, "y": 200, "width": 250, "height": 500 }
}
```

`mode` must be `manual` or `generated`. Manual mode requires `x` and `y`.
Generated mode requires `region`; the seed deterministically selects a point
inside it.

## `mainTarget`

The main target is circular and completes the required route when any part of
the token touches it.

Manual form:

```json
{
  "mode": "manual",
  "mediaId": "target-main",
  "x": 1400,
  "y": 450,
  "size": 58
}
```

Generated form uses `region` instead of `x`/`y`. Both forms require `size`, the
target diameter in world units.

## `generation`

This node creates additional static obstacles from `seed`. Generated obstacles
avoid authored reserved geometry and are accepted only when the main target
still has a collision-safe route.

```json
{
  "obstacleCount": 3,
  "allowedShapes": ["circle", "rect", "diamond"],
  "mediaByShape": {
    "circle": "obstacle-static-circle",
    "rect": "obstacle-static-rect",
    "diamond": "obstacle-static-diamond"
  },
  "minSize": 50,
  "maxSize": 110,
  "minimumGap": 48,
  "pathGrid": 20
}
```

| Property | Constraint | Role |
|---|---|---|
| `obstacleCount` | Integer `0–100` | Requested number of generated static obstacles. |
| `allowedShapes` | Unique non-empty array | Shapes the generator may choose. |
| `mediaByShape` | Object with all three keys below | Maps each generated collision shape to its logical visual. |
| `mediaByShape.circle` | Registered media ID | Visual used for generated circles. |
| `mediaByShape.rect` | Registered media ID | Visual used for generated rectangles. |
| `mediaByShape.diamond` | Registered media ID | Visual used for generated diamonds. |
| `minSize` | Positive number | Minimum generated width in world units. Must not exceed `maxSize`. |
| `maxSize` | Positive number | Maximum generated width in world units. |
| `minimumGap` | Number `0–500` | Extra clearance around generated candidates. |
| `pathGrid` | Integer `4–100` | Solvability-search cell size in world units. Smaller values are more precise but more expensive. |

The generator tries a bounded number of candidates. If a requested obstacle
cannot be placed safely, fewer than `obstacleCount` may be produced. Always use
**Regenerate** or **Playtest** to inspect the seed-locked result.

## Obstacle behavior at a glance

The editor draws dashed orange guides for sweep ranges, tracker zones, orbit
paths, maximum pulse bounds, and spinner envelopes. These guides are authoring
information only; the engine and Pixi renderer use the same deterministic
time-resolved collision state described below.

| Editor type | What it actually does |
|---|---|
| Static obstacle | A fixed solid collision shape. |
| Axis sweeper | Moves sinusoidally along X or Y between `center ± amplitude`. |
| Tracking obstacle | Starts with the attempt, then accelerates and turns toward the token while constrained to `zone`. |
| Phase gate | Is solid first, then open, then warning before the next solid interval. Only `solid` collides. |
| Orbiter | Remains solid while moving around its authored center on an elliptical path. |
| Pulse block | Remains solid while its real collision width and height grow and shrink. |
| Spinner | Remains solid while its rectangular collision geometry rotates. |
| Switch barrier | Becomes solid or open from the referenced switch and `initiallySolid`. |

All solid types use complete-token swept collision. One continuous overlap is
one collision, restores the last safe token position, applies the configured
penalty, and the third collision restarts the same deterministic layout.

## `manualObstacles[]`

Each item is a fixed solid obstacle.

```json
{
  "id": "barrier-1",
  "mediaId": "obstacle-static-rect",
  "shape": "rect",
  "x": 800,
  "y": 450,
  "width": 120,
  "height": 300
}
```

Required properties are `id`, `mediaId`, `shape`, `x`, `y`, plus `size` or the
pair `width`/`height`.

## `movingObstacles[]`

Moving obstacles oscillate around their configured center on one axis. Their
complete sweep must remain inside the arena.

```json
{
  "id": "sweeper-1",
  "mediaId": "obstacle-moving-circle",
  "shape": "circle",
  "x": 800,
  "y": 450,
  "size": 48,
  "axis": "x",
  "amplitude": 140,
  "periodMs": 3600,
  "phase": 0
}
```

| Property | Constraint | Role |
|---|---|---|
| Common entity fields | See above | Base shape and center of the sweep. |
| `axis` | `x` or `y` | Horizontal or vertical motion. |
| `amplitude` | Number `0–1000` | Maximum displacement in each direction, in world units. |
| `periodMs` | Integer `100–120000` | Milliseconds for one complete oscillation. |
| `phase` | Number, radians | Starting offset in the oscillation; `0`, `π/2`, `π`, etc. |

## `trackingObstacles[]`

Tracking hazards activate after the attempt starts, steer gradually toward the
token, and stay inside their rectangular zone.

```json
{
  "id": "tracker-1",
  "mediaId": "obstacle-tracking-circle",
  "shape": "circle",
  "x": 1100,
  "y": 450,
  "width": 40,
  "height": 40,
  "zone": { "x": 950, "y": 250, "width": 300, "height": 400 },
  "maxSpeed": 125,
  "acceleration": 180,
  "turnRateDegreesPerSecond": 140
}
```

| Property | Constraint and unit | Role |
|---|---|---|
| `id`, `mediaId`, `shape`, `x`, `y` | Required | Identity, collision shape, and initial center. |
| `width`, `height` | Positive world units | Explicit tracker dimensions. |
| `zone` | Region object | Allowed center area, expressed from its upper-left corner. |
| `maxSpeed` | `>0–2000` world units/second | Tracker speed limit. |
| `acceleration` | `>0–10000` world units/second² | Rate of speed change. |
| `turnRateDegreesPerSecond` | `>0–1440` degrees/second | Maximum gradual heading change. |

## `dynamicObstacles[]`

Each dynamic obstacle uses the common entity fields and exactly one `behavior`
object. Collision and Pixi rendering use the same time-resolved behavior.

### Phase behavior

```json
{
  "type": "phase",
  "cycleMs": 4000,
  "solidMs": 1500,
  "warningMs": 450,
  "offsetMs": 0
}
```

| Property | Constraint | Role |
|---|---|---|
| `type` | `phase` | Selects phase-gate behavior. |
| `cycleMs` | Integer `400–120000` | Complete solid/open/warning cycle duration. |
| `solidMs` | Integer `100–120000` | Solid time at the start of each cycle. |
| `warningMs` | Integer `100–120000` | Warning time immediately before becoming solid again. |
| `offsetMs` | Integer `0–120000` | Per-obstacle cycle offset. |

`solidMs + warningMs` must be **less than** `cycleMs`, leaving a non-zero open
window.

### Orbit behavior

```json
{
  "type": "orbit",
  "radiusX": 110,
  "radiusY": 75,
  "periodMs": 4200,
  "phase": 1.57
}
```

`radiusX` and `radiusY` are `0–1000` world units from the configured obstacle
center. `periodMs` is `400–120000`. `phase` is the starting angle in radians.
The complete elliptical motion envelope must fit inside the arena.

### Pulse behavior

```json
{
  "type": "pulse",
  "minScale": 0.55,
  "maxScale": 1.4,
  "periodMs": 3200,
  "phase": 0
}
```

| Property | Constraint | Role |
|---|---|---|
| `minScale` | Number `>0–1` | Smallest multiplier applied to base dimensions. |
| `maxScale` | Number `1–4` | Largest multiplier; must be at least `minScale`. |
| `periodMs` | Integer `400–120000` | Complete grow/shrink cycle. |
| `phase` | Number, radians | Starting offset in the pulse. |

The obstacle's dimensions at `maxScale` must fit inside the arena.

### Switch behavior

```json
{
  "type": "switch",
  "switchId": "switch-1",
  "initiallySolid": true
}
```

`switchId` must exactly match a `switches[].id`. If `initiallySolid` is `true`,
an active switch opens the barrier. If it is `false`, an active switch makes
the barrier solid.

### Rotate behavior

```json
{
  "type": "rotate",
  "speedDegreesPerSecond": 90,
  "initialDegrees": 45
}
```

`speedDegreesPerSecond` ranges from `-720` through `720`; negative values rotate
in the opposite direction. `initialDegrees` is unrestricted. The entire swept
radius of the rotating shape must fit inside the arena.

### Complete dynamic obstacle example

```json
{
  "id": "spinner-1",
  "mediaId": "obstacle-spinner",
  "shape": "rect",
  "x": 800,
  "y": 450,
  "width": 240,
  "height": 28,
  "behavior": {
    "type": "rotate",
    "speedDegreesPerSecond": 90,
    "initialDegrees": 45
  }
}
```

## `switches[]`

Switches are circular contact pads activated when the complete token touches
them. Activation is edge-triggered: continuous overlap does not repeatedly
activate a switch.

```json
{
  "id": "switch-1",
  "mediaId": "switch-pad",
  "x": 500,
  "y": 700,
  "size": 44,
  "activation": "timed",
  "durationMs": 4500
}
```

| Property | Constraint | Role |
|---|---|---|
| `id` | Non-empty string | Link target for dynamic switch barriers. |
| `mediaId` | Registered ID | Normally `switch-pad`. |
| `x`, `y` | Coordinates | Switch center. |
| `size` | Positive number | Circular pad diameter. |
| `activation` | `once`, `timed`, or `toggle` | One permanent activation, time-limited activation, or flip on each new contact. |
| `durationMs` | Integer `0–120000` | Active time for `timed`; use `0` for non-timed modes. |

## `forceFields[]`

Force fields are non-solid. Their acceleration is added while the complete
token overlaps them; overlapping fields combine in array order.

### Conveyor

```json
{
  "id": "current-1",
  "mediaId": "field-conveyor",
  "type": "conveyor",
  "x": 800,
  "y": 450,
  "width": 300,
  "height": 140,
  "directionDegrees": 0,
  "force": 320
}
```

The conveyor is rectangular. `directionDegrees` sets its push direction and
`force` is `>0–5000` world units/second².

### Repulsor or attractor

```json
{
  "id": "radial-1",
  "mediaId": "field-radial",
  "type": "attractor",
  "x": 800,
  "y": 450,
  "radius": 130,
  "force": 650
}
```

`type` is `repulsor` or `attractor`. `radius` is the circular field radius in
world units. `force` is `>0–5000` world units/second² at the center and falls
off linearly to zero at the edge.

## `coins[]`

```json
{
  "id": "coin-1",
  "mediaId": "coin-standard",
  "x": 800,
  "y": 250,
  "size": 30,
  "value": 1
}
```

`size` is the pickup diameter. `value` is an integer from `1` through `1000`
coins. Each course coin is claimable once for that theme and immutable level
identity; replaying the level cannot farm it.

## `rewards`

```json
{ "completionCoins": 5, "bonusCoinsPerTarget": 3 }
```

| Property | Constraint | Role |
|---|---|---|
| `completionCoins` | Integer `0–10000` | One-time coins for completing the level. |
| `bonusCoinsPerTarget` | Integer `0–10000` | One-time coins for each ordered bonus reached. |

These are progression currency rewards. They are separate from score points and
from collectible `coins[].value`.

## `scoring`

```json
{
  "baseMaximum": 10000,
  "parTimeMs": 12000,
  "parDistance": 900,
  "timeWeight": 0.5,
  "distanceWeight": 0.5,
  "collisionPenaltyRate": 0.2,
  "maximumCollisions": 3
}
```

| Property | Constraint and unit | Role |
|---|---|---|
| `baseMaximum` | Integer `≥1`, score points | Maximum score before earned bonus capacity. |
| `parTimeMs` | Integer `≥1`, milliseconds | Full time factor at or below this attempt time. |
| `parDistance` | Number `>0`, world units | Authoring reference distance. Runtime direct distance follows reached ordered targets. |
| `timeWeight` | Number `0–1` | Fraction of performance score based on time. |
| `distanceWeight` | Number `0–1` | Fraction based on route efficiency. |
| `collisionPenaltyRate` | Number `0–1` | Fraction of attainable maximum removed per collision; `0.2` means 20%. |
| `maximumCollisions` | Schema allows `1–20`; current game requires `3` | Collision count that restarts the same layout. |

`timeWeight + distanceWeight` must equal exactly `1` within validation
tolerance. The engine calculates:

```text
attainableMaximum = baseMaximum + earnedBonusMaximum
timeFactor = min(1, parTime / elapsedTime)
routeFactor = min(1, directDistance / actualDistance)
performanceScore = attainableMaximum ×
  ((timeWeight × timeFactor) + (distanceWeight × routeFactor))
collisionPenalty = attainableMaximum × collisionPenaltyRate × collisionCount
finalScore = round(clamp(
  performanceScore - collisionPenalty - bonusFailurePenalty,
  0,
  attainableMaximum
))
```

## `bonuses`

```json
{
  "maximumTargets": 1,
  "rewardPerTarget": 1200,
  "offerChanceMode": "currentScorePercent",
  "failurePenaltyRate": 0.1,
  "targets": [
    {
      "id": "bonus-a",
      "mediaId": "target-bonus",
      "x": 900,
      "y": 220,
      "size": 48
    }
  ]
}
```

| Property | Constraint | Role |
|---|---|---|
| `maximumTargets` | Integer `0–20` | Maximum ordered targets that may be offered. Must not exceed `targets.length`. |
| `rewardPerTarget` | Integer `≥0`, score points | Added attainable score capacity for every reached bonus. |
| `offerChanceMode` | Exactly `currentScorePercent` | Uses current score percentage for deterministic offer selection. |
| `failurePenaltyRate` | Number `0–1` | Attainable-maximum fraction removed when an accepted bonus pursuit fails. |
| `targets` | Array | Ordered bonus target definitions. |

Each target requires a unique non-empty `id`, registered `mediaId`, center `x`
and `y`, and positive diameter `size`. Only one bonus appears at a time. Reaching
one checkpoints the token there; attempt time, distance, and trail continue.

For a level without bonuses, use:

```json
{
  "maximumTargets": 0,
  "rewardPerTarget": 0,
  "offerChanceMode": "currentScorePercent",
  "failurePenaltyRate": 0,
  "targets": []
}
```

## Registered `mediaId` values

These IDs are currently available to level JSON. A theme can override the file
for any one ID independently; missing or invalid theme media falls back to the
default asset.

| Category | Registered IDs |
|---|---|
| Arenas | `arena-standard`, `arena-ellipse`, `arena-polygon` |
| Tokens | `token-circle`, `token-rect`, `token-diamond` |
| Targets and switches | `start-pad`, `target-main`, `target-bonus`, `switch-pad` |
| Static obstacles | `obstacle-static-circle`, `obstacle-static-rect`, `obstacle-static-diamond` |
| Moving obstacles | `obstacle-moving-circle`, `obstacle-moving-rect`, `obstacle-moving-diamond` |
| Tracking obstacles | `obstacle-tracking-circle`, `obstacle-tracking-rect`, `obstacle-tracking-diamond` |
| Dynamic obstacles | `obstacle-phase-gate`, `obstacle-orbiter`, `obstacle-pulse-block`, `obstacle-switch-barrier`, `obstacle-spinner` |
| Force fields | `field-conveyor`, `field-radial` |
| Coins | `coin-standard` |

Power media IDs exist in the global registry but are configured by the power
system, not placed through level JSON.

## Per-object image and audio overrides

Select an object on the level map and choose **Choose image or audio override**.
The shared dialog browses the read-only PublicMedia catalog and the signed-in
author's private **My uploads** folder. Use **Upload image** or **Upload audio**
to add personal media. The quota meter covers uploaded sources plus custom
media copied into every theme owned by the account; deleting an uploaded source
frees its source bytes without removing existing theme copies. Applying a
selection:

1. copies and validates an image, or normalizes audio to a WAV master plus WebM
   and MP3 delivery files;
2. stores those files inside the owned theme;
3. creates a server-issued `visualOverrideId` or `audioOverrideId`;
4. assigns that ID to only the selected object;
5. retains the object's normal `mediaId` or logical event sound as fallback.

Example coin definitions:

```json
{
  "id": "coin-10",
  "mediaId": "coin-standard",
  "visualOverrideId": "entity-visual-11111111-1111-1111-1111-111111111111",
  "audioOverrideId": "entity-audio-22222222-2222-2222-2222-222222222222",
  "x": 600,
  "y": 450,
  "size": 30,
  "value": 10
}
```

```json
{
  "id": "coin-50",
  "mediaId": "coin-standard",
  "visualOverrideId": "entity-visual-33333333-3333-3333-3333-333333333333",
  "audioOverrideId": "entity-audio-44444444-4444-4444-4444-444444444444",
  "x": 1000,
  "y": 450,
  "size": 38,
  "value": 50
}
```

The IDs above illustrate the format only. Always let the Workshop create real
IDs; manually invented IDs fail save validation because no owned file exists.
Use **Clear object media overrides** to return the selected entity to the
theme-wide defaults.

## Validation beyond property types

**Validate JSON** and **Validate and apply** check more than syntax:

1. The document must match the schema and contain no unknown properties.
2. Level identity and scoring relationships must be valid.
3. `generation.minSize` must not exceed `generation.maxSize`.
4. A phase behavior must contain a real open window.
5. Pulse scales must not be inverted.
6. Every switch barrier must reference an existing switch ID.
7. Every `mediaId` must be registered.
8. The complete token, targets, pickups, hazards, movement sweeps, dynamic
   envelopes, and tracking zones must fit the arena.
9. Invalid entity overlaps are rejected.
10. The deterministic generated course must have safe routes through the main
    target and every ordered required target.

Common fixes:

| Validation problem | Typical correction |
|---|---|
| `must NOT have additional properties` | Remove or correct the misspelled property. |
| `must match exactly one schema in oneOf` | Use only the fields belonging to the selected arena, start, target, force-field, or dimension form. |
| `unknown mediaId` | Choose an ID from the registry table. |
| `requires a non-zero open phase` | Reduce `solidMs`/`warningMs` or increase `cycleMs`. |
| `references unknown switch` | Match `behavior.switchId` to `switches[].id`. |
| `is outside the arena` | Move the entity inward or reduce its size/motion envelope. |
| `overlaps` | Move or resize one of the reported entities. |
| `Unable to generate a solvable level` | Reduce obstacles, sizes, or gaps; move authored hazards; enlarge the arena route; or adjust `pathGrid`. |

## Safe authoring workflow

1. Duplicate an existing level close to the mechanic you want.
2. Keep `internalId` unchanged.
3. Change `name`, `briefing`, and `seed` intentionally.
4. Edit one mechanic group at a time.
5. Select **Format JSON** to normalize indentation and expose syntax errors.
6. Select **Validate JSON** and correct every reported issue.
7. Select **Validate and apply** to place the validated draft into the editor.
8. Use **Playtest** with both pointer and keyboard controls.
9. Save the level, then test restart determinism, collisions, target order,
   bonuses, coins, switches, and the full hazard envelope.
10. Use the media editor to replace logical visuals or sounds without changing
    collision geometry.

## Minimal complete level example

This example intentionally has no obstacles, fields, coins, or bonuses. A
Workshop copy will also contain its own immutable `internalId`.

```json
{
  "schemaVersion": 2,
  "id": "level-01",
  "number": 1,
  "name": "Open Run",
  "seed": "my-theme-open-run-v1",
  "difficulty": 1,
  "briefing": "Cross the arena and touch the target.",
  "arena": {
    "shape": "rect",
    "mediaId": "arena-standard",
    "margin": 35,
    "cornerRadius": 38
  },
  "token": {
    "shape": "circle",
    "size": 40,
    "mediaId": "token-circle"
  },
  "movement": {
    "maximumSpeed": 420,
    "acceleration": 1500,
    "deceleration": 1800,
    "keyboardSpeed": 320
  },
  "start": {
    "mode": "manual",
    "mediaId": "start-pad",
    "x": 180,
    "y": 450
  },
  "mainTarget": {
    "mode": "manual",
    "mediaId": "target-main",
    "x": 1420,
    "y": 450,
    "size": 58
  },
  "generation": {
    "obstacleCount": 0,
    "allowedShapes": ["circle", "rect", "diamond"],
    "mediaByShape": {
      "circle": "obstacle-static-circle",
      "rect": "obstacle-static-rect",
      "diamond": "obstacle-static-diamond"
    },
    "minSize": 50,
    "maxSize": 100,
    "minimumGap": 45,
    "pathGrid": 20
  },
  "manualObstacles": [],
  "movingObstacles": [],
  "trackingObstacles": [],
  "dynamicObstacles": [],
  "switches": [],
  "forceFields": [],
  "coins": [],
  "rewards": {
    "completionCoins": 1,
    "bonusCoinsPerTarget": 0
  },
  "scoring": {
    "baseMaximum": 1000,
    "parTimeMs": 8000,
    "parDistance": 1240,
    "timeWeight": 0.5,
    "distanceWeight": 0.5,
    "collisionPenaltyRate": 0.2,
    "maximumCollisions": 3
  },
  "bonuses": {
    "maximumTargets": 0,
    "rewardPerTarget": 0,
    "offerChanceMode": "currentScorePercent",
    "failurePenaltyRate": 0,
    "targets": []
  }
}
```

## Theme presentation JSON for source-controlled themes

The Workshop popup does not edit this document, but developers creating a
source-controlled presentation theme use
[`src/config/themeConfig.json`](../../src/config/themeConfig.json), validated by
[`src/config/schemas/theme.schema.json`](../../src/config/schemas/theme.schema.json).

Top-level properties are:

| Property | Role |
|---|---|
| `schemaVersion` | Must be `2`. |
| `mediaVersion` | Positive integer used for cache invalidation. |
| `defaultMediaRoot` | Must be `/media/default`. |
| `activeTheme` | Hyphenated ID that must name an entry in `themes`. |
| `themes` | Map from theme ID to presentation settings. |

Each `themes.<themeId>` object contains:

| Property | Constraint and role |
|---|---|
| `name` | Non-empty player-facing theme name. |
| `mediaRoot` | `/media/themes/<theme-id>` URL root. |
| `colors` | One or more named six-digit hex colors such as `#18d9f3`. Color keys are presentation tokens consumed by the UI/theme layer. |
| `effects.glowIntensity` | Number `0–1`. |
| `effects.trailWidth` | Number `>0–50` world units. |
| `effects.collisionGuideWidth` | Number `>0–5` world units. |
| `effects.ghostTrailOpacity` | Number `0–1`. |
| `effects.targetPulseDurationMs` | Integer `0–60000` milliseconds. |
| `effects.collisionFlashDurationMs` | Integer `0–60000` milliseconds. |

Visual and audio overrides are not manually listed in that JSON. Build tooling
scans standardized filenames and generates resolved manifests. A valid theme
override wins for that one element; otherwise the valid default is used.
