# Path Protocol

[![Status: Playable](https://img.shields.io/badge/status-playable-36d7ff)](https://app.inkandquill.io/protocol/)
[![Renderer: Three.js WebGL](https://img.shields.io/badge/renderer-Three.js%20WebGL-8b5cf6)](https://threejs.org/)
[![CI](https://github.com/argentquest/protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/argentquest/protocol/actions/workflows/ci.yml)
[![CodeQL](https://github.com/argentquest/protocol/actions/workflows/codeql.yml/badge.svg)](https://github.com/argentquest/protocol/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e)](LICENSE)

Path Protocol is a 100-level desktop browser precision game. The player guides a
dimensioned token through deterministic obstacle courses, avoids stationary and
moving hazards, collects one-time coins, reaches ordered targets, and uses
consumable powers to improve a per-level and cumulative score.
Each released level uses a fixed seed to spread its start, target, pickups, and
hazards across the full 1600 × 900 arena. Restarts preserve that layout, keeping
scores comparable without repeating a small set of route lanes.

Play the current release at
[app.inkandquill.io/protocol](https://app.inkandquill.io/protocol/).
Hosting is provided as a complimentary service from ArgentQuest.

Developed by [Eric Silver](https://www.linkedin.com/in/eric-silver-tx/) of
ArgentQuest. Contact: [esilver@argentquest.com](mailto:esilver@argentquest.com).

Path Protocol is open source and welcomes focused contributions. Start with
[`CONTRIBUTING.md`](CONTRIBUTING.md), browse
[good first issues](https://github.com/argentquest/protocol/labels/good%20first%20issue),
or share an idea in [GitHub Discussions](https://github.com/argentquest/protocol/discussions).

## Quickstart

Requirements:

- Node.js 20.19 or newer.
- npm.
- A current desktop browser with WebGL.

Install and start the local development server:

```powershell
npm ci
npm run dev
```

This starts Vite plus the local Express theme server. Open the URL printed by
Vite, normally `http://localhost:5173`; `/api` is proxied to the server.

On Windows, double-click `start-game.cmd` for the same combined startup. The
launcher verifies Node, npm, installed dependencies, and ports 4173/5173 before
starting. Press Ctrl+C once in its terminal to stop both processes. The
individual processes can also be run with `npm run dev:frontend` and
`npm run dev:server` when debugging.

The local server enables **Dev mode** by default so all 100 levels are available
for playtesting. The home-screen toggle restores normal progression.
Protocols **99 — Kenney Test Hole 1** and **100 — Round Green** are the V3 model
showcases. Hole 1 demonstrates flat Guided/Ricochet play and modeled bank
obstacles. Round Green is a deliberately simple finishing hole with one straight
ramp and a large circular green whose precise target sits in the middle.
Completing a main hole requires the ball center to enter its configured target
footprint; merely touching the hole with the ball's outside edge is not enough.

Create and preview a production build:

```powershell
npm run build
npm run preview
```

`npm run preview` serves the production UI and Theme Workshop API through Node
on port 4173. Mutable themes default to `data/themes`, and SQLite accounts to
`data/path-protocol.sqlite`. Set `PATH_PROTOCOL_DATA_DIR` and
`PATH_PROTOCOL_DB_PATH` to select other persistent locations. Personal uploads
default to `data/user-media`; override that location with
`PATH_PROTOCOL_PERSONAL_MEDIA_ROOT`. Each account receives 500 MiB for all
uploaded sources and copied custom theme media. Set
`PATH_PROTOCOL_ACCOUNT_MEDIA_QUOTA_BYTES` to a positive byte count to change
that ceiling. Upload defaults are 25 MiB per image, 100 MiB per audio file,
4096 pixels per image axis, 16,777,216 total image pixels, and 300 seconds of
audio. Deployments can override these with
`PATH_PROTOCOL_MAX_UPLOAD_IMAGE_BYTES`, `PATH_PROTOCOL_MAX_UPLOAD_AUDIO_BYTES`,
`PATH_PROTOCOL_MAX_UPLOAD_IMAGE_DIMENSION`,
`PATH_PROTOCOL_MAX_UPLOAD_IMAGE_PIXELS`, and
`PATH_PROTOCOL_MAX_UPLOAD_AUDIO_SECONDS`.

Theme authors register with a username, email address, and password. Local
development accounts are active immediately without email confirmation. Public
themes remain playable without login; cloning and editing require an account.
Players can choose any built-in presentation theme from Settings.

The Theme Workshop media editor uses an element-first recursive file browser for
the licensed `PublicMedia` catalog. Choose the object or sound to replace, walk
every nested source folder without searching, and inspect a large image or audio
preview before applying the selected asset. Applying
an image or sound copies it into the editable theme package; runtime themes
never depend on the catalog source path. Imported audio is normalized to a WAV
master plus WebM and MP3 delivery files. Validate all built-in theme fallbacks
with `npm run media:validate-themes`.

The selected-object inspector can also apply artwork and event-sound overrides
to one level entity. This supports distinctions such as separate images and
collection sounds for 10-point and 50-point coins without changing their base
coin type. The server copies each choice into the owned theme and the level
stores only the generated override ID.

For V3 presentation, the same inspector exposes all 126 licensed Kenney
Minigolf Kit GLB models in a categorized catalog with image previews. An
optional `model3dId` selects a model for any renderable entity while JSON keeps
sole ownership of collision geometry, elevation, and terrain. Model loads are
cached and each entity falls back independently to procedural geometry.

The level editor also includes a **Kenney Course Builder** palette. Its
schema-validated fairway, green, ramp, and hazard templates place fitted GLB
presentation together with ordinary editable terrain, wall, ramp, and obstacle
JSON. Authors can reshape every generated entity after placement. From the
Theme Workshop dashboard, **Create demo theme and level** clones the default
campaign, appends a solvable showcase hole, saves it through the normal server
validation path, and opens it in the editor.

On the level grid, select a dimensioned object and drag its edge or corner
handles to resize its authoritative collision geometry in 10-unit increments.
Right-click an object (or press Shift+F10) for separate image, sound, and
object-only JSON actions. Square and circular objects preserve their aspect
ratio; rectangular objects can stretch independently on each axis.

The **Arena boundary** controls can convert a level between rounded rectangle,
ellipse, and irregular polygon boundaries. Polygon corners are numbered and
drag directly on the 10-unit grid; authors can add or remove corners and edit
exact coordinates. Concave outlines are supported, while crossed edges and
degenerate polygons fail validation. Dashed orange guides show axis sweeps,
tracker zones, orbit paths, maximum pulse bounds, and spinner envelopes. The
expandable obstacle guide explains the exact engine behavior of every hazard.

Object-level image and sound actions reuse the complete Theme media filesystem
browser: recursive folders, breadcrumbs, search, paging, large preview,
provenance, and license details behave identically in both workflows.
Signed-in authors can upload supported images (PNG, JPEG, compatible SVG) and
audio (WAV, OGG, MP3, AIF/AIFF) from the same browser. The server streams each
file through a size-limited quarantine, verifies its extension, MIME type, and
signature, enforces image and audio limits, normalizes it, and exposes it only
to its owner under **My uploads**. The quota meter includes both retained
uploads and media copied across all themes owned by the account. Deleting an
uploaded source reclaims its bytes without changing self-contained theme
copies.

First-time visitors choose from the official campaign and every enabled public
theme before entering the game. After the owner has registered normally, stop
the server and grant moderation access directly against its private SQLite
database:

```powershell
$env:PATH_PROTOCOL_DB_PATH = './data/path-protocol.sqlite'
npm run admin:grant -- --email esilver@argentquest.com
```

The explicit server-side grant prevents someone from becoming an administrator
merely by registering with a known public email address. Administrators can
review every theme, disable or re-enable community publication, and permanently
delete abusive themes. The default campaign remains read-only and cannot be
disabled or deleted. The default account-wide media limit is 500 MiB and can be
changed with `PATH_PROTOCOL_ACCOUNT_MEDIA_QUOTA_BYTES`.

Each level editor also provides a popup full-level JSON editor. It formats JSON,
reports parse errors, and validates drafts against the authoritative level JSON
Schema and generated-course gameplay checks before applying them locally.
Its designer reference opens as a formatted, responsive HTML guide with a
sticky table of contents, readable tables and code samples, section links, and
print styling. `npm run docs:build` regenerates that page from the maintained
Markdown source.

## Architecture Overview

Path Protocol V3 uses:

- React 19 for screens, menus, dialogs, HUD, settings, and the Power Lab.
- Three.js with WebGL for the perspective 3D arena.
- One imperative Three.js renderer canvas mounted by React.
- A framework-neutral fixed 60 Hz game engine.
- Optional engine-owned elevation, gravity, ramps, height-aware collision, and
  deterministic terrain surfaces with slopes, bridges, friction, and landing.
- A generated 126-model GLB catalog with per-entity selection, shared cached
  loading, and procedural geometry fallback.
- Howler.js for effects and looping ambience.
- WAV audio masters with WebM preferred and MP3 fallback delivery.
- JSON Schema-validated levels, media, themes, audio, and powers.
- Browser-local versioned progress storage.
- Express APIs, SQLite accounts/sessions, and filesystem-backed theme packages.
- The existing SVG/PNG theme catalog remains available to the Theme Workshop;
  gameplay uses the built-in V3 GLB catalog and procedural Three.js geometry.
  Owned theme GLB uploads remain future work.

```text
React screens and HUD
        │ player intent / throttled snapshots
        ▼
Framework-neutral fixed 60 Hz game engine
        │ stable session transforms / logical events
        ├──────────────► Three.js WebGL renderer
        └──────────────► Howler.js audio manager
```

See:

- [`architecturev3.md`](architecturev3.md) for the active V3 source of truth.
- [`architecturev2.md`](architecturev2.md) for the V2 source of truth.
- [`sprintv2.md`](sprintv2.md) for live implementation status.
- [`AGENTS.md`](AGENTS.md) for repository contribution rules.

The older [`architecture.md`](architecture.md) and [`sprints.md`](sprints.md)
files describe the V1 implementation. V2 is now the compatibility baseline for
the active V3 branch.

## Requirements

- Node.js 20.19 or newer.
- npm.
- A current desktop browser with WebGL.
- A mouse, trackpad, or keyboard.
- FFmpeg for manually inspecting or converting audio. The repository also pins
  `ffmpeg-static`, so normal npm builds do not depend on a machine-wide install.
- Docker Desktop only for containerized production testing.

## Testing

Run unit and component tests:

```powershell
npm run test
```

Run lint:

```powershell
npm run lint
```

Create the production build:

```powershell
npm run build
```

Run the browser suite:

```powershell
npm run test:e2e
```

Run the installed Chrome/Edge compatibility smoke tests:

```powershell
npm run test:browser-compat
```

Firefox can be selected with `--project=firefox` on a runner where Playwright
Firefox launches successfully. Safari must be verified on macOS; Playwright
WebKit on Windows does not provide Safari's production audio stack.

## Controls & Gameplay

Guide the complete token through each deterministic course, avoid boundaries
and hazards, and touch ordered targets. Speed and route efficiency improve the
score; collisions apply penalties and the third collision restarts the level.

| Input | Support | Controls |
| --- | --- | --- |
| Mouse or trackpad | Supported | Guided: click to toggle steering. Ricochet: press the stopped token, pull backward, and release to launch. |
| Keyboard | Supported | Guided: `Space` toggles play and arrows steer. Ricochet: `Space` starts/commits an arrow-key aim. `R` restarts. |
| Touch | Not supported | Desktop precision gameplay is the current product scope. |
| Gamepad | Not supported | No gamepad mapping has been approved or implemented. |

The arena's lower-right camera controls rotate left/right, raise/lower the
view, or restore the default angle. Camera movement changes presentation only;
pointer steering continues to raycast into the same deterministic world plane.

The persistent **Movement mode** toggle on the home screen controls how every
campaign level and Micro Protocol plays. **Guided** uses the original continuous
steering on the same layout. In **Ricochet**, press the stopped token, pull
opposite the desired direction, and release to launch. With the keyboard, press `Space`, hold
an arrow direction, and press `Space` again. Steering is locked while the token
is in flight; arena walls and obstacles ricochet the token, drag removes speed,
and the engine sets velocity exactly to zero before the next shot can be aimed.
Bumpers retain or add bounded speed, while arrestor surfaces stop immediately.
Completed Ricochet runs record shots used, each level's fewest shots, the sum of
campaign-best shots, and lifetime shots from completed runs.
Optional shot goals add par, perfect, and maximum-shot targets. The last
permitted shot always resolves completely before success or failure is decided.
Reset surfaces recover the token at its most recent fully stopped position.

The token accelerates toward input rather than snapping to it. The complete
token geometry participates in obstacle and arena collision, and the actual
token-center trail remains visible.

Dynamic obstacles add four deterministic decisions beyond static placement:

- Phase gates alternate between solid, warning, and open states.
- Orbiters travel around configured elliptical paths.
- Pulse blocks grow and contract using authoritative collision dimensions.
- Contact switches open barriers once, temporarily, or as toggles.

After completing a campaign chamber, the results screen offers optional Micro
Protocols. These short challenges teach one dynamic behavior in the selected
movement mode, keep separate records, grant only one-time rewards, and never
affect campaign score or unlocks.

## V2 configuration and media commands

The completed V2 foundation provides:

```powershell
npm run media:audio
npm run media:audio:force
npm run media:validate-svg
npm run media:validate-audio
npm run media:manifests
npm run media:prepare
npm run config:validate
```

Their intended behavior is:

- `media:audio` creates only missing WebM and MP3 files from WAV masters.
- `media:audio:force` intentionally regenerates both delivery formats.
- `media:validate-svg` verifies the complete default vector library.
- `media:validate-audio` verifies WAV masters, delivery files, and playback
  settings.
- `media:manifests` scans default and theme files and generates deterministic
  visual and audio manifests.
- `media:prepare` runs source preservation, conversion, validation, and manifest
  generation as one operation.
- `config:validate` validates levels, registries, media, themes, audio, and
  powers before gameplay starts.

Vite development and production builds run configuration and media preparation
automatically before starting. A normal conversion preserves existing delivery
files; use the explicit `:force` command only when regeneration is intended.

## Media inheritance

The default media library is complete and mandatory. A theme supplies only the
individual files it wants to replace:

```text
valid theme element
    ↓ otherwise
valid default element
    ↓ otherwise
fatal default-media error
```

This applies independently to SVG artwork, sound effects, and looping ambience.
Future Lab initially inherits all defaults and gains overrides one element at a
time.

Expected layout:

```text
public/media/
├── default/
│   ├── tokens/
│   ├── obstacles/
│   ├── targets/
│   ├── bonus/
│   ├── coins/
│   ├── powers/
│   ├── arenas/
│   └── audio/
└── themes/
    └── future-lab/
        └── optional overrides
```

## Sprint workflow

Development proceeds in the sequence defined by `sprintv2.md`.

For each sprint:

1. Mark active tasks `IN PROGRESS`.
2. Implement the sprint within the boundaries in `architecturev2.md`.
3. Add focused tests.
4. Run the full unit suite.
5. Run lint and production build when executable code changes.
6. Run relevant Playwright journeys for gameplay or integration work.
7. Mark tasks and the sprint `DONE` only after required checks pass.
8. Do not begin the next sprint while a required check is failing.

## Docker

The repository provides a multi-stage production deployment that builds the
Vite application and runs the optimized frontend plus the Theme Workshop API
through the production Node/Express server:

```powershell
docker compose up --build -d
```

Open:

```text
http://localhost:8080
```

The build stage installs FFmpeg, validates and prepares all media, and creates
the Vite bundle. The runtime installs production Node dependencies, serves
`dist`, and persists accounts, sessions, themes, and personal media beneath the
mounted `/app/data` volume. Build-only development tools are absent. The
`ffmpeg-static` runtime dependency supports Theme Workshop audio imports.

Inspect the container:

```powershell
docker compose build
docker compose up -d
docker compose ps
curl.exe -I http://localhost:8080/
curl.exe http://localhost:8080/api/health
docker compose exec path-protocol node --version
```

Stop it with:

```powershell
docker compose down
```

### Linux reverse-proxy subpath deployment

When the public URL includes a path prefix such as
`https://app.example.com/protocol/`, persist the Vite build prefix beside the
Compose file:

```bash
printf 'VITE_BASE_PATH=/protocol/\n' > .env
docker compose up --build -d
docker compose ps
curl -f http://127.0.0.1:8080/api/health
curl -f http://127.0.0.1:8080/media/manifests/future-lab.json
```

Configure the external reverse proxy to forward `/protocol/` to
`http://127.0.0.1:8080` **after stripping the `/protocol` prefix**. API requests
under `/protocol/api/` must be forwarded to `/api/` on the container. Rebuilding
is required after changing `VITE_BASE_PATH` because Vite writes the prefix into
the production bundle.

`Dockerfile.dev` starts Vite and the watch-mode API for remote development only.
It exposes source modules and hot-reload endpoints and must not be used for a
public or production deployment.

### Production analytics

The production build is configured for Google Analytics 4 measurement ID
`G-2ZWLL7P02J`. The identifier is public configuration, not a secret. Analytics
is disabled until a visitor explicitly accepts the in-app analytics notice;
declining does not load Google's script. To use a different property or disable
analytics for a build, set `VITE_GA_MEASUREMENT_ID` to another valid `G-...` ID
or an empty value before running `npm run build`.

The privacy notice is published at `/PRIVACY.html`. Deployments that enforce a
Content Security Policy must permit scripts from `www.googletagmanager.com` and
connections to `*.google-analytics.com`; a suitable policy is documented in
`docker/nginx.conf` for deployments that use an external Nginx proxy. The Node
container itself does not inject that header.

## Troubleshooting

- If startup reports a missing default asset, run `npm run media:prepare` and
  inspect the exact asset named by the error. Theme overrides may fall back;
  defaults may not.
- If startup cannot resolve the Future Lab manifest behind a path-based proxy,
  verify that `VITE_BASE_PATH` matches the public prefix including its trailing
  slash, rebuild the image, and request
  `<public-url>/media/manifests/future-lab.json` directly.
- If audio is silent, press **Start Game** once, confirm the two audio switches
  in **Controls**, and check browser autoplay permissions.
- If WebGL initialization fails, update the browser and graphics driver and
  confirm hardware acceleration is enabled.
- If a released seed fingerprint changes intentionally, review the generated
  course visually and update the locked fingerprint in the same change.
- If Docker cannot start, verify Docker Desktop is running before rebuilding.

## Directory Map

```text
architecturev3.md       current V3 product and renderer architecture
architecturev2.md       historical V2 product and technical architecture
sprintv2.md             live V3 implementation tracker
AGENTS.md               repository instructions
src/config/             levels, schemas, powers, and game configuration
src/config/micro-levels optional short-challenge level configurations
src/game/               engine, geometry, generation, audio, and rendering
public/media/            complete default media, theme overrides, and manifests
scripts/                build, validation, media, and test helpers
tests/e2e/              Playwright browser journeys
```

## Performance & Profiling

- The simulation advances at a fixed 60 Hz using a clamped accumulator.
- Rendering runs independently through `requestAnimationFrame` and Three.js.
- GLB model sources are cached once and cloned for individual scene entities.
- Static collision geometry is precomputed and Three.js scene objects are reused.
- Trail and ghost samples are bounded to prevent unbounded memory growth.
- The development HUD exposes rolling rendered FPS and collision diagnostics.
- The target is 60 rendered frames per second on a representative current
  desktop browser.

See [PERFORMANCE.md](PERFORMANCE.md) for profiling procedures, acceptance
thresholds, and captured evidence.

## Project rules

- Gameplay geometry comes from JSON, never visual asset bounds.
- All released level generation is deterministic.
- Raw input handlers do not run the simulation or update React per event.
- Default media failures are fatal.
- Invalid theme overrides fall back to defaults and warn only in development.
- New dependencies and external assets require recorded licenses.
- `sprintv2.md` must stay synchronized with completed work.

See [`PERFORMANCE.md`](PERFORMANCE.md), [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md),
[`NOTICE.md`](NOTICE.md), [`CHANGELOG.md`](CHANGELOG.md), and
[`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) for release evidence.

## Contributing

Bug reports, documentation fixes, accessibility improvements, focused features,
tests, themes, and level-authoring improvements are welcome. Read
[`CONTRIBUTING.md`](CONTRIBUTING.md) before starting, and discuss gameplay,
architecture, dependency, or asset-license changes in an issue first.

The project is currently maintained by Eric Silver. Pull requests require the
automated quality, browser, and security checks; the maintainer may use the
administrator bypass described in [`GOVERNANCE.md`](GOVERNANCE.md) when no
independent maintainer is available.

## License and attribution

Path Protocol source code and project-authored media are available under the
[MIT License](LICENSE). Developed by
[Eric Silver](https://www.linkedin.com/in/eric-silver-tx/) of ArgentQuest;
contact [esilver@argentquest.com](mailto:esilver@argentquest.com).

Bundled third-party media remains under its recorded upstream license. See
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) and the license or credit
files stored beside each asset collection.
