import { describe, expect, it } from "vitest";
import { patchSubjectBodySchema } from "./patch-subject-schema.js";

describe("patchSubjectBodySchema", () => {
  it("accepts empty object", () => {
    expect(patchSubjectBodySchema.safeParse({}).success).toBe(true);
  });

  it("accepts external_key string or null", () => {
    expect(patchSubjectBodySchema.safeParse({ external_key: "k" }).success).toBe(true);
    expect(patchSubjectBodySchema.safeParse({ external_key: null }).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    expect(patchSubjectBodySchema.safeParse({ name: "x" }).success).toBe(false);
  });
});
