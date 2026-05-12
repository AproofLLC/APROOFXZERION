# Zerion Agent live demo (judge script)

Single active subject: **Zerion Agent** (`zerion-agent`). This path assumes [environment hardening](./environment-hardening.md) and [hardwire-local-zerion-agent.md](./hardwire-local-zerion-agent.md) are satisfied.

## A. What the demo proves

1. **Zerion Agent** executes a **real Solana devnet** transaction (via forked CLI contract or `scripts/aproof-agent-devnet-execute.mjs`).
2. **AProof** evaluates the action through **scoped policy** and the **seven deterministic integrity** angles.
3. AProof **generates a proof** and **anchors** it to Solana devnet (`SOLANA_KEYPAIR_PATH`).
4. The **Zerion Agent** tab shows **`tx_hash`**, **`proof_digest`**, **`anchor_signature`**, and **`explorer_url`** on successful **Authorized Execution**.

## B. Wallet separation

| Wallet | Environment | Signs |
|--------|-------------|--------|
| Execution | `ZERION_AGENT_WALLET_ADDRESS` | Agent devnet transaction from the CLI executor. |
| Anchor | `SOLANA_KEYPAIR_PATH` | AProof anchor transaction. |

Recommend **different** keypairs unless you deliberately reuse one.

## C. Required env

See [`.env.example`](../.env.example) and [environment-hardening.md](./environment-hardening.md). **Do not** paste real secrets into docs or commits.

## D. Local executor (`aproof-agent-devnet-execute.mjs`)

- Current **working** local devnet executor shipped in this repo.
- Same **argv** and **stdout JSON** contract as a forked Zerion CLI (swap later for a true **zerion-ai** route).
- **Success:** one JSON line on **stdout** with `ok: true` and `tx_hash` (real signature).
- **Failure:** one JSON line on **stdout** with `ok: false` and a safe `message`; diagnostics belong on **stderr** only.

## E. Scenario flow (unchanged semantics)

| Scenario | Flow |
|----------|------|
| **Authorized Execution** | Policy pass → CLI invoked → `tx_hash` → proof → anchor. |
| **Blocked Execution** | Policy violation → **CLI not invoked** → no `tx_hash` → failure proof. |
| **Execution Continuity** | Same agent lineage → `event_version` increments → traceable history. |

## F. Judge demo script (concise)

1. Open the **Zerion Agent** tab on `/app/proofs`.
2. Confirm readiness: **`execution_ready`**, **`anchor_ready`**, **`anchor_balance_ready`**, **`integration_ready`** are **true** (and `what_is_working` / `what_is_next` read sensibly).
3. Run **Authorized Execution**.
4. Confirm **`tx_hash`** on the latest row (≥32 chars).
5. Confirm **`proof_digest`**.
6. Confirm **`anchor_signature`** and **Solana explorer** link.
7. Run **Blocked Execution** — policy blocked **before** CLI (`cli_invoked` false).
8. Run **Execution Continuity** — same lineage, version increments.

**Pre-run UI:** When integration is green and **no** Zerion-scoped rows exist yet, the deterministic flow shows **ready / pending** (not “Forked Zerion CLI — failed”).

## G. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `integration_ready=false` | Missing env, CLI path, keypair files, or RPC; read `integration_readiness_blocker` and `missing` / `what_is_next`. |
| `ZERION_INTEGRATION_NOT_READY` (overview) | Same as above from the product shell’s operational angle. |
| `ZERION_CLI_EXECUTION_FAILED` | Executor stderr / safe `message` in JSON; RPC, keypair path, wallet match, rent/fee balance. |
| `ZERION_TX_HASH_MISSING` | Adapter could not parse a signature from CLI stdout; stdout must be valid JSON (first structured line). |
| `anchor_balance_ready=false` | Fund anchor wallet; faucet rate limits on public RPC. |
| Windows paths | Use absolute paths or normalize escaping in `.env`. |
| Executor contract | **JSON only** on stdout for `--json` mode. |
