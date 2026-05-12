import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(join(__dirname, "..", "scripts", "generate-zerion-agent-wallet.mjs"), "utf8");

describe("generate-zerion-agent-wallet.mjs", () => {
  it("writes only .local/zerion-agent-keypair.json as output path (no secret logging patterns)", () => {
    expect(SCRIPT).toContain(".local/zerion-agent-keypair.json");
    expect(SCRIPT).toContain("Keypair.generate()");
    expect(SCRIPT).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*secretKey/);
    expect(SCRIPT).not.toMatch(/console\.(log|info|debug|warn|error)\([^)]*JSON\.stringify\(\s*Array\.from\(\s*keypair\.secretKey/);
  });

  it("documents airdrop failure copy for operators", () => {
    expect(SCRIPT).toContain("Airdrop failed or rate-limited. Fund this public address manually with devnet SOL.");
  });
});
