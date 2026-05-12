import { describe, expect, it } from "vitest";
import {
  buildSandboxSessionSuccessBody,
  SANDBOX_SESSION_BOOTSTRAP_JSON_KEYS,
  SANDBOX_SESSION_SUCCESS_JSON_KEYS,
} from "./sandbox-session-response.js";

describe("sandbox session response contract", () => {
  it("success body uses only documented keys and never includes session or key material", () => {
    const body = buildSandboxSessionSuccessBody({
      user_id: "u",
      organization_id: "o",
      environment_id: "e",
      expires_at: "2026-01-01T00:00:00.000Z",
    });
    expect(Object.keys(body).sort()).toEqual([...SANDBOX_SESSION_SUCCESS_JSON_KEYS].sort());
    expect(body).not.toHaveProperty("session_token");
    expect(body).not.toHaveProperty("plain_key");
    expect(body).not.toHaveProperty("key_hash");
    expect(body.environment_mode).toBe("testnet");
  });

  it("optional bootstrap adds template references without tokens", () => {
    const body = buildSandboxSessionSuccessBody({
      user_id: "u",
      organization_id: "o",
      environment_id: "e",
      expires_at: "2026-01-01T00:00:00.000Z",
      bootstrap: {
        template: "clean_first_proof",
        primary_subject_id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        subject_ids: ["aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"],
      },
    });
    for (const k of SANDBOX_SESSION_BOOTSTRAP_JSON_KEYS) {
      if (k === "subject_ids_by_rail") continue;
      expect(body).toHaveProperty(k);
    }
    expect(body).not.toHaveProperty("subject_ids_by_rail");
    expect(body).not.toHaveProperty("session_token");
    expect(body.template).toBe("clean_first_proof");
  });

  it("bootstrap may include subject_ids_by_rail for rail-keyed subject map", () => {
    const body = buildSandboxSessionSuccessBody({
      user_id: "u",
      organization_id: "o",
      environment_id: "e",
      expires_at: "2026-01-01T00:00:00.000Z",
      bootstrap: {
        template: "demo_all_rails",
        primary_subject_id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        subject_ids: ["aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"],
        subject_ids_by_rail: { agent: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee" },
      },
    });
    expect(body.subject_ids_by_rail).toEqual({ agent: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee" });
  });
});
