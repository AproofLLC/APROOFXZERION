import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { baselines } from "../db/schema/index.js";
import type { Db, DbTransaction } from "../db/client.js";

/**
 * Baseline active at `at` for subject + angle (spec §9): [effectiveFrom, effectiveTo).
 */
export async function resolveBaselineAt(
  db: Db | DbTransaction,
  input: {
    organizationId: string;
    environmentId: string;
    subjectId: string;
    angle:
      | "deterministic_integrity"
      | "policy_integrity"
      | "identity_access_integrity"
      | "operational_integrity"
      | "model_identity_integrity"
      | "retrieval_integrity"
      | "cross_system_integrity";
    at: Date;
  }
) {
  const rows = await db
    .select()
    .from(baselines)
    .where(
      and(
        eq(baselines.organizationId, input.organizationId),
        eq(baselines.environmentId, input.environmentId),
        eq(baselines.subjectId, input.subjectId),
        eq(baselines.angle, input.angle),
        lte(baselines.effectiveFrom, input.at),
        or(isNull(baselines.effectiveTo), gt(baselines.effectiveTo, input.at))
      )
    )
    .orderBy(desc(baselines.effectiveFrom))
    .limit(1);

  return rows[0] ?? null;
}
