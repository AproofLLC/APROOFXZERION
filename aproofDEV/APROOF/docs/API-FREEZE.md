# AProof HTTP API — frozen contract (v1)

This document locks the public HTTP contract implemented by `src/http/server.ts`. Behavior matches identity, hashing, and proof semantics defined elsewhere in `docs/` and enforced in pipeline code.

## Authentication

All endpoints require header:

- `x-api-key: <secret>` — resolves to one `(organization_id, environment_id)` scope.

Missing or unknown key:

```json
HTTP 401
{ "error": "unauthorized" }
```

## Disclosure / role views

Header (optional on every endpoint):

- `x-proof-view: internal | external | minimal | adversarial_safe`

Default when omitted or invalid: **`internal`**.

| View | Purpose |
|------|---------|
| **internal** | Full operational JSON: proof units with diagnostic fields, full `product_proof`, full `failure_intelligence`, stable mirror **`failure_rollup`** (same shape), deduped proof-level **`evidence_refs`**, **`anchor_metadata`**, **`linked_events`**, envelope **`status`** (= `product_proof.proof_status`), envelope **`subject_id`** (= `product_proof.subject_id`), plus `identity` on event envelopes. |
| **external** | Redacts proof-unit diagnostics (`evidence_json`, `inspection_path`, etc.); trims `product_proof.failure_locator` to `layer` + `summary`; trims failure insights to `angle`, `category`, `summary`. Exposes the same frontend-safe rollup fields as internal where applicable: **`failure_rollup`** (sanitized like `failure_intelligence`), **`evidence_refs`**, **`anchor_metadata`**, **`linked_events`**, **`status`**, **`subject_id`**. **`identity` is included** (hashes and ids are not treated as internal-only diagnostics). |
| **minimal** | `ok`, `canonical_event_type`, and minimal `product_proof` (`proof_status` + per-angle `angle`, `applicable`, `status` only). No `identity`, `proof_units`, or `failure_intelligence`. |
| **adversarial_safe** | Same minimal proof surface as **minimal**, plus `{ "message": "Integrity verification completed." }`. |

List endpoint **`GET /failures`** follows the same header:

- **internal**: full failure locator rows.
- **external**: `event_id`, `angle`, `host`, `created_at` per item.
- **minimal** / **adversarial_safe**: `angle`, `host` only per item; adversarial_safe adds the same `message` as above.

---

## Frozen endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/events` | Ingest event, run pipeline, return proof envelope. |
| `GET` | `/proofs/:id` | Fetch proof envelope for stored canonical event. **`id` = `event_id` (UUID).** |
| `GET` | `/subjects/:id/proofs` | Paginated list of proof envelopes for a subject. **`id` = `subject_id` (UUID).** |
| `GET` | `/failures` | Paginated failure locator index, optionally filtered by `subject_id`. |

---

## `POST /events`

### Request body (JSON)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `organization_id` | UUID | yes | Must match API key scope. |
| `environment_id` | UUID | yes | Must match API key scope. |
| `source_type_key` | string | yes | Maps to canonical event type. |
| `subject_id` | UUID | yes | Must exist in env. |
| `event_id` | UUID | no | Generated if omitted. |
| `artifact_id` | UUID | no | Underlying object identity. Provided value is authoritative; if deterministic stable-field derivation exists it is validated against derived identity (mismatch rejects). If omitted, server derives deterministically or fails safely when non-derivable. |
| `event_lineage_id` | UUID | no | Defaults to `artifact_id` if omitted. |
| `event_version` | int | yes | Positive integer. |
| `trace_id` | string | yes | Non-empty. |
| `occurred_at` | date-time | yes | Coerced; must not be far in the future. |
| `payload` | object | yes | Event payload (angle-specific). |
| `idempotency_key` | string | no | Optional dedup key (max 512 chars). Stored on canonical event, returned in event reads. |
| `ingestion_source` | string | no | Optional source label (max 256 chars). Stored on canonical event, returned in event reads. |

Scope mismatch (`organization_id` / `environment_id` ≠ key):

```json
HTTP 403
{ "error": "scope_mismatch" }
```

Validation failure:

```json
HTTP 400
{ "error": "invalid_body", "details": <zod flatten> }
```

### Success `201`

Body (before disclosure) includes:

- Pipeline fields: `ok`, `source_type_key`, `raw_event_id`, `event_id`, `canonical_event_type`, `subject_rail`, `proof_units`, `failure_locators_created`, `lineage_anomaly`.
- **`identity`** (object):

  | Field | Description |
  |-------|-------------|
  | `event_id` | Canonical instance id (primary key). |
  | `artifact_id` | Object identity. |
  | `event_lineage_id` | Version stream id. |
  | `event_version` | Version within stream. |
  | `canonical_hash` | 64-char hex SHA-256 over `{ event_id, trace_id, subject_id, event_type, occurred_at }` (sorted JSON). |
  | `logical_hash` | 64-char hex SHA-256 over `{ trace_id, subject_id, event_type, occurred_at }` (sorted JSON). |

- **`product_proof`**: product `ProductProof` (always **7** angles).
- **`failure_intelligence`**: rollup from `src/product/failure-intelligence.ts`.
- **`failure_rollup`**: same object as `failure_intelligence` (stable alias for UI).
- **`evidence_refs`**: sorted union of per-angle `evidence_refs` on `product_proof`.
- **`anchor_metadata`**: `{ anchor_status, anchor_batch_id, anchor_chain, anchor_tx_hash, anchor_timestamp }` (mirrors anchor fields on `product_proof`).
- **`linked_events`**: `{ event_id, relationship }[]` (`canonical` + optional `raw`).
- **`status`**: mirrors `product_proof.proof_status`.
- **`subject_id`**: mirrors `product_proof.subject_id`.

### Error `422` — not proofable / duplicate

Exact shape:

```json
{
  "ok": false,
  "code": "NOT_PROOFABLE",
  "reason": "<machine string>",
  "raw_event_id": "<uuid>"
}
```

`reason` is one of the codes listed in **`src/http/not-proofable-reasons.ts`** (also regression-tested), including gate failures (`mapping_missing`, `subject_not_unique_or_missing`, …), artifact identity validation failures (`ARTIFACT_ID_CONFLICT_WITH_DERIVED`, `ARTIFACT_ID_NOT_DERIVABLE`), idempotency / lineage outcomes (`duplicate_event_id_same_hash`, `duplicate_lineage_version_hash_conflict`, `lineage_artifact_identity_conflict`, …), and `duplicate_submission_conflict`.

---

## `GET /proofs/:id`

- **Auth**: **`x-api-key`** (proof-engine scope) **or** cookie session (`aproof_session`) for the same organization + environment as the proof.
- **`id`**: canonical **`event_id`** (UUID). Invalid UUID → `400` `{ "error": "invalid_id", "field": "id" }`.
- Unknown or out-of-scope event → `404` `{ "error": "not_found" }`.
- Stored canonical row exists but `proofability !== "proofable"` → `422` with the same NOT_PROOFABLE shape as ingest (`reason` may be `canonical_not_proofable` or stored quarantine text).

Success **`200`**: same envelope shape as `POST /events` success (reconstructed from DB), including **`identity`** and disclosure rules above.

---

## `GET /subjects/:id/proofs`

- **Auth**: **`x-api-key`** (proof-engine scope) **or** cookie session for the subject’s org + environment.
- **`id`**: **`subject_id`** (UUID). Invalid → `400` `{ "error": "invalid_id", "field": "id" }`.
- Subject not in key scope → `404` `{ "error": "not_found" }`.

Query:

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `limit` | int | 20 | 100 |
| `offset` | int | 0 | — |

Only **`proofability = proofable`** events are listed, newest `occurred_at` first.

Success **`200`**:

```json
{
  "items": [ /* same objects as GET /proofs/:id per item */ ],
  "page": { "limit": 20, "offset": 0, "total": 42 }
}
```

---

## `GET /failures`

Query:

| Param | Type | Notes |
|-------|------|--------|
| `limit` | int | default 20, max 100 |
| `offset` | int | default 0 |
| `subject_id` | UUID | optional; invalid UUID → `400` `{ "error": "invalid_id", "field": "subject_id" }` |

Success **`200`** (internal view item shape):

| Field | Type |
|-------|------|
| `id` | UUID (failure locator row) |
| `proof_id` | UUID |
| `event_id` | UUID |
| `angle` | integrity angle enum string |
| `failure_zone` | string |
| `subject` | string |
| `host` | string |
| `inspection_path` | string |
| `created_at` | ISO-8601 |

```json
{
  "items": [ /* ... */ ],
  "page": { "limit": 20, "offset": 0, "total": 10 }
}
```

---

## Identity semantics (normative)

- **`event_id`**: Unique per submission instance; duplicate submissions with the same `event_id` compare **`canonical_hash`**.
- **`artifact_id`**: Underlying object identity. Provided value is authoritative; when deterministic derivation exists it is used for validation and mismatch rejection; omitted values are derived or rejected if non-derivable.
- **`event_lineage_id`**: Version stream; duplicate detection for a slot uses **artifact + lineage + version + `logical_hash`**.
- **`event_version`**: Strictly positive; ordering anomalies may set `lineage_anomaly: "OUT_OF_ORDER_LINEAGE_VERSION"` on **ingest** responses only (read APIs use `null`).

---

## Control-plane / read-model endpoints (cookie session auth)

These routes use HTTP-only cookie session auth (set on **`POST /auth/sign-up`** and **`POST /auth/sign-in`**). They coexist with the API-key-authenticated proof engine routes above.

### Auth / Session

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/sign-up` | **Contract A (locked):** Creates org, default environment (explicit stored **`mode: production`** in DB, independent of display **name** `"production"`), user, and **a valid server-side session** in one step. Sets `aproof_session` cookie **identically** to sign-in: **HttpOnly**, **SameSite=Lax**, **Path=/**, **Max-Age** = 7 days; **`Secure`** is added when `NODE_ENV === "production"` or `APROOF_COOKIE_SECURE=1` / `true`, and omitted when `APROOF_COOKIE_SECURE=0` / `false`. JSON body **does not** include the raw session token. Response: `{ ok, user_id, organization_id, environment_id, expires_at }`. `GET /auth/session` with that cookie succeeds immediately without a separate sign-in. 409 on duplicate email. |
| `POST` | `/auth/sign-in` | Authenticate. Body: `{ email, password }`. Sets `aproof_session` with the same cookie attributes as sign-up. 401 on bad credentials. |
| `POST` | `/auth/sign-out` | Revoke session. Clears cookie (same attributes + **Max-Age=0**). |
| `GET` | `/auth/session` | Returns `{ user_id, organization_id, environment_id, environment, has_subject, subject_id, expires_at }` (`expires_at` = session expiry, ISO-8601). 401 if no valid session. |

**Abuse protection:** `POST /auth/sign-in`, `POST /auth/sign-up`, and `POST /sandbox/session` share a **fixed-window in-memory rate limiter** per server process (key = client IP + path). Defaults: **120** requests per **60s** per key unless overridden by `APROOF_AUTH_RL_MAX` and `APROOF_AUTH_RL_WINDOW_MS`. Set `APROOF_RATE_LIMIT_DISABLED=1` to disable (e.g. specialized local harnesses). Excess requests → **429** `{ ok: false, error: { code: "RATE_LIMITED", ... } }`.

**CSRF / cross-site cookie mutations:** For **POST**, **PATCH**, **PUT**, and **DELETE**, if the request carries an `aproof_session` cookie **and** the browser sends `Sec-Fetch-Site: cross-site`, the request is rejected with **403** `{ ok: false, error: { code: "CSRF_BLOCKED", ... } }`. Clients that omit `Sec-Fetch-Site` (e.g. curl, many integration tests) are unaffected. Same-site / same-origin browser calls are allowed. This complements **SameSite=Lax** on the session cookie.

### Subject lifecycle and unified subject contract

**Subject core block** (same field names and nullability everywhere below):

| Field | Type | Notes |
|-------|------|--------|
| `subject_id` | UUID | |
| `subject_type` | string | Rail: `system` \| `service` \| `agent` \| `model` \| `endpoint` |
| `organization_id` | UUID | |
| `environment_id` | UUID | |
| `environment` | string | Environment **name** (display), not mode |
| `external_key` | string \| `null` | Optional external identifier when set via `PATCH` |
| `created_at` | ISO-8601 | |
| `latest_event_timestamp` | ISO-8601 \| `null` | Max event `occurred_at` for subject |
| `latest_proof_timestamp` | ISO-8601 \| `null` | Max proof unit `created_at` |
| `latest_anchor_timestamp` | ISO-8601 \| `null` | Max anchor batch time linked to subject proofs |

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/subjects` | Create subject. Initializes 7 baseline records. Body: `{ subject_type }` (or `rail_type`). Returns the **subject core block** (includes `external_key`, usually `null` until patched). |
| `GET` | `/subjects` | List subjects. Each item is the **subject core block**. Paginated. |
| `GET` | `/subjects/:id` | Subject detail: **subject core block**. |
| `PATCH` | `/subjects/:id` | Strict JSON: only `{ external_key?: string \| null }` allowed. Unknown keys → **400** `INVALID_BODY`. Returns **subject core block**. Org/env scoped. |

### Overview Read Model

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/subjects/:id/overview` | `subject_header` is exactly the **subject core block** (same keys as GET `/subjects/:id`, including `created_at` and `latest_*` timestamps). Also: `metadata` (always `{}` today), `status_strip` (includes **`lineage_count`**: distinct `event_lineage_id` values for the subject), `latest_proof_snapshot`, `angles_summary` (7 angles, canonical order), `recent_events`, `active_failures_list`, `pipeline_state`. |

### Events Read Layer

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/subjects/:id/events` | List canonical events. Includes `occurred_at` (same instant as `timestamp`), `lineage_id` (= `event_lineage_id`), `linked_proof_refs` (all proof unit ids for the event, sorted), `related_failure_refs` (`failure_id`, `angle`, `reason_code`), plus legacy table fields (`event_id`, `raw_event_id`, `artifact_id`, `event_lineage_id`, `version`, `source_type`, `ingestion_source`, `canonical_event_type`, `timestamp`, `canonical_hash`, `occurrence_hash`, `idempotency_key`, `proof_id` = first sorted proof id). |
| `GET` | `/events/:id` | Event detail: top-level `event_id`, `subject_id`, `occurred_at`, `artifact_id`, `source_type`, `lineage_id`, `canonical_event_type`, `linked_proof_refs`, `related_failure_refs`, `canonicalized_representation` (= stored canonical payload), `metadata` (`{}`), plus `raw_payload`, `canonical_form`, nested blocks each carrying a `metadata: {}` object where applicable, `identity_resolution` (with `identity_status` enum), `lineage_assignment`, `state_hashes`, `linked_proof`, `pipeline_metadata`. |

### Lineage / Traceability

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/subjects/:id/lineages` | List lineages: `lineage_id`, `artifact_id` (nullable), `version_count`, `first_seen` (nullable ISO-8601), `last_updated` (nullable ISO-8601). |
| `GET` | `/lineages/:id` | Detail: `lineage_id`, `artifact_id`, `ordered_event_sequence` (same as `version_timeline`), `related_proofs` (sorted distinct proof ids), `version_progression` (= `delta_inspector`), `anchor_linkage` (= `anchor_mapping`), `metadata` (`{}`), plus `artifact_identity` (includes `metadata: {}`), `version_timeline`, `delta_inspector`, `anchor_mapping`. |

### Failure Detail

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/subjects/:id/failures` | Paginated failure list for a subject. Each item: `failure_id`, `angle`, `reason_code`, `step`, `failure_priority`, **`severity`** (`low` \| `medium` \| `high` \| `critical`, derived from priority), `event_id`, `proof_id`, `created_at`. |
| `GET` | `/failures/:id` | Top-level: `failure_id`, `proof_id`, `subject_id`, `created_at`, `angle`, **`severity`**, `code` (= `reason_code`), `reason_code`, `expected_baseline`, `actual_observed` (from proof unit JSON), `failed_field_condition` (`inspection_path`, sorted `missing_fields`), `related_event_refs`, `related_proof_refs`, `metadata` (`{}`), plus nested `failure_overview`, `impacted_artifact` (with `metadata: {}`), `evidence` (with `metadata: {}`), `full_trace_chain` (with `metadata: {}`). |

### Baselines

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/subjects/:id/baselines` | 7 canonical angles. Each: `angle`, **`baseline_present`**, `baseline_summary`, `last_updated` (**`null`** when no baseline row exists for that angle), `baseline_version`, `baseline_locked`, **`evidence_sufficiency`** (`full` \| `qualified` \| `insufficient`), **`sources_state`** (`present` \| `no sources`), `metadata` (`{}`). |
| `GET` | `/subjects/:id/baselines/:angle` | Detail: **`baseline_present`**, **`evidence_sufficiency`**, **`sources_state`**, **`version_history`** (all versions, ascending), `metadata` (`{}`), plus `definition`, `baseline_rules`, `current_values`, `editable_fields`, `recent_violations`, `baseline_version`, `baseline_locked`. |
| `POST` | `/subjects/:id/baselines/:angle/versions` | Insert-only version creation. Body: `{ definition }`. Returns updated detail. |

### Settings / Control-Plane

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings/api` | List API keys (prefix only, never full secret). |
| `POST` | `/settings/api-keys` | Create key. `plain_key` returned only at creation. |
| `DELETE` | `/settings/api-keys/:id` | Revoke key. |
| `GET` | `/settings/account` | Account info. |
| `PATCH` | `/settings/account` | Update email and/or password. Body: `{ email?, current_password?, new_password? }`. 409 if email taken. 401 if current password wrong. **Password change:** new password is hashed with the same scrypt parameters as sign-up; **all other sessions for that user are revoked**; the **current** session (cookie used for the request) remains valid. |
| `GET` | `/settings/organization` | Org summary. |
| `GET` | `/settings/organization/users` | `{ users: [...] }` each user includes `user_id`, `email`, `role`, **`created_at`** (ISO-8601). |
| `GET` | `/settings/environment` | Env info + `mode` column (testnet/staging/production). |
| `PATCH` | `/settings/environment` | Update env name and/or mode. Body: `{ name?, mode?: "testnet"|"staging"|"production" }`. `name` and `mode` are independent columns. 400 on invalid mode. |

### Sandbox / Testnet

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sandbox/session` | Creates isolated sandbox org/user. Sets environment **name** `testnet` and explicit stored **mode** `testnet` (never inferred from the name alone). Uses the same session cookie attributes as auth routes. **Success JSON** contains exactly: `ok`, `sandbox`, `user_id`, `organization_id`, `environment_id`, `environment_mode` (always `"testnet"`), `expires_at` (session expiry, ISO-8601). **No** `session_token`, API key material, or password fields in the body. Server failure → **500** `SANDBOX_INIT_FAILED` with a **generic** public message (`"Sandbox initialization failed."`); the specific failure code is **not** echoed to the client and is logged server-side only (`warn`). Each call creates a **new** org (not idempotent; IDs differ per call). Response **shape** and field names are stable. Subject to the same rate limit as sign-in/sign-up. |

## Response shape rules

- All object keys are stable; never silently omitted.
- Absent values use explicit `null`, `[]`, `0`, or sentinel values (e.g., `NO_SOURCES`).
- Angles are always in canonical 7-angle order: `policy_integrity`, `identity_access_integrity`, `operational_integrity`, `model_identity_integrity`, `retrieval_integrity`, `deterministic_integrity`, `cross_system_integrity`.
- Timestamps are ISO-8601. IDs are UUIDs.
- Error envelope: `{ ok: false, error: { code, message, details? } }`.

---

## Audit logging (server)

Sensitive control-plane actions emit structured **`info`** logs with `audit: true` and an `action` field (e.g. `auth.sign_in`, `auth.sign_out`, `settings.api_key_create`, `settings.environment_mode_change`, `subject.create`). **Secrets** (passwords, raw session tokens, API key material) are **not** logged. Sandbox bootstrap failures use **`warn`** logs with a `code` field only (no passwords).

**Proof read JSON normalization** (nested `product_proof` / list summaries) is implemented in `src/http/proof-read-envelope.ts` (stable collections and nullability on read paths; does not change proof semantics).

## Regression tests

- `e2e/api-freeze.e2e.test.ts` — endpoints, identity block, pagination, failures list, 422 shape.
- `e2e/control-plane-api.e2e.test.ts` — auth/session, subjects, overview, events read, lineages, failures detail, baselines, settings, sandbox, org scoping, CSRF header behavior.
- `src/http/api-freeze.test.ts` — reason registry and disclosure invariants.
- `src/http/baselines-service.test.ts` — baseline list `last_updated` nullability.
- `src/http/csrf-cookie-mutation.test.ts`, `src/http/auth-rate-limit-http.test.ts`, `src/http/rate-limit-in-memory.test.ts` — security helper behavior.
- `src/http/api-read-contract.test.ts` — proof list / `ProductProof` schema and error envelope invariants.
- `src/http/sandbox-session-response.test.ts` — sandbox success body key set and absence of token fields.
