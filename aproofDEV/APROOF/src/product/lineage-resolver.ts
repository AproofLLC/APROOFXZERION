import { and, eq, desc } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { canonicalEvents } from "../db/schema/index.js";
import {
  canonicalHashFields,
  logicalHashFields,
  stableStringify,
} from "../protocol/event-hashing.js";

export interface LineageResolutionResult {
  event_id: string;
  event_lineage_id: string;
  event_version: number;
  lineage_status: "new_lineage" | "existing_lineage_same_state" | "existing_lineage_new_version";
  matched_prior_event_id: string | null;
  matched_prior_version: number | null;
  lineage_reason: string;
  canonical_hash: string;
  artifact_hash: string | null;
  occurrence_hash: string | null;
  artifact_id: string;
}

type LineageReasonCode =
  | "new_lineage_from_artifact_identity"
  | "existing_lineage_same_state"
  | "existing_lineage_new_version"
  | "existing_lineage_client_version_accepted"
  | "existing_lineage_client_version_rejected"
  | "reused_lineage_from_candidate_match"
  | "rejected_lineage_artifact_conflict"
  | "rejected_lineage_ambiguous_artifact_identity";

export interface LineageResolverInput {
  event_id: string;
  event_lineage_id: string;
  artifact_id: string;
  organization_id: string;
  environment_id: string;
  subject_id: string;
  canonical_event_type: string;
  occurred_at: Date;
  payload: Record<string, unknown>;
  trace_id: string;
  expected_version?: number;
  artifact_identity_source?: string;
  event_lineage_provided?: boolean;
}

/**
 * When the client supplies `event_version`, storage and anomaly rules are driven by the pipeline
 * (out-of-order acceptance, duplicate slots, etc.). This only builds a complete lineage + hash
 * block for proof assembly — it does not enforce strict version sequencing.
 */
export async function resolveClientEventVersionLineage(
  db: Db,
  input: LineageResolverInput & { client_event_version: number }
): Promise<LineageResolutionResult> {
  const {
    event_id,
    event_lineage_id,
    artifact_id,
    organization_id,
    environment_id,
    subject_id,
    canonical_event_type,
    occurred_at,
    payload,
    trace_id,
    client_event_version,
  } = input;

  const existingEvents = await db
    .select({
      event_id: canonicalEvents.eventId,
      event_version: canonicalEvents.eventVersion,
      logical_hash: canonicalEvents.logicalHash,
      artifact_id: canonicalEvents.artifactId,
    })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, organization_id),
        eq(canonicalEvents.environmentId, environment_id),
        eq(canonicalEvents.eventLineageId, event_lineage_id)
      )
    )
    .orderBy(desc(canonicalEvents.eventVersion))
    .limit(1);

  const latestEvent = existingEvents[0];

  if (latestEvent && latestEvent.artifact_id !== artifact_id) {
    throw new Error("LINEAGE_ARTIFACT_IDENTITY_CONFLICT");
  }

  const occurrence_hash = computeOccurrenceSignatureForLineage({
    event_id,
    trace_id,
    subject_id,
    canonical_event_type,
    occurred_at,
    payload,
  });

  const artifact_hash = computeArtifactSignatureForLineage({
    artifact_id,
    subject_id,
    canonical_event_type,
  });

  const canonical_hash = canonicalHashFields({
    event_id,
    trace_id,
    subject_id,
    event_type: canonical_event_type,
    occurred_at: occurred_at.toISOString(),
  });

  const matched_prior_event_id = latestEvent?.event_id ?? null;
  const matched_prior_version = latestEvent?.event_version ?? null;
  const incoming_logical_hash = logicalHashFields({
    subject_id,
    event_type: canonical_event_type,
    payload,
  });

  let lineage_status: LineageResolutionResult["lineage_status"];
  let lineage_reason: LineageReasonCode;
  if (!latestEvent) {
    lineage_status = "new_lineage";
    lineage_reason = "new_lineage_from_artifact_identity";
  } else if (client_event_version < latestEvent.event_version) {
    throw new Error("LINEAGE_VERSION_REPLAY_REJECTED");
  } else if (client_event_version === latestEvent.event_version) {
    if (latestEvent.logical_hash !== incoming_logical_hash) {
      throw new Error("existing_lineage_client_version_rejected");
    }
    lineage_status = "existing_lineage_same_state";
    lineage_reason = "existing_lineage_client_version_accepted";
  } else if (client_event_version === latestEvent.event_version + 1) {
    if (latestEvent.logical_hash === incoming_logical_hash) {
      throw new Error("existing_lineage_client_version_rejected");
    }
    lineage_status = "existing_lineage_new_version";
    lineage_reason = "existing_lineage_client_version_accepted";
  } else {
    throw new Error("existing_lineage_client_version_rejected");
  }

  return {
    event_id,
    event_lineage_id,
    event_version: client_event_version,
    lineage_status,
    matched_prior_event_id,
    matched_prior_version,
    lineage_reason,
    canonical_hash,
    artifact_hash,
    occurrence_hash,
    artifact_id,
  };
}

/**
 * Resolves event lineage, version, and status against existing events.
 * Implements the 3-layer identity model with deterministic versioning.
 */
export async function resolveEventLineage(
  db: Db,
  input: LineageResolverInput
): Promise<LineageResolutionResult> {
  const {
    event_id,
    event_lineage_id,
    artifact_id,
    organization_id,
    environment_id,
    subject_id,
    canonical_event_type,
    occurred_at,
    payload,
    trace_id,
    expected_version,
    artifact_identity_source,
  } = input;

  // Generate deterministic signatures
  const occurrence_signature = computeOccurrenceSignatureForLineage({
    event_id,
    trace_id,
    subject_id,
    canonical_event_type,
    occurred_at,
    payload,
  });

  const artifact_signature = computeArtifactSignatureForLineage({
    artifact_id,
    subject_id,
    canonical_event_type,
  });

  const incoming_logical_hash = logicalHashFields({
    subject_id,
    event_type: canonical_event_type,
    payload,
  });

  // Check for existing lineage
  const existingEvents = await db
    .select({
      event_id: canonicalEvents.eventId,
      event_version: canonicalEvents.eventVersion,
      logical_hash: canonicalEvents.logicalHash,
      artifact_id: canonicalEvents.artifactId,
    })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, organization_id),
        eq(canonicalEvents.environmentId, environment_id),
        eq(canonicalEvents.eventLineageId, event_lineage_id)
      )
    )
    .orderBy(desc(canonicalEvents.eventVersion))
    .limit(1);

  const latestEvent = existingEvents[0];

  let event_version: number;
  let lineage_status: LineageResolutionResult["lineage_status"];
  let matched_prior_event_id: string | null = null;
  let matched_prior_version: number | null = null;
  let lineage_reason: LineageReasonCode;

  if (!latestEvent) {
    // New lineage
    event_version = expected_version ?? 1;
    lineage_status = "new_lineage";
    lineage_reason = "new_lineage_from_artifact_identity";
  } else {
    matched_prior_event_id = latestEvent.event_id;
    matched_prior_version = latestEvent.event_version;

    // Check if artifact matches
    if (latestEvent.artifact_id !== artifact_id) {
      throw new Error("LINEAGE_ARTIFACT_IDENTITY_CONFLICT");
    }

    // If expected_version is provided, validate it
    if (expected_version !== undefined) {
      if (expected_version === latestEvent.event_version) {
        // Same version - check if content matches
        if (latestEvent.logical_hash === incoming_logical_hash) {
          // Same content - this is a duplicate
          event_version = expected_version;
          lineage_status = "existing_lineage_same_state";
          lineage_reason = "existing_lineage_same_state";
        } else {
          throw new Error("duplicate_lineage_version_hash_conflict");
        }
      } else if (expected_version === latestEvent.event_version + 1) {
        // Next version - allow it
        if (latestEvent.logical_hash === incoming_logical_hash) {
          throw new Error("LINEAGE_VERSION_REPLAY_REJECTED");
        }
        event_version = expected_version;
        lineage_status = "existing_lineage_new_version";
        lineage_reason = "existing_lineage_new_version";
      } else {
        throw new Error("existing_lineage_client_version_rejected");
      }
    } else {
      // No expected_version - determine automatically
      // Check if state is the same or changed
      if (latestEvent.logical_hash === incoming_logical_hash) {
        // Same state - keep same version
        event_version = latestEvent.event_version;
        lineage_status = "existing_lineage_same_state";
        lineage_reason =
          artifact_identity_source === "candidate_match"
            ? "reused_lineage_from_candidate_match"
            : "existing_lineage_same_state";
      } else {
        // Changed state - increment version
        event_version = latestEvent.event_version + 1;
        lineage_status = "existing_lineage_new_version";
        lineage_reason =
          artifact_identity_source === "candidate_match"
            ? "reused_lineage_from_candidate_match"
            : "existing_lineage_new_version";
      }
    }
  }

  const canonical_hash = canonicalHashFields({
    event_id,
    trace_id,
    subject_id,
    event_type: canonical_event_type,
    occurred_at: occurred_at.toISOString(),
  });

  return {
    event_id,
    event_lineage_id,
    event_version,
    lineage_status,
    matched_prior_event_id,
    matched_prior_version,
    lineage_reason,
    canonical_hash,
    artifact_hash: artifact_signature,
    occurrence_hash: occurrence_signature,
    artifact_id,
  };
}

/**
 * Occurrence signature for proof/event identity (stable JSON; same inputs as resolveEventLineage).
 */
export function computeOccurrenceSignatureForLineage(params: {
  event_id: string;
  trace_id: string;
  subject_id: string;
  canonical_event_type: string;
  occurred_at: Date;
  payload: Record<string, unknown>;
}): string {
  const { event_id, trace_id, subject_id, canonical_event_type, occurred_at, payload } = params;
  return stableStringify({
    event_id,
    trace_id,
    subject_id,
    canonical_event_type,
    occurred_at: occurred_at.toISOString(),
    payload,
  });
}

/**
 * Artifact signature for proof/event identity (stable JSON; same inputs as resolveEventLineage).
 */
export function computeArtifactSignatureForLineage(params: {
  artifact_id: string;
  subject_id: string;
  canonical_event_type: string;
}): string {
  const { artifact_id, subject_id, canonical_event_type } = params;
  return stableStringify({
    artifact_id,
    subject_id,
    canonical_event_type,
  });
}
