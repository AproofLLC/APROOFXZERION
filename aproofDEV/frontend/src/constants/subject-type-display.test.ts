import { describe, expect, it } from "vitest";
import { USER_CREATABLE_SUBJECT_TYPES, userFacingSubjectType } from "./subject-type-display";

describe("subject-type-display", () => {
  it("does not expose llm as a user creatable rail", () => {
    expect(USER_CREATABLE_SUBJECT_TYPES).not.toContain("llm");
    expect(USER_CREATABLE_SUBJECT_TYPES).toContain("model");
  });

  it('maps legacy "llm" and canonical "model" to the same user-facing label', () => {
    expect(userFacingSubjectType("llm")).toBe("Model");
    expect(userFacingSubjectType("model")).toBe("Model");
  });
});
