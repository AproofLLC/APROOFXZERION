import type { Session } from "../api/types";

export type ProductMode = "demo" | "production";

/** Single source of truth: demo === authenticated testnet session. */
export function getProductMode(session: Session | null | undefined): ProductMode {
  return session?.environment_mode === "testnet" ? "demo" : "production";
}
