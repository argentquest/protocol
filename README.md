# Path Protocol

Path Protocol is a desktop browser precision game built with React, Vite, JavaScript, and SVG.

## Requirements

- Node.js 20.19 or newer.
- npm.
- A desktop mouse or trackpad.
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

The browser suite verifies navigation, successful Level 1 completion, and continuous-collision handling.

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
- `src/config/levels/` — the ten level definitions.
- `src/config/themeConfig.json` — visual and audio theme configuration.
- `Dockerfile` — production image definition.
- `docker-compose.yml` — local container deployment.
- `docker/nginx.conf` — static server and security configuration.
