/**
 * Stable starter payloads for first-proof onboarding (POST /events → action_completed).
 * Shapes satisfy `deriveAllAngleBaselines` required fields per subject rail (baseline-registry).
 */
import type { RailType } from "../protocol/angle-applicability.js";
import {
  cleanAgentPolicyCheckedPayload,
  cleanEndpointPolicyCheckedPayload,
  cleanModelPolicyCheckedPayload,
  cleanServicePolicyCheckedPayload,
  cleanSystemControlPayload,
} from "../demo/demo-clean-payloads.js";

export function starterPayloadForRail(rail: RailType): Record<string, unknown> {
  switch (rail) {
    case "system":
      return cleanSystemControlPayload({
        host: "aproof.starter",
        record_id: "aproof-starter-record",
        name: "aproof-starter-system",
      });
    case "service":
      return cleanServicePolicyCheckedPayload({
        host: "aproof.starter",
        record_id: "aproof-starter-record",
        service_id: "aproof-starter-service",
      });
    case "agent":
      return cleanAgentPolicyCheckedPayload({
        host: "aproof.starter",
        record_id: "aproof-starter-record",
        agent_id: "aproof-starter-agent",
      });
    case "model":
      return cleanModelPolicyCheckedPayload({
        host: "aproof.starter",
        record_id: "aproof-starter-record",
        model_id: "aproof-starter-model",
      });
    case "endpoint":
      return cleanEndpointPolicyCheckedPayload({
        host: "aproof.starter",
        record_id: "aproof-starter-record",
        endpoint_id: "aproof-starter-endpoint",
      });
    default:
      return cleanSystemControlPayload({ host: "aproof.starter" });
  }
}
