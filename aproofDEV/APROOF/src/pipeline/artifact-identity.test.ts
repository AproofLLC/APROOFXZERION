import { describe, expect, it } from "vitest";
import type { PostEventBody } from "../http/events-schema.js";
import { resolveArtifactIdentity } from "./identity-resolver.js";
import { stableIdentityMapsEqual } from "./artifact-identity.js";

function base(overrides: Partial<PostEventBody> = {}): PostEventBody {
  return {
    organization_id: "11111111-1111-4111-8111-111111111111",
    environment_id: "22222222-2222-4222-8222-222222222222",
    source_type_key: "e2e.compat.upload",
    subject_id: "33333333-3333-4333-8333-333333333333",
    trace_id: "t-art",
    occurred_at: new Date("2026-04-10T10:00:00.000Z"),
    payload: { image_id: "IMG-1" },
    ...overrides,
  };
}

describe("artifact identity normalization", () => {
  it("normalizes alias keys to one canonical stable identity key", () => {
    const a = resolveArtifactIdentity(base({ payload: { image_id: " IMG-1 " } }));
    const b = resolveArtifactIdentity(base({ payload: { image: { uid: "img-1" } } }));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("expected derivation");
    expect(a.stable_identity_map).toEqual({ image: "img-1" });
    expect(b.stable_identity_map).toEqual({ image: "img-1" });
    expect(a.artifact_id).toBe(b.artifact_id);
  });

  it("derives from nested paths when flat keys are absent", () => {
    const r = resolveArtifactIdentity(
      base({ source_type_key: "unknown_nested", payload: { artifact: { id: "ART-42" } } })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected derivation");
    expect(r.stable_identity_map).toEqual({ artifact: "art-42" });
  });

  it("rejects conflicting flat+nested aliases for same canonical key", () => {
    const r = resolveArtifactIdentity(
      base({
        payload: {
          image_id: "img-a",
          image: { uid: "img-b" },
        },
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected conflict");
    expect(r.reason).toBe("ARTIFACT_STABLE_IDENTITY_CONFLICT");
  });

  it("compares stable maps structurally not by serialization order", () => {
    expect(stableIdentityMapsEqual({ image: "img-1", record: "r-1" }, { record: "r-1", image: "img-1" })).toBe(true);
    expect(stableIdentityMapsEqual({ image_id: "img-1" }, { image: "img-1" })).toBe(true);
    expect(stableIdentityMapsEqual({ image: "img-1" }, { image: "img-2" })).toBe(false);
  });
});

