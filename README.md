# Path Protocol

Path Protocol is a 30-level desktop browser precision game built with React, Vite, JavaScript, and SVG.

The campaign includes deterministic generated courses, varied token geometry, moving and player-tracking hazards, ordered bonus relays, one-time coin collectibles, and five consumable keyboard power-ups.

Use the prominent **Buy power-ups** action on the home or level-selection screen to open the Power
Lab. Purchases use collected coins and may require a configured cumulative-score unlock.

## Requirements

- Node.js 20.19 or newer.
- npm.
- A desktop mouse, trackpad, or keyboard.
- Docker Desktop only if running the containerized build.

## Run locally for development

Install dependencies:

```powershell
npm install
```

Start the Vite development server:

```powershell
npm run dev
```

Open the URL printed by Vite, normally:

```text
http://localhost:5173
```

Vite automatically reloads the browser when source files change.

During a level, use the visible **Restart** control or press `R` to reset the current attempt without changing the generated course.

## Developer playtest mode

Add `?dev=1` to any local or deployed game URL:

```text
http://localhost:5173/?dev=1
http://localhost:8080/?dev=1
```

Playtest mode unlocks all 30 levels, adds previous/next level controls, gives unlimited power-up charges, and displays the deterministic seed, validated route, collision geometry, moving/tracking zones, live scoring factors, and frame rate. The **Overlay** button hides or restores the SVG diagnostics.

Completed developer runs are stored separately in browser storage under `path-protocol.playtest-runs`. They do not unlock levels or replace the player's normal best scores. Remove `?dev=1` to return to the regular game.

## Run automated checks

Run the unit, geometry, generation, persistence, and component tests:

```powershell
npm run test
```

Run the linter:

```powershell
npm run lint
```

Create the production build:

```powershell
npm run build
```

Preview the production build:

```powershell
npm run preview
```

The preview is normally available at:

```text
http://localhost:4173
```

## Run browser tests

Install the Playwright Chromium test browser once:

```powershell
npx playwright install chromium
```

Run the end-to-end suite:

```powershell
npm run test:e2e
```

The browser suite verifies navigation, successful Level 1 completion, continuous-collision handling, manual restart, and developer playtest access.

## Run with Docker Compose

Build and start the production container:

```powershell
docker compose up --build -d
```

Open:

```text
http://localhost:8080
```

Check container status and health:

```powershell
docker compose ps
```

Follow server logs:

```powershell
docker compose logs -f
```

Stop and remove the container:

```powershell
docker compose down
```

The image remains locally available as `path-protocol:local`.

## Run directly with Docker

Build the image:

```powershell
docker build -t path-protocol:local .
```

Run it:

```powershell
docker run --rm --name path-protocol -p 8080:80 path-protocol:local
```

Open `http://localhost:8080`. Press `Ctrl+C` to stop the foreground container.

## Container behavior

- Node and Vite are used only in the build stage.
- Nginx serves the final static game from a small runtime image.
- Client-side routes fall back to `index.html`.
- Hashed assets receive long-lived immutable caching.
- HTML is not cached, allowing safe updates.
- The health endpoint is `http://localhost:8080/healthz`.
- No backend, database, volume, environment variable, or external service is required.

## Important project files

- `architecture.md` — product and system architecture.
- `sprints.md` — development backlog.
- `AGENTS.md` — coding-agent instructions.
- `src/config/levels/` — the 30 deterministic level definitions.
- `src/config/powerup.json` — power keys, costs, unlock scores, durations, effects, and sounds.
- `src/config/gameConfig.json` — global input tuning, including pointer response speed.
- `src/config/themeConfig.json` — visual and audio theme configuration.
- `src/game/GameView.jsx` — gameplay state-machine and animation orchestrator.
- `src/game/components/` — header, HUD, SVG arena, and bonus-dialog presentation.
- `src/game/hooks/` and `src/game/runtime/` — input handling and pure runtime helpers.
- `Dockerfile` — production image definition.
- `docker-compose.yml` — local container deployment.
- `docker/nginx.conf` — static server and security configuration.
