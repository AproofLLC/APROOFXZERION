# Release Packaging

Use the clean packaging command to produce a shareable bundle without secrets, build outputs, or local state.

## Commands

- `npm run release:preflight` — run preflight checks only (no bundle created)
- `npm run release:bundle` — preflight + create clean bundle
- `npm run package:clean` — alias for `release:bundle`

Output folder:
- `tmp/release-bundle`

## What Is Excluded

- `.env` and `.env.*` (except `.env.example`)
- `node_modules/`
- `dist/`
- `coverage/`
- `data/`
- `tmp/` (except the generated bundle target itself)
- `*.log`
- `*.sqlite`
- `*.db`
- `.DS_Store`
- `Thumbs.db`

## Why Excluded

- Secrets (`.env*`) must never be shared in release archives.
- Build artifacts and dependencies (`dist`, `node_modules`) are reproducible and create noisy/large bundles.
- Local runtime state and DB files (`data`, `*.db`, `*.sqlite`) are environment-specific and can leak sensitive data.
- Temp and OS artifacts are irrelevant to source distribution.

## Preflight Checks

Before bundling, the script scans the repo root and **fails** if any of these are present:

- `.env`, `.env.*` (except `.env.example`)
- `node_modules/`
- `dist/`
- `data/`
- `tmp/`
- `coverage/`

This ensures no local secrets, build artifacts, or runtime state leak into the review artifact.

## Included Project Surface

The bundle includes the intended development/project files:
- `src/`
- `e2e/`
- `docs/`
- `drizzle/`
- `scripts/`
- root configs (`package.json`, `package-lock.json`, `tsconfig*.json`, `vitest.config.ts`, `drizzle.config.ts`, `.gitignore`, `.env.example`, `docker-compose.yml`)
