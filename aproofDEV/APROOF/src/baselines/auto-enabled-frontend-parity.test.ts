import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * B. The UI must re-export the same SSOT table; hand-maintained angle lists in the frontend are not allowed to drift.
 */
describe("frontend rail-auto-enabled re-exports SSOT only", () => {
  it("frontend/constants/rail-auto-enabled imports APROOF auto-enabled-angles-by-rail and does not redefine arrays", () => {
    const fePath = path.resolve(__dirname, "../../../frontend/src/constants/rail-auto-enabled.ts");
    const s = readFileSync(fePath, "utf8");
    expect(s, "expected re-export of SSOT module").toMatch(
      /from\s+["']@aproof\/baselines\/auto-enabled-angles-by-rail(\\.ts)?["']/,
    );
    expect(s, "no duplicate inline model: [ ... ] table").not.toMatch(/^\s*model:\s*\[/m);
  });
});
