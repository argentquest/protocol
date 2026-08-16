# Contributing to Path Protocol

Thank you for helping improve Path Protocol. The project welcomes bug reports,
documentation fixes, accessibility improvements, new tests, and focused feature
proposals.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Discuss architecture, gameplay-contract, dependency, or asset-license changes
  in an issue before implementing them.
- Read `AGENTS.md`, `architecturev3.md`, and the current sprint in
  `sprintv2.md` before changing gameplay or rendering behavior.
- Never submit secrets, personal data, generated build output, account
  databases, or media without a documented redistribution license.

## Local setup

Requirements are Node.js 20.19 or newer, npm, and a current desktop browser with
WebGL.

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env` only when you need non-default local paths or
limits. `.env` files are intentionally ignored.

## Development rules

- Keep the fixed-step engine independent from React, Three.js, Howler, browser
  APIs, and persistence.
- Keep collision and gameplay geometry in validated JSON; visual model bounds
  are never authoritative.
- Use the shared seeded random service for gameplay.
- Add JSDoc to non-trivial functions and include physical units where relevant.
- Preserve accessibility, keyboard play, reduced motion, and the single-canvas
  renderer contract.
- Record dependency and media licenses in `THIRD_PARTY_LICENSES.md`.

## Required checks

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

Gameplay or integration changes should include a relevant Playwright journey.
Update `sprintv2.md` when completing a tracked task.

## Pull requests

Keep pull requests focused and explain the user-visible outcome, contract
changes, test evidence, and license impact. By contributing, you agree that your
contribution is licensed under the repository's MIT License.
