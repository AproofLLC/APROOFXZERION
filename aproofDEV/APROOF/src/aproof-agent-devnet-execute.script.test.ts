import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(join(__dirname, "..", "scripts", "aproof-agent-devnet-execute.mjs"), "utf8");

describe("aproof-agent-devnet-execute.mjs", () => {
  it("loads .env from package root and uses rent-exempt lamports for micro-transfer", () => {
    expect(SCRIPT).toContain('path.join(aproofRoot, ".env")');
    expect(SCRIPT).toContain("getMinimumBalanceForRentExemption(0)");
    expect(SCRIPT).toContain("890_880");
    expect(SCRIPT).toContain("feeBuffer");
  });

  it("never prints API key or secret key material to stdout", () => {
    expect(SCRIPT).not.toMatch(/emit\([^)]*ZERION_API_KEY/);
    expect(SCRIPT).not.toMatch(/console\.(log|info|debug)\([^)]*secretKey/);
    expect(SCRIPT).toMatch(/emit\(\{\s*ok:\s*true/);
    expect(SCRIPT).toMatch(/emit\(\{\s*ok:\s*false/);
  });

  it("uses only structured emit() for stdout (no stray console logging)", () => {
    expect(SCRIPT).not.toMatch(/console\.(log|info|debug|warn|error)\(/);
  });

  it("requires and returns an explicit deterministic recipient", () => {
    expect(SCRIPT).toContain('else if (a === "--recipient")');
    expect(SCRIPT).toContain("--recipient is required for deterministic execution continuity");
    expect(SCRIPT).toContain("recipient_address: dest.toBase58()");
    expect(SCRIPT).toContain("transfer recipient must equal --recipient (deterministic route violation)");
    expect(SCRIPT).not.toContain("const dest = Keypair.generate().publicKey");
  });
});
