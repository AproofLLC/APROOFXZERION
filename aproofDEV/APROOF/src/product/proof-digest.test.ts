/// <reference path="../vitest-test-globals.d.ts" />
import { EXAMPLE_PRODUCT_PROOF } from "./product-proof.js";
import { computeProofDigest, toHashableProofPayload } from "./proof-digest.js";

describe("proof-digest", () => {
  it("computeProofDigest is deterministic for the same hashable payload", () => {
    const p = { ...EXAMPLE_PRODUCT_PROOF, proof_digest: "" };
    const h = toHashableProofPayload(p);
    expect(computeProofDigest(h)).toBe(computeProofDigest(h));
  });

  it("ignores proof_digest and other excluded fields when hashing via toHashableProofPayload", () => {
    const base = { ...EXAMPLE_PRODUCT_PROOF, proof_digest: "" };
    const a = toHashableProofPayload(base);
    const b = toHashableProofPayload({
      ...base,
      proof_digest: "sha256:deadbeef",
      proof_summary: "different summary",
      updated_at: "2099-01-01T00:00:00.000Z",
    });
    expect(computeProofDigest(a)).toBe(computeProofDigest(b));
  });
});
