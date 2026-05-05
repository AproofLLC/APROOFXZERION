# Deployment and operations (production-oriented)

This document is **not** the local interactive workflow. For day-to-day manual testing, use **`npm run dev:stack`** from the repo root. For **CI**, see `.github/workflows/ci.yml`. For **verification**, use **`npm run verify`** from the repo root.

## Topology

- **Frontend:** static SPA (`frontend` build output). In dev, Vite serves it and proxies API routes to the backend.
- **Backend:** JSON API only (`APROOF`); default **PGlite** on disk or **Postgres** via env (`APROOF/.env.example`).
- **Production:** Prefer one **public hostname** for both HTML and API so **session cookies** stay **same-site** with the app. If the UI and API use different origins, configure **CORS** and cookie settings explicitly (`APROOF` CORS + `Secure` cookies for HTTPS).

## Reverse proxy / SPA routing

- **HTML** routes (`/`, `/app/proofs`, …) must return **`index.html`** (SPA fallback).
- **API** paths (`/auth`, `/subjects`, `/events`, `/proofs`, `/health`, `/sandbox`, …) must forward to the API process **without** rewriting JSON bodies.
- Do **not** let `/proofs/:id` (API) collide with a SPA route at the same path; the product app uses **`/app/proofs`** for the dashboard.

See also: `APROOF/docs/INTEGRATION.md`.

## Optional: Docker

- **`docker-compose.yml`** (repo root) — example **web** (nginx + static SPA) + **api** (Node). Nginx proxies the same path prefixes as `frontend/vite.config.ts` so the browser can keep **relative** API URLs (`VITE_API_BASE_URL` unset).
- **`APROOF/Dockerfile`** — builds `dist/` and runs `node dist/main.js`.
- **`frontend/Dockerfile`** — builds `dist/` and serves it with **`frontend/nginx.default.conf`**.

**PGlite:** persist `APROOF/data` (or your `PGLITE_DATA_DIR`) with a volume if you use file-backed PGlite in a container. **Postgres:** set `DATABASE_URL` and run migrations per `APROOF` docs.

## Health and uptime

- **`GET /health`** — JSON `{ ok: true }` when the API is live; use for load balancer / synthetic checks.
- **Logs:** structured logs via **pino** (see `APROOF` server config). Point log shipping at stdout/stderr in your platform.
- **Error tracking:** no in-repo vendor SDK; add a small client/server hook later if you adopt Sentry/Datadog/etc.

## Environment variables (short)

| Area | Examples |
|------|----------|
| API | `PORT`, `APROOF_DB_MODE`, `DATABASE_URL`, `PGLITE_DATA_DIR` |
| Frontend build | `VITE_API_BASE_URL` — only when the API is on another origin (no Vite proxy); must match CORS/cookie plan |

## Rollback

- Deploy previous **container image** or **static bundle** artifact; run **DB migrations** forward-only (keep backups before migrations). No special rollback logic lives in this repo.

## Remaining ops maturity (defer)

- Managed TLS, secrets store, horizontal scaling, and vendor-specific IaC are **out of scope** for this repo.
