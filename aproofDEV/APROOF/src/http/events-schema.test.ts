import { describe, it, expect } from "vitest";
import { postEventBodySchema } from "./events-schema.js";

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: "11111111-1111-4111-8111-111111111111",
    environment_id: "22222222-2222-4222-8222-222222222222",
    source_type_key: "test.event",
    subject_id: "33333333-3333-4333-8333-333333333333",
    trace_id: "trace-1",
    occurred_at: "2026-04-08T10:00:00.000Z",
    event_version: 1,
    payload: { foo: "bar" },
    ...overrides,
  };
}

describe("events-schema hardening", () => {
  it("accepts valid body", () => {
    const result = postEventBodySchema.safeParse(baseBody());
    expect(result.success).toBe(true);
  });

  it("rejects null payload", () => {
    const result = postEventBodySchema.safeParse(baseBody({ payload: null }));
    expect(result.success).toBe(false);
  });

  it("rejects array payload", () => {
    const result = postEventBodySchema.safeParse(baseBody({ payload: [1, 2, 3] }));
    expect(result.success).toBe(false);
  });

  it("rejects too-long source_type_key", () => {
    const result = postEventBodySchema.safeParse(baseBody({ source_type_key: "x".repeat(300) }));
    expect(result.success).toBe(false);
  });

  it("rejects too-long trace_id", () => {
    const result = postEventBodySchema.safeParse(baseBody({ trace_id: "t".repeat(600) }));
    expect(result.success).toBe(false);
  });

  it("accepts max-length source_type_key", () => {
    const result = postEventBodySchema.safeParse(baseBody({ source_type_key: "x".repeat(256) }));
    expect(result.success).toBe(true);
  });

  it("rejects zero event_version", () => {
    const result = postEventBodySchema.safeParse(baseBody({ event_version: 0 }));
    expect(result.success).toBe(false);
  });

  it("rejects negative event_version", () => {
    const result = postEventBodySchema.safeParse(baseBody({ event_version: -1 }));
    expect(result.success).toBe(false);
  });
});
