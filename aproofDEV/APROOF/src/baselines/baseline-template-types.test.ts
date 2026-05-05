/// <reference path="../vitest-test-globals.d.ts" />
import {
  API_SERVICE_TEMPLATE,
  LLM_ASSISTANT_TEMPLATE,
  SECURE_INTERNAL_SYSTEM_TEMPLATE,
} from "./baseline-template-types.js";

const UNIVERSAL_KEYS = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

describe("universal baseline templates", () => {
  it("all packaged templates expose all seven universal keys", () => {
    for (const t of [LLM_ASSISTANT_TEMPLATE, API_SERVICE_TEMPLATE, SECURE_INTERNAL_SYSTEM_TEMPLATE]) {
      expect(Object.keys(t).sort()).toEqual([...UNIVERSAL_KEYS].sort());
    }
  });

  it("all packaged templates use v1 schema type markers", () => {
    for (const t of [LLM_ASSISTANT_TEMPLATE, API_SERVICE_TEMPLATE, SECURE_INTERNAL_SYSTEM_TEMPLATE]) {
      expect(t.policy_integrity.type).toBe("policy_integrity_v1");
      expect(t.identity_access_integrity.type).toBe("identity_access_integrity_v1");
      expect(t.operational_integrity.type).toBe("operational_integrity_v1");
      expect(t.model_identity_integrity.type).toBe("model_identity_integrity_v1");
      expect(t.retrieval_integrity.type).toBe("retrieval_integrity_v1");
      expect(t.deterministic_integrity.type).toBe("deterministic_integrity_v1");
      expect(t.cross_system_integrity.type).toBe("cross_system_integrity_v1");
    }
  });
});
