export interface CanonicalIdentityContract {
  event_id: string;
  artifact_id: string;
  event_lineage_id: string;
  event_version: number;
  canonical_hash: string;
  logical_hash: string;
}

export function buildCanonicalIdentityContract(input: CanonicalIdentityContract): CanonicalIdentityContract {
  return {
    event_id: input.event_id,
    artifact_id: input.artifact_id,
    event_lineage_id: input.event_lineage_id,
    event_version: input.event_version,
    canonical_hash: input.canonical_hash,
    logical_hash: input.logical_hash,
  };
}

export function canonicalIdentityContractFromCanonicalRow(row: {
  eventId: string;
  artifactId: string;
  eventLineageId: string;
  eventVersion: number;
  canonicalHash: string;
  logicalHash: string;
}): CanonicalIdentityContract {
  return buildCanonicalIdentityContract({
    event_id: row.eventId,
    artifact_id: row.artifactId,
    event_lineage_id: row.eventLineageId,
    event_version: row.eventVersion,
    canonical_hash: row.canonicalHash,
    logical_hash: row.logicalHash,
  });
}
