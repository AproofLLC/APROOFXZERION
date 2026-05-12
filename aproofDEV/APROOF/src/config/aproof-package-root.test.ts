import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAproofPackageRoot } from "./aproof-package-root.js";

describe("resolveAproofPackageRoot", () => {
  it("points at the APROOF package root (contains package.json)", () => {
    const root = resolveAproofPackageRoot();
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
    expect(existsSync(path.join(root, "src", "main.ts"))).toBe(true);
  });
});
