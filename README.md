# Path Protocol

[![Status: Playable](https://img.shields.io/badge/status-playable-36d7ff)](https://app.inkandquill.io/protocol/)
[![Renderer: PixiJS WebGL](https://img.shields.io/badge/renderer-PixiJS%20WebGL-8b5cf6)](https://pixijs.com/)
[![Tests: Vitest + Playwright](https://img.shields.io/badge/tests-Vitest%20%2B%20Playwright-22c55e)](#testing)

Path Protocol is a 70-level desktop browser precision game. The player guides a
dimensioned token through deterministic obstacle courses, avoids stationary and
moving hazards, collects one-time coins, reaches ordered targets, and uses
consumable powers to improve a per-level and cumulative score.

Play the current release at
[app.inkandquill.io/protocol](https://app.inkandquill.io/protocol/).

## Quickstart

Requirements:

- Node.js 20.19 or newer.
- npm.
- A current desktop browser with WebGL.

Install and start the local development server:

```powershell
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

The local server enables **Dev mode** by default so all 70 levels are available
for playtesting. The home-screen toggle restores normal progression.

Create and preview a production build:

```powershell
npm run build
npm run preview
```

## Architecture Overview

Path Protocol V2 uses:

- React 19 for screens, menus, dialogs, HUD, settings, and the Power Lab.
- PixiJS with WebGL only for the real-time arena.
- One imperative Pixi canvas mounted by React.
- A framework-neutral fixed 60 Hz game engine.
- External SVG media loaded initially as reusable Pixi vector graphics.
- Howler.js for effects and looping ambience.
- WAV audio masters with WebM preferred and MP3 fallback delivery.
- JSON Schema-validated levels, media, themes, audio, and powers.
- Browser-local versioned progress storage.

```text
React screens and HUD
        │ player intent / throttled snapshots
        ▼
Framework-neutral fixed 60 Hz game engine
        │ stable session transforms / logical events
        ├──────────────► PixiJS WebGL renderer
        └──────────────► Howler.js audio manager
```

See:

- [`architecturev2.md`](architecturev2.md) for the V2 source of truth.
- [`sprintv2.md`](sprintv2.md) for live implementation status.
- [`AGENTS.md`](AGENTS.md) for repository contribution rules.

The older [`architecture.md`](architecture.md) and [`sprints.md`](sprints.md)
files describe the V1 implementation and remain historical references while V2
is built.

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
| Mouse or trackpad | Supported | Click the token to start, move the pointer to steer, and click again to stop. |
| Keyboard | Supported | `Space` toggles play, arrow keys steer, number keys activate powers, and `R` restarts. |
| Touch | Not supported | Desktop precision gameplay is the current product scope. |
| Gamepad | Not supported | No gamepad mapping has been approved or implemented. |

The token accelerates toward input rather than snapping to it. The complete
token geometry participates in obstacle and arena collision, and the actual
token-center trail remains visible.

Dynamic obstacles add four deterministic decisions beyond static placement:

- Phase gates alternate between solid, warning, and open states.
- Orbiters travel around configured elliptical paths.
- Pulse blocks grow and contract using authoritative collision dimensions.
- Contact switches open barriers once, temporarily, or as toggles.

After completing a campaign chamber, the results screen offers optional Micro
Protocols. These short challenges teach one dynamic behavior, keep separate
records, grant only one-time rewards, and never affect campaign score or
unlocks.

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

The existing repository provides a multi-stage static-site Docker deployment:

```powershell
docker compose up --build -d
```

Open:

```text
http://localhost:8080
```

The build stage installs FFmpeg, validates and prepares all media, and creates
the Vite bundle. The final stage copies only static output into Nginx; Node,
npm, FFmpeg, source WAV masters outside `dist`, and build tooling are absent.

Inspect the container:

```powershell
docker compose build
docker compose up -d
docker compose ps
curl.exe -I http://localhost:8080/
curl.exe http://localhost:8080/healthz
docker compose exec path-protocol sh -c "command -v node || true; command -v ffmpeg || true"
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
curl -f http://127.0.0.1:8080/healthz
curl -f http://127.0.0.1:8080/protocol/media/manifests/future-lab.json
```

Configure the external reverse proxy to forward `/protocol/` to
`http://127.0.0.1:8080`. The runtime Nginx image accepts the prefixed path
whether the proxy preserves or strips the prefix. Rebuilding is required after
changing `VITE_BASE_PATH` because Vite writes the prefix into the production
bundle.

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
architecturev2.md       V2 product and technical architecture
sprintv2.md             live V2 implementation tracker
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
- Rendering runs independently through `requestAnimationFrame` and PixiJS.
- Resolved SVG sources are parsed once and reused as cached `GraphicsContext`
  objects.
- Static collision geometry is precomputed and Pixi display objects are reused.
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
and [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) for release evidence.
