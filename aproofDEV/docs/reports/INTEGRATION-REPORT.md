# APROOF frontend ↔ proofs engine integration

*(Archived from `frontend/` as part of repo layout hygiene; content unchanged.)*

## Run commands

**Backend** (from `APROOF/`, Node ≥ 20, database per project README):

```bash
cd APROOF
npm install
npm run db:setup   # or your env’s migrate + seed path
npm run dev        # listens on PORT from env (often 3040)
```

**Frontend** (dev uses Vite proxy to the API; cookies must be same-site with the proxy):

```bash
cd frontend
npm install
npm run dev        # http://127.0.0.1:5273 — proxies /auth, /subjects, /proofs, etc.
```

Optional: `VITE_API_PROXY_TARGET=http://127.0.0.1:3040`, or set `APROOF_PORT` when the API is not on **3040** (Vite does not use shell `PORT` for the proxy target).

Production build:

```bash
cd frontend
npm run build
npm run preview
```

## Files changed (integration pass)

- `src/app/pages/Proofs.tsx` — real session, subjects list, subject selector (`external_key` fallback), overview-driven context bar, tab wiring with `subjectId`.
- `src/app/components/proofs/ProofsOverview.tsx` — `GET /subjects/:id/overview` (status strip, latest proof snapshot, seven-angle merge, recent events, failures, pipeline, metadata JSON).
- `src/app/components/proofs/ProofsProofs.tsx` — passes `subjectId` to list/detail.
- `src/app/components/proofs/ProofsProofsList.tsx` — `GET /subjects/:id/proofs` + `GET /proofs/:id` (summaries, merged seven angles, compared/changed unions, failure rollup, evidence, linked events, anchor + envelope metadata).
- `src/app/components/proofs/ProofsEvents.tsx` — `GET /subjects/:id/events` + `GET /events/:id` (canonical, hashes, payloads, lineage, proofs, failures, pipeline).
- `src/app/components/proofs/ProofsFailures.tsx` — `GET /subjects/:id/failures` + `GET /failures/:id`.
- `src/app/components/proofs/ProofsAngles.tsx` — `GET /subjects/:id/baselines` + `GET /subjects/:id/baselines/:angle` (all seven rows + detail; explicit no baseline / no sources / not evaluated via merge + fallback labels).
- `src/app/components/proofs/ProofsTraceability.tsx` — `GET /subjects/:id/lineages` + `GET /lineages/:id` (timeline, deltas, related proofs, anchor linkage JSON).
- `src/app/components/proofs/ProofsSettings.tsx` — settings API keys (list/create/revoke), account PATCH, organization + users read, environment PATCH.
- `src/api/types.ts` — contracts aligned with backend (overview pipeline, event/failure/lineage detail, angle detail, etc.).
- `src/main.tsx` — fix `App` import for `tsc`.
- `src/app/pages/Home.tsx` — remove unused icon imports (build hygiene).
- `src/app/components/ui/empty-state.tsx`, `sidebar.tsx` — `verbatimModuleSyntax` type-only imports.

Existing layer (from earlier in the integration effort): `src/api/client.ts`, `src/hooks/*`, `src/constants/proof-engine.ts`, `src/util/angle-merge.ts`, `vite.config.ts` proxy, `package.json` / `QueryClientProvider`.

## Backend compatibility fixes

None in this pass. The UI uses `x-proof-view: internal` and the routes already exposed by `APROOF`.

## Remaining blockers / gaps

- **Organization name**: `GET /settings/organization` only — no PATCH in backend; UI is read-only for org name.
- **Invite/remove users**: not wired; no matching routes in the listed API surface.
- **Subject display name**: subjects expose `external_key` or UUID; there is no separate “name” field on `SubjectCoreBlock`.
- **E2E smoke**: backend Vitest e2e + `npm run verify` (root) + CI cover API and frontend build/tests; full browser E2E is still optional for later.

## Short verification checklist

1. Sign in or use **Sandbox**; confirm `GET /auth/session` populates the shell.
2. Create or select a **subject**; context bar shows type, org name (from settings), environment, posture hint from overview.
3. **Overview**: counts and latest proof snapshot match API; seven angle rows always shown; pipeline booleans reflect `pipeline_state`.
4. **Proofs**: list pagination total; selecting a row loads detail; seven angle blocks always render; compared/changed, evidence_refs, linked_events, anchor_metadata, metadata are JSON-safe (no null objects).
5. **Events / Failures / Traceability / Angles**: list + detail with loading/empty/error paths.
6. **Settings**: API keys (create shows `plain_key` once), account email/password, environment mode + name.
