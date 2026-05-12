# Environment hardening (Zerion Agent + AProof devnet)

This note complements [hardwire-local-zerion-agent.md](./hardwire-local-zerion-agent.md) and [zerion-agent-live-demo.md](./zerion-agent-live-demo.md).

## Env load order

1. **`APROOF/.env`** at the package root is loaded first (`src/config/load-aproof-env.ts`, imported from `src/main.ts`).
2. If **`process.cwd()`** is not the AProof package root, **`cwd/.env`** is applied second with **override**, so local overlays work when running tools from another directory.

Standalone Node scripts that must see the same variables (for example `scripts/aproof-agent-devnet-execute.mjs`) also load **`APROOF/.env`** from the resolved package root so a child process is not silently missing `ZERION_AGENT_KEYPAIR_PATH` or `SOLANA_RPC_URL`.

## Secret hygiene (never in logs or HTTP)

- Do **not** print **`ZERION_API_KEY`** values, keypair JSON, `secretKey` arrays, or private PEM text.
- Readiness and **`GET /subjects/:id/zerion-agent-summary`** expose **public addresses**, booleans, and **presence** flags (e.g. `zerion_api_key_present`), not secret material.
- Keep keypairs under **`.local/`** (gitignored). Never commit `.env` or `*.keypair.json`.

## Required variables (live devnet demo)

| Variable | Role |
|----------|------|
| `ZERION_API_KEY` | Presence gate for CLI / integration (value never logged). |
| `ZERION_CLI_PATH` | Forked Zerion entry or `scripts/aproof-agent-devnet-execute.mjs`. |
| `ZERION_AGENT_WALLET_ADDRESS` | Execution wallet pubkey. |
| `ZERION_AGENT_KEYPAIR_PATH` | Signing keypair file for the executor (matches agent wallet). |
| `ZERION_ALLOWED_CHAIN` | Default `solana-devnet`. |
| `ZERION_MAX_SPEND_USD` | Default `5`. |
| `ZERION_APPROVED_ASSETS` | Default `SOL,USDC`. |
| `SOLANA_RPC_URL` | Devnet RPC for balances and txs. |
| `SOLANA_KEYPAIR_PATH` | **Anchor** wallet (AProof proof anchoring), not the Zerion spend wallet. |
| `ANCHOR_MODE` / `APROOF_ENV` | `solana-devnet` for live anchor path. |
| `SOLANA_MIN_BALANCE_LAMPORTS` | Anchor balance gate (default `10000000`). |

## Wallet separation

- **Execution:** `ZERION_AGENT_WALLET_ADDRESS` (+ `ZERION_AGENT_KEYPAIR_PATH`) — pays agent devnet transactions.
- **Anchor:** `SOLANA_KEYPAIR_PATH` — signs AProof’s anchor transactions.

They may coincide only if you **intentionally** configure the same keypair; the recommended demo layout keeps them **separate** so spend and anchor roles stay clear.

## Windows and paths

Absolute Windows paths are supported for `ZERION_CLI_PATH` and keypair paths. Repo-relative paths (e.g. `./scripts/aproof-agent-devnet-execute.mjs`) resolve from the AProof package root where applicable.

## Devnet as default demo mode

Local interactive demos assume **Solana devnet** when `ANCHOR_MODE` / `APROOF_ENV` are set accordingly; Vitest defaults to mock anchoring unless `E2E_USE_SOLANA_DEVNET=true` (see `vitest-setup-env.ts`).
