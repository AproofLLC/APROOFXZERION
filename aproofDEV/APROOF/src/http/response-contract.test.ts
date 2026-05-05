import { describe, it, expect } from "vitest";
import { ApiEnvelopeSchema, ProofListResponseSchema, FailuresListResponseSchema } from "./api-schema.js";

describe("response contract schemas", () => {
  it("ProofListResponseSchema validates a well-formed list", () => {
    const list = {
      items: [],
      page: { limit: 20, offset: 0, total: 0 },
    };
    expect(ProofListResponseSchema.safeParse(list).success).toBe(true);
  });

  it("FailuresListResponseSchema validates a well-formed internal list", () => {
    const list = {
      items: [
        {
          id: "a0000000-0000-4000-8000-000000000001",
          proof_id: "a0000000-0000-4000-8000-000000000002",
          event_id: "a0000000-0000-4000-8000-000000000003",
          angle: "deterministic_integrity",
          failure_zone: "deterministic_integrity",
          subject: "a0000000-0000-4000-8000-000000000004",
          host: "test",
          inspection_path: "payload.deterministic",
          created_at: "2026-04-08T10:00:00.000Z",
        },
      ],
      page: { limit: 20, offset: 0, total: 1 },
    };
    expect(FailuresListResponseSchema.safeParse(list).success).toBe(true);
  });

  it("ApiEnvelopeSchema rejects missing required fields", () => {
    const result = ApiEnvelopeSchema.safeParse({ ok: true });
    expect(result.success).toBe(false);
  });
});
