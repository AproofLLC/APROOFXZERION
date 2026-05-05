/**
 * Identity model (API freeze):
 * - event_id: unique instance identity (submission / row key).
 * - artifact_id: underlying object identity (content-derived or client-supplied).
 * - event_lineage_id: version stream identity within an org/env.
 * - event_version: ordered progression within a lineage.
 *
 * Lineage duplicate semantics are scoped by artifact_id: two different artifacts must
 * not share the same (lineage, version) slot unless the client explicitly reuses
 * lineage UUID across artifacts — in that case the second artifact is rejected
 * (lineage_artifact_identity_conflict) rather than merged with the first.
 */

export type LineageVersionDuplicateReason =
  | "duplicate_lineage_version_same_hash"
  | "duplicate_lineage_version_hash_conflict"
  | "LINEAGE_ARTIFACT_IDENTITY_CONFLICT";

export function classifyLineageVersionAgainstExisting(params: {
  existingArtifactId: string;
  existingLogicalHash: string;
  incomingArtifactId: string;
  incomingLogicalHash: string;
}): LineageVersionDuplicateReason {
  const {
    existingArtifactId,
    existingLogicalHash,
    incomingArtifactId,
    incomingLogicalHash,
  } = params;

  if (existingArtifactId !== incomingArtifactId) {
    return "LINEAGE_ARTIFACT_IDENTITY_CONFLICT";
  }
  if (existingLogicalHash === incomingLogicalHash) {
    return "duplicate_lineage_version_same_hash";
  }
  return "duplicate_lineage_version_hash_conflict";
}
