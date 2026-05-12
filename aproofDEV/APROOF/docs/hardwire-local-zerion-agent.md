# Hardwire the local Zerion Agent into AProof (Zerion Frontier demo)

This document describes how to point AProof at a **forked** [zerion-ai](https://github.com/zeriontech/zerion-ai) (or compatible) CLI entry script so the **Zerion Agent** subject (`external_key` / logical key `zerion-agent`) can execute **real Solana devnet** transactions and return a **real** `tx_hash` to AProof for canonicalization, seven-angle proof, and devnet anchoring.

## Architecture roles

| Layer | Owner | Responsibility |
|--------|--------|----------------|
| Governance / policy / proof / anchor | **AProof** | Scoped policy gate, deterministic evaluation, proof digest, failure localization, Solana devnet anchor (uses `SOLANA_KEYPAIR_PATH` wallet). |
| Execution / wallet / tx | **Zerion Agent** | Forked Zerion CLI + API route; spends from `ZERION_AGENT_WALLET_ADDRESS`. |

AProof is **not** the execution wallet. The agent wallet executes; the anchor wallet anchors proof batches (they may differ unless you deliberately reuse the same keypair).

## Required local CLI contract

AProof invokes:

```bash
node <ZERION_CLI_PATH> \
  --chain solana-devnet \
  --asset SOL \
  --amount-usd 1 \
  --wallet <ZERION_AGENT_WALLET_ADDRESS> \
  --mode execute \
  --json
```

- `ZERION_API_KEY` must be read from the environment inside the script (never printed).
- Output must be **JSON only** on success (first structured line may be the JSON object).
- Never print private keys or API key values.

**Success shape (example):**

```json
{
  "ok": true,
  "tx_hash": "REAL_SOLANA_DEVNET_SIGNATURE",
  "chain": "solana-devnet",
  "asset": "SOL",
  "amount_usd": 1,
  "wallet_address": "...",
  "execution_source": "zerion_cli"
}
```

**Failure shape:**

```json
{
  "ok": false,
  "runtime_error": "ZERION_CLI_EXECUTION_FAILED"
}
```

Accepted hash keys in JSON: `tx_hash`, `txHash`, `signature`, `transactionSignature`, `transaction_hash` (see `zerion-execution-adapter.ts`).

**Allowed `runtime_error` strings** surfaced through the adapter:  
`ZERION_INTEGRATION_NOT_READY`, `ZERION_CLI_PATH_INVALID`, `ZERION_CLI_EXECUTION_FAILED`, `ZERION_TX_HASH_MISSING`, `ZERION_CLI_TIMEOUT`, `ZERION_CLI_INVALID_OUTPUT`, `ZERION_POLICY_BLOCKED`.

---

## STEP 0 — Do you have a local `zerion-ai` fork?

If **`../zerion-ai`** (or your chosen clone path) **does not exist** yet:

1. Fork [zeriontech/zerion-ai](https://github.com/zeriontech/zerion-ai) on GitHub.
2. Clone your fork next to AProof, for example:
   ```bash
   cd ..
   git clone https://github.com/<your-user>/zerion-ai.git
   ```
3. Continue with STEP 1–2 inside that repo.

**You must not vendor a fake full Zerion fork inside the AProof repo.** Use either your clone or the AProof-built reference executor below.

### Option B — Real `tx_hash` without a Zerion fork (Solana-only reference)

AProof ships **`APROOF/scripts/aproof-agent-devnet-execute.mjs`**, a tiny **Solana devnet transfer** that matches the same argv/JSON contract as the Zerion CLI adapter (for Frontier demos where the Zerion trade API is not wired yet).

- Set `ZERION_CLI_PATH` to the absolute path of that file.
- Set **`ZERION_AGENT_KEYPAIR_PATH`** to a **gitignored** keypair JSON whose public key equals **`ZERION_AGENT_WALLET_ADDRESS`**.
- Fund that execution wallet with devnet SOL.
- `ZERION_API_KEY` must still be **set** (presence gate); it is **never printed** by the script.

## STEP 1 — Fork Zerion CLI (Option A)

```bash
git clone https://github.com/<your-user>/zerion-ai.git
```

Work in your fork so you can add `aproof-agent-execute.mjs` (or equivalent) without blocking upstream.

## STEP 2 — Add a local execution script (fork) or use Option B

Example path in the fork:

`zerion-ai/scripts/aproof-agent-execute.mjs`

You can **copy** the logic from `APROOF/scripts/aproof-agent-devnet-execute.mjs` as a starting point, then replace the transfer with your Zerion SDK/API call while keeping the same argv and stdout JSON contract.

The script must:

- Parse argv: `--chain`, `--asset`, `--amount-usd`, `--wallet`, `--mode execute`, `--json`.
- Use `process.env.ZERION_API_KEY` (never log it).
- Call your Zerion CLI/API route and perform a **real Solana devnet** action.
- Print **one JSON object** to stdout for `--json` mode.

## STEP 3 — Script requirements (checklist)

- [ ] Uses `ZERION_API_KEY` from env.
- [ ] Executes through the Zerion stack you control in the fork.
- [ ] JSON-only stdout on success/failure contract above.
- [ ] Returns a **real** devnet signature string (never fabricate).

## STEP 4 — Hardwire paths into AProof `.env`

```env
ZERION_CLI_PATH=<repo>/path/to/zerion-ai/scripts/aproof-agent-execute.mjs
ZERION_API_KEY=<zerion_api_key>
ZERION_AGENT_WALLET_ADDRESS=<agent_wallet>

ZERION_ALLOWED_CHAIN=solana-devnet
ZERION_MAX_SPEND_USD=5
ZERION_APPROVED_ASSETS=SOL,USDC

ANCHOR_MODE=solana-devnet
APROOF_ENV=solana-devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_KEYPAIR_PATH=<repo>/APROOF/.local/solana-devnet-keypair.json
```

Use absolute paths on your machine if required; avoid committing personal paths — keep them in **local** `.env` only.

## STEP 5 — Fund wallets

| Wallet | Env | Role |
|--------|-----|------|
| Execution | `ZERION_AGENT_WALLET_ADDRESS` | Pays devnet fees for agent-driven txs. |
| Anchor | `SOLANA_KEYPAIR_PATH` | Signs Solana transactions that anchor AProof proof digests. |

They may be the same public key only if you **explicitly** configure that; default mental model keeps them separate.

## STEP 6 — Bootstrap / faucet (anchor keypair)

Run:

```bash
node APROOF/scripts/bootstrap-devnet-wallet.mjs
```

Behavior:

- Creates or reuses `.local/solana-devnet-keypair.json` (repo `.gitignore` covers `.local/`).
- Prints **public address only** — never private key material.
- Uses `SOLANA_RPC_URL` to read balance and request devnet airdrops when low, with backoff on 429.

If the faucet fails:

> Airdrop failed or rate-limited. Fund this public address manually with devnet SOL, then rerun readiness.

Public RPC endpoints may rate-limit; prefer a dedicated devnet RPC when demoing.

## STEP 7 — Restart stack

```bash
npm run stop:stack
npm run dev:stack -- --skip-devnet-smoke
```

## STEP 8 — Verify readiness (Settings / Zerion Agent tab)

Expect booleans:

- `execution_ready`
- `anchor_ready`
- `anchor_balance_ready`
- `integration_ready`

Readiness distinguishes **agent execution wallet** (`ZERION_AGENT_WALLET_ADDRESS` → `agent_wallet_public_address`) from **anchor wallet** (`SOLANA_KEYPAIR_PATH` → `wallet_public_address`, balances). Never expose API keys, keypair JSON, or private keys in HTTP responses.

## STEP 9 — Run Authorized Execution (demo)

From the demo controls, **Authorized Execution** should yield:

- Real `tx_hash` on the canonical event (`payload.zerion.tx_hash`).
- `proof_digest` and anchored metadata on the proof read path.
- `anchor_signature` / `explorer_url` when anchoring succeeds.

---

## Three demo scenarios (same subject: `zerion-agent`)

1. **Authorized Execution** — Policy + readiness pass → `runZerionCliExecution` → real devnet tx → proof + anchor.
2. **Blocked Execution** — Spend above `ZERION_MAX_SPEND_USD` → `POLICY_SPEND_LIMIT_EXCEEDED` → **no** CLI invocation, **no** wallet spend.
3. **Execution Continuity** — Same lineage, `event_version` increments; history remains traceable; **never** fabricate `tx_hash`.

---

## HTTP: Zerion Agent summary

`GET /subjects/:id/zerion-agent-summary` returns a non-secret JSON summary including `transactions: []` when empty. It accepts **session cookie** or **`x-api-key`** (same style as proof reads). Only unknown / out-of-scope subjects return **404**.

See also:

- [`docs/zerion-agent-contract.md`](./zerion-agent-contract.md)
- [`docs/environment-hardening.md`](./environment-hardening.md) — load order, secret hygiene, required env.
- [`docs/zerion-agent-live-demo.md`](./zerion-agent-live-demo.md) — judge script, troubleshooting, UI pre-run flow.
- Inline notes in `src/zerion/zerion-execution-adapter.ts`.
