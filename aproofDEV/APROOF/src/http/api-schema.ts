/**
 * Zod contracts for HTTP responses (internal / `x-proof-view: internal`).
 *
 * Collection & nullability (proof reads):
 * - Arrays in JSON are never null (e.g. `angles`, `flags`, `failed_angles`, `insights`, `evidence_refs`).
 * - Angle `metadata` defaults to `{}`; `compared_fields` / `changed_fields` default to `[]`.
 * - Optional nested objects use `null` in JSON where “explicitly absent” (e.g. `failure_locator` when verified).
 * - `proof_sufficiency` is always present on proofable `product_proof` objects returned by this API.
 */
import { z } from "zod";
import { PRODUCT_ANGLE_NAMES } from "../product/product-proof.js";

/** Product JSON may include legacy `llm`; DB rails use `model`. User creation uses `model` only (see RAIL_TYPES / POST /subjects). */
export const SubjectTypeSchema = z.enum(["llm", "model", "agent", "service", "endpoint", "system"]);
export const ProofStatusSchema = z.enum(["verified", "flagged", "failed", "unproofable"]);
export const ProofabilityStatusSchema = z.enum(["proofable", "unproofable"]);
export const AnchorStatusSchema = z.enum(["pending", "batched", "anchored", "anchor_failed"]);
export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const AngleNameSchema = z.enum([
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
]);
export const AngleResultStatusSchema = z.enum([
  "pass",
  "fail",
  "warn",
  "not_applicable",
  "insufficient_evidence",
]);

export const ProductAngleResultSchema = z.object({
  angle: AngleNameSchema,
  status: AngleResultStatusSchema,
  reason_code: z.string(),
  summary: z.string(),
  evidence_refs: z.array(z.string()),
  baseline_present: z.boolean(),
  baseline_status: z.enum(["present", "missing", "insufficient", "unsupported"]),
  baseline_source: z.enum(["declared", "observed", "policy", "mixed", "none"]),
  baseline_version: z.string().min(1),
  baseline_rule_id: z.string().min(1),
  baseline_summary: z.string().nullable(),
  expected_summary: z.string().nullable(),
  actual_summary: z.string().nullable(),
  delta_detected: z.boolean(),
  delta_type: z.enum(["none", "drift", "violation", "missing", "unknown"]),
  diff_summary: z.string().nullable(),
  compared_fields: z.array(z.string()).default([]),
  changed_fields: z.array(z.string()).default([]),
  applicable: z.boolean(),
  sources_state: z.enum(["present", "no sources"]).optional(),
  baseline_ref: z.string().nullable().optional(),
  validator_ref: z.string().nullable().optional(),
  metadata: z.record(z.any()).default({}),
});

export const ProductFlagSchema = z.object({
  flag_id: z.string(),
  code: z.string(),
  severity: SeveritySchema,
  angle: AngleNameSchema.nullable().optional(),
  title: z.string(),
  message: z.string(),
  evidence_refs: z.array(z.string()).default([]),
});

export const ProductFailureLocatorSchema = z.object({
  angle: z.union([AngleNameSchema, z.literal("contract")]),
  step: z.string().min(1),
  reason_code: z.string().min(1),
  detail: z.string().min(1),
  failure_type: z
    .enum(["baseline_missing", "no_source", "insufficient_context", "diff_violation", "drift", "invalid_data"])
    .optional(),
  missing_fields: z.array(z.string()).optional(),
  baseline_rule_id: z.string().nullable().optional(),
});

export const ProductProofSchema = z
  .object({
    proof_id: z.string(),
    org_id: z.string(),
    subject_id: z.string(),
    subject_type: SubjectTypeSchema,
    raw_event_id: z.string(),
    canonical_event_id: z.string(),
    event_type: z.string(),
    event_timestamp: z.string(),
    received_at: z.string(),
    source_system: z.string().nullable().optional(),
    source_event_ref: z.string().nullable().optional(),
    proofability_status: ProofabilityStatusSchema,
    proofability_reason_code: z.string().nullable().optional(),
    proofability_summary: z.string().nullable().optional(),
    proof_status: ProofStatusSchema,
    proof_summary: z.string(),
    angles: z.array(ProductAngleResultSchema),
    contract_valid: z.boolean(),
    contract_failure_reason: z.string().nullable(),
    flags: z.array(ProductFlagSchema),
    flags_count: z.number(),
    highest_severity: SeveritySchema.nullable().optional(),
    failure_locator: ProductFailureLocatorSchema.nullable().optional(),
    canonicalization_version: z.string(),
    verifier_version: z.string(),
    policy_version: z.string().nullable().optional(),
    baseline_version: z.string().nullable().optional(),
    proof_digest: z.string(),
    anchor_status: AnchorStatusSchema,
    anchor_batch_id: z.string().nullable().optional(),
    anchor_chain: z.string().nullable().optional(),
    anchor_payload: z.string().nullable().optional(),
    anchor_tx_hash: z.string().nullable().optional(),
    anchor_explorer_url: z.string().nullable().optional(),
    anchor_wallet_public_key: z.string().nullable().optional(),
    anchor_confirmation_status: z.string().nullable().optional(),
    anchor_error_message: z.string().nullable().optional(),
    anchor_root_hash: z.string().nullable().optional(),
    anchor_proof_count: z.number().nullable().optional(),
    anchor_proof_ids: z.array(z.string()).nullable().optional(),
    anchor_timestamp: z.string().nullable().optional(),
    solana_sandbox: z
      .object({
        route: z.literal("solana-sandbox"),
        chain_family: z.literal("solana"),
        cluster: z.string(),
        batch_hash: z.string(),
        anchor_payload: z.string().nullable(),
        simulated_signature: z.string(),
        simulated_slot: z.string(),
        simulated_commitment: z.string(),
        external_attested: z.literal(false),
      })
      .nullable()
      .optional(),
    created_at: z.string(),
    updated_at: z.string(),

    // Event identity fields
    event_id: z.string(),
    event_lineage_id: z.string(),
    event_version: z.number(),
    artifact_id: z.string(),
    lineage_status: z.enum(["new_lineage", "existing_lineage_same_state", "existing_lineage_new_version"]),
    lineage_reason: z.string(),
    matched_prior_event_id: z.string().nullable(),
    canonical_hash: z.string(),
    artifact_hash: z.string().nullable().optional(),
    occurrence_hash: z.string().nullable().optional(),
    proof_sufficiency: z.enum(["full", "qualified", "insufficient"]),
  })
  .superRefine((pp, ctx) => {
    if (pp.angles.length !== PRODUCT_ANGLE_NAMES.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `angles must contain exactly ${PRODUCT_ANGLE_NAMES.length} entries`,
        path: ["angles"],
      });
      return;
    }
    for (let i = 0; i < PRODUCT_ANGLE_NAMES.length; i++) {
      const expected = PRODUCT_ANGLE_NAMES[i];
      const got = pp.angles[i]?.angle;
      if (got !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `angles[${i}] must be "${expected}" (canonical product order)`,
          path: ["angles", i],
        });
        return;
      }
    }
  });

export const ApiIdentitySnapshotSchema = z.object({
  event_id: z.string(),
  artifact_id: z.string(),
  event_lineage_id: z.string(),
  event_version: z.number(),
  canonical_hash: z.string(),
  logical_hash: z.string(),
});

export const PipelineProofUnitSchema = z.object({
  proof_id: z.string(),
  status: z.enum(["conformant", "flagged", "violated", "unverifiable"]),
  angle: AngleNameSchema,
  delta_code: z.string().nullable(),
});

export const FailureInsightSchema = z.object({
  angle: z.string(),
  delta_code: z.string().nullable(),
  category: z.string(),
  cluster_key: z.string(),
  summary: z.string(),
});

export const FailureRollupSchema = z.object({
  failed_angles: z.array(z.string()),
  primary_failure_category: z.string().nullable(),
  primary_failure_summary: z.string().nullable(),
  insights: z.array(FailureInsightSchema),
});

/** Proof-level anchor block (duplicates key fields from `product_proof` for panel UIs). */
export const SolanaSandboxAttestationSchema = z.object({
  route: z.literal("solana-sandbox"),
  chain_family: z.literal("solana"),
  cluster: z.string(),
  batch_hash: z.string(),
  anchor_payload: z.string().nullable(),
  simulated_signature: z.string(),
  simulated_slot: z.string(),
  simulated_commitment: z.string(),
  external_attested: z.literal(false),
});

export const AnchorMetadataSchema = z.object({
  anchor_id: z.string().nullable().optional(),
  batch_id: z.string().nullable().optional(),
  root_hash: z.string().nullable().optional(),
  proof_count: z.number().nullable().optional(),
  proof_ids: z.array(z.string()).optional(),
  network: z.string().nullable().optional(),
  anchor_mode: z.string().nullable().optional(),
  tx_signature: z.string().nullable().optional(),
  explorer_url: z.string().nullable().optional(),
  wallet_public_key: z.string().nullable().optional(),
  status: z.enum(["pending", "confirmed", "failed", "mocked", "disabled"]).optional(),
  confirmation_status: z.string().nullable().optional(),
  anchored_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  error_message: z.string().nullable().optional(),
  anchor_status: AnchorStatusSchema,
  anchor_batch_id: z.string().nullable(),
  anchor_chain: z.string().nullable(),
  anchor_payload: z.string().nullable().optional(),
  anchor_tx_hash: z.string().nullable(),
  anchor_timestamp: z.string().nullable(),
  solana_sandbox: SolanaSandboxAttestationSchema.nullable().optional(),
  network_family: z.union([z.literal("Solana"), z.null()]).optional(),
  cluster: z.string().nullable().optional(),
  route: z.literal("solana-sandbox").nullable().optional(),
  external_attested: z.boolean().nullable().optional(),
});

export const ProofVerificationStatusSchema = z.enum(["valid", "invalid", "not_anchored", "error"]);
export const ProofVerificationResponseSchema = z.object({
  proof_id: z.string(),
  subject_id: z.string().nullable(),
  event_id: z.string().nullable(),
  batch_id: z.string().nullable(),
  verification_status: ProofVerificationStatusSchema,
  computed_root_hash: z.string().nullable(),
  anchored_root_hash: z.string().nullable(),
  proof_digest: z.string().nullable(),
  tx_signature: z.string().nullable(),
  explorer_url: z.string().nullable(),
  network: z.string().nullable(),
  anchor_status: z.string().nullable(),
  verified_at: z.string(),
  mismatch_reason: z.string().nullable(),
  error_message: z.string().nullable(),
});

export const LinkedEventRefSchema = z.object({
  event_id: z.string(),
  relationship: z.string(),
});

export const ApiEnvelopeSchema = z.object({
  ok: z.literal(true),
  source_type_key: z.string(),
  raw_event_id: z.string(),
  event_id: z.string(),
  canonical_event_type: z.string(),
  subject_rail: z.string(),
  proof_units: z.array(PipelineProofUnitSchema),
  failure_locators_created: z.number(),
  lineage_anomaly: z.union([z.literal("OUT_OF_ORDER_LINEAGE_VERSION"), z.null()]),
  identity: ApiIdentitySnapshotSchema.optional(),
  product_proof: ProductProofSchema,
  failure_intelligence: FailureRollupSchema,
  /** Same object shape as `failure_intelligence` (stable alias for UI contracts). */
  failure_rollup: FailureRollupSchema,
  evidence_refs: z.array(z.string()),
  anchor_metadata: AnchorMetadataSchema,
  linked_events: z.array(LinkedEventRefSchema),
  /** Mirrors `product_proof.proof_status`. */
  status: ProofStatusSchema,
  /** Mirrors `product_proof.subject_id`. */
  subject_id: z.string(),
});

/** Row-level summary for list UIs (`GET /subjects/:id/proofs`, internal view). */
export const ProofListSummarySchema = z.object({
  proof_id: z.string(),
  event_id: z.string(),
  event_lineage_id: z.string(),
  event_version: z.number(),
  event_type: z.string(),
  event_timestamp: z.string(),
  proof_status: ProofStatusSchema,
  proof_sufficiency: z.enum(["full", "qualified", "insufficient"]),
  flags_count: z.number(),
  highest_severity: SeveritySchema.nullable(),
  contract_valid: z.boolean(),
  anchor_status: AnchorStatusSchema,
  created_at: z.string(),
  failure_locator_summary: z
    .object({
      angle: z.string(),
      step: z.string(),
      reason_code: z.string(),
    })
    .nullable(),
  failed_angles: z.array(z.string()),
  primary_failure_category: z.string().nullable(),
});

export const ProofListItemSchema = ApiEnvelopeSchema.extend({
  proof_list_summary: ProofListSummarySchema,
});

export const ProofListResponseSchema = z.object({
  items: z.array(ProofListItemSchema),
  page: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export const InternalFailureItemSchema = z.object({
  id: z.string(),
  proof_id: z.string(),
  event_id: z.string(),
  angle: z.string(),
  failure_zone: z.string(),
  subject: z.string(),
  host: z.string(),
  inspection_path: z.string(),
  created_at: z.string(),
});

export const FailuresListResponseSchema = z.object({
  items: z.array(InternalFailureItemSchema),
  page: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export type ApiEnvelope = z.infer<typeof ApiEnvelopeSchema>;
export type ProductProof = z.infer<typeof ProductProofSchema>;
export type ProofListResponse = z.infer<typeof ProofListResponseSchema>;
export type FailuresListResponse = z.infer<typeof FailuresListResponseSchema>;
export type ProofVerificationResponse = z.infer<typeof ProofVerificationResponseSchema>;
