# AProof — overview

## What AProof is

AProof is an **integrity and proof layer** for operational events. You send structured events (who did what, on which subject, with what evidence). AProof **canonicalizes** them, **evaluates** them against configured baselines across seven integrity dimensions, and returns a **product proof**: a single, consistent verdict with per-angle results you can store, audit, or show to customers.

It is not a generic data warehouse. It is built to answer: *“Can we show—with structured evidence—that this action met our integrity bar?”*

## What problem it solves

Teams operating AI systems, services, and regulated workflows face recurring gaps:

- **Trust gap**: Stakeholders want evidence that execution, policy, retrieval, and identity checks actually happened as claimed.
- **Fragmentation**: Logs exist, but they rarely compose into a **single defensible proof** tied to one business event.
- **Audit pressure**: Compliance and security reviews need **repeatable, explainable** outcomes—not ad-hoc screenshots.

AProof addresses this by making each important event **proofable by construction**: map a source event type, attach evidence in the payload, compare to baselines, emit a **seven-angle proof** plus failure rollups when something breaks.

## How the proof pipeline works (conceptually)

1. **Ingest** — You `POST /events` with organization, environment, subject, lineage/version fields, trace, time, and a `payload`.
2. **Resolve identity** — The system assigns or accepts `event_id`, resolves `artifact_id` with strict precedence (provided authoritative, validated against deterministic derivation when available, fail-safe when non-derivable), and resolves `event_lineage_id` (defaulting to `artifact_id` when you omit lineage).
3. **Gate** — Subject must exist; mapping from `source_type_key` → canonical event type must exist; basic validity (UUIDs, version, time skew).
4. **Canonicalize** — Event is stored immutably; **canonical_hash** and **logical_hash** are computed (see below).
5. **Evaluate** — The proof surface is always seven angles. Evaluators run when evidence context applies; for each angle, AProof uses its fixed schema/evaluator logic and the customer-configured baseline values for that subject.
6. **Product proof** — Results are assembled into a **ProductProof**: always **seven angles**, each with status and reasons, plus digest and metadata.
7. **Failure intelligence** — Failures are rolled up for operations (categories, primary failure, ordered insights).
8. **Respond / disclose** — The JSON you receive respects **disclosure mode** (`x-proof-view`) so the same proof can be shown internally, to partners, or in minimal/adversarial-safe form.

Dedupe and lineage rules (retries, evolution, conflicts) run **before** a new canonical row is committed; duplicates do not create a second proof for the same logical slot.

## Identity model (readable definitions)

| Field | Role |
|--------|------|
| **`event_id`** | **Instance identity** — one submission / one canonical row. Unique. You may supply it; if omitted, the server generates it. Retrying “the same instance” should reuse the same `event_id` when you want idempotency on that key. |
| **`artifact_id`** | **Object identity** — “what thing is this event about?” Provided `artifact_id` is authoritative; when deterministic derivation from stable fields is available, provided value is validated and mismatches are rejected. If omitted, server derives deterministically; if not derivable, ingest fails safely. |
| **`event_lineage_id`** | **Version stream identity** — groups versions of the same logical stream (corrections, new versions). Optional on ingest: if omitted, it defaults to **`artifact_id`**, which is the right default when each distinct object has its own stream. |
| **`event_version`** | **Position in the stream** — positive integer. Increment when you publish a new version of the same lineage (evolution). Same lineage + same version + same logical content ⇒ **replay**; same slot + different logical content ⇒ **conflict**. |

**Important:** Lineage duplicate detection is **scoped by `artifact_id`**. Two different artifacts must not share the same `(lineage_id, version)` slot; if a client reuses a lineage UUID across different artifacts, the second submission is rejected as **`lineage_artifact_identity_conflict`** rather than merged.

It is expected and correct for repeated measurement/update/analysis of the same object to have different `event_id` values while keeping the same `artifact_id`.

## `canonical_hash` vs `logical_hash`

Both are **64-character hex SHA-256** digests over **sorted JSON** (see [hash-law.md](./hash-law.md)).

| Hash | Includes | Use |
|------|-----------|-----|
| **`canonical_hash`** | `event_id`, `trace_id`, `subject_id`, `event_type`, `occurred_at` | **Instance** identity: “Is this the same submitted instance?” Used for **`event_id`** dedupe. |
| **`logical_hash`** | `trace_id`, `subject_id`, `event_type`, `occurred_at` — **no** `event_id` | **Logical** identity at a lineage slot: “Same version of the stream, same logical content?” Used for **lineage + version** dedupe and conflict detection. |

Intuition: if a client retries **without** sending `event_id`, the server mints a new `event_id`, but **`logical_hash`** can still match the prior submission so the API returns a **duplicate lineage/version** outcome instead of inserting twice.

## Baseline ownership model

- AProof owns the meaning of each angle and evaluator behavior.
- Customers configure baseline **values** per subject/customer (thresholds, expected models, required tags/scopes, expected systems/sources).
- Event type affects whether sufficient evidence exists for a given angle on that event; it does not remove the angle from the proof surface.
- References:
  - [APROOF-BASELINE-SCHEMAS.md](./APROOF-BASELINE-SCHEMAS.md)
  - [APROOF-BASELINE-TEMPLATES.md](./APROOF-BASELINE-TEMPLATES.md)

## Where to go next

- **Angles**: [APROOF-ANGLES.md](./APROOF-ANGLES.md)  
- **Disclosure**: [APROOF-DISCLOSURE-AND-VIEWS.md](./APROOF-DISCLOSURE-AND-VIEWS.md)  
- **API**: [APROOF-API-OVERVIEW.md](./APROOF-API-OVERVIEW.md) and [API-FREEZE.md](./API-FREEZE.md)  
- **Messaging & pilots**: [APROOF-COMMUNICATIONS.md](./APROOF-COMMUNICATIONS.md)
