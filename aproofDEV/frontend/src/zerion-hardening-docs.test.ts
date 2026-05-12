import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const aproofDocs = join(__dirname, "..", "..", "APROOF", "docs");

describe("Zerion docs (monorepo APROOF/docs)", () => {
  it("live demo doc mentions wallet separation and demo artifacts", () => {
    const t = readFileSync(join(aproofDocs, "zerion-agent-live-demo.md"), "utf8");
    expect(t).toMatch(/wallet separation|Execution|Anchor/i);
    expect(t).toContain("tx_hash");
    expect(t).toContain("proof_digest");
    expect(t).toContain("anchor_signature");
    expect(t).toContain("explorer_url");
  });
});
