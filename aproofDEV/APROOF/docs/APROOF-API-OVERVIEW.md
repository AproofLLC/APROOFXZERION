# API overview (integrators)

The **frozen contract** is defined in [API-FREEZE.md](./API-FREEZE.md). This page is a short orientation.

## Authentication

Two authentication modes are supported:

1. **API-key auth** — Header `x-api-key` scoped to one organization + environment. Used for event ingestion and proof reads.
2. **Cookie session auth** — Cookie `aproof_session` set by `/auth/sign-in` and `/auth/sign-up`. Used for control-plane, read-model, and settings routes.

### Session cookie and mutation safety

- **Cookie attributes:** `HttpOnly`, `SameSite=Lax`, `Path=/`, **Max-Age** 7 days; **`Secure`** in production (or when `APROOF_COOKIE_SECURE=1`), overridable with `APROOF_COOKIE_SECURE=0` for local HTTP.
- **CSRF:** Browser-originated **unsafe** methods with an `aproof_session` cookie are rejected when `Sec-Fetch-Site: cross-site` is present (**403** `CSRF_BLOCKED`). Non-browser clients without that header are unaffected.
- **Rate limits:** `POST /auth/sign-in`, `POST /auth/sign-up`, and `POST /sandbox/session` are rate-limited per IP + path (defaults **120 / 60s**; tunable via `APROOF_AUTH_RL_MAX`, `APROOF_AUTH_RL_WINDOW_MS`; disable with `APROOF_RATE_LIMIT_DISABLED=1`). **429** `RATE_LIMITED` when exceeded.
- **Secrets:** Session tokens and API key hashes are not returned on routine reads; `plain_key` only once on `POST /settings/api-keys` creation. **`POST /sandbox/session`** never returns a session token in JSON (cookie only). Error responses do not echo passwords or raw tokens. Structured **audit** logs mark sensitive actions without logging secrets (see [API-FREEZE.md](./API-FREEZE.md)).

## Core Proof Engine Endpoints (API-key auth)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/events` | Submit an event; receive pipeline result + identity + product_proof + failure_intelligence. |
| `GET` | `/proofs/:id` | Fetch a stored proof envelope by event_id or proof_id. **Also allowed with cookie session** (same org/env as the proof) for the control-plane UI. |
| `GET` | `/subjects/:id/proofs` | Paginated list of proof envelopes for a subject. **Also allowed with cookie session** (same org/env as the subject). |
| `GET` | `/failures` | Paginated failure locator index; optional subject_id filter. |

## Auth / Session (no auth / cookie auth)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/auth/sign-up` | Create organization + user + session (auto-session; sets cookie immediately). |
| `POST` | `/auth/sign-in` | Authenticate user; sets session cookie. |
| `POST` | `/auth/sign-out` | Invalidate current session. |
| `GET` | `/auth/session` | Return current session context (user_id, org, env, has_subject, subject_id, expires_at). |

## Subject Lifecycle (cookie auth)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/subjects` | Create subject + initialize 7 baselines. |
| `GET` | `/subjects` | List subjects for current org/env. |
| `GET` | `/subjects/:id` | Get subject detail with activity timestamps. |
| `PATCH` | `/subjects/:id` | Update subject (external_key). |

## Overview Read Model (cookie auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/subjects/:id/overview` | Aggregated subject dashboard: header, status strip, latest proof, angles summary, recent events, active failures, pipeline state. |

## Events Read Layer (cookie auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/subjects/:id/events` | List canonical events for a subject. |
| `GET` | `/events/:id` | Event detail: raw payload, canonical form, identity resolution, lineage, hashes, pipeline metadata. |

## Lineage / Traceability (cookie auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/subjects/:id/lineages` | List lineages (grouped by event_lineage_id). |
| `GET` | `/lineages/:id` | Lineage detail: artifact identity, version timeline, delta inspector, anchor mapping. |

## Failure Detail (cookie auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/subjects/:id/failures` | Paginated failure list for a subject (session-scoped). |
| `GET` | `/failures/:id` | Failure detail: overview, impacted artifact, evidence, full trace chain. |

## Baselines / Angles (cookie auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/subjects/:id/baselines` | List baselines for all 7 canonical angles. |
| `GET` | `/subjects/:id/baselines/:angle` | Baseline detail for specific angle. |
| `POST` | `/subjects/:id/baselines/:angle/versions` | Create new baseline version (insert-only, never mutates history). |

## Settings / Control-Plane (cookie auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/settings/api` | List API keys (safe: prefix only, no secrets). |
| `POST` | `/settings/api-keys` | Create API key (plain key returned only at creation). |
| `DELETE` | `/settings/api-keys/:id` | Revoke API key. |
| `GET` | `/settings/account` | Account info (email, role). |
| `PATCH` | `/settings/account` | Update account email and/or password. |
| `GET` | `/settings/organization` | Organization summary. |
| `GET` | `/settings/organization/users` | List org users. |
| `GET` | `/settings/environment` | Environment info + mode (testnet/staging/production). |
| `PATCH` | `/settings/environment` | Update environment name or mode (testnet/staging/production). |

## Sandbox / Testnet

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/sandbox/session` | Create isolated sandbox org+user+env with stored **mode** `testnet` and env **name** `testnet`. Sets `aproof_session` cookie only; success JSON is the fixed key set documented in [API-FREEZE.md](./API-FREEZE.md) (`expires_at` is session expiry time, not a secret). Init failures return a generic **500** message. |

## Disclosure

Set **`x-proof-view`** on proof engine routes. See [APROOF-DISCLOSURE-AND-VIEWS.md](./APROOF-DISCLOSURE-AND-VIEWS.md). Proof envelope collection/nullability normalization for reads lives in `src/http/proof-read-envelope.ts`.

## Success and errors

- **`200`** — Successful read.
- **`201`** — Resource created (event accepted, subject created, etc).
- **`401`** — Invalid or missing authentication.
- **`403`** — Scope mismatch, or **CSRF_BLOCKED** on cross-site cookie-authenticated mutations.
- **`404`** — Resource not found.
- **`429`** — **RATE_LIMITED** on abuse-protected auth/sandbox routes.
- **`409`** — Conflict (duplicate email, etc).
- **`422`** — Not proofable or validation failure.

Error envelope: `{ ok: false, error: { code, message, details? } }`.

## Identity block (success)

On successful ingest and on proof reads (when the view includes it), **`identity`** contains:
`event_id`, `artifact_id`, `event_lineage_id`, `event_version`, `canonical_hash`, `logical_hash`.

## Baseline model (integration note)

- The seven-angle proof surface is universal and fixed.
- AProof owns evaluator logic and schema meaning for each angle.
- Integrators configure per-subject baseline values only.
- Baseline edits always create a new version; history is immutable.
