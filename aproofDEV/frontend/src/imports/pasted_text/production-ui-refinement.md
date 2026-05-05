Refine the existing Aproof frontend into a final, backend-faithful, production-grade UI. Do NOT redesign the app from scratch. Preserve the current scaffold, layout, navigation, and tab structure exactly as they are.

The goal of this pass is to achieve maximum frontend truth before backend integration. Every visible element must represent a real backend object, state, or relationship. Remove all remaining abstraction, placeholder feeling, or decorative UI that is not grounded in actual system behavior.

Core Product Model:
USER → SESSION → SUBJECT → (PROOFS / EVENTS / FAILURES / BASELINES / LINEAGES)

Global Rules:
- Every UI element must map to a real backend field or object
- Every tab must support: loading, empty, error, and populated states
- Use list-first → detail-second interaction patterns everywhere
- Every object must link to related objects (proof ↔ event ↔ failure ↔ lineage ↔ baseline)
- Do NOT use decorative charts or fake KPIs
- Do NOT hide complexity — simplify navigation, not truth
- Keep the dark enterprise SaaS style, clean hierarchy, soft borders, subtle shadows
- Maintain the current scaffold and structure

---

ACCESS GATEWAY (AUTH)
Refine into a real operational gateway:
- sign in
- sign up
- restore session
- optional sandbox session
Add:
- loading state
- inline error state
- success transition into workspace
Remove:
- any fake/demo feeling behavior

---

SUBJECT CONTEXT BAR (TOP OF APP)
Make this visually dominant and always visible:
- subject name
- subject type
- organization
- environment
- posture status
This must feel like the anchor of the entire system.

---

OVERVIEW TAB
Convert into a truthful command surface:
Display only real backend-driven concepts:
- latest proof status
- proof count
- event count
- failure count
- lineage count
- anchor state
- seven-angle summary strip
- latest proof snapshot
- recent activity feed (proofs/events)
Add:
- loading state
- empty state
- error state
Remove:
- decorative or vague KPI cards

---

PROOFS TAB (CRITICAL)
This must feel like a forensic system, not a dashboard.

List View:
- proof_id
- created_at
- status
- flags_count
- anchor_state
- angle coverage
- summary

Detail View (structured sections only):
- Proof Summary
- Baseline vs Actual (compared_fields, changed_fields)
- Angle Results (ALL 7 angles)
- Failure Rollup
- Evidence References
- Linked Events
- Anchor Metadata

Make each section:
- clearly separated
- non-decorative
- precise and readable

---

EVENTS TAB
Convert into an operational event ledger.

List:
- event_id
- canonical event type
- occurred_at
- artifact_id
- source_type
- lineage_id
- proof linkage state

Detail:
- canonicalized event view
- artifact identity
- hash-related fields
- linked proofs
- related failures
- lineage linkage

Make relationships clickable and obvious.

---

TRACEABILITY TAB
Remove all abstract or conceptual visuals.

Replace with:
- lineage table
- lineage_id
- artifact_id
- ordered event sequence
- related proofs
- version progression

Interaction:
- select lineage
- view full event chain
- view connected proofs and failures

This must feel like a record browser, not a diagram.

---

FAILURES TAB
Make this feel clinical and diagnostic.

List:
- failure_id
- proof_id
- angle
- severity
- code / reason
- timestamp
- artifact / lineage reference

Detail:
- expected baseline
- actual observed state
- exact failed field / condition
- evidence references
- linked proof
- linked event

No alert-style or decorative UI.

---

ANGLES TAB (VERY IMPORTANT)
Always render ALL 7 angles with identical structure.

Each angle must show:
- angle name
- status
- baseline present (yes/no)
- baseline version
- evidence sufficiency
- summary

Explicit fallback states:
- no baseline
- no sources
- not evaluated

Detail view:
- baseline detail
- latest actual comparison
- version history
- linked proofs and failures

No missing or hidden angles.

---

SETTINGS TAB
Only include real operational sections:
- API keys
- account
- organization
- organization users
- environment

Remove anything that feels template-generated or unnecessary.

Make forms feel real and minimal.

---

STATE REALISM (CRITICAL)
Every major surface must include:
- loading skeleton
- empty state (no data)
- error state (failed request)

These states must be visually distinct and intentional.

---

RELATIONSHIP VISIBILITY
Make connections between objects explicit and navigable:

- Proof → Events
- Proof → Failures
- Event → Lineage
- Failure → Proof
- Angle → Baseline version
- Lineage → Proofs

These links must be visible, clickable, and consistent.

---

VISUAL DIRECTION
- dark neutral enterprise SaaS
- soft borders, subtle shadows
- strong hierarchy
- clean typography
- tables + detail panels as primary interaction model
- no flashy visuals, no neon, no blockchain aesthetics
- product should feel auditable, governed, and investor-ready

---

FINAL GOAL
Transform the existing scaffold into a truthful, backend-aligned UI that feels like a real operational system, not a concept or mockup.