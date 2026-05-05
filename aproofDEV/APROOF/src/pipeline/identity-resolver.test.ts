import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PostEventBody } from "../http/events-schema.js";
import { resolveArtifactIdentity, resolveEventIdentity } from "./identity-resolver.js";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENV_ID = "22222222-2222-4222-8222-222222222222";
const SUBJECT_ID = "33333333-3333-4333-8333-333333333333";

function baseBody(overrides: Partial<PostEventBody> = {}): PostEventBody {
  return {
    organization_id: ORG_ID,
    environment_id: ENV_ID,
    source_type_key: "src",
    subject_id: SUBJECT_ID,
    event_version: 1,
    trace_id: "t1",
    occurred_at: new Date("2026-04-06T12:00:00.000Z"),
    payload: { record_id: "R-BASE", k: 1 },
    ...overrides,
  };
}

describe("resolveEventIdentity", () => {
  it("identical event without supplied event_id derives identical deterministic event_id", () => {
    const shared = baseBody();
    const a = resolveEventIdentity(shared);
    const b = resolveEventIdentity(shared);
    expect(a.artifact.ok).toBe(true);
    expect(b.artifact.ok).toBe(true);
    if (!a.artifact.ok || !b.artifact.ok) {
      throw new Error("artifact resolution unexpectedly failed");
    }
    expect(a.artifact.artifact_id).toBe(b.artifact.artifact_id);
    expect(a.event_lineage_id).toBe(a.artifact.artifact_id);
    expect(b.event_lineage_id).toBe(b.artifact.artifact_id);
    expect(a.event_lineage_id).toBe(b.event_lineage_id);
    expect(a.event_id).toBe(b.event_id);
  });

  it("explicit event_lineage_id is preserved; artifact still derived from payload", () => {
    const lineage = randomUUID();
    const body = baseBody({ event_lineage_id: lineage });
    const r = resolveEventIdentity(body);
    expect(r.event_lineage_id).toBe(lineage);
    expect(r.artifact.ok).toBe(true);
  });

  it("same stable artifact key with changed payload keeps artifact identity", () => {
    const common = {
      source_type_key: "e2e.strict_xray",
      payload: { xray_id: "XR-DET-1", analysis: "v1" },
    };
    const a = resolveEventIdentity(baseBody(common));
    const b = resolveEventIdentity(baseBody({ ...common, payload: { xray_id: "XR-DET-1", analysis: "v2" } }));
    expect(a.artifact.ok).toBe(true);
    expect(b.artifact.ok).toBe(true);
    if (!a.artifact.ok || !b.artifact.ok) {
      throw new Error("artifact resolution unexpectedly failed");
    }
    expect(a.artifact.artifact_id).toBe(b.artifact.artifact_id);
  });

  it("does not invent lineage id when artifact identity is insufficient", () => {
    const input = baseBody({
      source_type_key: "e2e.strict_xray",
      payload: { note: "no derivation keys present" },
    });
    const a = resolveEventIdentity(input);
    expect(a.artifact.ok).toBe(false);
    if (a.artifact.ok) {
      throw new Error("artifact unexpectedly resolved");
    }
    expect(a.artifact.reason).toBe("ARTIFACT_ID_NOT_DERIVABLE");
    expect(a.event_lineage_id).toBe("");
  });
});

describe("resolveArtifactIdentity precedence", () => {
  it("accepts provided artifact_id when stable derivation rule is not derivable", () => {
    const provided = randomUUID();
    const r = resolveArtifactIdentity(
      baseBody({
        source_type_key: "e2e.strict_xray",
        payload: { note: "no-xray-id-present" },
        artifact_id: provided,
      })
    );
    expect(r).toEqual({
      ok: true,
      artifact_id: provided,
      source: "provided",
      stable_identity_fields: [],
      stable_identity_map: {},
      stable_identity_summary: "none",
      derivation_rule_id: "source_type:e2e.strict_xray",
      candidate_keys: expect.any(Array),
      quality: "explicit",
      compatible_source_match: null,
      confidence: "high",
    });
  });

  it("accepts provided artifact_id when it matches deterministic derived identity", () => {
    const seededBody = baseBody({
      source_type_key: "e2e.strict_xray",
      payload: { xray_id: "XR-100" },
    });
    const derived = resolveArtifactIdentity(seededBody);
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      throw new Error("expected derivable artifact identity");
    }
    const validated = resolveArtifactIdentity({
      ...seededBody,
      artifact_id: derived.artifact_id,
    });
    expect(validated).toEqual({
      ok: true,
      artifact_id: derived.artifact_id,
      source: "provided_validated",
      stable_identity_fields: ["xray"],
      stable_identity_map: { xray: "xr-100" },
      stable_identity_summary: "xray=xr-100",
      derivation_rule_id: "source_type:e2e.strict_xray",
      candidate_keys: expect.any(Array),
      quality: "explicit",
      compatible_source_match: null,
      confidence: "high",
    });
  });

  it("rejects provided artifact_id when it conflicts with deterministic derived identity", () => {
    const r = resolveArtifactIdentity(
      baseBody({
        source_type_key: "e2e.strict_xray",
        payload: { xray_id: "XR-200" },
        artifact_id: randomUUID(),
      })
    );
    expect(r).toEqual({
      ok: false,
      reason: "ARTIFACT_ID_CONFLICT_WITH_DERIVED",
      stable_identity_fields: ["xray"],
      stable_identity_map: { xray: "xr-200" },
      derivation_rule_id: "source_type:e2e.strict_xray",
      candidate_keys: expect.any(Array),
      quality: "derived_strong",
      compatible_source_match: null,
      detail: "provided artifact_id conflicts with deterministic stable derivation",
    });
  });

  it("derives artifact_id when omitted and deterministic fields exist", () => {
    const r = resolveArtifactIdentity(
      baseBody({
        source_type_key: "e2e.strict_xray",
        payload: { xray_id: "XR-300" },
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      throw new Error("expected derivable artifact identity");
    }
    expect(r.source).toBe("derived");
    expect(r.stable_identity_fields).toEqual(["xray"]);
  });

  it("fails safely when artifact_id is omitted and deterministic rule is not derivable", () => {
    const r = resolveArtifactIdentity(
      baseBody({
        source_type_key: "e2e.strict_xray",
        payload: { note: "missing stable xray_id" },
      })
    );
    expect(r).toEqual({
      ok: false,
      reason: "ARTIFACT_ID_NOT_DERIVABLE",
      stable_identity_fields: [],
      stable_identity_map: {},
      derivation_rule_id: "source_type:e2e.strict_xray",
      candidate_keys: expect.any(Array),
      quality: "insufficient",
      compatible_source_match: null,
      detail: "explicit stable derivation rule evaluated",
    });
  });

  it("derives unknown source from generic stable keys instead of full payload hash", () => {
    const a = resolveArtifactIdentity(
      baseBody({
        source_type_key: "unknown_source",
        payload: { record_id: "R-1", mutable: "A" },
      })
    );
    const b = resolveArtifactIdentity(
      baseBody({
        source_type_key: "unknown_source",
        payload: { record_id: "R-1", mutable: "B" },
      })
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) {
      throw new Error("expected generic stable key derivation");
    }
    expect(a.artifact_id).toBe(b.artifact_id);
    expect(a.derivation_rule_id).toBe("generic_stable_key_allowlist_v2");
  });

  it("fails safely for unknown source with no stable identity keys", () => {
    const r = resolveArtifactIdentity(
      baseBody({
        source_type_key: "unknown_source",
        payload: { mutable_status: "ok", summary: "text" },
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) {
      throw new Error("expected insufficient identity");
    }
    expect(r.reason).toBe("ARTIFACT_IDENTITY_INSUFFICIENT");
  });
});
