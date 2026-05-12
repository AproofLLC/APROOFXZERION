# Solana Devnet Demo Checklist

## Environment

Set in `APROOF/.env`:

- `ANCHOR_MODE=solana-devnet`
- `SOLANA_RPC_URL=https://api.devnet.solana.com`
- `SOLANA_CLUSTER=devnet`
- `SOLANA_KEYPAIR_PATH=.local/solana/anchor-devnet.json`
- `SOLANA_EXPLORER_BASE_URL=https://explorer.solana.com`
- `SOLANA_AUTOCREATE_DEVNET_WALLET=true`
- `SOLANA_AUTO_AIRDROP_DEVNET=true`
- `SOLANA_MIN_BALANCE_LAMPORTS=10000000`

## Fund Wallet (no Solana CLI required)

```bash
cd APROOF
npm run solana:devnet:wallet:init
npm run solana:devnet:wallet:balance
```

If balance is below `SOLANA_MIN_BALANCE_LAMPORTS` and `SOLANA_AUTO_AIRDROP_DEVNET=true`, the backend requests devnet airdrop automatically via RPC.

## Run Services

```bash
cd ..
npm run dev:stack:devnet
```

`dev:stack:devnet` runs a Devnet preflight smoke. If Devnet anchoring is not ready, startup fails fast.

Open: `http://127.0.0.1:5273/app/proofs`

## Reviewer Flow

1. Create/use sandbox subject.
2. Submit event.
3. Confirm UI shows:
   - In **A. Summary**: appended `Verification` block with `status` (`valid` / `invalid` / `not_anchored` / `error`)
   - In **A. Summary**: status-specific result line and optional `View Anchor ->` link
   - In **G. Anchor metadata**: Solana fields (`root_hash`, `tx_signature`, `explorer_url`, `wallet_public_key`, `confirmation_status`, `proof_count`, `proof_ids` when available)
4. Click explorer URL and verify real Devnet transaction.

## Security

- Never commit `.env`, keypairs, or wallet files.
- Private keys must never appear in logs or UI.
- Use dedicated devnet wallet for Aproof anchor transactions only.
