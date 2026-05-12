#!/usr/bin/env node
/**
 * Dev-only Zerion CLI stand-in: prints JSON with a synthetic Solana-like signature.
 * Real deployments should point ZERION_CLI_PATH at the forked Zerion CLI instead.
 */
const argv = process.argv.slice(2);
function argAfter(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

if (!argv.includes("--json")) {
  console.error("zerion-cli-devnet-stub: --json required");
  process.exit(2);
}

const chain = argAfter("--chain") ?? "";
const amount = argAfter("--amount-usd") ?? "";
const asset = argAfter("--asset") ?? "";
/* Real CLI also receives --wallet and --mode execute; this stub ignores extra argv. */
// 88-char base58-ish token for parser (min length check in adapter)
const tx_hash = "StubZerionDevnetTx".padEnd(88, "X");

const wallet = argAfter("--wallet") ?? "";
const recipient = argAfter("--recipient");

console.log(
  JSON.stringify({
    tx_hash,
    chain,
    amount_usd: amount,
    asset,
    wallet_address: wallet || undefined,
    recipient_address: recipient && recipient.trim() ? recipient.trim() : undefined,
  }),
);
process.exit(0);
