# Demo script — AProof × Zerion (presenter)

Use this verbatim or as a teleprompter for hackathon judges.

## Opening

**“Zerion executes. AProof governs, verifies, and anchors.”**

Briefly: Zerion’s agent performs the on-chain execution step. AProof sits in front with **deterministic policy**, **seven-angle proof**, **failure localization**, and a **separate Solana devnet anchor** for proof digests — so execution transactions and proof-anchor transactions stay distinct and auditable.

## Scenario 1 — Authorized Execution

1. Show readiness / policy: spend within limit, allowed chain and asset.
2. Trigger **Authorized Execution**.
3. Point to **execution** `tx_hash` and devnet explorer link (real transfer).
4. Show **proof digest**, **seven-angle** outcome, and **anchor** explorer link (memo / batch commitment).
5. Call out: **execution tx** ≠ **anchor tx** — two signatures, two roles.

## Scenario 2 — Blocked Execution

1. Trigger a **policy violation** (e.g. over spend limit).
2. Show that the **CLI / executor is not invoked** — no new execution transaction.
3. Show the **deterministic failure proof** explaining the violation path.

## Scenario 3 — Execution Continuity

1. Run continuity: **same sender**, **same recipient** as prior authorized flow.
2. Show a **new** execution `tx_hash` (new on-chain transaction).
3. Show **`event_version`** increments and lineage stays coherent.
4. Show **new proof** and **new anchor** for the updated event.

## Close

**“AProof adds deterministic governance, proof verification, operational traceability, and execution continuity to autonomous onchain agents powered by Zerion.”**

## Judge checklist (quick)

- Execution transaction hash + explorer
- Proof digest + seven-angle summary
- Anchor signature / batch root + anchor explorer
- Explicit confirmation: execution wallet vs anchor wallet vs continuity recipient (see main README)
