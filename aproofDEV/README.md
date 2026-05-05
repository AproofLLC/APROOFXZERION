# Aproof

**Aproof** is a proof-engine workspace: ingest events, evaluate integrity across seven angles, and surface proofs, failures, and lineage through a real API and a React dashboard.

## What lives where

| Path | Role |
|------|------|
| **`APROOF/`** | Backend Fastify API, proof pipeline, ingest, PGlite/Postgres, Vitest tests |
| **`frontend/`** | Vite + React UI (proofs dashboard, sandbox, session auth) |
| **`docs/`** | Top-level docs and archived reports |
| **`scripts/`** | Shared tooling; **`scripts/live-ps1/`** powers `npm run test:live` (PowerShell) |

Backend-focused docs also live under **`APROOF/docs/`**.

## Sandbox (short)

The **Sandbox** in the UI provisions a real testnet org and session (same routes and proof pipeline as production). Optional **demo scenarios** seed deterministic data through the same ingest path as production (`POST /events`). See **`docs/README.md`**.

## Demo Mode (guided workspace)

From the welcome screen, **Start Demo** signs you into a sandbox session and opens **`/app/proofs`**. In demo mode you get:

- **Demo controls** (clean proof, failure, version update, reset) that call the same sandbox reset API as automated harnesses.
- **Latest proof strip** at the top of the workspace: shows engine outcome vocabulary (**conformant / violated / flagged / unverifiable / pending**) and a **last action** line derived from the overview snapshot after each scenario—not from button labels.
- **Baselines** tab is read-only and groups **active-by-default** angles (per rail) vs **optional** angles, with copy tied to real baseline state and rail defaults (`frontend/src/constants/rail-auto-enabled.ts`, aligned with `APROOF/src/baselines/angle-control.ts`).

Use **`npm run verify`** (root) before sharing the repo; use **`npm run dev:stack`** when you want the full Vite + API stack for manual demo review.

### Devnet-only secure stack profile

This repository now enforces a Devnet-only startup profile for demo stack runs:

- `npm run dev:stack` (or `npm run dev:stack:devnet`) always:
  - stops existing listeners
  - enforces `ANCHOR_MODE=solana-devnet`
  - enforces `SOLANA_CLUSTER=devnet`
  - enforces `APROOF_REQUIRE_DEVNET_FOR_DEMO=1`
  - runs `anchor:devnet:smoke` preflight
  - starts backend + frontend only if preflight succeeds
  - runs under a supervised stack wrapper that auto-restarts the stack up to 3 times if the API process exits unexpectedly

Always run `npm run dev:check` after startup.

Sandbox demo routes now enforce Devnet by default (`APROOF_REQUIRE_DEVNET_FOR_DEMO=1` unless explicitly overridden). If devnet mode/config is missing, `/sandbox/session` and `/sandbox/reset` return `DEMO_REQUIRES_DEVNET` instead of silently running mock anchors.

## Run the backend

```bash
cd APROOF
npm install
npm run dev
```

Default local DB is **PGlite** (file-backed under `APROOF/data/` when you run dev). Copy **`APROOF/.env.example`** to **`APROOF/.env`** for local overrides — that file is **gitignored** and must stay **untracked**. **`npm run release:preflight`** only fails if a `.env` / `.env.*` file (other than `.env.example`) is **committed**; untracked local env files are expected.

### Solana Devnet Anchoring (optional)

Sandbox subjects/events stay sandbox/testnet demo data, but proof batch commitments can be written to real Solana Devnet when enabled.

- Required env vars (in `APROOF/.env`, never committed):
  - `ANCHOR_MODE=solana-devnet`
  - `SOLANA_RPC_URL=https://api.devnet.solana.com`
  - `SOLANA_CLUSTER=devnet`
  - `SOLANA_KEYPAIR_PATH=/secure/path/anchor-devnet.json`
  - `SOLANA_EXPLORER_BASE_URL=https://explorer.solana.com`
- If `ANCHOR_MODE` is missing, backend preserves sandbox/mock anchoring behavior.
- If `ANCHOR_MODE=solana-devnet` and config is invalid, anchoring fails with deterministic `SOLANA_CONFIG_INVALID` / `SOLANA_ANCHOR_FAILED` messages.
- Never commit keypairs; private key material is never stored in DB/API/UI.
- Wallet note template: `docs/SOLANA_DEVNET_WALLET_NOTE_TEMPLATE.md`.

Useful commands:

```bash
cd APROOF
npm run solana:devnet:wallet:init
npm run solana:devnet:wallet:balance
npm run anchor:devnet:test
npm run anchor:devnet:smoke
```

### Self-contained Solana Devnet demo without Solana CLI

- The backend can create a devnet wallet locally with `@solana/web3.js`.
- Default wallet path is `APROOF/.local/solana/anchor-devnet.json` when `SOLANA_AUTOCREATE_DEVNET_WALLET=true`.
- The wallet file is gitignored and should remain local-only.
- Devnet SOL is requested through RPC (`requestAirdrop`) when balance is below `SOLANA_MIN_BALANCE_LAMPORTS` and `SOLANA_AUTO_AIRDROP_DEVNET=true`.
- No real funds are used; this is devnet-only behavior and rejected for non-devnet clusters.
- Proof batches still anchor to real Solana Devnet transactions and expose real `tx_signature` and `explorer_url`.

Explorer verification:

- Open `https://explorer.solana.com/tx/<TX_SIGNATURE>?cluster=devnet`

### How Aproof Uses Solana

- Aproof does not write raw customer/user payloads on-chain.
- Aproof canonicalizes proof outputs and computes deterministic proof digests.
- Digests are batched into a deterministic `root_hash`.
- Only the batch commitment is anchored to Solana Devnet via Memo transaction.
- Backend stores `tx_signature`, `explorer_url`, and anchor metadata.
- UI links `Proof -> Batch Root -> Solana Transaction` for reviewer verification.
- This provides verifiable existence/integrity with a timestamped external attestation trail.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **`http://127.0.0.1:5173/`** and use **`/app/proofs`**. **Local development always uses the Vite dev server and its proxy** — the browser should load **`http://127.0.0.1:5173`** only; **do not** test the app by opening the raw API URL in the browser (that bypasses the proxy and invites CORS confusion). With `VITE_API_BASE_URL` unset, API paths are root-relative (for example `/proofs`, `/subjects`, `/health`) and Vite forwards them to **`VITE_API_PROXY_TARGET`**, or **`http://127.0.0.1:<APROOF_PORT or 3000>`** (`frontend/vite.config.ts` does **not** use shell **`PORT`** for the proxy target). **`strictPort: true`** keeps the UI on **5173** so HMR matches the page origin. Set **`VITE_API_BASE_URL`** only for a non-default API origin (e.g. staging).

## Interactive testing (manual — official workflow)

Use this for **manual** sandbox/UI checks. **Automated verification** (`npm run verify` from the repo root, `npm run test:live`, CI) is a **separate mode** from this interactive stack: automation does not require the Vite + proxy workflow below.

**From the repository root** (install root deps once: `npm install`):

1. **`npm run stop:stack`** — free dev ports (optional clean slate).
2. **`npm run dev:stack`** — starts the **backend** (default **`:3000`**, or **`PORT`/`APROOF_PORT`** if set), then the **Vite** dev server (`:5173`), then waits until **Backend**, **Frontend**, and **Proxy** (`/health` through Vite) are all healthy. Only then prints **App ready at** (see terminal output).
3. Wait until you see **App ready at: `http://127.0.0.1:5173/app/proofs`** — do not treat the stack as ready before that line.
4. **Optional:** **`npm run dev:check`** in another terminal — same checks as startup: backend `/health` on the **resolved API port**, Vite on **:5173**, then **`/health` plus route guardrails through the proxy** (`GET /auth/session`, user-log routes, `POST /sandbox/session` probe). If an old API process is still running **without** newly added routes, the **Proxy** step fails with a clear “stale backend / restart from current source” message (Fastify **404** “Route … not found” behind the proxy). **Fix:** **`npm run stop:stack`**, start again from current source, **`npm run dev:check`**. **`npm run dev:user-log-routes`** runs only the proxy route probes (expects Vite + API already up).
5. Open **`http://127.0.0.1:5173/app/proofs`**.
6. Test sandbox or signed-in flow.
7. **`npm run stop:stack`** when finished (or **Ctrl+C** in the `dev:stack` terminal).

If the API or proxy is down, the dev UI shows a **top banner** and **Enter Sandbox** stays disabled until `/health` succeeds through the same path as the rest of the app (relative URLs → Vite proxy when `VITE_API_BASE_URL` is unset).

## Verification

**One-shot (repo root):** backend `verify:all`, frontend typecheck + Vitest + build, sandbox template parity:

```bash
npm run verify
```

**Backend (full) only:** from **`APROOF/`**:

```bash
npm run verify:all
```

Runs typecheck, build, unit tests, e2e tests, and stress inject.

**Frontend:** from **`frontend/`** — `npm run typecheck`, `npm run test` (Vitest), `npm run build`.

**CI:** push/PR to `main` / `master` runs `.github/workflows/ci.yml` (backend `verify:all`, frontend typecheck + test + build, sandbox template parity script).

**Live harness (PowerShell, requires `npm run dev:live` in `APROOF/` on :3101):** from **`APROOF/`**:

```bash
npm run test:live
```

**Full harness (repo-root orchestrator):** from repository root, runs fresh PGlite + API `:3000` + live PS1 suite + e2e + stress (and optional Vite proxy checks):

```bash
npm run harness:full
```

`test:live` and `harness:full` are different workflows and use different API ports by default (`:3101` vs `:3000`).

### Proof Detail verification display

In the UI (`/app/proofs` -> open a proof -> **A. Summary**), verification runs automatically per selected proof via `GET /proofs/:proofId/verification`. The summary now appends:

- `Verification`
- `status` (`loading`, `valid`, `invalid`, `not_anchored`, `error`)
- result copy (`Verified against anchored root`, `Mismatch with anchored root`, `No anchor found`, or `Verification error`)
- optional `View Anchor ->` link when `explorer_url` is present

## Deployment (production)

See **`docs/DEPLOYMENT.md`** and optional **`docker-compose.yml`** (example: nginx + SPA + API). This is **not** the local `dev:stack` workflow.

## Official clean release (source-only bundle)

Use this when sharing **reviewer / investor / grant** drops — **not** a zip of your whole machine.

**From the repository root** (not inside `APROOF/`):

```bash
npm run release:preflight
npm run release
```

Or one step:

```bash
npm run release:pack
```

- **`release:preflight`** — fails if **git-tracked** `.env` / `.env.*` files (other than `.env.example`) appear under bundle paths. Local untracked `.env` files do **not** fail (normal development).
- **`release`** — requires a **git checkout**; writes a **source-only** tree to **`tmp/release-bundle/aproof-project/`** (copy excludes `node_modules`, `dist`, secrets, etc., by filter).

**APROOF-only** bundle (subset, same hygiene rules): from **`APROOF/`** use `npm run release:preflight` and `npm run package:clean` / `npm run release:bundle`.

## More detail

- UI ↔ API: `docs/reports/INTEGRATION-REPORT.md`
- Ports, proxy: `APROOF/docs/INTEGRATION.md`
- PGlite reset: `APROOF/docs/DEV-DB-RESET.md`
- Production / ops: `docs/DEPLOYMENT.md`
