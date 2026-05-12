import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, "..", "docs");

function readDoc(name: string): string {
  return readFileSync(join(docsDir, name), "utf8");
}

describe("Zerion hardening docs", () => {
  it("environment-hardening.md covers wallet separation and load order", () => {
    const t = readDoc("environment-hardening.md");
    expect(t).toContain("load order");
    expect(t).toMatch(/wallet separation|Execution:|Anchor:/i);
    expect(t).toContain("ZERION_AGENT_WALLET_ADDRESS");
    expect(t).toContain("SOLANA_KEYPAIR_PATH");
  });

  it("zerion-agent-live-demo.md covers demo path and tx_hash / proof_digest / anchor", () => {
    const t = readDoc("zerion-agent-live-demo.md");
    expect(t).toContain("tx_hash");
    expect(t).toContain("proof_digest");
    expect(t).toContain("anchor_signature");
    expect(t).toContain("explorer_url");
    expect(t).toMatch(/Blocked Execution|policy/i);
  });
});
