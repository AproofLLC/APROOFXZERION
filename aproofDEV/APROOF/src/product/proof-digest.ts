/**
 * Deterministic proof digest: stable field subset only (see PRODUCT_PROOF_RULES.DIGEST_RULE).
 */

import { createHash } from "node:crypto";
import type { ProductProof } from "./product-proof.js";
import { PRODUCT_ANGLE_NAMES } from "./product-proof.js";
import { stableStringify } from "../protocol/event-hashing.js";

export interface HashableAngleResult {
  angle: string;
  status: string;
  reason_code: string;
  summary: string;
  evidence_refs: string[];
  applicable?: boolean;
  sources_state?: "present" | "no sources";
  baseline_ref?: string | null;
  validator_ref?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface HashableFlag {
  flag_id: string;
  code: string;
  severity: string;
  angle: string | null;
  title: string;
  message: string;
  evidence_refs: string[];
}

export interface HashableFailureLocator {
  angle: string | null;
  step: string | null;
  reason_code: string | null;
  detail: string | null;
  failure_type: string | null;
  baseline_rule_id: string | null;
  missing_fields: string[];
}

export interface HashableProofPayload {
  proof_id: string;
  org_id: string;
  subject_id: string;
  subject_type: string;
  raw_event_id: string;
  canonical_event_id: string;
  event_type: string;
  event_timestamp: string;
  proofability_status: string;
  proofability_reason_code: string | null;
  proof_status: string;
  angles: HashableAngleResult[];
  flags: HashableFlag[];
  failure_locator: HashableFailureLocator | null;
  source_system: string | null;
  source_event_ref: string | null;
  canonicalization_version: string;
  verifier_version: string;
  policy_version: string | null;
  baseline_version: string | null;

  // Event identity fields for deterministic hashing
  event_id: string;
  event_lineage_id: string;
  event_version: number;
  lineage_status: string;
  lineage_reason: string;
  matched_prior_event_id: string | null;
  canonical_hash: string;
  artifact_hash: string | null;
  occurrence_hash: string | null;
}

/**
 * Maps ProductProof → stable payload for hashing.
 * Excludes: received_at, proof_summary, flags_count, highest_severity, anchor_*, created_at, updated_at, proof_digest.
 * Normalizes optional angle fields so undefined/null cannot drift between write and reconstruction.
 */
export function toHashableProofPayload(proof: ProductProof): HashableProofPayload {
  return {
    proof_id: proof.proof_id,
    org_id: proof.org_id,
    subject_id: proof.subject_id,
    subject_type: proof.subject_type,
    raw_event_id: proof.raw_event_id,
    canonical_event_id: proof.canonical_event_id,
    event_type: proof.event_type,
    event_timestamp: proof.event_timestamp,
    proofability_status: proof.proofability_status,
    proofability_reason_code: proof.proofability_reason_code ?? null,
    proof_status: proof.proof_status,
    angles: PRODUCT_ANGLE_NAMES.map(angleName => {
      const angle = proof.angles.find(a => a.angle === angleName);
      if (!angle) {
        throw new Error(`Missing angle ${angleName} in proof for hashing`);
      }
      return {
        angle: angle.angle,
        status: angle.status,
        reason_code: angle.reason_code,
        summary: angle.summary,
        evidence_refs: [...angle.evidence_refs].sort(),
        applicable: angle.applicable ?? true,
        sources_state:
          angle.sources_state ??
          (angle.evidence_refs.length > 0 ? "present" : "no sources"),
        baseline_ref: angle.baseline_ref ?? null,
        validator_ref: angle.validator_ref ?? null,
        metadata: angle.metadata ?? null,
      };
    }),
    flags: [...proof.flags]
      .map((f) => ({
        flag_id: f.flag_id,
        code: f.code,
        severity: f.severity,
        angle: f.angle ?? null,
        title: f.title,
        message: f.message,
        evidence_refs: [...(f.evidence_refs ?? [])].sort(),
      }))
      .sort((a, b) => a.flag_id.localeCompare(b.flag_id)),
    failure_locator: proof.failure_locator
      ? {
          angle: proof.failure_locator.angle ?? null,
          step: proof.failure_locator.step ?? null,
          reason_code: proof.failure_locator.reason_code ?? null,
          detail: proof.failure_locator.detail ?? null,
          failure_type: proof.failure_locator.failure_type ?? null,
          baseline_rule_id: proof.failure_locator.baseline_rule_id ?? null,
          missing_fields: [...(proof.failure_locator.missing_fields ?? [])].sort(),
        }
      : null,
    source_system: proof.source_system ?? null,
    source_event_ref: proof.source_event_ref ?? null,
    canonicalization_version: proof.canonicalization_version,
    verifier_version: proof.verifier_version,
    policy_version: proof.policy_version ?? null,
    baseline_version: proof.baseline_version ?? null,

    // Event identity fields
    event_id: proof.event_id,
    event_lineage_id: proof.event_lineage_id,
    event_version: proof.event_version,
    lineage_status: proof.lineage_status,
    lineage_reason: proof.lineage_reason,
    matched_prior_event_id: proof.matched_prior_event_id,
    canonical_hash: proof.canonical_hash,
    artifact_hash: proof.artifact_hash ?? null,
    occurrence_hash: proof.occurrence_hash ?? null,
  };
}

/** SHA256 hex of stable JSON; prefix matches product examples. */
export function computeProofDigest(payload: HashableProofPayload): string {
  const hex = createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
  return `sha256:${hex}`;
}

/** Per-angle stableStringify hashes for digest drift diagnostics. */
export function proofDigestAngleHashes(proof: ProductProof): Record<string, string> {
  const hashable = toHashableProofPayload(proof);
  const out: Record<string, string> = {};
  for (const a of hashable.angles) {
    out[a.angle] = createHash("sha256").update(stableStringify(a), "utf8").digest("hex");
  }
  return out;
}

export type ProofDigestIdentityBlock = Pick<
  HashableProofPayload,
  | "event_id"
  | "event_lineage_id"
  | "event_version"
  | "lineage_status"
  | "lineage_reason"
  | "matched_prior_event_id"
  | "canonical_hash"
  | "artifact_hash"
  | "occurrence_hash"
>;

export function proofDigestIdentityBlock(proof: ProductProof): ProofDigestIdentityBlock {
  const h = toHashableProofPayload(proof);
  return {
    event_id: h.event_id,
    event_lineage_id: h.event_lineage_id,
    event_version: h.event_version,
    lineage_status: h.lineage_status,
    lineage_reason: h.lineage_reason,
    matched_prior_event_id: h.matched_prior_event_id,
    canonical_hash: h.canonical_hash,
    artifact_hash: h.artifact_hash,
    occurrence_hash: h.occurrence_hash,
  };
}

/** Structured debug when write vs read digests disagree (logs / strict checks). */
export function proofDigestDriftReport(params: {
  label: string;
  write_digest: string;
  read_digest: string;
  write_proof: ProductProof;
  read_proof: ProductProof;
}): Record<string, unknown> {
  return {
    label: params.label,
    write_digest: params.write_digest,
    read_digest: params.read_digest,
    write_angle_hashes: proofDigestAngleHashes(params.write_proof),
    read_angle_hashes: proofDigestAngleHashes(params.read_proof),
    write_identity: proofDigestIdentityBlock(params.write_proof),
    read_identity: proofDigestIdentityBlock(params.read_proof),
    write_hashable_json: stableStringify(toHashableProofPayload(params.write_proof)),
    read_hashable_json: stableStringify(toHashableProofPayload(params.read_proof)),
  };
}

/**
 * Enforce identical digests (e.g. POST vs GET). Set APROOF_STRICT_DIGEST=1 to throw; otherwise returns a report object.
 */
export function assertProofDigestParity(
  writeDigest: string,
  readDigests: string[],
  proofs?: { write: ProductProof; reads: ProductProof[] }
): { ok: true } | { ok: false; report: Record<string, unknown> } {
  const all = [writeDigest, ...readDigests];
  const ok = all.every((d) => d === writeDigest);
  if (ok) return { ok: true };

  const report: Record<string, unknown> = {
    error: "proof_digest_mismatch",
    write_digest: writeDigest,
    read_digests: readDigests,
  };
  if (proofs && proofs.reads[0]) {
    Object.assign(
      report,
      proofDigestDriftReport({
        label: "write_vs_read0",
        write_digest: writeDigest,
        read_digest: readDigests[0] ?? "",
        write_proof: proofs.write,
        read_proof: proofs.reads[0]!,
      })
    );
  }

  if (process.env.APROOF_STRICT_DIGEST?.trim() === "1") {
    throw new Error(`proof_digest_mismatch: ${JSON.stringify(report)}`);
  }
  return { ok: false, report };
}
