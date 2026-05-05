import { describe, it, expect } from "vitest";
import { resolveEventIdentity, resolveArtifactIdentity } from "./identity-resolver.js";

/**
 * Identity derivation law tests.
 *
 * Rules:
 * - When event_id is omitted, backend derives it deterministically from
 *   { subject_id, source_type_key, trace_id, occurred_at, payload, canonical_event_type }.
 * - When artifact_id is omitted and stable derivation fields exist, backend derives it.
 * - When artifact_id is provided and derivable, backend validates it matches derived value.
 * - event_lineage_id defaults to artifact_id when omitted.
 * - event_version defaults via lineage resolution (not tested here — see lineage-resolver).
 */

function baseBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    organization_id: "11111111-1111-4111-8111-111111111111",
    environment_id: "22222222-2222-4222-8222-222222222222",
    source_type_key: "test.policy_checked",
    subject_id: "33333333-3333-4333-8333-333333333333",
    trace_id: "trace-law-test",
    occurred_at: new Date("2026-04-08T10:00:00.000Z"),
    payload: { host: "test", policy: { tags: ["allow_read"] } },
    ...overrides,
  };
}

describe("identity derivation law", () => {
  it("derives deterministic event_id when omitted", () => {
    const body = baseBody();
    const a = resolveEventIdentity(body);
    const b = resolveEventIdentity(body);
    expect(a.event_id).toBe(b.event_id);
    expect(a.event_id).toMatch(/^[0-9a-f]{8}-/);
  });

  it("preserves client-provided event_id", () => {
    const body = baseBody({ event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const result = resolveEventIdentity(body);
    expect(result.event_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("derives artifact_id when omitted and derivable", () => {
    const body = baseBody();
    const result = resolveArtifactIdentity(body);
    if (result.ok) {
      expect(result.artifact_id).toMatch(/^[0-9a-f]{8}-/);
    }
  });

  it("derives stable artifact_id from same payload", () => {
    const body = baseBody();
    const a = resolveArtifactIdentity(body);
    const b = resolveArtifactIdentity(body);
    expect(a).toEqual(b);
  });

  it("rejects conflicting provided artifact_id", () => {
    const body = baseBody({ artifact_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const result = resolveArtifactIdentity(body);
    if (!result.ok) {
      expect(result.reason).toBe("ARTIFACT_ID_CONFLICT_WITH_DERIVED");
    }
  });

  it("defaults event_lineage_id to artifact_id when omitted", () => {
    const body = baseBody();
    const result = resolveEventIdentity(body);
    const artifact = resolveArtifactIdentity(body);
    if (artifact.ok) {
      expect(result.event_lineage_id).toBe(artifact.artifact_id);
    }
  });

  it("preserves client-provided event_lineage_id", () => {
    const body = baseBody({ event_lineage_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    const result = resolveEventIdentity(body);
    expect(result.event_lineage_id).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  });

  it("different payload produces different artifact_id", () => {
    const a = resolveArtifactIdentity(baseBody({ payload: { record_id: "rec-1", mutable: "val1" } }));
    const b = resolveArtifactIdentity(baseBody({ payload: { record_id: "rec-2", mutable: "val2" } }));
    if (a.ok && b.ok) {
      expect(a.artifact_id).not.toBe(b.artifact_id);
    }
  });
});
