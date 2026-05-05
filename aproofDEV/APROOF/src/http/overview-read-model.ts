/**
 * Overview read model: GET /subjects/:id/overview
 * Aggregates subject header, status strip, latest proof, angles summary,
 * recent events, active failures, and pipeline state from existing tables.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  anchorBatchItems,
  anchorBatches,
  baselines,
  canonicalEvents,
  failureLocatorRecords,
  proofUnits,
  subjects,
} from "../db/schema/index.js";
import { PRODUCT_ANGLE_NAMES } from "../product/product-proof.js";
import type { SubjectCoreBlock } from "./subject-contract.js";
import { buildSubjectCoreBlock } from "./subject-assembler.js";
import { enrichSubjectTimestamps } from "./subject-service.js";
import { normalizeAnchorMetadata, type CanonicalAnchorMetadata } from "./anchor-metadata-normalizer.js";

export type SubjectOverview = {
  subject_header: SubjectCoreBlock;
  metadata: Record<string, unknown>;
  event_count: number;
  proof_event_count: number;
  angle_result_count: number;
  baseline_count: number;
  active_angle_count: number;
  failure_count: number;
  anchor_status: string;
  latest_proof: string | null;
  latest_proof_status: string | null;
  baselines_summary: Array<{ angle: string; enabled: boolean }>;
  status_strip: {
    total_events: number;
    total_proofs: number;
    active_failures: number;
    lineage_count: number;
    latest_anchor_batch_id: string | null;
    baseline_coverage: number;
    latest_anchor_metadata: CanonicalAnchorMetadata;
  };
  latest_proof_snapshot: {
    proof_id: string | null;
    status: string | null;
    flags: number;
    delta_detected: boolean;
    anchor_status: string | null;
  };
  angles_summary: Array<{
    angle: string;
    status: string;
    reason_code: string;
  }>;
  recent_events: Array<{
    event_id: string;
    event_type: string;
    occurred_at: string;
    source_type_key: string;
    proofability: string;
  }>;
  active_failures_list: Array<{
    failure_id: string;
    angle: string;
    reason_code: string;
    step: string;
    created_at: string;
  }>;
  pipeline_state: {
    raw_ingested: boolean;
    canonicalized: boolean;
    identity_resolved: boolean;
    baseline_resolved: boolean;
    angles_evaluated: boolean;
    proof_built: boolean;
    anchorable: boolean;
  };
};

/** Thrown when overview aggregation hits an unexpected DB/shape error (mapped to HTTP 500 by the route). */
export class OverviewBuildFailedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OverviewBuildFailedError";
  }
}

function safeCount(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** ISO string for event/failure timestamps; avoids throws on null or non-Date drivers. */
export function safeIsoTimestamp(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return value;
  }
  return new Date(0).toISOString();
}

function defaultAnglesSummary(): SubjectOverview["angles_summary"] {
  return PRODUCT_ANGLE_NAMES.map((angle) => ({
    angle,
    status: "not_applicable",
    reason_code: "NO_SOURCES",
  }));
}

async function assembleSubjectOverview(
  db: Db,
  params: {
    subjectId: string;
    organizationId: string;
    environmentId: string;
    environmentName: string;
    subRow: typeof subjects.$inferSelect;
  },
): Promise<SubjectOverview> {
  const subjectId = params.subjectId;

  const ts = await enrichSubjectTimestamps(db, subjectId);

  const [evCountRow] = await db
    .select({ c: count() })
    .from(canonicalEvents)
    .where(eq(canonicalEvents.subjectId, subjectId));
  const totalEvents = safeCount(evCountRow?.c);

  const [lineageCountRow] = await db
    .select({
      c: sql<number>`coalesce(count(distinct ${canonicalEvents.eventLineageId}), 0)::int`,
    })
    .from(canonicalEvents)
    .where(eq(canonicalEvents.subjectId, subjectId));
  const lineageCount = safeCount(lineageCountRow?.c);

  const [prCountRow] = await db
    .select({ c: count() })
    .from(proofUnits)
    .where(eq(proofUnits.subjectId, subjectId));
  const totalProofs = safeCount(prCountRow?.c);

  const [failCountRow] = await db
    .select({ c: count() })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .where(eq(proofUnits.subjectId, subjectId));
  const activeFailures = safeCount(failCountRow?.c);

  const [latestAnchor] = await db
    .select({
      batchId: anchorBatches.id,
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
    .from(anchorBatches)
    .innerJoin(anchorBatchItems, eq(anchorBatchItems.batchId, anchorBatches.id))
    .innerJoin(proofUnits, eq(proofUnits.proofId, anchorBatchItems.proofId))
    .where(eq(proofUnits.subjectId, subjectId))
    .orderBy(desc(anchorBatches.createdAt))
    .limit(1);

  const baselineRows = await db
    .select({ angle: baselines.angle, definition: baselines.definition })
    .from(baselines)
    .where(eq(baselines.subjectId, subjectId))
    .groupBy(baselines.angle, baselines.definition);
  const baselineCoverage = Array.isArray(baselineRows) ? baselineRows.length : 0;

  const baselinesSummary = (Array.isArray(baselineRows) ? baselineRows : []).map((r) => {
    const def = r.definition && typeof r.definition === "object" ? (r.definition as Record<string, unknown>) : {};
    const ac = def.angle_control && typeof def.angle_control === "object" ? (def.angle_control as Record<string, unknown>) : {};
    return { angle: r.angle, enabled: ac.enabled !== false };
  });
  const activeAngleCount = baselinesSummary.filter((b) => b.enabled).length;

  const [proofEventCountRow] = await db
    .select({
      c: sql<number>`coalesce(count(distinct ${proofUnits.eventId}), 0)::int`,
    })
    .from(proofUnits)
    .where(eq(proofUnits.subjectId, subjectId));
  const proofEventCount = safeCount(proofEventCountRow?.c);

  const [latestEvent] = await db
    .select({ eventId: canonicalEvents.eventId })
    .from(canonicalEvents)
    .where(
      and(eq(canonicalEvents.subjectId, subjectId), eq(canonicalEvents.proofability, "proofable")),
    )
    .orderBy(desc(canonicalEvents.occurredAt))
    .limit(1);

  let latestProof: {
    proofId: string;
    status: string;
    deltaCode: string | null;
    anchorState: string;
    eventId: string;
  } | null = null;
  let flagsCount = 0;

  let anglesSummary: SubjectOverview["angles_summary"];

  if (latestEvent?.eventId) {
    const pus = await db
      .select({
        angle: proofUnits.angle,
        status: proofUnits.status,
        deltaCode: proofUnits.deltaCode,
        proofId: proofUnits.proofId,
        anchorState: proofUnits.anchorState,
        eventId: proofUnits.eventId,
      })
      .from(proofUnits)
      .where(eq(proofUnits.eventId, latestEvent.eventId));

    const list = Array.isArray(pus) ? pus : [];
    if (list.length > 0) {
      const hasViolated = list.some((p) => p.status === "violated");
      const hasFlagged = list.some((p) => p.status === "flagged");
      const hasConformant = list.some((p) => p.status === "conformant");
      const aggStatus = hasViolated
        ? "violated"
        : hasFlagged
          ? "flagged"
          : hasConformant
            ? "conformant"
            : "unverifiable";
      const primary =
        list.find((p) => p.status === "violated") ??
        list.find((p) => p.status === "flagged") ??
        list[list.length - 1]!;
      latestProof = {
        proofId: primary.proofId,
        status: aggStatus,
        deltaCode: typeof primary.deltaCode === "string" ? primary.deltaCode : null,
        anchorState: typeof primary.anchorState === "string" ? primary.anchorState : String(primary.anchorState ?? ""),
        eventId: latestEvent.eventId,
      };
      flagsCount = list.filter((p) => p.status === "flagged").length;
    }

    const puMap = new Map(list.map((pu) => [pu.angle, pu]));
    anglesSummary = PRODUCT_ANGLE_NAMES.map((angle) => {
      const pu = puMap.get(angle);
      if (pu) {
        const statusMap: Record<string, string> = {
          conformant: "pass",
          flagged: "warn",
          violated: "fail",
          unverifiable: "insufficient_evidence",
        };
        const rawStatus = typeof pu.status === "string" ? pu.status : String(pu.status ?? "");
        return {
          angle,
          status: statusMap[rawStatus] ?? rawStatus,
          reason_code: typeof pu.deltaCode === "string" && pu.deltaCode.length > 0 ? pu.deltaCode : "OK",
        };
      }
      return { angle, status: "not_applicable", reason_code: "NO_SOURCES" };
    });
  } else {
    anglesSummary = defaultAnglesSummary();
    const [row] = await db
      .select({
        proofId: proofUnits.proofId,
        status: proofUnits.status,
        deltaCode: proofUnits.deltaCode,
        anchorState: proofUnits.anchorState,
        eventId: proofUnits.eventId,
      })
      .from(proofUnits)
      .where(eq(proofUnits.subjectId, subjectId))
      .orderBy(desc(proofUnits.createdAt))
      .limit(1);
    if (row) {
      latestProof = {
        proofId: row.proofId,
        status: typeof row.status === "string" ? row.status : String(row.status ?? ""),
        deltaCode: typeof row.deltaCode === "string" ? row.deltaCode : null,
        anchorState: typeof row.anchorState === "string" ? row.anchorState : String(row.anchorState ?? ""),
        eventId: typeof row.eventId === "string" ? row.eventId : String(row.eventId ?? ""),
      };
      if (latestProof.eventId.length > 0) {
        const [flagRow] = await db
          .select({ c: count() })
          .from(proofUnits)
          .where(
            and(eq(proofUnits.eventId, latestProof.eventId), eq(proofUnits.status, "flagged")),
          );
        flagsCount = safeCount(flagRow?.c);
      }
    }
  }

  const recentRows = await db
    .select({
      eventId: canonicalEvents.eventId,
      eventType: canonicalEvents.eventType,
      occurredAt: canonicalEvents.occurredAt,
      sourceTypeKey: canonicalEvents.sourceTypeKey,
      proofability: canonicalEvents.proofability,
    })
    .from(canonicalEvents)
    .where(eq(canonicalEvents.subjectId, subjectId))
    .orderBy(desc(canonicalEvents.occurredAt))
    .limit(10);

  const recentEvents = (Array.isArray(recentRows) ? recentRows : []).map((r) => ({
    event_id: typeof r.eventId === "string" ? r.eventId : String(r.eventId ?? ""),
    event_type: typeof r.eventType === "string" ? r.eventType : String(r.eventType ?? ""),
    occurred_at: safeIsoTimestamp(r.occurredAt),
    source_type_key:
      typeof r.sourceTypeKey === "string" ? r.sourceTypeKey : String(r.sourceTypeKey ?? ""),
    proofability: typeof r.proofability === "string" ? r.proofability : String(r.proofability ?? ""),
  }));

  const failRows = await db
    .select({
      id: failureLocatorRecords.id,
      angle: failureLocatorRecords.angle,
      reasonCode: failureLocatorRecords.reasonCode,
      step: failureLocatorRecords.step,
      createdAt: failureLocatorRecords.createdAt,
    })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .where(eq(proofUnits.subjectId, subjectId))
    .orderBy(desc(failureLocatorRecords.createdAt))
    .limit(10);

  const activeFailuresList = (Array.isArray(failRows) ? failRows : []).map((r) => ({
    failure_id: typeof r.id === "string" ? r.id : String(r.id ?? ""),
    angle: typeof r.angle === "string" ? r.angle : String(r.angle ?? ""),
    reason_code: typeof r.reasonCode === "string" ? r.reasonCode : String(r.reasonCode ?? ""),
    step: typeof r.step === "string" ? r.step : String(r.step ?? ""),
    created_at: safeIsoTimestamp(r.createdAt),
  }));

  let pipelineState: SubjectOverview["pipeline_state"] = {
    raw_ingested: false,
    canonicalized: false,
    identity_resolved: false,
    baseline_resolved: false,
    angles_evaluated: false,
    proof_built: false,
    anchorable: false,
  };
  if (latestEvent?.eventId) {
    const [pRow] = await db
      .select({ pipelineStageJson: canonicalEvents.pipelineStageJson })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.eventId, latestEvent.eventId))
      .limit(1);
    if (pRow?.pipelineStageJson && typeof pRow.pipelineStageJson === "object") {
      const ps = pRow.pipelineStageJson as Record<string, unknown>;
      pipelineState = {
        raw_ingested: ps.raw_ingested === true,
        canonicalized: ps.canonicalized === true,
        identity_resolved: ps.identity_resolved === true,
        baseline_resolved: ps.baseline_resolved === true,
        angles_evaluated: ps.angles_evaluated === true,
        proof_built: ps.proof_built === true,
        anchorable: ps.anchorable === true,
      };
    }
  }

  const anchorStatus = latestAnchor
    ? (latestAnchor.status === "confirmed" ? "anchored" : latestAnchor.status === "failed" ? "anchor_failed" : "pending")
    : "not_anchored";

  return {
    subject_header: buildSubjectCoreBlock(params.subRow, ts, params.environmentName),
    metadata: {},
    event_count: totalEvents,
    proof_event_count: proofEventCount,
    angle_result_count: totalProofs,
    baseline_count: baselineCoverage,
    active_angle_count: activeAngleCount,
    failure_count: activeFailures,
    anchor_status: anchorStatus,
    latest_proof: latestProof?.proofId ?? null,
    latest_proof_status: latestProof?.status ?? null,
    baselines_summary: baselinesSummary,
    status_strip: {
      total_events: totalEvents,
      total_proofs: totalProofs,
      active_failures: activeFailures,
      lineage_count: lineageCount,
      latest_anchor_batch_id: latestAnchor?.batchId ?? null,
      baseline_coverage: baselineCoverage,
      latest_anchor_metadata: normalizeAnchorMetadata(
        latestAnchor
          ? {
              anchor_id: latestAnchor.batchId,
              batch_id: latestAnchor.batchId,
              root_hash: latestAnchor.rootHash,
              proof_count: latestAnchor.proofCount,
              proof_ids: [],
              network: latestAnchor.chainName,
              cluster: latestAnchor.cluster,
              anchor_mode: latestAnchor.anchorMode,
              tx_signature: latestAnchor.txSignature,
              explorer_url: latestAnchor.explorerUrl,
              wallet_public_key: latestAnchor.walletPublicKey,
              status: String(latestAnchor.status),
              confirmation_status: latestAnchor.confirmationStatus,
              anchored_at: latestAnchor.anchoredAt ? latestAnchor.anchoredAt.toISOString() : null,
              created_at: latestAnchor.createdAt.toISOString(),
              error_message: latestAnchor.errorMessage,
            }
          : null,
        { anchoringEnabled: true },
      ),
    },
    latest_proof_snapshot: {
      proof_id: latestProof?.proofId ?? null,
      status: latestProof?.status ?? null,
      flags: flagsCount,
      delta_detected: Boolean(latestProof?.deltaCode && String(latestProof.deltaCode).length > 0),
      anchor_status: latestProof?.anchorState ?? null,
    },
    angles_summary: Array.isArray(anglesSummary) ? anglesSummary : defaultAnglesSummary(),
    recent_events: recentEvents,
    active_failures_list: activeFailuresList,
    pipeline_state: pipelineState,
  };
}

export async function buildSubjectOverview(
  db: Db,
  params: {
    subjectId: string;
    organizationId: string;
    environmentId: string;
    environmentName: string;
  },
): Promise<SubjectOverview | null> {
  const [subRow] = await db
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId),
      ),
    )
    .limit(1);
  if (!subRow) return null;

  try {
    return await assembleSubjectOverview(db, {
      ...params,
      subRow,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[overview-read-model] build failed:", stack ?? msg);
    throw new OverviewBuildFailedError(msg, { cause: e });
  }
}
