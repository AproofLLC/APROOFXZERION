# The seven integrity angles

Every proofable event produces a **ProductProof** with exactly **seven** angles, in a fixed order. Each angle answers a different integrity question. An angle can be **pass**, **fail**, **warn**, **insufficient_evidence**, or **not_applicable** depending on event evidence context (see [proof-semantics.md](./proof-semantics.md)).

Below is **external-facing language**. Baseline values are customer-configured, while evaluator logic and angle meaning are AProof-owned and fixed.

| Angle | Question it helps answer |
|-------|---------------------------|
| **deterministic_integrity** | Did the execution produce the **expected deterministic fingerprint** (e.g. digest of inputs/outputs) for this class of action? |
| **model_identity_integrity** | Was the **model (or endpoint identity)** that ran the action the one we expected? |
| **retrieval_integrity** | For retrieval-style events, did **sources and retrieval behavior** meet baseline expectations (coverage, grounding rules)? |
| **policy_integrity** | Did **policy tags / rules** attached to the event satisfy the configured policy baseline? |
| **operational_integrity** | Did **runtime behavior** (e.g. success/failure, latency bounds) meet operational baselines? |
| **identity_access_integrity** | Did **identity and access** evidence (scopes, tokens, checks) match what we require for this subject and event type? |
| **cross_system_integrity** | Did **cross-system** commitments (expected systems present, linkage) hold for this event? |

## How to read a proof

- **`proof_status`** — High-level verdict for the billable unit (e.g. verified vs failed vs flagged).  
- **Per-angle `status`** — Granular: pass/fail/insufficient/etc.  
- **`reason_code`** — Machine-stable string (e.g. baseline mismatch, `NO_SOURCES` when the event type carries no evidence for that angle).  
- **`failure_intelligence`** (when exposed) — Operational rollup: categories and summaries for dashboards.

Not every angle is “fully exercised” for every event type: some angles correctly return **insufficient_evidence** (`NO_SOURCES`) when the event does not carry the right evidence. That is expected and does **not** mean an angle disappeared from the proof.

## Order (normative)

1. `deterministic_integrity`  
2. `model_identity_integrity`  
3. `retrieval_integrity`  
4. `policy_integrity`  
5. `operational_integrity`  
6. `identity_access_integrity`  
7. `cross_system_integrity`  

This order is stable for **digests, APIs, and documentation**.
