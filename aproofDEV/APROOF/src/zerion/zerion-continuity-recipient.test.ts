import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { resolveAuthorizedExecutionRecipientAddress, resolveZerionContinuityRecipient } from "./zerion-continuity-recipient.js";

describe("zerion continuity recipient resolver", () => {
  it("resolveAuthorizedExecutionRecipientAddress uses env and does not read continuity file", () => {
    const authorized = Keypair.generate().publicKey.toBase58();
    const dir = mkdtempSync(join(tmpdir(), "zerion-recipient-env-"));
    expect(
      resolveAuthorizedExecutionRecipientAddress({ ZERION_AUTHORIZED_RECIPIENT_ADDRESS: authorized }, dir),
    ).toEqual({ recipient_address: authorized, source: "env", path: null });
  });

  it("authorized persisted address is separate from continuity recipient (no cross-leak)", () => {
    const dir = mkdtempSync(join(tmpdir(), "zerion-auth-cont-"));
    const a = resolveAuthorizedExecutionRecipientAddress({}, dir);
    const c = resolveZerionContinuityRecipient({}, dir);
    expect(a.recipient_address).not.toBe(c.recipient_address);
    expect(a.path).not.toBe(c.path);
    const a2 = resolveAuthorizedExecutionRecipientAddress({}, dir);
    const c2 = resolveZerionContinuityRecipient({}, dir);
    expect(a2.recipient_address).toBe(a.recipient_address);
    expect(c2.recipient_address).toBe(c.recipient_address);
  });

  it("uses env recipient before persisted local state", () => {
    const dir = mkdtempSync(join(tmpdir(), "zerion-recipient-env-"));
    const recipient = "11111111111111111111111111111111";
    const r = resolveZerionContinuityRecipient({ ZERION_CONTINUITY_RECIPIENT_ADDRESS: recipient }, dir);
    expect(r).toEqual({ recipient_address: recipient, source: "env", path: null });
  });

  it("generates once, persists, then reuses the same recipient", () => {
    const dir = mkdtempSync(join(tmpdir(), "zerion-recipient-local-"));
    const first = resolveZerionContinuityRecipient({}, dir);
    const second = resolveZerionContinuityRecipient({}, dir);

    expect(first.source).toBe("generated");
    expect(second.source).toBe("persisted");
    expect(second.recipient_address).toBe(first.recipient_address);
    expect(first.path).toBeTruthy();
    expect(existsSync(first.path!)).toBe(true);
    expect(readFileSync(first.path!, "utf8")).toContain(first.recipient_address);
  });
});
