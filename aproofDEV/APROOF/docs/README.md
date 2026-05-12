# AProof documentation

## Start here (external-facing)

| Document | Audience | Contents |
|----------|----------|----------|
| [APROOF-OVERVIEW.md](./APROOF-OVERVIEW.md) | Anyone | What AProof is, the problem, proof pipeline, identity + hashes |
| [APROOF-ANGLES.md](./APROOF-ANGLES.md) | Product, engineering | Universal seven-angle proof surface in plain language |
| [APROOF-BASELINE-SCHEMAS.md](./APROOF-BASELINE-SCHEMAS.md) | Product, engineering, compliance | AProof-owned baseline schema inventory for all seven angles |
| [APROOF-BASELINE-TEMPLATES.md](./APROOF-BASELINE-TEMPLATES.md) | Onboarding, solutions | Universal template structure + practical templates |
| [APROOF-DISCLOSURE-AND-VIEWS.md](./APROOF-DISCLOSURE-AND-VIEWS.md) | Security, integrations | `internal` / `external` / `minimal` / `adversarial_safe` |
| [APROOF-API-OVERVIEW.md](./APROOF-API-OVERVIEW.md) | Integrators | HTTP API summary; full contract in [API-FREEZE.md](./API-FREEZE.md) |
| [INTEGRATION.md](./INTEGRATION.md) | Local dev + deploy | API-only backend (3040), Vite UI (5273), `/app/proofs` dashboard path |
| [DEV-DB-RESET.md](./DEV-DB-RESET.md) | Local dev | **`58P01`** / missing `base/...` = bad PGlite files; default dev is PGlite; recovery: `dev:db:reset` → `dev:verify:routes` → `dev` |
| [LOCAL-VERIFICATION-AND-STRESS.md](./LOCAL-VERIFICATION-AND-STRESS.md) | QA / ops | Boot order, `verify:package`, `verify:all`, `test:e2e`, `stress:inject`, `stress:api` |
| [VERIFICATION-REPORT.md](./VERIFICATION-REPORT.md) | QA / ops | Snapshot of last recorded pass (update when re-verifying) |
| [environment-hardening.md](./environment-hardening.md) | Dev / security | `.env` load order, secret hygiene, Zerion + Solana env checklist |
| [zerion-agent-live-demo.md](./zerion-agent-live-demo.md) | Demos / judges | Live devnet walkthrough, wallet separation, troubleshooting |
| [hardwire-local-zerion-agent.md](./hardwire-local-zerion-agent.md) | Integrators | Forked Zerion CLI contract + local executor option |
| [APROOF-COMMUNICATIONS.md](./APROOF-COMMUNICATIONS.md) | GTM, pilots | Positioning lines, onboarding, subjects, pilot & demo messaging |

## Protocol & implementation (strict / reference)

| Document | Role |
|----------|------|
| [API-FREEZE.md](./API-FREEZE.md) | Frozen HTTP contract |
| [hash-law.md](./hash-law.md) | Serialization + hash algorithms |
| [proof-semantics.md](./proof-semantics.md) | Proof outcomes and reason classes |
| [idempotency-lineage-behavior.md](./idempotency-lineage-behavior.md) | Dedupe, lineage, anomalies |
| [event-identity-lineage-spec.md](./event-identity-lineage-spec.md) | Identity and lineage field definitions |
| [protocol-consistency.md](./protocol-consistency.md) | Cross-cutting protocol notes |
| [release-packaging.md](./release-packaging.md) | Build / bundle expectations |

## Local end-to-end validation

Run **from the `APROOF` directory** (Windows PowerShell). This is the single supported local flow:

1. **Kill stale dev ports**  
   `npm run kill:ports`

2. **Start the live dev stack** (fresh PGlite at `data/live-test-run-fresh`, **PORT=3101**, migrate + seed + `npm run dev`)  
   `npm run dev:live`  
   Leave this terminal running.

3. **Check health** (second terminal, same machine)  
   `curl http://localhost:3101/health`  
   Expect: `{"status":"ok"}`

4. **Build**  
   `npm run build`

5. **Tests**  
   `npm run test`

6. **Live PowerShell harness** (expects server on **3101**; sets `APROOF_URL`, `PGLITE_DATA_DIR`, and `APROOF_PGLITE_DATA_DIR` to `data/live-test-run-fresh` so it matches `dev:live`)  
   `npm run test:live`

**Environment precedence (runtime)**

| Variable | Role |
|----------|------|
| `PORT` | Listen port (first choice) |
| `APROOF_PORT` | Listen port if `PORT` unset/empty |
| *(default)* | `3040` |
| `PGLITE_DATA_DIR` | PGlite data directory (first choice); same resolution as `getResolvedPgliteDataDirectory` in `src/db/pglite.ts` |
| `APROOF_PGLITE_DATA_DIR` | PGlite dir if `PGLITE_DATA_DIR` unset |
| *(default)* | `data/pglite` under current working directory (absolute-resolved at runtime) |

Startup logs print the effective port and PGlite directory with their source.

## Backend verification commands

Run from `APROOF`:

1. Install dependencies  
   `npm install`
2. Typecheck (no emit)  
   `npm run typecheck`
3. Unit and integration tests  
   `npm run test`
4. E2E suite (if needed)  
   `npm run test:e2e`

## Solana Devnet self-contained wallet commands

Run from `APROOF` with `ANCHOR_MODE=solana-devnet` and `SOLANA_CLUSTER=devnet`:

1. Initialize or create local devnet wallet (no Solana CLI required)  
   `npm run solana:devnet:wallet:init`
2. Check wallet balance over RPC  
   `npm run solana:devnet:wallet:balance`
3. Run full anchoring smoke through the app coordinator  
   `npm run anchor:devnet:smoke`

Notes:

- Default local wallet path when autocreate is enabled: `APROOF/.local/solana/anchor-devnet.json`.
- Wallet files remain local-only and are gitignored (`.local/`, `anchor-devnet.json`, `*.keypair.json`).
- Devnet auto-wallet + auto-airdrop behavior is only valid for `SOLANA_CLUSTER=devnet`.

## User Logs environment parity

`GET /subjects/:id/user-logs` now returns the same envelope shape for production and testnet/sandbox scopes:

- `subject_id`
- `environment` (`production`, `testnet`, or `sandbox`)
- `logs` (always an array)
- `pagination` (`limit`, `offset`, `next_cursor`)
- `empty_reason` (`no_logs_for_subject` when empty, otherwise `null`)

The endpoint keeps legacy compatibility fields (`items`, `next_cursor`) while canonical consumers should use `logs` + `pagination`.
