import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = readFileSync(join(__dirname, "..", ".env.example"), "utf8");

describe(".env.example (Zerion + Solana devnet)", () => {
  it("documents all required integration keys without real secret values", () => {
    for (const key of [
      "ZERION_API_KEY",
      "ZERION_CLI_PATH",
      "ZERION_AGENT_WALLET_ADDRESS",
      "ZERION_AGENT_KEYPAIR_PATH",
      "ZERION_AUTHORIZED_RECIPIENT_ADDRESS",
      "ZERION_CONTINUITY_RECIPIENT_ADDRESS",
      "ZERION_ALLOWED_CHAIN",
      "ZERION_MAX_SPEND_USD",
      "ZERION_APPROVED_ASSETS",
      "SOLANA_RPC_URL",
      "SOLANA_KEYPAIR_PATH",
      "ANCHOR_MODE",
      "APROOF_ENV",
      "SOLANA_MIN_BALANCE_LAMPORTS",
    ]) {
      expect(EXAMPLE).toContain(key);
    }
    expect(EXAMPLE).toMatch(/never commit|Never commit|gitignored/i);
    expect(EXAMPLE).not.toMatch(/sk_live_[a-z0-9]{20,}/i);
    expect(EXAMPLE).not.toMatch(/ZERION_API_KEY=[^\s#]+/);
  });
});
