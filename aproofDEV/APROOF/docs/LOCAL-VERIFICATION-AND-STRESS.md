# Local verification and stress testing

Operational checklist for the **APROOF** backend (`APROOF/`). Commands and expectations only.

**Frontend proof dashboard:** from `frontend/`, run `npm run dev` and open **`http://localhost:5173/app/proofs`**. The API on port 3000 does not serve the SPA ([INTEGRATION.md](./INTEGRATION.md)).

## Commands reference

| Layer | Command | Directory |
|-------|---------|-----------|
| Backend dev | `npm run dev` | `APROOF/` |
| Backend live layout (port **3101**, see `dev:live`) | `npm run dev:live` | `APROOF/` |
| Backend typecheck | `npm run typecheck` | `APROOF/` |
| Backend build | `npm run build` | `APROOF/` |
| Unit + integration tests | `npm run test` | `APROOF/` |
| E2E (in-process server + PGlite memory) | `npm run test:e2e` | `APROOF/` |
| Package verification (typecheck + build + unit tests) | `npm run verify:package` | `APROOF/` |
| Full CI-style backend pass (adds e2e + `stress:inject`) | `npm run verify:all` | `APROOF/` |
| HTTP stress (needs **running** backend) | `npm run stress:api` | `APROOF/` |
| In-process burst (PGlite memory, no separate server) | `npm run stress:inject` | `APROOF/` |
| Live PowerShell harness (needs **`dev:live`**) | `npm run test:live` | `APROOF/` |

## Environment (minimal local)

**Backend (PGlite):**

| Variable | Purpose |
|----------|---------|
| `APROOF_DB_MODE=pglite` | Embedded DB (required if `DATABASE_URL` unset). |
| `APROOF_COOKIE_SECURE=0` | Session cookie on plain HTTP. |
| `PORT` or `APROOF_PORT` | Listen port (default **3000**; `dev:live` uses **3101**). |
| `PGLITE_DATA_DIR` | Data directory for on-disk PGlite. On **Windows**, if the repo lives under **OneDrive**, prefer a path under `%TEMP%` (e.g. `%TEMP%\aproof-pglite-dev`)—the default `APROOF/data/pglite` may fail WASM init. |
| `APROOF_PGLITE_OPEN_RETRIES` | Retries for transient PGlite init (default **4**). |
| `APROOF_LIVE_PGLITE_DATA_DIR` | Override PGlite dir for `dev:live` / `test:live` / `scripts/live-ps1`. If unset and the repo path contains `OneDrive`, scripts default to `%TEMP%\aproof-live-test-run-fresh`. |

**Node:** PGlite in this repo may reject **Node 24+** (`assertPgliteSupportedNode`). Use **Node 20 or 22** for local PGlite.

## Phase 1 — Boot backend

**cmd.exe:**

```bat
cd APROOF
set APROOF_DB_MODE=pglite
set APROOF_COOKIE_SECURE=0
npm run dev
```

**PowerShell** (recommended on Windows if the repo is under OneDrive—use a temp data dir):

```powershell
cd APROOF
$env:APROOF_DB_MODE = "pglite"
$env:APROOF_COOKIE_SECURE = "0"
$env:PGLITE_DATA_DIR = Join-Path $env:TEMP "aproof-pglite-dev"
npm run dev
```

Confirm log line shows listen port. Check:

```bash
curl -s http://127.0.0.1:3000/health
```

Expect JSON with `"status":"ok"` (or equivalent `ok` field per `/health` handler).

**Stress (optional, second terminal)** — with backend still running:

```bash
cd APROOF
npm run stress:api
```

Optional tuning:

```bash
set STRESS_BASE_URL=http://127.0.0.1:3000
set STRESS_ROUNDS=25
set STRESS_CONCURRENCY=15
npm run stress:api
```

## Phase 2 — Automated package verification

From `APROOF/` (no live HTTP server required):

```bash
npm run verify:all
```

Equivalent to: `typecheck` → `build` → `vitest run` (unit) → `vitest run e2e` → `stress:inject`.

For a quicker pass (skips e2e and inject stress):

```bash
npm run verify:package
```

`test:e2e` covers the control-plane surface (auth, subjects, overview, events, lineages, failures, baselines, settings, sandbox) against a **fresh in-memory** PGlite instance.

## Phase 3a — `stress:inject` (CI-friendly)

Runs in Vitest with **in-memory PGlite** and `Fastify.inject` (same pattern as other e2e tests). No background server.

```bash
cd APROOF
npm run stress:inject
```

Approximately **8 rounds × 12 concurrency × 8 routes = 768** parallel inject calls per run, plus contract checks on overview/baselines (seven angles, non-null `metadata`).

## Phase 3b — `test:live` (PowerShell, port 3101)

Requires **`npm run dev:live`** in another terminal (fresh migrate + seeds + API on **http://localhost:3101**). Then:

```bash
cd APROOF
npm run test:live
```

Runs `scripts/live-ps1/RUN-ALL-LIVE-TESTS.ps1` against `APROOF_URL`. On Windows, if the repo is under OneDrive, `scripts/live-pglite-env.ps1` defaults the live PGlite data dir to `%TEMP%\aproof-live-test-run-fresh` unless you set **`APROOF_LIVE_PGLITE_DATA_DIR`**.

## Phase 3c — `stress:api` behavior

The script (`scripts/stress-api-load.mjs`) performs real `fetch` calls:

- `/health`, `/auth/session` (401 without cookie)
- Sign-up → session cookie → `GET /auth/session`
- `POST /subjects`, invalid sign-in, invalid UUID paths (expect 400), unknown subject (404)
- Contract checks: overview `angles_summary.length === 7`, `metadata` object, baselines length 7, proofs list `items` array + `page`
- **Burst:** `ROUNDS × CONCURRENCY × 13` read requests (session, subjects, overview, proofs, events, failures, lineages, baselines, settings blocks), chunked for bounded parallelism
- Sign-out → session 401

Exit code **1** if any **5xx** is observed or an assertion fails. Prints status histogram and latency p50/p95.

## Reporting

After a run, record: commands, ports, env vars, `verify:package` / `test:e2e` / `stress:api` outcomes, and any fixes applied.
