# Path Protocol — Architecture V2

## 1. Status and purpose

This document is the source of truth for the Path Protocol V2 rearchitecture.
V2 is treated as a new game codebase inside the existing repository rather than
as a backward-compatible renderer upgrade.

Development takes place on:

```text
feature/pixijs-rearchitecture
```

The existing level concepts, scoring rules, deterministic generation, geometry,
progression, and persistence behavior may be reused when they conform to this
document. The existing React/SVG renderer and synthesized Web Audio
implementation are not compatibility targets.

The implementation order is:

1. Configuration contracts and validation.
2. Default and theme media pipeline.
3. Audio source and conversion pipeline.
4. Framework-neutral fixed-step game engine.
5. PixiJS WebGL renderer.
6. React application integration.
7. Howler audio integration.
8. Full validation, browser testing, Docker support, and documentation.

## 2. Product summary

Path Protocol is a desktop browser precision game. A player activates a visible
token at a start point and guides it through an obstacle course to an ordered
target sequence.

The game rewards:

- Fast completion.
- Efficient travel compared with the direct route.
- Avoiding obstacles and arena boundaries.
- Judicious pursuit of optional bonus targets.
- Improved per-level scores.
- Campaign progression, coin collection, and strategic use of consumable
  powers.

The campaign contains 100 deterministic levels across ten mechanic tiers.
Each tier teaches, tests, and combines a progressively broader obstacle
vocabulary. Released seeds distribute start points, required targets, static
geometry, and mechanic hazards across the full safe 1600 × 900 arena instead
of selecting from fixed route lanes. All players receive the same generated
layout for a given level version and seed; restarting never rerolls a course.

## 3. Technology decisions

| Area | V2 choice |
|---|---|
| Application shell | React 19 |
| Build tooling | Vite |
| Language | Modern JavaScript with ES modules |
| Game renderer | PixiJS |
| Rendering backend | WebGL only |
| Pixi integration | One imperative Pixi canvas mounted by React |
| Source artwork | External SVG files |
| Initial SVG mode | Pixi vector `GraphicsContext` |
| Future SVG mode | High-resolution texture fallback |
| Audio | Howler.js |
| Audio source | WAV masters |
| Runtime audio | WebM preferred, MP3 fallback |
| Game simulation | Fixed 60 Hz update |
| Rendering cadence | `requestAnimationFrame` through Pixi |
| Configuration | JSON validated by JSON Schema |
| Player persistence | Versioned, theme-namespaced `localStorage` |
| Theme persistence | Express REST API and filesystem-backed JSON packages |
| Unit/component tests | Vitest and React Testing Library |
| Browser tests | Playwright |

PixiJS owns gameplay rendering and the real-time loop. React owns screens,
navigation, HUD presentation, dialogs, settings, the power shop, and other
discrete UI.

Howler is independent of both React and Pixi. The game engine emits logical
events, and the audio service maps those events to the active theme.

## 4. System boundaries

```text
React application
├── Startup and loading screen
├── Main menu and level selection
├── HUD and messages
├── Bonus decision dialog
├── Results
├── Power shop and inventory
├── Settings
└── PixiGameCanvas
    └── Pixi runtime
        ├── Fixed-step engine
        ├── Input state
        ├── Collision and geometry services
        ├── Entity state
        ├── Scene graph
        ├── Trail renderer
        └── Debug renderer

Game events
├── React UI adapter
├── Howler audio adapter
└── Persistence adapter
```

React must not receive pointer positions, token transforms, obstacle transforms,
or trail samples every frame. It receives throttled HUD snapshots and discrete
events such as:

- `attempt.started`
- `attempt.restarted`
- `collision`
- `coin.collected`
- `target.reached`
- `bonus.offered`
- `bonus.accepted`
- `bonus.banked`
- `power.activated`
- `attempt.completed`
- `attempt.failed`

## 5. Logical world and responsive viewport

All authored gameplay coordinates use a logical 1600 × 900 world.

The Pixi canvas resizes to its containing element. A root world container is
uniformly scaled and centered:

```text
scale = min(viewportWidth / 1600, viewportHeight / 900)
offsetX = (viewportWidth - 1600 × scale) / 2
offsetY = (viewportHeight - 900 × scale) / 2
```

Uniform scaling prevents distortion of tokens, targets, obstacles, coins, and
effects. Pointer positions are converted from canvas coordinates into logical
world coordinates through one shared viewport service.

The arena itself may be rectangular, elliptical, polygonal, or a later custom
path. Its collision boundary is defined in JSON and is independent of the canvas
shape.

## 6. Simulation and rendering loop

Gameplay simulation runs at a fixed 60 updates per second:

```text
fixedStep = 1000 / 60 milliseconds

accumulator += clampedFrameDelta
while accumulator >= fixedStep:
    processInput(fixedStep)
    updateToken(fixedStep)
    updateMovingHazards(fixedStep)
    updateTrackingHazards(fixedStep)
    updatePowers(fixedStep)
    detectCollisions()
    detectPickupsAndTargets()
    accumulator -= fixedStep

render(interpolation)
```

Pixi renders on animation frames independently of the simulation rate. A private
Pixi ticker is used so update ordering remains under game control.

Scoring time uses a monotonic real-time clock. Fixed-step simulation is not used
to give a slow device a timing advantage.

Raw pointer events update input state only. They do not calculate collisions,
move hazards, mutate React state, or render the arena. Moving and tracking
obstacles therefore continue to update smoothly during heavy pointer input.

## 7. Input model

### 7.1 Pointer

- The player presses the visible token at the start or current bonus checkpoint.
- Clicking the token starts pointer control; clicking again stops it.
- Releasing the mouse button does not end the attempt.
- Pointer movement sets the token's desired position.
- The token moves toward that desired position using configured acceleration,
  maximum speed, and deceleration.
- The pointer controls the center of the token.
- The native cursor is hidden during active pointer control.
- Releasing is the player's explicit decision to finish or abandon the current
  run according to the gameplay state.

The token never snaps directly to the pointer. Pointer response settings belong
in configuration and may be tuned globally or per level.

### 7.2 Keyboard

- Pressing Space while the token is at the start activates keyboard play.
- Arrow keys steer the token.
- Pressing Space again stops keyboard control.
- Keyboard play does not require a prior mouse click.
- Number keys `1` through `9` activate configured consumable powers.
- `R` restarts the current level without regenerating its layout.

The first Start Game interaction unlocks Howler audio. Starting keyboard play
with Space is also a valid user interaction for resuming browser audio.

## 8. Gameplay state machine

V2 uses one explicit state machine. Conflicting component booleans are not
authoritative gameplay state.

Core states:

```text
loading
ready
active-main
main-reached
bonus-offer
bonus-ready
active-bonus
completed
failed
restarting
paused
```

Important transitions:

```text
ready --activate--> active-main
active-main --main touched--> main-reached
main-reached --bonus selected--> bonus-offer
bonus-offer --pursue--> bonus-ready
bonus-ready --activate--> active-bonus
active-bonus --bonus touched--> main-reached
bonus-offer --bank--> completed
active-main --toggle off early--> restarting
active-bonus --toggle off/fail--> completed with bonus penalty
any active state --third collision--> restarting
```

When a bonus is offered, React shows a popup. If the player pursues it, the token
is anchored at the target just reached and control restarts from that checkpoint.
Only one bonus target is visible at a time, and bonus order is mandatory.

## 9. Geometry and collision

Visual media never defines authoritative collision geometry.

```text
Level JSON geometry → collisions, containment, path validation, scoring
Resolved media asset → presentation only
```

The token has real width, height, and shape, fixed orientation, and no rotation.
The complete token is tested against obstacles and arena boundaries. Supported
geometry includes circles, rectangles, diamonds/polygons, and flattened paths
when later required.

Movement uses swept collision tests between the previous safe position and the
next simulated position to prevent token tunneling. Moving and tracking
obstacles collide only at their current rendered transforms; their configured
movement paths, amplitudes, and tracking zones are not solid collision areas.
The token collision shape is inset by the globally configured tolerance
(initially 4 world units from each visible edge). A thin theme-defined guide is
rendered over the token at that exact authoritative collision boundary.

On collision:

1. Count one collision for a continuous contact episode.
2. Apply the configured percentage penalty.
3. Return the token to its last safe position.
4. Preserve elapsed time and traveled distance.
5. Emit visual, HUD, and audio feedback.
6. Restart the same level after the configured maximum collision count,
   currently three.

Shield 1 ignores obstacle collisions but not arena boundaries. Shield 2 ignores
both obstacle and boundary collisions for its configured duration. When a shield
expires in an invalid location, the token returns to the last safe point.

## 10. Moving and tracking hazards

Moving obstacles derive their position from simulation time and configuration.
They are not advanced by pointer events.

Tracking obstacles:

- Activate only after the attempt begins.
- Remain inside their configured rectangular or squarish tracking area.
- Accelerate gradually.
- Turn gradually toward the token.
- Obey configured acceleration, maximum speed, and turn rate.
- Use deterministic update rules.
- Never rotate their visual or collision shape unless a future level explicitly
  introduces rotation.

### 10.1 Dynamic obstacle behaviors

Configuration-driven dynamic obstacles extend the fixed-step hazard system
without moving gameplay rules into Pixi or React. The initial behavior set is:

- `phase`: alternates through solid, open, and warning states.
- `orbit`: moves the obstacle center around an elliptical path.
- `pulse`: changes authoritative width and height within validated bounds.
- `switch`: becomes solid or open from engine-owned contact-switch state.
- `rotate`: turns authoritative rectangular geometry around its center.

Non-solid environmental force fields are fixed-step engine entities:

- `conveyor`: adds directional acceleration while the complete token overlaps.
- `repulsor`: pushes away from its center with linear falloff.
- `attractor`: pulls toward its center with linear falloff.

Collision and rendering consume the same time-resolved obstacle state. Dynamic
collision uses both previous and current transforms so fast hazards cannot
tunnel through the complete token between 60 Hz updates. Phase warnings remain
legible when reduced motion is enabled.

Contact switches support one-shot, timed, and toggle activation. Raw input never
activates a switch directly; activation occurs during the fixed engine update
after complete-token contact is evaluated.

### 10.2 Kinetic shot mode

Kinetic movement replaces guided movement with deterministic aim-and-launch
play. React owns one persistent home-screen `Movement mode` toggle, stored as
`settings.controlMode`; changing it does not alter authored level JSON.

At session creation React makes an immutable mode-specific projection:

- `guided` omits an authored `shotMechanic` and preserves original controls;
- `kinetic` uses an authored `shotMechanic` when present, otherwise injects the
  global defaults from `gameConfig.kineticShot`;
- every campaign level and Micro Protocol therefore supports either movement
  mode on the same authored/generated layout;
- the selected mode remains active for subsequent levels until changed at home.

- Pointer play presses the stopped token, pulls opposite the intended launch
  direction, and releases to queue a shot. An authored `two-click` input style
  remains available as an override.
- Keyboard play presses Space to aim, holds an arrow direction, and presses
  Space again to queue a shot.
- Launch intent is converted to velocity and consumed only by the next fixed
  engine update.
- Steering is locked in flight.
- Linear drag and configured restitution affect speed in world units/second.
- Arena boundaries and static obstacles reflect velocity without incrementing
  the penalized collision counter.
- Static obstacles may override the default response with `rebound`, `bumper`,
  `stop`, or `reset`; reset returns to `lastRestPosition`, which updates only
  when the token reaches exact rest or a target checkpoint.
- Motion below `stopSpeed` becomes literal zero velocity, permitting the next
  aim without residual sliding.
- Multi-impact steps retain ordered path segments for target sweeps, distance,
  and trail rendering.
- A main hole is reached only when the token center enters the authored target
  footprint. Optional bonus targets retain complete-token edge contact so their
  established pursuit difficulty does not change.
- Authored shot-mechanic levels remain restricted to validated static rebound
  surfaces; global Ricochet projection can still use the campaign's fixed-step,
  time-resolved hazards as collision surfaces.
- Consumable powers are unavailable in Ricochet sessions.

Kinetic phase (`resting`, `aiming`, or `in-flight`) is engine session state
inside `active-main`/`active-bonus`; it does not duplicate the global game state
machine. Pixi renders the aim line and engine transforms but never predicts or
resolves an authoritative rebound.

Completion payloads include `shotsTaken`. Persistence keeps the latest and
fewest positive shot count per campaign level, sums those best records for the
campaign shot total, and accumulates lifetime launched shots from completed
campaign and Micro Protocol runs. Guided completions never overwrite a kinetic
shot record.

Optional `shotGoals` define par, a perfect threshold, and a maximum shot
budget. The HUD exposes live power, shots used/remaining, and par. Consuming the
last shot never fails an in-flight token: target contact is resolved first,
then an exhausted main attempt restarts only if the token has stopped without
success. Completion emits a deterministic perfect/under-par/par/over-par
rating.

## 11. Trail rendering and scoring distance

The player's actual path remains visible.

- Accurate traveled distance is accumulated from simulation movement.
- Rendered trail points are sampled or simplified to bound GPU and memory cost.
- The active trail stays visible for the attempt.
- A small configured number of failed trails may remain as faint ghost trails.
- Render simplification never changes score calculations.

Pixi uses dedicated `Graphics` objects or a later optimized mesh for trails.
Trail updates do not trigger React rendering.

## 12. Level configuration

Every level is a JSON document validated against a versioned JSON Schema.
All 100 levels must contain every required gameplay attribute.

Every renderable gameplay object contains a theme-neutral `mediaId`, including:

- Arena/background treatment.
- Token.
- Start point.
- Main target.
- Bonus targets.
- Static obstacles.
- Moving obstacles.
- Tracking obstacles.
- Coins.
- Power pickups or effects when represented in the arena.

Example:

```json
{
  "id": "hazard-a",
  "mediaId": "obstacle-barrier",
  "shape": "rect",
  "x": 500,
  "y": 420,
  "width": 180,
  "height": 70
}
```

Level JSON defines geometry, dimensions, behavior, score values, and placement.
It does not define SVG colors, gradients, glow effects, or audio files.

Manual coordinates and deterministic generation may coexist. Manual elements
take priority, and generated layouts must be validated as solvable for the
configured token.

## 13. Media architecture

### 13.1 Default-first inheritance

The complete current SVG artwork and sound effects become the default media
library. Default media must always be present and valid.

Themes contain only individual overrides. Future Lab initially inherits the
default assets and adds files only when a distinct Future Lab treatment is
created.

Resolution occurs independently for each `mediaId`:

```text
valid theme override
    ↓ otherwise
valid default asset
    ↓ otherwise
fatal default-media error
```

A theme can override one token without replacing every token, or one collision
sound without replacing the whole sound set.

### 13.2 Directory layout

```text
public/media/
├── default/
│   ├── media.json
│   ├── audio.json
│   ├── tokens/
│   ├── obstacles/
│   ├── targets/
│   ├── bonus/
│   ├── coins/
│   ├── powers/
│   ├── arenas/
│   └── audio/
│       ├── source/
│       ├── *.webm
│       └── *.mp3
└── themes/
    └── future-lab/
        ├── media.json
        ├── audio.json
        ├── tokens/
        ├── obstacles/
        ├── targets/
        ├── bonus/
        ├── coins/
        ├── powers/
        ├── arenas/
        └── audio/
            ├── source/
            ├── *.webm
            └── *.mp3
```

Theme folders and category folders may be empty when no override exists.

### 13.3 SVG contract

SVG artwork is stored in external files, never embedded as large JSX shape
definitions.

Initial SVG requirements:

- Transparent background.
- Centered artwork.
- Standard `viewBox="0 0 100 100"`.
- Self-contained fill, stroke, gradient, and supported visual treatments.
- No dependency on global CSS variables or DOM IDs outside the asset.
- No embedded bitmap data.
- No text elements.
- Predictable bounds around the centered origin.

Rectangular artwork may scale to the JSON width and height. Tokens, circular
targets, coins, and other proportion-sensitive media preserve their aspect
ratio. The media definition declares its sizing behavior.

### 13.4 Explicit render mode

Every indexed visual asset includes an explicit render mode:

```json
{
  "mediaId": "token-orb",
  "src": "tokens/token-orb.svg",
  "renderMode": "vector",
  "sizing": "contain"
}
```

V2 initially implements only:

```text
renderMode: vector
```

Vector SVG files are loaded as reusable Pixi `GraphicsContext` objects and
cached. The schema reserves:

```text
renderMode: texture
```

Texture mode will later rasterize complex SVG artwork at an appropriate
resolution. Until implemented, selecting texture mode is an unsupported
configuration error. The original SVG remains the source asset in both modes.

Pixi's vector SVG limitations must be respected. SVG text, blur/drop-shadow
filters, and unsupported patterns are not allowed in vector-mode assets. Similar
effects are implemented using Pixi layers and filters when needed.

## 14. Generated media manifests

Media manifests are generated by the build tooling, not manually synchronized
with directory contents.

The indexer:

1. Scans the default library.
2. Scans every theme override library.
3. Matches standardized filenames to known `mediaId` values.
4. Reads declared render and sizing metadata.
5. Produces deterministic, versioned Pixi asset manifests.
6. Produces resolved Howler audio mappings.
7. Reports duplicates and unknown filenames.
8. Validates that every required default media ID resolves.

Default validation rules:

- Missing default asset: fatal.
- Invalid default SVG or audio: fatal.
- Unknown default filename: fatal until corrected or registered.
- Unsupported default render mode: fatal.

Theme override rules:

- Missing override: normal default inheritance.
- Valid override: use it for that one element.
- Invalid override: use the default.
- Development: emit a detailed warning.
- Production: fall back silently.

Theme problems must never hide an invalid or missing default asset.

Generated manifests contain a `mediaVersion`. The version participates in asset
aliases or URLs so an intentional version change invalidates stale browser and
Pixi caches.

## 15. Loading and caching

The startup screen tells the player that Path Protocol is initializing and shows
real loading progress.

Startup order:

1. Load and validate game configuration.
2. Load generated default and active-theme manifests.
3. Resolve theme overrides against defaults.
4. Initialize the WebGL Pixi application.
5. Parse and cache resolved vector SVG contexts.
6. Preload and decode the selected browser-compatible audio files.
7. Build the initial scene.
8. Enable the Start Game action.

Pixi's asset cache is used for visual assets. Howler manages decoded audio and
playback instances. Browser HTTP caching remains enabled through versioned URLs.
No gameplay screen appears before its required assets are ready.

## 16. Audio architecture

### 16.1 Logical events

The engine emits theme-neutral sound IDs such as:

```text
drag-start
collision
attempt-failed
target-reached
bonus-offered
bonus-accepted
coin-collected
power-obstacle-shield
power-full-shield
power-slow-field
power-coin-magnet
power-route-scan
power-unavailable
level-complete
ambience
```

Exact required IDs are stored in the audio schema and default configuration.

### 16.2 File inheritance

Audio uses the same per-element fallback as SVG media:

```text
theme audio file if valid
    ↓ otherwise
default audio file
```

Each sound is a separate file. Audio sprites are deferred until profiling shows
a demonstrated need.

### 16.3 Source and delivery formats

WAV is the canonical editable source. Runtime delivery uses:

1. WebM as the preferred format.
2. MP3 as the compatibility fallback.

Example:

```text
audio/source/collision.wav
audio/collision.webm
audio/collision.mp3
```

Howler receives sources in preferred order:

```js
["collision.webm", "collision.mp3"]
```

The browser downloads the first supported format rather than both in normal
playback.

### 16.4 Conversion

Before Vite development or production build, an audio preparation script scans
default and theme audio sources.

Normal conversion:

- If WebM exists, do not regenerate it.
- If MP3 exists, do not regenerate it.
- Generate only a missing delivery format from the WAV master.
- Never overwrite existing converted files.

Forced conversion:

```text
npm run media:audio:force
```

The force command intentionally regenerates WebM and MP3 from WAV.

FFmpeg performs conversion outside the browser. Docker includes FFmpeg only in
the build stage; the final static web-server image does not require it.

### 16.5 Playback settings

Audio recording and playback behavior remain separate. `audio.json` stores:

- Volume.
- Cooldown.
- Looping.
- Fade-in duration.
- Fade-out duration.
- Audio channel.

Example:

```json
{
  "collision": {
    "volume": 0.7,
    "cooldownMs": 250,
    "loop": false,
    "fadeInMs": 0,
    "fadeOutMs": 0,
    "channel": "effects"
  }
}
```

Theme setting inheritance is deliberately simple:

- A complete valid theme entry replaces the complete default entry.
- A missing, incomplete, or invalid theme entry uses the complete default entry.
- Settings are not merged property by property.
- Invalid theme settings warn only in development.

### 16.6 Ambience

The default library provides a required `ambience` WAV master and generated WebM
and MP3 files.

- Ambience starts after the player presses Start Game.
- It loops continuously.
- It continues between levels.
- It stops, fades, or changes only when audio is muted, the active theme
  changes, or the application is disposed.
- A theme may override the `ambience` files and complete playback entry.
- Missing theme ambience uses the default loop.

Music is not a separate first-release system. The initial release uses the
ambience loop.

## 17. Pixi scene architecture

```text
stage
└── world
    ├── arenaLayer
    ├── gridAndDecorationLayer
    ├── debugLayer
    ├── routeScanLayer
    ├── trailLayer
    ├── obstacleLayer
    ├── targetLayer
    ├── coinLayer
    ├── effectLayer
    └── tokenLayer
```

The arena provides a visual mask corresponding to its configured boundary.
Collision still uses JSON geometry.

Static display objects are created once per level. Moving display objects retain
stable instances and receive transforms from the renderer adapter each frame.
Pixi object construction and SVG parsing never occur inside the hot simulation
loop.

## 17A. Theme Workshop and server persistence

The Theme Workshop is an explicit post-V2 product expansion. Node and Express
serve the production React build and a same-origin REST API. The pure engine
does not import the server or filesystem.

The source-controlled default campaign is read-only. Cloning any published
theme creates a new folder in the configured persistent theme directory:

```text
data/themes/<theme-id>/
├── theme.json
├── levels/
    ├── <immutable-level-id>.json
│   └── ...
└── media/
    ├── <registered visual categories>/
    └── audio/{source/*.wav,*.webm,*.mp3}
```

The initial clone copies level JSON only. Authors may then select registered
visual and audio replacements from the read-only `PublicMedia/catalog.json`
library. A selection is never referenced in place: the server validates and
copies it into the theme's media folder and records its source asset ID.
The authoring UI exposes every supported media file through recursive folder
navigation, breadcrumbs, paging, and direct image/audio preview; search is an
optional accelerator rather than the only discovery mechanism.

PNG and compatible SVG sources retain their runtime format; JPEG sources are
converted to PNG. WAV, OGG, MP3, AIF, and AIFF audio is normalized to a stereo
44.1 kHz 16-bit WAV master, then delivered as WebM/Opus first and MP3 second.
Access-controlled dynamic manifests resolve each copied override independently
and fall back to mandatory defaults. Applying an asset increments the theme's
media version so renderer and audio caches reload.

Level entities retain their theme-neutral `mediaId` and may additionally hold
server-issued `visualOverrideId` and `audioOverrideId` values. These IDs name
files copied into the owned theme, never paths in PublicMedia. The visual
override affects only that entity instance, which allows (for example) a
10-point coin and a 50-point coin to use different artwork while both remain
coins. Per-entity audio currently applies to discrete coin-collection,
main/bonus-target, and switch-activation events. A missing or invalid override
falls back to the entity's `mediaId` or logical event sound. Cloning strips
per-entity override IDs because the initial clone intentionally copies levels
without media.

Players may select any source-controlled presentation theme in Settings.
Playing an owned or public Workshop theme loads its dynamic media manifest.

Source-controlled presentation themes may override a registered SVG basename
with a validated PNG texture. Resolution remains per element: valid theme PNG,
then valid theme SVG, then mandatory default SVG. Pixi caches both parsed vector
contexts and textures; collision bounds continue to come exclusively from level
JSON. Celestial Foundry is the first mixed vector/texture proof theme.

Each cloned theme has a generated stable ID, an owning SQLite user ID stored in
`theme.json`, user-provided metadata, private status until publication, and
between 1 and 200 levels. Campaign IDs and numbers follow sequence position,
while an immutable internal level ID owns file identity and player progress.

Accounts use a unique username, unique email address, and salted scrypt password
hash. Server sessions are represented by an HTTP-only, SameSite cookie; only a
SHA-256 digest of each random session token is stored in SQLite. Development
registration activates immediately without an email-confirmation step.
Unauthenticated players may play public themes. Cloning, private-theme reads,
and every mutation require login as the owning account.

Every save is schema-validated and passed through deterministic generation,
containment, overlap, and solvability checks. Invalid editor state remains
client-side. Debounced autosave and manual save persist only valid state.

The editor provides a mandatory 10-unit placement grid, entity CRUD and
resizing, a modal full-level JSON editor with formatting and server-side JSON
Schema plus gameplay validation, undo/redo, seed regeneration, live PixiJS
playtesting, and level duplication, deletion, reordering, and
automatic renumbering. Published themes remain editable by their key holder.

Selected dimensioned entities expose eight mouse resize handles. Edge and
corner drags update authoritative `size`, `radius`, or `width`/`height` fields;
single-dimension circles and squares preserve their proportions, while
rectangles resize independently. The opposite edge remains anchored where
world containment permits, and results snap to the 10-unit authoring grid. A
right-click context menu offers separate per-entity image and supported-event
sound actions plus a selected-object-only JSON dialog. Object JSON is validated
in the complete level before it can be applied.

The selected-object inspector also exposes independent vertical properties in
logical world units. `elevation` places the bottom of an object above the ground,
`visualHeight` controls its Three.js presentation, and `collisionHeight` controls
the authoritative vertical contact interval. These properties are optional on
the token and every placed entity, so levels that omit them retain their existing
flat-course defaults. The token is selectable in the inspector even though its
live position remains engine-owned.

Terrain surfaces are a separate selectable object category because their
top-down `height` is a footprint dimension rather than a vertical extrusion.
Each surface owns north-west, north-east, south-east, and south-west absolute
elevations. Equal corners form a platform or bridge; unequal corners form the
two deterministic slope triangles consumed identically by the engine and
Three.js. The editor exposes a set-all platform height plus individual corner
controls and surface friction.

V3 also exposes the complete built-in 3D model catalog in the selected-object
inspector. Any renderable entity may store an optional schema-validated
`model3dId`; the catalog provides grouped choices and previews from its generated
manifest. Model selection affects presentation only. JSON footprint geometry,
vertical collision, and terrain surfaces remain authoritative, and failed model
loads retain procedural fallback geometry.

V3 course-piece templates are a schema-validated authoring convenience, not a
new runtime entity type. A placement expands immediately into the existing
terrain-surface, wall, ramp, or static-obstacle contracts and stores the chosen
`model3dId` on those entities. Optional `model3dFit: "footprint"` fits the GLB
to the authored top-down width and height plus `visualHeight`; it never derives
collision from model bounds. The one-click Kenney demonstration workflow uses
the same clone, add-level, validate, and save APIs as manual authoring.

The map also owns a direct arena-boundary tool. Authors can convert between the
schema's rectangular, elliptical, and polygonal variants. Polygon vertices use
absolute 1600 × 900 coordinates, snap to the 10-unit grid, and expose numbered
drag handles plus exact coordinate and add/remove controls. Concave simple
polygons are supported. Semantic validation rejects out-of-world vertices,
degenerate area, and intersection or contact between non-adjacent edges before
generation. The Pixi mask and engine containment continue to consume the same
JSON points.

Authoring-only dashed overlays visualize movement contracts that static entity
bounds cannot communicate: sweeper axes, tracking zones, orbit ellipses, pulse
maximum bounds, and spinner envelopes. An inline behavior guide describes
static, moving, tracking, phase, orbit, pulse, switch, and rotating obstacles
using the engine's actual deterministic behavior. These overlays never enter
runtime configuration or collision decisions.

Theme-wide and per-entity media selection share one PublicMedia browser
component. Folder traversal, breadcrumbs, search, pagination, image/audio
preview, provenance, and license presentation therefore cannot drift between
the two authoring paths. Only the final materialization callback differs:
registered theme media replaces a base ID, while object media creates a
server-issued per-entity override ID.

Authenticated authors may also stream personal assets into an owner-only
`data/user-media/<user-id>` library. Multipart bodies are capped while bytes
arrive and land in a temporary quarantine. Extension, declared MIME type, and
file signature must agree before decoding. Images are limited to 4096 pixels on
either axis and 16,777,216 total pixels; audio is limited to five minutes.
Accepted raster images normalize to PNG, compatible SVG remains SVG, and audio
normalizes to a stereo 44.1 kHz 16-bit WAV master. Failed validation or
conversion removes every quarantine artifact. Stored metadata records original
name, MIME type and format, normalized format, byte size, upload time, account
credit, and user-provided provenance; a provenance snapshot is retained in
theme metadata when an asset is applied.

One serialized quota guard covers uploaded normalized sources and every custom
file under all themes owned by the account, including WAV masters and WebM/MP3
delivery audio. The default ceiling is 500 MiB and deployments may override it
with `PATH_PROTOCOL_ACCOUNT_MEDIA_QUOTA_BYTES`. Both upload commits and theme
materialization compute their byte delta under this guard, so concurrent or
direct API writes cannot bypass the limit. Personal listing, preview, deletion,
and application require the authenticated owner. Deleting a source frees its
quota while existing theme copies remain self-contained.

The full-level JSON editor links to a standalone semantic HTML designer
reference. A deterministic build script renders the maintained Markdown source
into the deployed page, including responsive navigation, tables, code blocks,
heading anchors, and print styles. Development and production prebuilds
regenerate it; documentation validation rejects a stale generated page.

Player progress, scores, coins, and inventory are namespaced by theme ID.
Level records use immutable internal IDs so reordering cannot attach progress
to another course.

## 18. Proposed source layout

```text
src/
├── app/
│   ├── App.jsx
│   └── screens/
├── config/
│   ├── gameConfig.json
│   ├── powerup.json
│   ├── levels/
│   ├── schemas/
│   ├── loadConfig.js
│   └── validateConfig.js
├── game/
│   ├── engine/
│   │   ├── GameEngine.js
│   │   ├── GameStateMachine.js
│   │   ├── FixedStepLoop.js
│   │   ├── GameEvents.js
│   │   └── createLevelSession.js
│   ├── entities/
│   │   ├── createToken.js
│   │   ├── createObstacle.js
│   │   ├── createTrackingObstacle.js
│   │   ├── createTarget.js
│   │   └── createCoin.js
│   ├── geometry/
│   ├── generation/
│   ├── scoring/
│   ├── input/
│   │   ├── InputController.js
│   │   ├── PointerInput.js
│   │   └── KeyboardInput.js
│   ├── media/
│   │   ├── loadMediaManifest.js
│   │   ├── resolveThemeMedia.js
│   │   └── validateMedia.js
│   ├── audio/
│   │   ├── AudioManager.js
│   │   ├── loadAudioManifest.js
│   │   └── audioEvents.js
│   └── pixi/
│       ├── PixiGameCanvas.jsx
│       ├── createPixiApplication.js
│       ├── PixiScene.js
│       ├── PixiEntityFactory.js
│       ├── PixiTrailRenderer.js
│       ├── PixiDebugRenderer.js
│       └── Viewport.js
├── persistence/
└── styles/

scripts/
├── build-media-manifests.mjs
├── convert-audio.mjs
└── validate-media.mjs
```

Module names may change during implementation, but the boundaries must remain:

- The engine contains no React, Pixi, Howler, or DOM imports.
- The Pixi adapter contains no scoring or persistence rules.
- The audio adapter responds to logical events.
- React does not update frame-by-frame entity state.
- Configuration validation occurs before a level session is created.

## 19. Scoring

The agreed scoring model remains:

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

bonusFailurePenalty =
  applicableLevelScore
  × bonusFailurePenaltyRate

finalScore =
  round(clamp(
    performanceScore - collisionPenalty - bonusFailurePenalty,
    0,
    attainableMaximum
  ))
```

Direct distance is the sum of straight-line segments from the start through each
ordered target reached. Bonus targets add to the attainable maximum. Score never
exceeds the attainable maximum.

The saved per-level score changes only when the new score is higher. Cumulative
score is recalculated from per-level best scores.

## 20. Coins and consumable powers

Coins may be awarded for:

- First completion of a level.
- First completion of configured bonuses.
- Touching one-time course coins.

Course coins are collectible once per player and cannot be farmed by replaying a
level.

Powers are purchased with coins, may require cumulative score gates, accumulate
as inventory, and are consumed immediately when activated. Number keys start at
`1`.

Power definitions remain in `powerup.json`. Duration, price, unlock threshold,
effect parameters, media ID, and logical sound ID are configuration values.

## 21. Persistence

One versioned local-storage record contains:

- Per-level best scores.
- Unlocked levels.
- Cumulative score.
- Coin balance.
- Claimed course coins.
- Claimed completion and bonus rewards.
- Power inventory.
- Audio preferences.
- Reduced-motion preference.
- Micro Protocol best scores, best times, attempts, and one-time reward claims.

Malformed or obsolete records are validated and migrated safely. An in-progress
attempt and raw path samples are never persisted.

### 21.1 Micro Protocols

Micro Protocols are optional short challenges offered from the completion
screen. They reuse the normal validated level, engine, Pixi, input, and audio
pipeline and therefore never mount multiple live gameplay canvases.

- Micro scores do not contribute to campaign cumulative score or unlocks.
- First clears may grant a small configured one-time coin reward.
- Failure or exit returns to the parent campaign result.
- Power charges and course-coin progress are not consumed.
- Their compact layouts teach phase, orbit, pulse, switch, and force-field
  behaviors before those behaviors are combined in later campaign levels.

## 22. Development diagnostics

Development mode may display:

- Seed and generator version.
- Fixed-step rate and rendered FPS.
- Token collision geometry.
- Obstacle collision geometry.
- Moving envelopes.
- Tracking zones and velocity vectors.
- Validated route.
- Media resolution source: theme or default.
- Theme fallback warnings.
- Live score factors and penalties.

The local Vite development server enables isolated playtest mode by default.
The home-screen Dev mode toggle updates the current URL override and allows
testers to switch immediately between unlocked diagnostics and normal
progression. Production builds default to normal progression unless explicitly
opened with `?dev=1` or enabled from the home screen.

Theme fallback warnings are never shown to players in production.

## 23. Build and Docker

The production pipeline is:

```text
validate JSON
→ prepare audio
→ generate media manifests
→ validate default completeness
→ run tests
→ Vite production build
→ Node/Express runtime image
```

The Docker build stage includes Node, npm, and FFmpeg. The runtime stage contains
the built site, Express API, configuration contracts, the read-only PublicMedia
catalog, and the repository-local FFmpeg binary used for theme imports.

Production builds accept a normalized `VITE_BASE_PATH` so every Vite asset,
media manifest, SVG, and audio URL can be served from a reverse-proxy subpath.
Express serves the static build and same-origin API. Root deployment remains
the default, with the configured base path used for reverse-proxy deployment.

Generated delivery media may be committed or produced during the build according
to repository policy established during implementation. Existing converted
files are never regenerated during normal builds.

## 24. Testing strategy

### 24.1 Configuration and media

- Validate all 100 levels against the level schema.
- Verify required `mediaId` attributes.
- Verify the complete default media registry.
- Verify individual theme overrides and fallback.
- Verify invalid theme override fallback.
- Verify invalid default media failure.
- Verify deterministic generated manifests.
- Verify media-version cache aliases.
- Verify audio conversion skip and force behavior.

### 24.2 Engine

- Fixed-step accumulation and frame-delta clamping.
- State-machine transitions.
- Pointer destination smoothing.
- Keyboard activation and steering.
- Collision latching and last-safe restoration.
- Third-collision restart.
- Target edge contact.
- Ordered bonus flow.
- Moving and tracking hazard determinism.
- Shield expiration recovery.
- Coin collection and non-farmability.
- Power inventory consumption.
- Score calculation and caps.

### 24.3 Renderer

- WebGL-only initialization.
- 1600 × 900 viewport transforms.
- Undistorted object sizing.
- Vector SVG context reuse.
- Stable scene-layer ordering.
- Trail point bounds.
- Renderer disposal and level replacement.

### 24.4 Audio

- Start Game unlock.
- WebM-first source order.
- MP3 fallback.
- Per-sound cooldown.
- Separate ambience and effect channels.
- Default/theme file fallback.
- Default/theme settings replacement.
- Continuous ambience loop.
- Persisted mute and volume settings.

### 24.5 Browser journeys

- Startup progress and Start Game.
- Mouse attempt.
- Space/arrow-key attempt.
- Manual restart.
- Collision and third-collision reset.
- Main target and bonus popup.
- Pursue from target checkpoint.
- Bank score.
- Buy and activate a power.
- Reload saved progress.
- Development-only diagnostics.

## 25. Performance requirements

- Target 60 rendered frames per second on a representative current desktop.
- Run deterministic simulation at 60 updates per second.
- Do no simulation work directly inside raw pointer handlers.
- Avoid React state updates in the real-time loop.
- Parse each resolved vector SVG once and reuse its `GraphicsContext`.
- Precompute static collision geometry.
- Reuse Pixi display objects.
- Bound trail and ghost-trail samples.
- Rate-limit collision sounds and effects.
- Add spatial indexes, workers, batching, or audio sprites only after profiling
  demonstrates a need.

## 26. Accessibility and reduced motion

- React menus and dialogs remain keyboard accessible.
- Focus remains visible.
- Space and arrow-key play is supported.
- Sound is never the sole indicator of a collision, bonus, or completion.
- Reduced motion disables or softens nonessential pulsing, screen flashes, and
  animated effects without changing game rules.
- Volume and mute controls remain available.
- The Pixi canvas has an accessible name and surrounding instructions.

## 27. Initial implementation milestones

### Milestone A — Contracts and media foundation

- Update documentation and agent instructions for V2.
- Define complete media ID and sound ID registries.
- Add level, media, audio, game, power, and theme schemas.
- Add required media IDs to all 100 levels.
- Convert current generated visuals into default external SVG assets.
- Convert current synthesized sound concepts into default WAV assets.
- Implement audio conversion scripts.
- Implement generated media manifests.
- Implement default/theme resolution and validation tests.

### Milestone B — Engine

- Create framework-neutral state machine.
- Create fixed-step loop.
- Create input state and movement integration.
- Port and test geometry, collision, scoring, generation, bonus, tracking, coin,
  and power rules.

### Milestone C — Pixi WebGL

- Mount one imperative WebGL canvas.
- Implement viewport and world layers.
- Load vector SVG contexts.
- Create entity display objects.
- Render trails, hazards, targets, coins, powers, and debug data.
- Connect input and engine events.

### Milestone D — React and Howler

- Connect startup progress and Start Game.
- Connect HUD snapshots and dialogs.
- Implement theme-aware Howler manager.
- Add looping default ambience.
- Connect settings and persistence.

### Milestone E — Verification and release

- Complete unit, component, and browser tests.
- Profile pointer input and moving hazards.
- Validate all deterministic levels.
- Update Docker build.
- Audit licenses.
- Remove obsolete V1 renderer and synthesized audio code.

## 28. Definition of done

Architecture V2 is complete when:

- The game renders through PixiJS WebGL only.
- React owns no frame-by-frame gameplay state.
- The engine runs deterministic fixed 60 Hz updates.
- Pointer and keyboard controls follow the agreed activation model.
- All 100 level files pass their schema and media requirements.
- Default external SVG and audio libraries are complete.
- Theme overrides resolve one element at a time.
- Invalid theme overrides safely use defaults.
- Default failures stop the build or startup with a useful error.
- Vector SVG assets preload and reuse cached contexts.
- Howler plays WebM first with MP3 fallback.
- WAV conversion skips existing outputs and supports forced regeneration.
- Default ambience loops after Start Game.
- Score, progression, coins, powers, and saved data behave as specified.
- Unit, integration, browser, build, and Docker checks pass.
- V1 renderer/audio compatibility code is removed.
