import { describe, expect, it } from "vitest";
import { evaluateZerionScopedPolicy } from "./zerion-policy-gate.js";

describe("evaluateZerionScopedPolicy", () => {
  const occurred = new Date("2026-05-09T12:00:00.000Z");
  const validUntil = "2026-12-31T23:59:59.000Z";

  it("rejects disallowed chain with POLICY_CHAIN_NOT_ALLOWED", () => {
    const r = evaluateZerionScopedPolicy({
      intended_chain: "solana-mainnet",
      spend_usd: 1,
      asset: "SOL",
      occurred_at: occurred,
      policy_valid_until_iso: validUntil,
    });
    expect(r).toEqual({ ok: false, reason_code: "POLICY_CHAIN_NOT_ALLOWED" });
  });

  it("rejects spend above env max", () => {
    const r = evaluateZerionScopedPolicy({
      intended_chain: "solana-devnet",
      spend_usd: 999,
      asset: "SOL",
      occurred_at: occurred,
      policy_valid_until_iso: validUntil,
    });
    expect(r).toEqual({ ok: false, reason_code: "POLICY_SPEND_LIMIT_EXCEEDED" });
  });

  it("rejects unapproved asset", () => {
    const r = evaluateZerionScopedPolicy({
      intended_chain: "solana-devnet",
      spend_usd: 1,
      asset: "ETH",
      occurred_at: occurred,
      policy_valid_until_iso: validUntil,
    });
    expect(r).toEqual({ ok: false, reason_code: "POLICY_ASSET_NOT_APPROVED" });
  });

  it("rejects expired policy window", () => {
    const r = evaluateZerionScopedPolicy({
      intended_chain: "solana-devnet",
      spend_usd: 1,
      asset: "SOL",
      occurred_at: occurred,
      policy_valid_until_iso: "2020-01-01T00:00:00.000Z",
    });
    expect(r).toEqual({ ok: false, reason_code: "POLICY_EXPIRED" });
  });

  it("rejects god_mode", () => {
    const r = evaluateZerionScopedPolicy({
      intended_chain: "solana-devnet",
      spend_usd: 1,
      asset: "SOL",
      god_mode: true,
      occurred_at: occurred,
      policy_valid_until_iso: validUntil,
    });
    expect(r).toEqual({ ok: false, reason_code: "ZERION_GOD_MODE_FORBIDDEN" });
  });

  it("passes when policy checks are satisfied", () => {
    const r = evaluateZerionScopedPolicy({
      intended_chain: "solana-devnet",
      spend_usd: 1,
      asset: "SOL",
      occurred_at: occurred,
      policy_valid_until_iso: validUntil,
    });
    expect(r).toEqual({ ok: true });
  });
});
