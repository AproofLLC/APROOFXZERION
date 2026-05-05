import { describe, expect, it } from "vitest";
import { normalizeSubjectUserLogsResponse } from "./user-logs";

describe("normalizeSubjectUserLogsResponse", () => {
  it("uses canonical logs/pagination when available", () => {
    const out = normalizeSubjectUserLogsResponse({
      subject_id: "s1",
      environment: "testnet",
      logs: [{ user_log_id: "l1" } as any],
      pagination: { limit: 50, offset: 0, next_cursor: "c1" },
    });
    expect(out.logs).toHaveLength(1);
    expect(out.next_cursor).toBe("c1");
  });

  it("falls back to legacy items/next_cursor", () => {
    const out = normalizeSubjectUserLogsResponse(({
      subject_id: "s1",
      environment: "production",
      items: [{ user_log_id: "l1" } as any],
      next_cursor: "legacy-cursor",
    } as unknown) as any);
    expect(out.logs).toHaveLength(1);
    expect(out.next_cursor).toBe("legacy-cursor");
  });
});
