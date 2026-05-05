import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./rate-limit-in-memory.js";

describe("FixedWindowRateLimiter", () => {
  it("allows up to max requests per window then blocks", () => {
    const rl = new FixedWindowRateLimiter(3, 60_000);
    expect(rl.isAllowed("a")).toBe(true);
    expect(rl.isAllowed("a")).toBe(true);
    expect(rl.isAllowed("a")).toBe(true);
    expect(rl.isAllowed("a")).toBe(false);
  });

  it("resetKey clears the bucket", () => {
    const rl = new FixedWindowRateLimiter(1, 60_000);
    expect(rl.isAllowed("k")).toBe(true);
    expect(rl.isAllowed("k")).toBe(false);
    rl.resetKey("k");
    expect(rl.isAllowed("k")).toBe(true);
  });
});
