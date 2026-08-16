# Path Protocol V3 Release Checklist

## Contracts and campaign

- [x] All JSON documents pass their V3-compatible schemas.
- [x] All 100 level IDs, versions, and fixed-seed fingerprints are locked.
- [x] Initial placements, moving envelopes, tracking zones, and ordered routes
  pass full-token validation.
- [x] Score maxima increase across the campaign and movement settings are
  consistent.

## Media and licenses

- [x] All default SVG media assets validate.
- [x] All 15 WAV masters, WebM files, and MP3 fallbacks validate.
- [x] The generated 126-model Kenney GLB catalog and previews validate.
- [x] Theme manifests resolve one element at a time with mandatory defaults.
- [x] Manifest URLs include `mediaVersion` cache aliases.
- [x] Dependency and project-authored media licenses are recorded in
  `THIRD_PARTY_LICENSES.md`.

## Application

- [x] Three.js runs in WebGL mode and owns one imperative canvas.
- [x] Howler unlocks after explicit interaction and retries WebM, MP3, then
  HTML5 playback.
- [x] Progress schema migration preserves scores, unlocks, coins, claims,
  powers, and settings.
- [x] Keyboard input, accessible control names, and reduced motion are covered.
- [x] The legacy SVG and Pixi gameplay renderers, oscillator audio, and runtime
  state are gone.

## Verification

- [x] Unit and integration suite passes.
- [x] ESLint passes without warnings.
- [x] Vite production build and media preparation pass.
- [x] Production dependency audit reports zero known vulnerabilities.
- [x] Critical Chromium journeys pass.
- [x] Chrome and Edge compatibility smoke tests pass on Windows.
- [x] Chromium visual baselines pass at 1440×900; layout is also checked at
  1920×1080.
- [ ] Verify Firefox on a runner where Playwright Firefox launches correctly.
- [ ] Verify Safari and audio playback on current macOS hardware.
- [ ] Confirm 60 FPS on a hardware-accelerated representative desktop.

## Container and rollout

- [x] Build the Docker image from a clean cache.
- [x] Confirm `/healthz`, SPA fallback, media, and cache headers.
- [x] Confirm Node, npm, and FFmpeg are absent from the runtime image.
- [ ] Record the candidate commit and image digest.
- [ ] Preserve the previous deployable image as the rollback target.
- [x] Run one clean-browser start, level completion, reload, and settings test.

Previously verified image:
`sha256:58474e702ff5f25fb2f6ef2954f725c8d4b22ba38bffb549d418942c42863af2`.
Rebuild and record a new digest before release; this image predates the
stable-canvas and click-toggle input fixes.
