# Quickstart — AProof × Zerion (Solana devnet)

Judge- and developer-friendly steps to clone, configure, fund wallets, and run the demo stack.

## 0. Public demo safety

This demo uses **Solana devnet**. Do not use production private keys or reuse funded mainnet wallets. Keypairs created by the tooling live under `APROOF/.local/` and are ignored by git.

## 1. Clone and install

```bash
git clone <your-fork-or-upstream-url> aproof-zerion-demo
cd aproof-zerion-demo
npm install
cd APROOF && npm install && cd ..
cd frontend && npm install && cd ..
```

## 2. Environment

```bash
cd APROOF
cp .env.example .env
```

Edit `APROOF/.env`:

- Set `ZERION_API_KEY` (your Zerion API key — never commit the value).
- Set `ZERION_CLI_PATH` to your forked Zerion executor or to `APROOF/scripts/aproof-agent-devnet-execute.mjs` (see [`APROOF/docs/hardwire-local-zerion-agent.md`](../APROOF/docs/hardwire-local-zerion-agent.md)).
- Set `ZERION_AGENT_WALLET_ADDRESS` after generating the agent wallet (next step).
- Set `ZERION_AGENT_KEYPAIR_PATH` to the gitignored keypair path printed by the wallet generator.
- Set `SOLANA_KEYPAIR_PATH` for the **anchor** wallet (separate from execution).

Optional: see `.env.demo.example` for **fake** placeholder shape only.

## 3. Generate devnet wallets

From `APROOF/`:

```bash
npm run zerion:wallet:generate
```

Note the printed **public** address; put it in `ZERION_AGENT_WALLET_ADDRESS` and ensure `ZERION_AGENT_KEYPAIR_PATH` points at the generated file under `.local/`.

## 4. Fund wallets

- Fund **execution** (`ZERION_AGENT_WALLET_ADDRESS`) with devnet SOL (faucet or transfer).
- Bootstrap anchor key material:

```bash
npm run devnet:wallet:bootstrap
```

Align `SOLANA_KEYPAIR_PATH` in `.env` with the anchor keypair you use (often under `.local/solana/`).

## 5. Readiness

```bash
npm run zerion:readiness
```

Resolve any `integration_readiness_blocker` before demoing.

## 6. Start the stack

From the **repository root**:

```bash
npm run dev:stack:skip-smoke
```

Wait until the terminal reports the app URL (Vite + proxied API). Optionally run `npm run dev:check` in another shell.

## 7. Run the three scenarios

In the UI (`/app/proofs`), use the Zerion Agent / demo controls:

1. **Authorized Execution** — policy passes; executor runs; `tx_hash` and proof appear; anchor tx separate on explorer.
2. **Blocked Execution** — policy violation; executor **not** invoked; deterministic failure proof.
3. **Execution Continuity** — same sender/recipient lineage, **new** `tx_hash`, `event_version` increments, new proof and anchor.

## 8. Verify on explorers

- **Execution:** open the Solana devnet explorer using the execution transaction signature from the event (`tx_hash`).
- **Anchor:** open the anchor transaction from the proof / batch UI (`explorer_url` or `anchor_signature` flow documented in the main README).

## 9. Repo verification commands

From repository root:

```bash
npm run verify
npm run repo:safety-check
```

From `APROOF/`:

```bash
npm run verify:all
```

See also: [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) for presenter wording.
