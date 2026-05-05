import "dotenv/config";
import { loadOrCreateAnchorKeypair, resolveAnchorMode, resolveSolanaDevnetConfig } from "../anchor/solana-devnet-anchor.js";

async function main() {
  if (resolveAnchorMode(process.env) !== "solana-devnet") {
    throw new Error("ANCHOR_MODE_INVALID: requires ANCHOR_MODE=solana-devnet");
  }
  const config = resolveSolanaDevnetConfig(process.env);
  const kp = await loadOrCreateAnchorKeypair(config);
  console.log(`wallet_public_key=${kp.publicKey.toBase58()}`);
  console.log(`keypair_path=${config.keypairPathAbsolute}`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(msg);
  process.exit(1);
});
