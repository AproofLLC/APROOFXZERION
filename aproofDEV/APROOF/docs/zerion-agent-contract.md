# Zerion Agent — local execution contract (AProof integration)

This document defines how a **forked Zerion CLI / agent** must behave when invoked by AProof via **`ZERION_CLI_PATH`**. AProof is not Zerion: it governs policy, builds deterministic proofs, localizes failures, and anchors digests to Solana devnet.

## Repository expectation

- The executable at **`ZERION_CLI_PATH`** should be built from a fork of **[github.com/zeriontech/zerion-ai](https://github.com/zeriontech/zerion-ai)** (or a compatible agent entrypoint your fork documents).
- **Never** commit private keys, keypair JSON, or **`ZERION_API_KEY`** into the repo.

## Reference implementation in this repo

For demos without a full Zerion fork, this repository ships **`APROOF/scripts/aproof-agent-devnet-execute.mjs`**: a minimal Solana devnet transfer that honors the same argv and stdout JSON contract. Point `ZERION_CLI_PATH` at that file and set **`ZERION_AGENT_KEYPAIR_PATH`** to a gitignored keypair whose pubkey matches **`ZERION_AGENT_WALLET_ADDRESS`**.

## Invocation (argv)

AProof invokes the CLI with:

```text
--chain solana-devnet
--asset SOL
--amount-usd 1
--wallet <ZERION_AGENT_WALLET_ADDRESS>
--recipient <recipient_address>
--mode execute
--json
```

Authentication: **`ZERION_API_KEY`** is passed **only** in the child process environment (never logged or returned in API responses).

## stdout contract (single JSON object)

**stdout must be JSON only** (the first non-empty line is parsed). **stderr** may contain safe diagnostics; it must **not** leak secrets.

### Success

```json
{
  "ok": true,
  "tx_hash": "<solana_devnet_signature>",
  "wallet_address": "<same as argv --wallet>",
  "recipient_address": "<recipient used for the transfer>",
  "execution_source": "zerion_cli"
}
```

Omitted `recipient_address` may be inferred by the adapter from aliases (`recipientAddress`, `destination_address`, …); see `zerion-execution-adapter.ts`. Accepted aliases for the on-chain signature: `tx_hash`, `txHash`, `signature`, `transactionSignature`, `transaction_hash`.

### Failure

```json
{
  "ok": false,
  "runtime_error": "ZERION_CLI_EXECUTION_FAILED",
  "message": "safe reason"
}
```

`message` is optional but recommended: short, **non-secret** explanation for judges and logs. AProof maps it into safe readiness / failure surfaces.

## Local test stub

If **`ZERION_CLI_PATH`** points at **`zerion-cli-devnet-stub.mjs`**, AProof labels execution as **stub / local-test** (`execution_source: zerion_cli_stub`, `execution_simulated: true`). Judges should treat that path as **not** a forked Zerion production binary.

## Safety

- **Do not** print private keys, keypair bytes, or **`ZERION_API_KEY`** to stdout or stderr.
- **Do not** emit fabricated devnet signatures when operating in a judged “live” profile: use a real executor + funded devnet wallet.
