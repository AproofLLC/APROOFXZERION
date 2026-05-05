/**
 * HTTP read-path normalization for proof envelopes (additive, no semantic weakening).
 *
 * Collection / nullability rules for proof reads (internal view):
 * - Arrays exposed on JSON responses are never null (use []).
 * - Angle `evidence_refs`, `compared_fields`, `changed_fields` are always arrays.
 * - Angle `metadata` is always a plain object (use {} when absent).
 * - Optional strings that are unknown use null, not "" (product builder already follows this for most fields).
 *
 * `proof_list_summary` is attached to each proof envelope in `GET /subjects/:id/proofs` so list reads can
 * use a flat summary without dereferencing the full nested `product_proof` first.
 */

import type { FailureRollup } from "../product/failure-intelligence.js";
import type { ProductAngleResult, ProductProof, Severity } from "../product/product-proof.js";
import { normalizeAnchorMetadata } from "./anchor-metadata-normalizer.js";

function normalizeAngleForApi(a: ProductAngleResult): ProductAngleResult {
  return {
    ...a,
    evidence_refs: Array.isArray(a.evidence_refs) ? a.evidence_refs : [],
    compared_fields: Array.isArray(a.compared_fields) ? a.compared_fields : [],
    changed_fields: Array.isArray(a.changed_fields) ? a.changed_fields : [],
    metadata:
      a.metadata !== undefined && a.metadata !== null && typeof a.metadata === "object" && !Array.isArray(a.metadata)
        ? (a.metadata as Record<string, unknown>)
        : {},
  };
}

/**
 * Ensures proof list/detail JSON is deterministic for nested collections on angles.
 * Call on envelopes before schema validation and disclosure.
 */
export function finalizeProductProofForApiResponse(pp: ProductProof): ProductProof {
  const flags = [...pp.flags].sort((a, b) => a.flag_id.localeCompare(b.flag_id));
  return {
    ...pp,
    flags,
    flags_count: flags.length,
    angles: pp.angles.map(normalizeAngleForApi),
  };
}

export type ProofListSummary = {
  proof_id: string;
  event_id: string;
  event_lineage_id: string;
  event_version: number;
  event_type: string;
  event_timestamp: string;
  proof_status: ProductProof["proof_status"];
  proof_sufficiency: NonNullable<ProductProof["proof_sufficiency"]>;
  flags_count: number;
  highest_severity: Severity | null;
  contract_valid: boolean;
  anchor_status: ProductProof["anchor_status"];
  created_at: string;
  failure_locator_summary: {
    angle: string;
    step: string;
    reason_code: string;
  } | null;
  failed_angles: string[];
  primary_failure_category: string | null;
};

export function buildProofListSummary(
  product_proof: ProductProof,
  failure_intelligence: FailureRollup
): ProofListSummary {
  const fl = product_proof.failure_locator;
  return {
    proof_id: product_proof.proof_id,
    event_id: product_proof.event_id,
    event_lineage_id: product_proof.event_lineage_id,
    event_version: product_proof.event_version,
    event_type: product_proof.event_type,
    event_timestamp: product_proof.event_timestamp,
    proof_status: product_proof.proof_status,
    proof_sufficiency: product_proof.proof_sufficiency ?? "insufficient",
    flags_count: product_proof.flags_count,
    highest_severity: product_proof.highest_severity ?? null,
    contract_valid: product_proof.contract_valid,
    anchor_status: product_proof.anchor_status,
    created_at: product_proof.created_at,
    failure_locator_summary: fl
      ? { angle: String(fl.angle), step: fl.step, reason_code: fl.reason_code }
      : null,
    failed_angles: [...failure_intelligence.failed_angles],
    primary_failure_category: failure_intelligence.primary_failure_category,
  };
}

/** Mutates envelope: sets normalized product_proof and proof_list_summary for list responses. */
export function attachProofListSummaryToEnvelope(envelope: Record<string, unknown>): void {
  const rawPp = envelope.product_proof;
  if (!rawPp || typeof rawPp !== "object") return;
  const fi = envelope.failure_intelligence;
  if (!fi || typeof fi !== "object") return;
  const pp = finalizeProductProofForApiResponse(rawPp as ProductProof);
  envelope.product_proof = pp;
  envelope.proof_list_summary = buildProofListSummary(pp, fi as FailureRollup);
  attachFrontendProofEnvelopeFields(envelope);
}

/**
 * Frontend-stable fields on proof event envelopes (internal + validated list items).
 * Mirrors `failure_intelligence` as `failure_rollup`; aggregates proof-level refs and anchor metadata.
 * Requires `product_proof` to already be passed through `finalizeProductProofForApiResponse`.
 */
export function attachFrontendProofEnvelopeFields(envelope: Record<string, unknown>): void {
  const fi = envelope.failure_intelligence;
  if (fi && typeof fi === "object") {
    envelope.failure_rollup = fi;
  }

  const rawPp = envelope.product_proof;
  if (!rawPp || typeof rawPp !== "object") return;
  const pp = rawPp as ProductProof;

  envelope.status = pp.proof_status;
  envelope.subject_id = pp.subject_id;

  const refs = new Set<string>();
  for (const a of pp.angles) {
    for (const r of a.evidence_refs ?? []) {
      if (typeof r === "string" && r.length > 0) refs.add(r);
    }
  }
  envelope.evidence_refs = [...refs].sort((a, b) => a.localeCompare(b));

  const ss = pp.solana_sandbox ?? null;
  const canonical = normalizeAnchorMetadata(
    {
      anchor_id: pp.anchor_batch_id ?? null,
      batch_id: pp.anchor_batch_id ?? null,
      root_hash: pp.anchor_root_hash ?? ss?.batch_hash ?? null,
      proof_count: pp.anchor_proof_count ?? null,
      proof_ids: pp.anchor_proof_ids ?? [],
      network: pp.anchor_chain ?? null,
      cluster: pp.anchor_chain === "solana-devnet" ? "devnet" : (ss?.cluster ?? null),
      anchor_mode: pp.anchor_mode ?? (pp.anchor_chain === "solana-devnet" ? "solana-devnet" : "mock"),
      tx_signature: pp.anchor_tx_hash ?? null,
      explorer_url: pp.anchor_explorer_url ?? null,
      wallet_public_key: pp.anchor_wallet_public_key ?? null,
      confirmation_status: pp.anchor_confirmation_status ?? null,
      anchored_at: pp.anchor_timestamp ?? null,
      created_at: pp.created_at ?? null,
      error_message: pp.anchor_error_message ?? null,
      anchor_status: pp.anchor_status,
      anchor_chain: pp.anchor_chain,
      anchor_tx_hash: pp.anchor_tx_hash,
      anchor_timestamp: pp.anchor_timestamp,
      anchor_batch_id: pp.anchor_batch_id,
    },
    { anchoringEnabled: pp.anchor_chain === "solana-devnet" },
  );
  envelope.anchor_metadata = {
    ...canonical,
    anchor_status: pp.anchor_status,
    anchor_batch_id: pp.anchor_batch_id ?? null,
    anchor_chain: pp.anchor_chain ?? null,
    anchor_payload: pp.anchor_payload ?? null,
    anchor_tx_hash: canonical.tx_signature,
    anchor_timestamp: pp.anchor_timestamp ?? null,
    solana_sandbox: ss,
    network_family: ss ? "Solana" : null,
    route: ss?.route ?? null,
    external_attested: ss ? false : null,
  };

  const linked: { event_id: string; relationship: string }[] = [
    { event_id: pp.event_id, relationship: "canonical" },
  ];
  const rawEv = pp.raw_event_id;
  if (typeof rawEv === "string" && rawEv.length > 0 && rawEv !== pp.event_id) {
    linked.push({ event_id: rawEv, relationship: "raw" });
  }
  linked.sort((a, b) => a.event_id.localeCompare(b.event_id) || a.relationship.localeCompare(b.relationship));
  envelope.linked_events = linked;
}

/** Normalizes product_proof inside a full envelope (POST 201, GET /proofs/:id). */
export function finalizeEnvelopeProductProof(envelope: Record<string, unknown>): void {
  const rawPp = envelope.product_proof;
  if (!rawPp || typeof rawPp !== "object") return;
  envelope.product_proof = finalizeProductProofForApiResponse(rawPp as ProductProof);
  attachFrontendProofEnvelopeFields(envelope);
}
