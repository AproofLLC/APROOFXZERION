# Communications playbook

External positioning, onboarding, subject guidance, and pilot messaging. **No protocol changes**—this aligns with [API-FREEZE.md](./API-FREEZE.md) and [APROOF-OVERVIEW.md](./APROOF-OVERVIEW.md).

---

## 1) Positioning (copy bank)

### Website / landing — short hero (example)

**Headline:** Proof, not just logs—for every critical AI and service action.  
**Sub:** AProof turns operational events into structured, seven-angle integrity proofs you can audit, share, and defend.

### Short product description (≈50 words)

AProof is an integrity layer for operational events. Send structured events tied to subjects and baselines; receive a single **product proof** with seven standardized integrity angles—deterministic, model, retrieval, policy, operational, identity/access, and cross-system—plus clear failure rollups. Same pipeline, multiple **disclosure views** for internal ops vs external trust surfaces.

### Investor / partner one-liner

**We sell defensible integrity proofs for high-stakes automation—not generic observability.**

### Technical one-liner

**Canonical event ingestion → baseline-backed multi-angle evaluators → immutable proof units → stable ProductProof JSON with disclosure modes and lineage-aware dedupe.**

### Compliance / audit one-liner

**AProof produces repeatable, structured evidence of control effectiveness per event—what was checked, against what baseline, and whether each integrity dimension passed, failed, or lacked sufficient evidence.**

---

## 2) Ideal first-user onboarding flow

Keep it **linear** and **one proof in hand** before expanding.

1. **Create organization & environment** — Your tenant boundary (API key is scoped here).
2. **Create one subject** — Pick the real actor/asset you care about first (e.g. one production service or one model endpoint). Set **rail type** honestly; it drives angle applicability.
3. **Configure mapping** — Map one `source_type_key` you already emit (or will emit) to a **canonical event type** you can support with payload evidence.
4. **Attach at least one baseline** — Start with one angle that matters (often **policy** or **deterministic** for demos); add others as you grow.
5. **Send first event** — `POST /events` with `trace_id`, `occurred_at`, `event_version`, and a minimal valid `payload` for that type.
6. **Receive first proof** — Inspect **`product_proof.angles`** (always seven), **`proof_status`**, and **`identity`** (who/what/when at the hash level).
7. **Read failures** — If something fails, use **`failure_intelligence`** (internal view) or **`GET /failures`** to see **where** it broke; map `reason_code` back to the angle doc ([APROOF-ANGLES.md](./APROOF-ANGLES.md)).
8. **Retry and evolve** — Practice **replay** (same instance or same lineage slot + same logical content) vs **evolution** (same lineage, `event_version + 1`, new `event_id`). See overview for hashes.

**Success criterion for onboarding:** one event type, one subject, one green (or intentionally red) proof the team can explain in one sentence each for *identity*, *angles*, and *disclosure mode*.

---

## 3) Subject ingestion story

### What a subject is

A **subject** is the **thing AProof evaluates “as a participant”** in an event: a service, agent, model, endpoint, or system record in your environment. It has a stable **`subject_id`** in AProof and a **rail type** that reflects how you think about operational risk for that entity.

### How to think about subject types (rails)

Rails are **not** marketing labels—they do **not** change the universal seven-angle proof surface. Rails primarily influence evidence context and baseline values. Pick the rail that matches **how you govern** that entity:

- **Service** — Typical APIs and backends.  
- **Agent / model / endpoint** — AI-specific surfaces when those distinctions matter to your controls.  
- **System** — Broader infrastructure-style subjects when appropriate.

When unsure, start with **service** for generic backends and refine once you know which angles you will actually baseline.

### How `artifact_id` and lineage relate to submitted events

- **`artifact_id`** answers: *which underlying object is this event about?* If you send it, AProof treats it as authoritative. If deterministic derivation from stable fields exists, AProof validates provided vs derived and rejects mismatches (`ARTIFACT_ID_CONFLICT_WITH_DERIVED`). If omitted, AProof derives deterministically or fails safely when non-derivable (`ARTIFACT_ID_NOT_DERIVABLE`).  
- **`event_lineage_id`** answers: *which version stream is this row part of?* If you omit it, it defaults to **`artifact_id`**, which fits the common pattern **one object, one stream**.  
- **`event_version`** increments when you publish a **new version** in that stream.  

**Practical rule:** For a first integration, send either a stable object identity in payload fields that support deterministic derivation or provide `artifact_id` directly. AProof will not silently override provided `artifact_id` and will not guess loosely. When you **share** a `event_lineage_id` across payloads, ensure they share the **same artifact** or you will get **`lineage_artifact_identity_conflict`**.

### Starting with one real subject and expanding safely

1. Wire **one** production-like subject and **one** event type.  
2. Run shadow traffic until proofs are stable (insufficient_evidence only where expected).  
3. Clone the pattern: new subjects reuse the same mapping/baseline templates.  
4. Add angles and stricter baselines **after** ingestion is clean—avoid debugging payload and baseline at once.

---

## 4) Pilot / demo messaging

### 30-second explanation

“AProof takes the events you already emit—like an action or retrieval—and runs them through seven integrity checks against your baselines. You get one proof object: pass, fail, or insufficient evidence per angle, with hashes that tie the instance to its logical content. You can show a minimal view to customers and keep full detail internal.”

### 2-minute demo walkthrough

1. **Context** — “We’ll prove integrity for one real workflow step.”  
2. **Subject** — Show the subject and rail.  
3. **Event** — Send one `POST /events` with realistic payload.  
4. **Proof** — Expand **`product_proof`**: walk the seven angles in order; explain one **pass** and one **insufficient_evidence** if present.  
5. **Identity** — Show **`identity`**: same logical retry vs new `event_id`.  
6. **Disclosure** — Toggle **`x-proof-view`**: internal vs minimal side-by-side.  
7. **Failure (optional)** — Trigger a baseline mismatch; show **`failure_intelligence`** or **`GET /failures`**.

### Pilot proposal summary (internal template)

- **Scope:** One environment, one or two subjects, one canonical event type, up to N events/day.  
- **Duration:** 4–6 weeks.  
- **Deliverables:** Integrated ingest, dashboard or export of proof status, runbook for `NOT_PROOFABLE` reasons, disclosure mode for any customer-visible UI.  
- **Exit:** Go/no-go on expanding angles, subjects, and event types.

### Best first pilot customer profile

- Runs **customer-facing or regulated** automation (AI or not).  
- Already has **structured logs or events** but lacks a **single proof artifact**.  
- Has an **owner** who can map one workflow end-to-end and tolerate **one** event type going deep before breadth.

### What pilot success looks like

- **Technical:** ≥95% intended events proofable; team can explain every **`NOT_PROOFABLE`** in a runbook.  
- **Product:** One **external-safe** proof view agreed with stakeholders.  
- **Trust:** Audit or security partner can trace **event → proof → baseline** for sampled cases without ad-hoc scripts.

---

## Finalized lines (quick reference)

| Slot | Line |
|------|------|
| Investor / partner | We sell defensible integrity proofs for high-stakes automation—not generic observability. |
| Technical | Canonical event ingestion → baseline-backed multi-angle evaluators → immutable proof units → stable ProductProof JSON with disclosure modes and lineage-aware dedupe. |
| Compliance / audit | Repeatable, structured evidence of control effectiveness per event—what was checked, against what baseline, and the outcome per integrity dimension. |
