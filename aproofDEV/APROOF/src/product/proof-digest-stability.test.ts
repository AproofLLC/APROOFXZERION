/// <reference path="../vitest-test-globals.d.ts" />
import { describe, expect, it } from "vitest";
import type { ProductProof } from "./product-proof.js";
import { PRODUCT_ANGLE_NAMES } from "./product-proof.js";
import {
  assertProofDigestParity,
  computeProofDigest,
  proofDigestAngleHashes,
  toHashableProofPayload,
} from "./proof-digest.js";
import { stableStringify } from "../protocol/event-hashing.js";

function sevenAngleStub(overrides: Partial<ProductProof["angles"][0]>[] = []): ProductProof["angles"] {
  return PRODUCT_ANGLE_NAMES.map((angle, i) => ({
    angle,
    applicable: true,
    status: "pass" as const,
    reason_code: "OK",
    summary: "s",
    evidence_refs: [`pf-${i}`],
    sources_state: "present" as const,
    ...overrides[i],
  }));
}

function minimalProductProof(angles: ProductProof["angles"]): ProductProof {
  return {
    proof_id: "policy-proof",
    org_id: "o1",
    subject_id: "s1",
    subject_type: "system",
    raw_event_id: "r1",
    canonical_event_id: "e1",
    event_type: "policy_checked",
    event_timestamp: "2026-04-07T12:00:00.000Z",
    received_at: "2026-04-07T12:00:01.000Z",
    proofability_status: "proofable",
    proof_status: "verified",
    proof_summary: "ok",
    angles,
    contract_valid: true,
    contract_failure_reason: null,
    flags: [],
    flags_count: 0,
    canonicalization_version: "0.1.0",
    verifier_version: "0.1.0",
    proof_digest: "",
    anchor_status: "pending",
    created_at: "2026-04-07T12:00:01.000Z",
    updated_at: "2026-04-07T12:00:01.000Z",
    event_id: "e1",
    event_lineage_id: "l1",
    event_version: 1,
    lineage_status: "new_lineage",
    lineage_reason: "first",
    matched_prior_event_id: null,
    canonical_hash: "ch",
    artifact_hash: "ah",
    occurrence_hash: "oh",
  };
}

describe("proof digest determinism", () => {
  it("same logical proof object with shuffled key order yields same digest", () => {
    const base = minimalProductProof(sevenAngleStub());
    const shuffled: ProductProof = {
      ...base,
      angles: base.angles.map((a) => ({
        summary: a.summary,
        reason_code: a.reason_code,
        angle: a.angle,
        status: a.status,
        applicable: a.applicable,
        sources_state: a.sources_state,
        evidence_refs: [...a.evidence_refs],
      })),
    };
    expect(computeProofDigest(toHashableProofPayload(base))).toBe(
      computeProofDigest(toHashableProofPayload(shuffled))
    );
  });

  it("omitted applicable/sources_state/metadata normalize to stable hash inputs", () => {
    const withExplicit = minimalProductProof(sevenAngleStub());
    const withOmitted = minimalProductProof(
      sevenAngleStub().map((a) => {
        const { applicable, sources_state, metadata, ...rest } = a;
        return {
          ...rest,
          applicable: undefined as boolean | undefined,
          sources_state: undefined as "present" | "no sources" | undefined,
          metadata: undefined,
        };
      })
    );
    const h1 = computeProofDigest(toHashableProofPayload(withExplicit));
    const h2 = computeProofDigest(toHashableProofPayload(withOmitted));
    expect(h1).toBe(h2);
  });

  it("assertProofDigestParity succeeds when digests match", () => {
    const p = minimalProductProof(sevenAngleStub());
    const d = computeProofDigest(toHashableProofPayload(p));
    expect(assertProofDigestParity(d, [d, d], { write: p, reads: [p, p] }).ok).toBe(true);
  });

  it("proofDigestAngleHashes has seven keys", () => {
    const p = minimalProductProof(sevenAngleStub());
    const h = proofDigestAngleHashes(p);
    expect(Object.keys(h).length).toBe(7);
  });

  it("stableStringify of hashable payload is deterministic", () => {
    const p = minimalProductProof(sevenAngleStub());
    const a = stableStringify(toHashableProofPayload(p));
    const b = stableStringify(toHashableProofPayload(p));
    expect(a).toBe(b);
  });

  it("includes deterministic failure_locator in digest payload parity", () => {
    const p = minimalProductProof(sevenAngleStub());
    p.proof_status = "flagged";
    p.failure_locator = {
      angle: "policy_integrity",
      step: "baseline_resolution",
      reason_code: "BASELINE_MISSING",
      detail: "Required policy_integrity baseline was not found for this subject at event time.",
    };
    const d1 = computeProofDigest(toHashableProofPayload(p));
    const d2 = computeProofDigest(toHashableProofPayload({ ...p }));
    expect(d1).toBe(d2);
  });

  it("guards digest material field-set for accidental drift", () => {
    const p = minimalProductProof(sevenAngleStub());
    const payload = toHashableProofPayload(p) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "angles",
      "artifact_hash",
      "baseline_version",
      "canonical_event_id",
      "canonical_hash",
      "canonicalization_version",
      "event_id",
      "event_lineage_id",
      "event_timestamp",
      "event_type",
      "event_version",
      "failure_locator",
      "flags",
      "lineage_reason",
      "lineage_status",
      "matched_prior_event_id",
      "occurrence_hash",
      "org_id",
      "policy_version",
      "proof_id",
      "proof_status",
      "proofability_reason_code",
      "proofability_status",
      "raw_event_id",
      "source_event_ref",
      "source_system",
      "subject_id",
      "subject_type",
      "verifier_version",
    ]);
  });
});
