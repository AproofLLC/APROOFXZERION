/// <reference path="../vitest-test-globals.d.ts" />
import {
  batchHashFromOrderedProofDigests,
  mvpAnchorBatchHashes,
  proofDigest,
} from "./anchor-batch-hash.js";

describe("MVP anchor + proof digest", () => {
  it("proof_digest is stable for fixed fields", () => {
    const a = proofDigest({
      proof_id: "550e8400-e29b-41d4-a716-446655440000",
      angle: "policy_integrity",
      status: "conformant",
      delta_code: null,
    });
    const b = proofDigest({
      proof_id: "550e8400-e29b-41d4-a716-446655440000",
      angle: "policy_integrity",
      status: "conformant",
      delta_code: null,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("batch_hash depends on order; root_hash equals batch_hash (MVP)", () => {
    const d1 = proofDigest({
      proof_id: "00000000-0000-4000-8000-000000000001",
      angle: "policy_integrity",
      status: "flagged",
      delta_code: "X",
    });
    const d2 = proofDigest({
      proof_id: "00000000-0000-4000-8000-000000000002",
      angle: "model_identity_integrity",
      status: "violated",
      delta_code: null,
    });
    const h12 = batchHashFromOrderedProofDigests([d1, d2]);
    const h21 = batchHashFromOrderedProofDigests([d2, d1]);
    expect(h12).not.toBe(h21);

    const mvp = mvpAnchorBatchHashes([d1, d2]);
    expect(mvp.rootHash).toBe(mvp.batchHash);
    expect(mvp.batchHash).toBe(h12);
  });
});
