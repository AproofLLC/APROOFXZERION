import { describe, expect, it } from "vitest";
import { canonicalHashFields } from "../protocol/event-hashing.js";
import { classifyLineageVersionAgainstExisting } from "./identity-rules.js";

describe("determinism law", () => {
  it("same request twice yields the same canonical hash", () => {
    const input = {
      event_id: "2ea7c00b-7f4b-5325-b4b2-37ce31f86f6a",
      trace_id: "trace-1",
      subject_id: "subj-1",
      event_type: "policy_checked",
      occurred_at: "2026-04-08T00:00:00.000Z",
    };
    expect(canonicalHashFields(input)).toBe(canonicalHashFields(input));
  });

  it("same duplicate inputs classify identically every time", () => {
    const params = {
      existingArtifactId: "artifact-1",
      existingLogicalHash: "logical-1",
      incomingArtifactId: "artifact-1",
      incomingLogicalHash: "logical-1",
    };
    const first = classifyLineageVersionAgainstExisting(params);
    const second = classifyLineageVersionAgainstExisting(params);
    expect(first).toBe(second);
  });

  it("same lineage/version same hash => duplicate_lineage_version_same_hash", () => {
    expect(
      classifyLineageVersionAgainstExisting({
        existingArtifactId: "artifact-1",
        existingLogicalHash: "logical-1",
        incomingArtifactId: "artifact-1",
        incomingLogicalHash: "logical-1",
      })
    ).toBe("duplicate_lineage_version_same_hash");
  });

  it("same lineage/version different hash => duplicate_lineage_version_hash_conflict", () => {
    expect(
      classifyLineageVersionAgainstExisting({
        existingArtifactId: "artifact-1",
        existingLogicalHash: "logical-1",
        incomingArtifactId: "artifact-1",
        incomingLogicalHash: "logical-2",
      })
    ).toBe("duplicate_lineage_version_hash_conflict");
  });

  it("different artifact same lineage/version => lineage_artifact_identity_conflict", () => {
    expect(
      classifyLineageVersionAgainstExisting({
        existingArtifactId: "artifact-1",
        existingLogicalHash: "logical-1",
        incomingArtifactId: "artifact-2",
        incomingLogicalHash: "logical-1",
      })
    ).toBe("LINEAGE_ARTIFACT_IDENTITY_CONFLICT");
  });
});
