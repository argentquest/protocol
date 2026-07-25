# Path Protocol

Path Protocol is a 70-level desktop browser precision game. The player guides a
dimensioned token through deterministic obstacle courses, avoids stationary and
moving hazards, collects one-time coins, reaches ordered targets, and uses
consumable powers to improve a per-level and cumulative score.

## V2 rearchitecture

Active V2 development takes place on:

```text
feature/pixijs-rearchitecture
```

V2 is treated as a new codebase inside this repository. Its architecture uses:

- React 19 for screens, menus, dialogs, HUD, settings, and the Power Lab.
- PixiJS with WebGL only for the real-time arena.
- One imperative Pixi canvas mounted by React.
- A framework-neutral fixed 60 Hz game engine.
- External SVG media loaded initially as reusable Pixi vector graphics.
- Howler.js for effects and looping ambience.
- WAV audio masters with WebM preferred and MP3 fallback delivery.
- JSON Schema-validated levels, media, themes, audio, and powers.
- Browser-local versioned progress storage.

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

## Current development commands

Install dependencies:

```powershell
npm install
```

Start Vite:

```powershell
npm run dev
```

Open the URL printed by Vite, normally:

```text
http://localhost:5173
```

The local Vite server starts with **Dev mode** enabled so all 70 levels are
available for playtesting. Use the **Dev mode** button on the home screen to
switch back to normal progression. `?dev=1` and `?dev=0` remain available as
explicit URL overrides.

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

## Repository map

```text
architecturev2.md       V2 product and technical architecture
sprintv2.md             live V2 implementation tracker
AGENTS.md               repository instructions
src/config/             levels, schemas, powers, and game configuration
src/game/               engine, geometry, generation, audio, and rendering
public/media/            complete default media, theme overrides, and manifests
scripts/                build, validation, media, and test helpers
tests/e2e/              Playwright browser journeys
```

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
