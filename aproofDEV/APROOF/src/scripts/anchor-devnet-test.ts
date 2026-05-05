import "dotenv/config";
import { resolveSolanaDevnetConfig, submitSolanaDevnetMemo } from "../anchor/solana-devnet-anchor.js";

async function main() {
  const config = resolveSolanaDevnetConfig(process.env);
  const rootHash = `manual-${Date.now().toString(16)}`;
  const proofCount = 1;
  const createdAtIso = new Date().toISOString();
  const result = await submitSolanaDevnetMemo({
    config,
    rootHash,
    proofCount,
    createdAtIso,
  });
  console.log(`wallet_public_key=${result.wallet_public_key}`);
  console.log(`tx_signature=${result.tx_signature}`);
  console.log(`explorer_url=${result.explorer_url}`);
  console.log(`confirmation_status=${result.confirmation_status}`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(msg);
  process.exit(1);
});
