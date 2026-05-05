/**
 * Single assembler for SubjectCoreBlock used by subject routes and overview.subject_header.
 */
import type { SubjectCoreBlock } from "./subject-contract.js";
import { subjectTypeFromRail } from "./subject-contract.js";

export type SubjectRowShape = {
  id: string;
  organizationId: string;
  environmentId: string;
  railType: string;
  createdAt: Date;
  externalKey?: string | null;
};

export function buildSubjectCoreBlock(
  row: SubjectRowShape,
  timestamps: {
    latest_event_timestamp: string | null;
    latest_proof_timestamp: string | null;
    latest_anchor_timestamp: string | null;
  },
  environmentDisplayName: string,
): SubjectCoreBlock {
  return {
    subject_id: row.id,
    subject_type: subjectTypeFromRail(row.railType),
    organization_id: row.organizationId,
    environment_id: row.environmentId,
    environment: environmentDisplayName,
    external_key: row.externalKey ?? null,
    created_at: row.createdAt.toISOString(),
    latest_event_timestamp: timestamps.latest_event_timestamp,
    latest_proof_timestamp: timestamps.latest_proof_timestamp,
    latest_anchor_timestamp: timestamps.latest_anchor_timestamp,
  };
}
