/**
 * Failure detail service: GET /failures/:id, GET /subjects/:id/failures
 */
import { and, count, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  anchorBatchItems,
  anchorBatches,
  canonicalEvents,
  failureLocatorRecords,
  proofUnits,
} from "../db/schema/index.js";
import { normalizeAnchorMetadata } from "./anchor-metadata-normalizer.js";

export type FailurePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type FailureSeverityUi = "low" | "medium" | "high" | "critical";

export type FailureDetail = {
  failure_id: string;
  proof_id: string;
  subject_id: string | null;
  created_at: string;
  angle: string;
  severity: FailureSeverityUi;
  code: string;
  reason_code: string;
  expected_baseline: unknown;
  actual_observed: unknown;
  failed_field_condition: {
    inspection_path: string;
    missing_fields: string[];
  };
  related_event_refs: { event_id: string; relationship: string }[];
  related_proof_refs: { proof_id: string }[];
  metadata: Record<string, unknown>;
  failure_overview: {
    failure_id: string;
    angle: string;
    step: string;
    reason_code: string;
    severity: string;
    failure_priority: FailurePriority;
    detail: string;
  };
  impacted_artifact: {
    artifact_id: string;
    lineage_id: string;
    metadata: Record<string, unknown>;
  };
  evidence: {
    linked_events: string[];
    metadata: Record<string, unknown>;
  };
  full_trace_chain: {
    event: string | null;
    lineage: string | null;
    proof: string | null;
    anchor: string | null;
    metadata: Record<string, unknown>;
  };
};

export function priorityToUiSeverity(p: FailurePriority): FailureSeverityUi {
  switch (p) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    default:
      return "low";
  }
}

function missingFieldsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).sort((a, b) => a.localeCompare(b));
}

function deriveFailurePriority(angle: string, reasonCode: string): FailurePriority {
  const criticalCodes = [
    "ARTIFACT_STABLE_IDENTITY_CONFLICT",
    "LINEAGE_ARTIFACT_IDENTITY_CONFLICT",
  ];
  if (criticalCodes.includes(reasonCode)) return "CRITICAL";

  const highAngles = ["policy_integrity", "identity_access_integrity"];
  if (highAngles.includes(angle)) return "HIGH";

  const mediumAngles = ["deterministic_integrity", "model_identity_integrity"];
  if (mediumAngles.includes(angle)) return "MEDIUM";

  return "LOW";
}

export async function getFailureDetail(
  db: Db,
  params: { failureId: string; organizationId: string; environmentId: string }
): Promise<FailureDetail | null> {
  const [flr] = await db
    .select()
    .from(failureLocatorRecords)
    .where(eq(failureLocatorRecords.id, params.failureId))
    .limit(1);
  if (!flr) return null;

  // Verify org/env scoping through canonical event
  const [ce] = await db
    .select({
      eventId: canonicalEvents.eventId,
      organizationId: canonicalEvents.organizationId,
      environmentId: canonicalEvents.environmentId,
    })
    .from(canonicalEvents)
    .where(eq(canonicalEvents.eventId, flr.eventId))
    .limit(1);

  if (
    !ce ||
    ce.organizationId !== params.organizationId ||
    ce.environmentId !== params.environmentId
  ) {
    return null;
  }

  // Anchor info
  const [anchorInfo] = await db
    .select({
      batchId: anchorBatchItems.batchId,
      rootHash: anchorBatches.rootHash,
      proofCount: anchorBatches.proofCount,
      chainName: anchorBatches.chainName,
      cluster: anchorBatches.cluster,
      anchorMode: anchorBatches.anchorMode,
      txSignature: anchorBatches.txSignature,
      explorerUrl: anchorBatches.explorerUrl,
      walletPublicKey: anchorBatches.walletPublicKey,
      confirmationStatus: anchorBatches.confirmationStatus,
      anchoredAt: anchorBatches.anchoredAt,
      createdAt: anchorBatches.createdAt,
      errorMessage: anchorBatches.errorMessage,
      status: anchorBatches.status,
    })
    .from(anchorBatchItems)
    .innerJoin(anchorBatches, eq(anchorBatches.id, anchorBatchItems.batchId))
    .where(eq(anchorBatchItems.proofId, flr.proofId))
    .limit(1);

  const [pu] = await db
    .select({
      subjectId: proofUnits.subjectId,
      expectedJson: proofUnits.expectedJson,
      observedJson: proofUnits.observedJson,
    })
    .from(proofUnits)
    .where(eq(proofUnits.proofId, flr.proofId))
    .limit(1);

  const priority = deriveFailurePriority(flr.angle, flr.reasonCode);
  const missingFields = missingFieldsList(flr.missingFields);

  const relatedEventRefs = [
    { event_id: flr.eventId, relationship: "canonical" },
    { event_id: flr.rawEventId, relationship: "raw" },
    { event_id: flr.canonicalEventId, relationship: "canonical_record" },
  ];
  const seen = new Set<string>();
  const dedupedRefs = relatedEventRefs.filter((r) => {
    if (seen.has(r.event_id)) return false;
    seen.add(r.event_id);
    return true;
  });
  dedupedRefs.sort((a, b) => a.event_id.localeCompare(b.event_id) || a.relationship.localeCompare(b.relationship));

  return {
    failure_id: flr.id,
    proof_id: flr.proofId,
    subject_id: pu?.subjectId ?? null,
    created_at: flr.createdAt.toISOString(),
    angle: flr.angle,
    severity: priorityToUiSeverity(priority),
    code: flr.reasonCode,
    reason_code: flr.reasonCode,
    expected_baseline: pu?.expectedJson ?? null,
    actual_observed: pu?.observedJson ?? null,
    failed_field_condition: {
      inspection_path: flr.inspectionPath,
      missing_fields: missingFields,
    },
    related_event_refs: dedupedRefs,
    related_proof_refs: [{ proof_id: flr.proofId }],
    metadata: {},
    failure_overview: {
      failure_id: flr.id,
      angle: flr.angle,
      step: flr.step,
      reason_code: flr.reasonCode,
      severity: flr.failureType ?? "unknown",
      failure_priority: priority,
      detail: flr.detail,
    },
    impacted_artifact: {
      artifact_id: flr.artifactId,
      lineage_id: flr.eventLineageId,
      metadata: {},
    },
    evidence: {
      linked_events: [...new Set([flr.eventId, flr.rawEventId, flr.canonicalEventId])].sort((a, b) =>
        a.localeCompare(b)
      ),
      metadata: {},
    },
    full_trace_chain: {
      event: flr.eventId,
      lineage: flr.eventLineageId,
      proof: flr.proofId,
      anchor: anchorInfo?.batchId ?? null,
      metadata: {
        anchor_metadata: normalizeAnchorMetadata(
          anchorInfo
            ? {
                anchor_id: anchorInfo.batchId,
                batch_id: anchorInfo.batchId,
                root_hash: anchorInfo.rootHash,
                proof_count: anchorInfo.proofCount,
                proof_ids: [],
                network: anchorInfo.chainName,
                cluster: anchorInfo.cluster,
                anchor_mode: anchorInfo.anchorMode,
                tx_signature: anchorInfo.txSignature,
                explorer_url: anchorInfo.explorerUrl,
                wallet_public_key: anchorInfo.walletPublicKey,
                status: String(anchorInfo.status),
                confirmation_status: anchorInfo.confirmationStatus,
                anchored_at: anchorInfo.anchoredAt ? anchorInfo.anchoredAt.toISOString() : null,
                created_at: anchorInfo.createdAt.toISOString(),
                error_message: anchorInfo.errorMessage,
              }
            : null,
          { anchoringEnabled: true },
        ),
      },
    },
  };
}

export type FailureListItem = {
  failure_id: string;
  angle: string;
  reason_code: string;
  step: string;
  failure_priority: FailurePriority;
  severity: FailureSeverityUi;
  event_id: string;
  proof_id: string;
  created_at: string;
};

export async function listFailuresForSubject(
  db: Db,
  params: {
    subjectId: string;
    organizationId: string;
    environmentId: string;
    limit: number;
    offset: number;
  }
): Promise<{ items: FailureListItem[]; total: number }> {
  const scope = and(
    eq(proofUnits.subjectId, params.subjectId),
    eq(canonicalEvents.organizationId, params.organizationId),
    eq(canonicalEvents.environmentId, params.environmentId)
  );

  const [countRow] = await db
    .select({ c: count() })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .innerJoin(canonicalEvents, eq(canonicalEvents.eventId, failureLocatorRecords.eventId))
    .where(scope);
  const total = Number(countRow?.c ?? 0);

  const rows = await db
    .select({
      id: failureLocatorRecords.id,
      angle: failureLocatorRecords.angle,
      reasonCode: failureLocatorRecords.reasonCode,
      step: failureLocatorRecords.step,
      eventId: failureLocatorRecords.eventId,
      proofId: failureLocatorRecords.proofId,
      createdAt: failureLocatorRecords.createdAt,
    })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .innerJoin(canonicalEvents, eq(canonicalEvents.eventId, failureLocatorRecords.eventId))
    .where(scope)
    .orderBy(desc(failureLocatorRecords.createdAt))
    .limit(params.limit)
    .offset(params.offset);

  return {
    items: rows.map((r) => {
      const fp = deriveFailurePriority(r.angle, r.reasonCode);
      return {
        failure_id: r.id,
        angle: r.angle,
        reason_code: r.reasonCode,
        step: r.step,
        failure_priority: fp,
        severity: priorityToUiSeverity(fp),
        event_id: r.eventId,
        proof_id: r.proofId,
        created_at: r.createdAt.toISOString(),
      };
    }),
    total,
  };
}
