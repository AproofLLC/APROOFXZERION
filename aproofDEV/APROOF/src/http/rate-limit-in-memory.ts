/**
 * Fixed-window in-memory rate limiter (per process). Suitable for auth/sandbox abuse reduction.
 * Not distributed — document for single-node / dev; replace with Redis etc. if multi-node.
 */

type Bucket = { count: number; windowStart: number };

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now - b.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (b.count >= this.maxPerWindow) return false;
    b.count += 1;
    return true;
  }

  /** Test hook: reset a key between tests. */
  resetKey(key: string): void {
    this.buckets.delete(key);
  }
}
