# AProof × Zerion — Deterministic Governance for Autonomous Onchain Execution

Public hackathon / review drop: **Solana devnet** demo wiring for a Zerion execution agent governed and proven by **AProof**. Nothing in this document replaces `npm run verify`; use it before publishing or judging.

**Public demo safety:** This demo uses Solana devnet. Do not use production private keys. Do not reuse funded mainnet wallets. All local keypairs are generated under `APROOF/.local/` and ignored by git.

## 1. What this is

**AProof** adds deterministic governance, proof verification, failure localization, and Solana devnet anchoring to an autonomous **Zerion** execution agent. Events flow through scoped policy, a fork-compatible **Zerion CLI executor**, real devnet transactions when allowed, then a **seven-angle** deterministic proof pipeline and a **separate** anchor transaction that commits proof digests on-chain.

## 2. Core thesis

**“Zerion executes. AProof governs, verifies, and anchors.”**

## 3. Demo scenarios

### Authorized Execution

- Policy passes (chain, asset, spend).
- **Zerion Agent** invokes the executor and produces a **real** Solana devnet transaction.
- **AProof** ingests the result, builds the proof, and **anchors** the digest (separate tx from execution).

### Blocked Execution

- Policy violation (for example over spend limit).
- Executor / CLI is **not** invoked; **no** execution transaction is created.
- **AProof** still yields a **deterministic failure proof** localizing the violation.

### Execution Continuity

- **Same** sender and **same** continuity recipient as a prior authorized run.
- A **new** execution `tx_hash` (new on-chain transaction).
- **`event_version`** increments; **new** proof and **new** anchor.

## 4. What judges should verify

- **Execution** transaction hash and Solana devnet explorer link.
- **Proof digest** and **seven-angle** proof summary (conformant / violated / flagged / … per angle rules).
- **Anchor signature** (batch anchor tx) and **anchor** explorer link.
- Trace **lineage** across continuity (`event_version`, subject identity).
- Confirm **execution tx** and **proof anchor tx** are **different** signatures and roles.

## 5. Architecture (data flow)

```text
User action (UI / API)
  → scoped policy check
  → Zerion execution adapter (forked CLI or bundled devnet reference script)
  → Solana devnet execution transaction
  → tx_hash
  → AProof event ingestion
  → seven-angle deterministic proof
  → Solana devnet anchor (proof batch / memo commitment)
  → explorer verification
```

Executor contract (argv + JSON): [`APROOF/docs/zerion-agent-contract.md`](APROOF/docs/zerion-agent-contract.md).  
Local hardwire guide: [`APROOF/docs/hardwire-local-zerion-agent.md`](APROOF/docs/hardwire-local-zerion-agent.md).  
Bundled reference executor (Solana transfer, same CLI shape as Zerion): `APROOF/scripts/aproof-agent-devnet-execute.mjs`.

## 6. Wallet separation

| Role | Typical env | Purpose |
|------|-------------|--------|
| **Execution** | `ZERION_AGENT_WALLET_ADDRESS` (+ `ZERION_AGENT_KEYPAIR_PATH` for the local executor) | Signs **execution** devnet txs via the Zerion adapter. |
| **Continuity recipient** | `ZERION_CONTINUITY_RECIPIENT_ADDRESS` | Stable recipient for the continuity scenario. |
| **Anchor** | `SOLANA_KEYPAIR_PATH` | Signs **anchor** txs that commit AProof proof digests / batch roots. |

**Execution** transactions and **proof anchor** transactions are intentionally **separate**: different purposes, different signatures, both visible on devnet explorers.

## 7. Local setup

From the **repository root**:

```bash
npm install
cd APROOF
cp .env.example .env
# Edit .env — see section 8 (never commit real values).
npm run zerion:wallet:generate
npm run devnet:wallet:bootstrap
npm run zerion:readiness
cd ..
npm run dev:stack:skip-smoke
```

Then open the printed app URL (Vite on **5273** with API proxy). Optional: `npm run dev:check`.

Detail: [`docs/QUICKSTART.md`](docs/QUICKSTART.md).

## 8. Required env (placeholders only)

Set real values in **`APROOF/.env`** (gitignored). The committed templates are safe:

- [`APROOF/.env.example`](APROOF/.env.example) — **empty** secrets, documented keys.
- [`APROOF/.env.demo.example`](APROOF/.env.demo.example) — **fake** `replace_me` shape for orientation only.

Keys you must understand:

`ZERION_API_KEY`, `ZERION_CLI_PATH`, `ZERION_AGENT_WALLET_ADDRESS`, `ZERION_AGENT_KEYPAIR_PATH`, `ZERION_AUTHORIZED_RECIPIENT_ADDRESS`, `ZERION_CONTINUITY_RECIPIENT_ADDRESS`, `ZERION_ALLOWED_CHAIN`, `ZERION_MAX_SPEND_USD`, `ZERION_APPROVED_ASSETS`, `SOLANA_RPC_URL`, `SOLANA_KEYPAIR_PATH`, `ANCHOR_MODE`, `APROOF_ENV`, `SOLANA_MIN_BALANCE_LAMPORTS`.

## 9. Security note

Never commit `.env`, `.local/`, private key material, keypair JSON, PEM files, or real API keys. Use `npm run repo:safety-check` in a git checkout to fail fast on accidental tracking.

## 10. Verification

```bash
npm run verify
npm run repo:safety-check
```

```bash
cd APROOF
npm run verify:all
```

## Repo layout

- **`APROOF/`** — backend proof engine, Zerion execution adapter, Solana anchor logic, scripts.
- **`frontend/`** — Vite/React dashboard, Zerion Agent UI, proof summary UI.
- **`docs/`** — demo script, quickstart, top-level pointers.
- **`APROOF/docs/`** — integration, Zerion contract, environment hardening, Solana checklist.

## Presenter script

See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

## Contributing / security / license

- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`SECURITY.md`](SECURITY.md)
- [`LICENSE`](LICENSE) (MIT)

## Further reading (deep dives)

- Ports, proxy: `APROOF/docs/INTEGRATION.md`
- PGlite: `APROOF/docs/DEV-DB-RESET.md`
- Sandbox: `docs/README.md`, `APROOF/docs/README.md`
- Deployment (non-local): `docs/DEPLOYMENT.md`
- Environment hygiene: `APROOF/docs/environment-hardening.md`
