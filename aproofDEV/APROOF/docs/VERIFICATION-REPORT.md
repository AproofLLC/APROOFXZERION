# Verification report (merged APROOF — local + stress)

This document records an operational verification pass. Update it when you re-run checks.

## 1. Startup status

| Item | Result (latest agent run, 2026-04-12) |
|------|----------------------------------------|
| Backend `npm run dev` (PGlite **default** `APROOF/data/pglite` under OneDrive) | **FAIL** after retries — `PGlite failed to initialize properly` (WASM / synced-folder sensitivity). |
| Backend `npm run dev` with `PGLITE_DATA_DIR` under `%TEMP%` | **PASS** — server listened on `0.0.0.0:3040`. |
| Backend `npm run dev:live` + `npm run test:live` | **PASS** — live PGlite dir auto-selected under `%TEMP%` when repo is under OneDrive (`live-pglite-env.ps1`). |
| Backend automated tests | **PASS** — `verify:all`: 66 unit files / 379 tests, 22 e2e files / 151 tests, `stress:inject` 4 tests. |

**Commands executed (APROOF):**

- `npm run verify:all` (= typecheck + build + `vitest run` + `vitest run e2e` + `stress:inject`)
- `npm run stress:api` with live server (`PGLITE_DATA_DIR` in temp) — **PASS**
- `npm run test:live` (with `dev:live` on **3101**) — **PASS**

**Ports (expected local):**

- Backend: `PORT` / `APROOF_PORT` / default **3040**; `dev:live` **3101**

**Env vars documented:** see [LOCAL-VERIFICATION-AND-STRESS.md](./LOCAL-VERIFICATION-AND-STRESS.md).

## 2. Flow verification

| Area | Result | Notes |
|------|--------|--------|
| Auth | **PASS** (e2e) | `control-plane-api.e2e.test.ts` covers sign-up, sign-in, session, sign-out, invalid password. |
| Subjects | **PASS** (e2e) | List, create, patch, scoping. |
| Overview | **PASS** (e2e + stress:inject) | Seven `angles_summary` rows; `metadata` object; `lineage_count` numeric. |
| Proofs | **PASS** (e2e) | List + detail paths with API key; session auth for proof reads covered in e2e where applicable. |
| Events | **PASS** (e2e) | List + detail. |
| Traceability | **PASS** (e2e) | Lineages list + detail. |
| Failures | **PASS** (e2e) | List + detail. |
| Angles / baselines | **PASS** (e2e + stress:inject) | `GET .../baselines` returns **7** entries. |
| Settings | **PASS** (e2e) | API keys, account, org, users, environment. |
| HTTP stress | **PASS** (`stress:api`) | Real `fetch`; 4891 requests; no 5xx; expected 4xx on negative paths. |

## 3. Stress results

### A. `npm run stress:inject`

- **What:** 8 rounds × 12 concurrent “waves” × 8 routes ≈ **768** `inject` calls per test; all expect **200**; no **5xx**.
- **Contract spot-check:** Overview `angles_summary.length === 7`, `metadata` non-null object; baselines length **7**.
- **Failure paths:** Invalid UUID → **400**; missing cookie → **401**.
- **Result:** **PASS**.

### B. `npm run stress:api` (real HTTP)

- **Result:** **PASS** (with `PGLITE_DATA_DIR` under user temp, backend on port 3040).
- Sample histogram: `200: 4881`, `201: 2`, `400: 4`, `401: 3`, `404: 1`; latency p50 ~21 ms, p95 ~37 ms (machine-dependent).

## 4. Fixes applied (stability pass)

| File | Change |
|------|--------|
| `APROOF/src/db/pglite.ts` | Transient init retries for on-disk and in-memory PGlite; quiet `close` between attempts; env `APROOF_PGLITE_OPEN_RETRIES`. |
| `APROOF/src/main.ts` | Try/catch around PGlite startup with actionable stderr; OneDrive / `%TEMP%` hint. |
| `APROOF/package.json` | `verify:all` chains typecheck, build, unit tests, e2e, `stress:inject`. |
| `APROOF/docs/LOCAL-VERIFICATION-AND-STRESS.md` | Backend-only runbook; `verify:all`, OneDrive + `PGLITE_DATA_DIR`, retry env. |
| `APROOF/docs/VERIFICATION-REPORT.md` | This snapshot. |
| `APROOF/docs/README.md` | Index mentions `verify:all`. |
| `APROOF/scripts/live-pglite-env.ps1` | `APROOF_LIVE_PGLITE_DATA_DIR` override; default live dir under `%TEMP%` when repo path contains OneDrive. |

## 5. Remaining risks

- **On-disk PGlite** in a **OneDrive-synced** tree may still fail even with retries; use **`PGLITE_DATA_DIR` outside sync** or **`DATABASE_URL`** + Postgres.
- **`stress:api`** requires a **running** server; CI should rely on **`verify:all`** / **`stress:inject`**.
- **`npm run test:live`** requires **`npm run dev:live`** on **3101**; run order documented in LOCAL-VERIFICATION.

## 6. Doc updates

- [LOCAL-VERIFICATION-AND-STRESS.md](./LOCAL-VERIFICATION-AND-STRESS.md) — primary runbook.
- [VERIFICATION-REPORT.md](./VERIFICATION-REPORT.md) — this snapshot.
- [README.md](./README.md) — index link to verification doc.
