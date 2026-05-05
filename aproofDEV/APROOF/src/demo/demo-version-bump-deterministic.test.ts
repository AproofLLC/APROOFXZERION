import { describe, expect, it } from "vitest";
import { demoVersionBumpSecondPayloadForRail } from "./demo-clean-payloads.js";

/**
 * service + endpoint have deterministic_integrity auto-on under default `action_completed` mapping;
 * version-bump v2 must keep observed digest aligned with the merged baseline expected digest
 * (see demo-clean-payloads comments) so the progress scenario snapshot stays conformant.
 */
describe("demoVersionBumpSecondPayloadForRail deterministic digests (service, endpoint)", () => {
  it("keeps service observed_digest at svc-stable-digest-v1 (baseline-matching)", () => {
    const p = demoVersionBumpSecondPayloadForRail("service") as { deterministic?: { observed_digest?: string } };
    expect(p.deterministic?.observed_digest).toBe("svc-stable-digest-v1");
  });

  it("keeps endpoint observed_digest at ep-digest-v1 (baseline-matching)", () => {
    const p = demoVersionBumpSecondPayloadForRail("endpoint") as { deterministic?: { observed_digest?: string } };
    expect(p.deterministic?.observed_digest).toBe("ep-digest-v1");
  });
});
