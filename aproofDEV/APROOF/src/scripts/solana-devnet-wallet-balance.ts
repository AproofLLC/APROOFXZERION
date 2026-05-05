import "dotenv/config";
import { Connection } from "@solana/web3.js";
import {
  getWalletBalanceLamports,
  loadOrCreateAnchorKeypair,
  resolveAnchorMode,
  resolveSolanaDevnetConfig,
} from "../anchor/solana-devnet-anchor.js";

async function main() {
  if (resolveAnchorMode(process.env) !== "solana-devnet") {
    throw new Error("ANCHOR_MODE_INVALID: requires ANCHOR_MODE=solana-devnet");
  }
  const config = resolveSolanaDevnetConfig(process.env);
  const kp = await loadOrCreateAnchorKeypair(config);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const balance = await getWalletBalanceLamports(connection, kp);
  console.log(`wallet_public_key=${kp.publicKey.toBase58()}`);
  console.log(`balance_lamports=${balance}`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(msg);
  process.exit(1);
});
