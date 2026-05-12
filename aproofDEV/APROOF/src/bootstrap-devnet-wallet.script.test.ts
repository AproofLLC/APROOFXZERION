import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(join(__dirname, "..", "scripts", "bootstrap-devnet-wallet.mjs"), "utf8");

describe("bootstrap-devnet-wallet.mjs", () => {
  it("does not print secret key material via console logging", () => {
    expect(SCRIPT).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*secretKey/);
    expect(SCRIPT).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*JSON\.stringify\(\s*kp\.secretKey/);
  });
});
