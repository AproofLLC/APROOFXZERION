# Frontend / backend integration

## Ports and roles

| Process | Port | Role |
|--------|------|------|
| APROOF API (`npm run dev` in `APROOF/`) | **3000** (default; override with `PORT` / `APROOF_PORT`) | JSON API only — does **not** serve the React SPA. |
| `npm run dev:live` (live PGlite harness) | **3101** | Same API as above; fresh `data/live-test-run-fresh` + `npm run test:live`. |
| Vite dev (`npm run dev` in `frontend/`) | **5173** | React app + dev proxy to the API (`VITE_API_PROXY_TARGET` or `APROOF_PORT` / default **3000** — not shell `PORT`). |
| `vite preview` | **4173** | Production build preview + same API proxy. |

Treat the backend as **API-only** in development. Do not expect `http://localhost:3000` to render the product UI.

## Proof dashboard URL

The product shell lives at **`/app/proofs`** on the **frontend** origin (e.g. `http://localhost:5173/app/proofs`).

- Open the dashboard from the **Vite** URL, not from port 3000.
- Legacy path **`/proofs`** in the SPA redirects to **`/app/proofs`** so the browser path does not collide with the API prefix `GET /proofs/:id`.

## Production / reverse proxy

If one hostname serves both static assets and the API, configure the proxy so that:

- **HTML navigations** to app routes (e.g. `/app/proofs`) return `index.html`.
- **API** paths (`/auth`, `/subjects`, `/proofs/<uuid>`, `/settings`, etc.) forward to the API process.

Do not merge SPA and API on the same path pattern without explicit HTML-vs-JSON routing.

## Environment

- Frontend optional: `VITE_API_BASE_URL` — absolute API base when not using Vite proxy; `VITE_API_PROXY_TARGET` or `APROOF_PORT` when using the Vite proxy to a non-default API port.
- Backend: see `.env.example` for `APROOF_DB_MODE`, `DATABASE_URL`, `PORT`, etc.

## Corrupt or stale local DB (PGlite)

In this repo, **normal dev uses PGlite on disk**, not Docker Postgres, unless you change env to TCP Postgres.

Postgres error **`58P01`** with messages like **`could not open file "base/5/6104": No such file or directory`** means the **local PGlite file store** is corrupted, partially deleted, or out of sync — not an API bug.

**Recovery (from `APROOF/`):** stop `npm run dev` → `npm run dev:db:reset` → `npm run dev:verify:routes` (with API stopped) → `npm run dev`. Prefer a **non-synced** folder for `PGLITE_DATA_DIR` / `data/pglite`. Full detail: [DEV-DB-RESET.md](./DEV-DB-RESET.md).

## Deprecated

The folder `_fe_api_hooks_backup/` at the repo root is **not** maintained. Use `frontend/src` hooks and `frontend/src/api` only.
