import { describe, expect, it } from "vitest";
import {
  buildSolanaSandboxAttestationForBatch,
  simulatedSignatureFromBatchHash,
  simulatedSlotFromBatchHash,
} from "./solana-simulated-attestation.js";
import { SOLANA_SANDBOX_ROUTE } from "./sandbox-anchor-constants.js";

describe("solana simulated attestation", () => {
  const hash = "a".repeat(64);

  it("derives stable signature and slot for the same batch hash", () => {
    expect(simulatedSignatureFromBatchHash(hash)).toBe(simulatedSignatureFromBatchHash(hash));
    expect(simulatedSlotFromBatchHash(hash)).toBe(simulatedSlotFromBatchHash(hash));
    expect(simulatedSignatureFromBatchHash(hash)).toMatch(/^ssim1_[a-f0-9]{64}$/);
    expect(simulatedSlotFromBatchHash(hash)).toMatch(/^\d+$/);
  });

  it("buildSolanaSandboxAttestationForBatch maps solana-sandbox rows and marks external_attested false", () => {
    const a = buildSolanaSandboxAttestationForBatch({
      chainName: SOLANA_SANDBOX_ROUTE,
      batchHash: hash,
      anchorPayload: `aproof:v1:${hash}`,
      chainFamily: "solana",
      cluster: "sandbox-devnet",
      simulatedSignature: simulatedSignatureFromBatchHash(hash),
      simulatedSlot: simulatedSlotFromBatchHash(hash),
      simulatedCommitment: "simulated_finalized",
      externalAttested: false,
    });
    expect(a).not.toBeNull();
    expect(a!.external_attested).toBe(false);
    expect(a!.route).toBe("solana-sandbox");
  });
});
