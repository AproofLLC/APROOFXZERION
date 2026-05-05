import { describe, expect, it } from "vitest";
import { normalizeAnchorMetadata } from "./anchor-metadata-normalizer.js";

describe("normalizeAnchorMetadata", () => {
  it("returns canonical fields for solana devnet row", () => {
    const out = normalizeAnchorMetadata(
      {
        anchor_id: "a1",
        batch_id: "b1",
        root_hash: "r1",
        proof_count: 2,
        proof_ids: ["p1", "p2"],
        network: "solana-devnet",
        cluster: "devnet",
        anchor_mode: "solana-devnet",
        tx_signature: "sig1",
        explorer_url: "https://explorer.solana.com/tx/sig1?cluster=devnet",
        wallet_public_key: "wallet1",
        status: "confirmed",
        confirmation_status: "confirmed",
        anchored_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        error_message: null,
      },
      { anchoringEnabled: true },
    );
    expect(out.status).toBe("confirmed");
    expect(out.network).toBe("solana-devnet");
    expect(out.proof_ids).toEqual(["p1", "p2"]);
  });

  it("maps legacy aliases", () => {
    const out = normalizeAnchorMetadata({
      anchor_batch_id: "b1",
      anchor_chain: "solana-devnet",
      anchor_tx_hash: "sig1",
      anchor_timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(out.batch_id).toBe("b1");
    expect(out.network).toBe("solana-devnet");
    expect(out.tx_signature).toBe("sig1");
    expect(out.anchored_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns pending when missing anchor in devnet mode", () => {
    const out = normalizeAnchorMetadata(null, { anchoringEnabled: true });
    expect(out.status).toBe("pending");
    expect(out.proof_ids).toEqual([]);
  });

  it("returns failed with safe error", () => {
    const out = normalizeAnchorMetadata({
      error_message: "SOLANA_ANCHOR_FAILED: Solana memo transaction failed to confirm.",
    });
    expect(out.status).toBe("failed");
    expect(out.error_message).toContain("SOLANA_ANCHOR_FAILED");
  });

  it("returns mocked when anchoring is off", () => {
    const out = normalizeAnchorMetadata(null, { anchoringEnabled: false });
    expect(out.status).toBe("mocked");
  });

  it("sandbox/mock never impersonates solana-devnet", () => {
    const out = normalizeAnchorMetadata({
      batch_id: "b1",
      anchor_mode: "sandbox",
      chain_name: "solana-sandbox",
      tx_signature: null,
      explorer_url: null,
    });
    expect(out.network).toBe("sandbox");
    expect(out.cluster).toBeNull();
    expect(out.status).toBe("mocked");
  });

  it("drops explorer/signature fields for non-devnet modes", () => {
    const out = normalizeAnchorMetadata({
      batch_id: "b1",
      anchor_mode: "mock",
      tx_signature: "fake-sig",
      explorer_url: "https://explorer.solana.com/tx/fake?cluster=devnet",
      wallet_public_key: "fake-wallet",
    });
    expect(out.tx_signature).toBe("fake-sig");
    expect(out.explorer_url).toBeNull();
    expect(out.wallet_public_key).toBeNull();
    expect(out.status).toBe("mocked");
  });
});
