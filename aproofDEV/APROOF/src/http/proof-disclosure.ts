import type { FailureListItem } from "./reconstruct-proof-read.js";
import { normalizeAnchorMetadata } from "./anchor-metadata-normalizer.js";

export type ProofDisclosureView = "internal" | "external" | "minimal" | "adversarial_safe";

function toRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function cloneRecord(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input };
}

function sanitizeProofUnitsForExternal(input: unknown): unknown {
  if (!Array.isArray(input)) return input;
  return input.map((unit) => {
    const rec = toRecord(unit);
    const out = cloneRecord(rec);
    delete out.evidence_json;
    delete out.inspection_path;
    delete out.inspectionPath;
    delete out.failure_locator;
    delete out.failureLocator;
    delete out.detail;
    return out;
  });
}

function sanitizeProductProofForExternal(input: unknown): unknown {
  const productProof = toRecord(input);
  if (!productProof || Object.keys(productProof).length === 0) return input;
  const out = cloneRecord(productProof);
  const locator = toRecord(out.failure_locator);
  if (Object.keys(locator).length > 0) {
    out.failure_locator = {
      angle: locator.angle ?? locator.component ?? null,
      step: locator.step ?? locator.layer ?? null,
      reason_code: locator.reason_code ?? null,
      detail: locator.detail ?? locator.summary ?? null,
    };
  }
  return out;
}

function sanitizeFailureIntelligenceForExternal(input: unknown): unknown {
  const fi = toRecord(input);
  const insightsRaw = Array.isArray(fi.insights) ? fi.insights : [];
  const insights = insightsRaw.map((insight) => {
    const i = toRecord(insight);
    return {
      angle: i.angle ?? null,
      delta_code: i.delta_code ?? null,
      category: i.category ?? null,
      cluster_key: i.cluster_key ?? null,
      summary: i.summary ?? null,
    };
  });

  return {
    failed_angles: Array.isArray(fi.failed_angles) ? fi.failed_angles : [],
    primary_failure_category: fi.primary_failure_category ?? null,
    primary_failure_summary: fi.primary_failure_summary ?? null,
    insights,
  };
}

function toMinimalProductProof(input: unknown): Record<string, unknown> {
  const productProof = toRecord(input);
  const anglesRaw = Array.isArray(productProof.angles) ? productProof.angles : [];
  const angles = anglesRaw.map((a) => {
    const angle = toRecord(a);
    return {
      angle: angle.angle ?? null,
      applicable: Boolean(angle.applicable),
      status: angle.status ?? null,
    };
  });
  return {
    proof_status: productProof.proof_status ?? null,
    angles,
  };
}

export function applyProofDisclosureView(
  responseBody: Record<string, unknown>,
  view: ProofDisclosureView
): Record<string, unknown> {
  if (view === "internal") return responseBody;

  if (view === "minimal" || view === "adversarial_safe") {
    const proofListSummary = responseBody.proof_list_summary;
    return {
      ok: responseBody.ok ?? false,
      canonical_event_type: responseBody.canonical_event_type ?? null,
      product_proof: toMinimalProductProof(responseBody.product_proof),
      ...(proofListSummary !== undefined ? { proof_list_summary: proofListSummary } : {}),
      ...(view === "adversarial_safe" ? { message: "Integrity verification completed." } : {}),
    };
  }

  const identity = responseBody.identity;
  const proofListSummary = responseBody.proof_list_summary;
  const fiSanitized = sanitizeFailureIntelligenceForExternal(responseBody.failure_intelligence);
  return {
    ok: responseBody.ok ?? false,
    canonical_event_type: responseBody.canonical_event_type ?? null,
    ...(identity !== undefined ? { identity } : {}),
    source_type_key: responseBody.source_type_key ?? null,
    subject_rail: responseBody.subject_rail ?? null,
    proof_units: sanitizeProofUnitsForExternal(responseBody.proof_units),
    product_proof: sanitizeProductProofForExternal(responseBody.product_proof),
    failure_intelligence: fiSanitized,
    failure_rollup: fiSanitized,
    evidence_refs: Array.isArray(responseBody.evidence_refs) ? responseBody.evidence_refs : [],
    anchor_metadata:
      responseBody.anchor_metadata && typeof responseBody.anchor_metadata === "object"
        ? normalizeAnchorMetadata(responseBody.anchor_metadata as Record<string, unknown>)
        : normalizeAnchorMetadata(null, { anchoringEnabled: false }),
    linked_events: Array.isArray(responseBody.linked_events) ? responseBody.linked_events : [],
    status: responseBody.status ?? null,
    subject_id: typeof responseBody.subject_id === "string" ? responseBody.subject_id : null,
    ...(proofListSummary !== undefined ? { proof_list_summary: proofListSummary } : {}),
  };
}

/**
 * `GET /failures` list: internal is full locator rows; other views reduce sensitive fields.
 */
export function applyFailuresListDisclosureView(
  body: {
    items: FailureListItem[];
    page: { limit: number; offset: number; total: number };
  },
  view: ProofDisclosureView
): Record<string, unknown> {
  if (view === "internal") {
    return body as unknown as Record<string, unknown>;
  }

  if (view === "external") {
    return {
      items: body.items.map((it) => ({
        event_id: it.event_id,
        angle: it.angle,
        host: it.host,
        created_at: it.created_at,
      })),
      page: body.page,
    };
  }

  return {
    items: body.items.map((it) => ({
      angle: it.angle,
      host: it.host,
    })),
    page: body.page,
    ...(view === "adversarial_safe" ? { message: "Integrity verification completed." } : {}),
  };
}
