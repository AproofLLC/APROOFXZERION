import { describe, expect, it } from "vitest";
import { evaluateOperationalAngle } from "./process-event.js";

describe("evaluateOperationalAngle Zerion CLI guard", () => {
  const baseline = {
    type: "operational_integrity_v1",
    expected_status: "success",
    max_latency_ms: 60_000,
    require_no_runtime_error: true,
  } as Record<string, unknown>;

  it("downgrades conformant to violated with ZERION_TX_HASH_MISSING when zerion_cli ran without tx_hash", () => {
    const payload = {
      operational: {
        execution_status: "success",
        latency_ms: 10,
        runtime_error: null,
      },
      zerion: {
        execution_source: "zerion_cli",
        cli_invoked: true,
        execution_attempted: true,
        tx_hash: null,
      },
    } as Record<string, unknown>;

    const r = evaluateOperationalAngle(baseline, payload);
    expect(r.status).toBe("violated");
    expect(r.deltaCode).toBe("ZERION_TX_HASH_MISSING");
  });

  it("keeps conformant when zerion_cli ran with a long tx_hash", () => {
    const payload = {
      operational: {
        execution_status: "success",
        latency_ms: 10,
        runtime_error: null,
      },
      zerion: {
        execution_source: "zerion_cli",
        cli_invoked: true,
        execution_attempted: true,
        tx_hash: "A".repeat(88),
      },
    } as Record<string, unknown>;

    const r = evaluateOperationalAngle(baseline, payload);
    expect(r.status).toBe("conformant");
    expect(r.deltaCode).toBeNull();
  });
});
