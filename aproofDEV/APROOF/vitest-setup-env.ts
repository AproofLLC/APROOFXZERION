/**
 * Developer `.env` often sets ANCHOR_MODE=solana-devnet for local demos. Vitest loads `dotenv/config`
 * in many suites; parallel e2e then hits public Solana RPC and gets rate-limited (429).
 * Default Vitest runs to sandbox/mock anchoring unless explicitly opting into devnet RPC.
 *
 * Disable the sandbox-session devnet guard so `/sandbox/session` tests succeed without live RPC
 * (same pattern as `sandbox-session-http.test.ts` local overrides).
 */
if (process.env.E2E_USE_SOLANA_DEVNET !== "true") {
  process.env.ANCHOR_MODE = "mock";
  process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO = "0";
}
