# AProof × Zerion

**Zerion executes. AProof governs, verifies, and anchors.**

AProof wraps autonomous on-chain execution with **deterministic governance**: scoped policy, **seven-angle proof verification**, failure localization, and **Solana devnet anchoring**. Execution transactions and proof-anchor transactions are intentionally **separate**—auditable on explorers in different roles.

## Demo scenarios

1. **Authorized Execution** — Policy passes → real devnet execution transaction → proof digest → anchor transaction.  
2. **Blocked Execution** — Policy violation → executor **not** invoked → **no** spend → deterministic failure proof.  
3. **Execution Continuity** — Same sender/recipient lineage → **new** `tx_hash`, **`event_version`** increments → new proof and anchor.

## Monorepo layout

| Path | Role |
|------|------|
| **`aproofDEV/APROOF`** | Backend: proof engine, Zerion execution adapter, anchoring, API |
| **`aproofDEV/frontend`** | Vite + React app: proofs dashboard, Zerion Agent UI |
| **`aproofDEV/docs`** | Quickstart, demo script, workspace documentation |
| **`aproofDEV/scripts`** | Dev stack orchestration, `verify`, repo safety checks, harnesses |

## Full documentation and setup

Use **`aproofDEV/`** as the working directory for **`npm install`**, **`npm run verify`**, **`npm run dev:stack`**, Solana devnet env setup, and the complete architecture guide:

→ **[`aproofDEV/README.md`](aproofDEV/README.md)**

*(Node.js 20+. Public demos target Solana devnet. Do not commit `.env`, keypairs, or anything under `.local/`.)*
