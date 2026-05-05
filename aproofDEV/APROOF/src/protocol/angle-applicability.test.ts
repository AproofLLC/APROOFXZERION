/// <reference path="../vitest-test-globals.d.ts" />
import {
  CANONICAL_EVENT_TYPES,
  INTEGRITY_ANGLES,
  RAIL_TYPES,
  getApplicableAngles,
} from "./angle-applicability.js";

function classesByAngle(
  list: ReturnType<typeof getApplicableAngles>
): Record<string, string> {
  return Object.fromEntries(list.map((a) => [a.angle, a.requirement]));
}

describe("getApplicableAngles (universal)", () => {
  const expectedAngles = [...INTEGRITY_ANGLES].sort((a, b) => a.localeCompare(b));

  it("returns all seven angles REQUIRED for every rail × event pair (spot checks)", () => {
    const pairs: [typeof RAIL_TYPES[number], typeof CANONICAL_EVENT_TYPES[number]][] = [
      ["system", "policy_checked"],
      ["service", "identity_access_checked"],
      ["service", "request_received"],
      ["agent", "record_accessed"],
      ["model", "access_token_used"],
      ["endpoint", "decision_completed"],
    ];
    for (const [rail, event] of pairs) {
      const list = getApplicableAngles(rail, event);
      expect(list.map((x) => x.angle)).toEqual(expectedAngles);
      for (const a of list) {
        expect(a.requirement).toBe("REQUIRED");
      }
    }
  });

  it("request_received + agent includes cross_system_integrity (same as service)", () => {
    const agent = classesByAngle(getApplicableAngles("agent", "request_received"));
    const service = classesByAngle(getApplicableAngles("service", "request_received"));
    expect(agent).toEqual(service);
    expect(Object.keys(agent).length).toBe(7);
  });

  it("record_accessed: full set for any rail (no exclusions)", () => {
    expect(getApplicableAngles("service", "record_accessed").map((x) => x.angle)).toEqual(
      expectedAngles
    );
    expect(getApplicableAngles("model", "record_accessed").map((x) => x.angle)).toEqual(
      expectedAngles
    );
  });
});
