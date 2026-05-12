/// <reference path="../vitest-test-globals.d.ts" />
import { describe, expect, it } from "vitest";
import {
  BASELINE_ANGLES,
  deriveAllAngleBaselines,
  normalizeSubjectType,
  ZERION_AGENT_LOGICAL_KEY,
} from "./baseline-registry.js";

const SUBJECTS = ["llm", "model", "agent", "service", "system", "endpoint"] as const;

describe("baseline registry", () => {
  it("normalizes legacy aliases to canonical subject types", () => {
    expect(normalizeSubjectType("llm")).toBe("llm");
    expect(normalizeSubjectType("bot")).toBe("agent");
    expect(normalizeSubjectType("saas")).toBe("service");
  });

  it("emits seven angle baselines for all supported subject types", () => {
    for (const subjectType of SUBJECTS) {
      const out = deriveAllAngleBaselines({
        subjectType,
        canonicalEvent: {
          payload: {
            policy: { tags: ["allow_read"], version: "v1" },
            identity_access: { actor_id: "u1", role: "reader", scopes: ["read:proofs"], tenant_id: "tenant_demo" },
            operational: { execution_status: "success", latency_ms: 10 },
            model_identity: { observed_model: "gpt-4.1-mini", version: "2026.1" },
            retrieval: { retrieved_sources: ["db"], declared: true, tool_usage: true, local_source: "cache", remote_source: "db" },
            deterministic: { observed_digest: "d", temperature: 0.2 },
            cross_system: { observed_systems: ["ehr"], sync_id: "s1" },
            model_id: "m1",
            provider: "openai",
            org_id: "o1",
            trace_id: "t1",
            request_id: "r1",
            dependency_id: "dep",
            endpoint_id: "e1",
            service_id: "svc1",
            operation_type: "run",
            request_type: "query",
            correlation_id: "corr",
            tool_invocation_id: "tool1",
            external_response_id: "resp1",
            sync_id: "sync1",
            upload_id: "up1",
            callback_id: "cb1",
          },
          trace_id: "t1",
        },
      });
      expect(Object.keys(out).sort()).toEqual([...BASELINE_ANGLES].sort());
      for (const angle of BASELINE_ANGLES) {
        expect(out[angle].baseline_rule_id).toContain(`${subjectType}.${angle}.v1`);
        expect(out[angle].baseline_version).toBe("v1");
        expect(out[angle].derivation_trace.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses Zerion Agent lifecycle field paths when subject external key is zerion-agent", () => {
    const payload = {
      policy: { tags: ["allow_read"], policy_result: "approved" },
      identity_access: { principal_id: "p1", scopes: ["read:proofs"] },
      operational: { execution_status: "success", latency_ms: 10, runtime_error: null },
      model_identity: { observed_model: "gpt-4.1-mini" },
      deterministic: { observed_digest: "agent-digest-v1" },
      correlation_id: "c1",
      cross_system: { observed_systems: ["zerion_cli_fork", "zerion_api", "solana_devnet", "aproof_ingest"] },
      zerion: {
        chain: "solana-devnet",
        allowed_chain: "solana-devnet",
        amount_usd: 1,
        max_spend_usd: 5,
        approved_assets: ["SOL", "USDC"],
        wallet_address: "W1",
        execution_attempted: true,
        cli_invoked: true,
        execution_source: "zerion_cli",
        tx_hash: "a".repeat(64),
      },
    };
    const out = deriveAllAngleBaselines({
      subjectType: "agent",
      subjectExternalKey: ZERION_AGENT_LOGICAL_KEY,
      canonicalEvent: { payload, trace_id: "t1" },
    });
    for (const angle of BASELINE_ANGLES) {
      expect(out[angle].baseline_present).toBe(true);
    }
  });

  it("returns deterministic fail-safe baseline object on partial data", () => {
    const out = deriveAllAngleBaselines({
      subjectType: "system",
      canonicalEvent: { payload: { policy: { tags: ["allow_read"] } }, trace_id: "t1" },
    });
    for (const angle of BASELINE_ANGLES) {
      expect(out[angle].baseline_present).toBe(false);
      expect(out[angle].baseline_source).toBe("none");
      expect(out[angle].baseline_status).toBe("missing");
      expect(Array.isArray(out[angle].missing_fields)).toBe(true);
    }
  });
});
