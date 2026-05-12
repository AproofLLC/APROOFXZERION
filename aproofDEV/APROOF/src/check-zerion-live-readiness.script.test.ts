import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(join(__dirname, "..", "scripts", "check-zerion-live-readiness.mjs"), "utf8");

describe("check-zerion-live-readiness.mjs", () => {
  it("never logs secret material patterns", () => {
    expect(SCRIPT).not.toMatch(/console\.(log|info|debug)\([^)]*process\.env\.ZERION_API_KEY/);
    expect(SCRIPT).not.toMatch(/console\.(log|info|debug)\([^)]*env\.ZERION_API_KEY[^)]*\)/);
    expect(SCRIPT).not.toMatch(/secretKey/);
    expect(SCRIPT).toContain("Zerion live execution readiness:");
  });
});
