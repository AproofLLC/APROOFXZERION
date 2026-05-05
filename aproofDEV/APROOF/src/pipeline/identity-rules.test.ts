import { describe, expect, it } from "vitest";
import { classifyLineageVersionAgainstExisting } from "./identity-rules.js";

describe("classifyLineageVersionAgainstExisting", () => {
  it("same artifact + same logical_hash => replay", () => {
    expect(
      classifyLineageVersionAgainstExisting({
        existingArtifactId: "a1",
        existingLogicalHash: "h1",
        incomingArtifactId: "a1",
        incomingLogicalHash: "h1",
      })
    ).toBe("duplicate_lineage_version_same_hash");
  });

  it("same artifact + different logical_hash => conflict", () => {
    expect(
      classifyLineageVersionAgainstExisting({
        existingArtifactId: "a1",
        existingLogicalHash: "h1",
        incomingArtifactId: "a1",
        incomingLogicalHash: "h2",
      })
    ).toBe("duplicate_lineage_version_hash_conflict");
  });

  it("different artifact => LINEAGE_ARTIFACT_IDENTITY_CONFLICT (not merged with stream)", () => {
    expect(
      classifyLineageVersionAgainstExisting({
        existingArtifactId: "a1",
        existingLogicalHash: "h1",
        incomingArtifactId: "a2",
        incomingLogicalHash: "h1",
      })
    ).toBe("LINEAGE_ARTIFACT_IDENTITY_CONFLICT");
  });
});
