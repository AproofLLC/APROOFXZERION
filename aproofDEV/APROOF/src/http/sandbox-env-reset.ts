import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  anchorBatchItems,
  anchorBatches,
  baselines,
  canonicalEvents,
  failureLocatorRecords,
  proofUnits,
  rawEvents,
  subjectUserLogs,
  subjects,
} from "../db/schema/index.js";

/**
 * Deletes all subjects and pipeline rows for an environment (mapping rules and API keys preserved).
 * Used only for testnet replay; caller must verify environment mode.
 */
export async function deleteEnvironmentSubjectGraph(
  db: Db,
  params: { organizationId: string; environmentId: string },
): Promise<void> {
  const subjectRows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(eq(subjects.organizationId, params.organizationId), eq(subjects.environmentId, params.environmentId)),
    );
  const subjectIds = subjectRows.map((r) => r.id);
  if (subjectIds.length === 0) {
    await db
      .delete(rawEvents)
      .where(
        and(eq(rawEvents.organizationId, params.organizationId), eq(rawEvents.environmentId, params.environmentId)),
      );
    return;
  }

  const proofRows = await db
    .select({ proofId: proofUnits.proofId })
    .from(proofUnits)
    .where(inArray(proofUnits.subjectId, subjectIds));
  const proofIds = proofRows.map((r) => r.proofId);

  if (proofIds.length > 0) {
    await db.delete(failureLocatorRecords).where(inArray(failureLocatorRecords.proofId, proofIds));
    const batchItemRows = await db
      .select({ batchId: anchorBatchItems.batchId })
      .from(anchorBatchItems)
      .where(inArray(anchorBatchItems.proofId, proofIds));
    await db.delete(anchorBatchItems).where(inArray(anchorBatchItems.proofId, proofIds));
    const batchIds = [...new Set(batchItemRows.map((r) => r.batchId))];
    if (batchIds.length > 0) {
      await db.delete(anchorBatches).where(inArray(anchorBatches.id, batchIds));
    }
  }

  await db.delete(proofUnits).where(inArray(proofUnits.subjectId, subjectIds));
  await db
    .delete(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, params.organizationId),
        eq(canonicalEvents.environmentId, params.environmentId),
      ),
    );
  await db
    .delete(rawEvents)
    .where(
      and(eq(rawEvents.organizationId, params.organizationId), eq(rawEvents.environmentId, params.environmentId)),
    );
  await db.delete(subjectUserLogs).where(inArray(subjectUserLogs.subjectId, subjectIds));
  await db.delete(baselines).where(inArray(baselines.subjectId, subjectIds));
  await db.delete(subjects).where(inArray(subjects.id, subjectIds));
}

/**
 * Clears generated pipeline state for an environment but preserves subjects and baselines.
 * Deletes: events, proof units, anchors, failures, user logs.
 * Preserves: subjects, baselines, mapping rules, API keys.
 */
export async function clearEnvironmentGeneratedState(
  db: Db,
  params: { organizationId: string; environmentId: string },
): Promise<void> {
  const subjectRows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(eq(subjects.organizationId, params.organizationId), eq(subjects.environmentId, params.environmentId)),
    );
  const subjectIds = subjectRows.map((r) => r.id);

  if (subjectIds.length > 0) {
    const proofRows = await db
      .select({ proofId: proofUnits.proofId })
      .from(proofUnits)
      .where(inArray(proofUnits.subjectId, subjectIds));
    const proofIds = proofRows.map((r) => r.proofId);

    if (proofIds.length > 0) {
      await db.delete(failureLocatorRecords).where(inArray(failureLocatorRecords.proofId, proofIds));
      const batchItemRows = await db
        .select({ batchId: anchorBatchItems.batchId })
        .from(anchorBatchItems)
        .where(inArray(anchorBatchItems.proofId, proofIds));
      await db.delete(anchorBatchItems).where(inArray(anchorBatchItems.proofId, proofIds));
      const batchIds = [...new Set(batchItemRows.map((r) => r.batchId))];
      if (batchIds.length > 0) {
        await db.delete(anchorBatches).where(inArray(anchorBatches.id, batchIds));
      }
    }

    await db.delete(proofUnits).where(inArray(proofUnits.subjectId, subjectIds));
    await db.delete(subjectUserLogs).where(inArray(subjectUserLogs.subjectId, subjectIds));
  }

  await db
    .delete(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, params.organizationId),
        eq(canonicalEvents.environmentId, params.environmentId),
      ),
    );
  await db
    .delete(rawEvents)
    .where(
      and(eq(rawEvents.organizationId, params.organizationId), eq(rawEvents.environmentId, params.environmentId)),
    );
}

/**
 * Clears generated pipeline state for a single subject but preserves the subject row and baselines.
 */
export async function clearSubjectGeneratedState(
  db: Db,
  params: { organizationId: string; environmentId: string; subjectId: string },
): Promise<void> {
  const { organizationId, environmentId, subjectId } = params;

  const [subj] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, subjectId),
        eq(subjects.organizationId, organizationId),
        eq(subjects.environmentId, environmentId),
      ),
    )
    .limit(1);
  if (!subj) return;

  const proofRows = await db
    .select({ proofId: proofUnits.proofId })
    .from(proofUnits)
    .where(eq(proofUnits.subjectId, subjectId));
  const proofIds = proofRows.map((r) => r.proofId);

  if (proofIds.length > 0) {
    await db.delete(failureLocatorRecords).where(inArray(failureLocatorRecords.proofId, proofIds));
    const batchItemRows = await db
      .select({ batchId: anchorBatchItems.batchId })
      .from(anchorBatchItems)
      .where(inArray(anchorBatchItems.proofId, proofIds));
    await db.delete(anchorBatchItems).where(inArray(anchorBatchItems.proofId, proofIds));
    const batchIds = [...new Set(batchItemRows.map((r) => r.batchId))];
    if (batchIds.length > 0) {
      await db.delete(anchorBatches).where(inArray(anchorBatches.id, batchIds));
    }
  }

  await db.delete(proofUnits).where(eq(proofUnits.subjectId, subjectId));

  const canonRows = await db
    .select({ rawEventId: canonicalEvents.rawEventId })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, organizationId),
        eq(canonicalEvents.environmentId, environmentId),
        eq(canonicalEvents.subjectId, subjectId),
      ),
    );
  const rawIds = [...new Set(canonRows.map((r) => r.rawEventId))];

  await db
    .delete(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, organizationId),
        eq(canonicalEvents.environmentId, environmentId),
        eq(canonicalEvents.subjectId, subjectId),
      ),
    );

  if (rawIds.length > 0) {
    await db
      .delete(rawEvents)
      .where(
        and(
          eq(rawEvents.organizationId, organizationId),
          eq(rawEvents.environmentId, environmentId),
          inArray(rawEvents.id, rawIds),
        ),
      );
  }

  await db.delete(subjectUserLogs).where(eq(subjectUserLogs.subjectId, subjectId));
}

/**
 * Deletes one subject and all pipeline rows tied to it (proofs, events, baselines).
 * Preserves other subjects in the environment. Testnet-only callers should gate on mode.
 */
export async function deleteSubjectSubgraph(
  db: Db,
  params: { organizationId: string; environmentId: string; subjectId: string },
): Promise<void> {
  const { organizationId, environmentId, subjectId } = params;

  const [subj] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, subjectId),
        eq(subjects.organizationId, organizationId),
        eq(subjects.environmentId, environmentId),
      ),
    )
    .limit(1);
  if (!subj) return;

  const proofRows = await db
    .select({ proofId: proofUnits.proofId })
    .from(proofUnits)
    .where(eq(proofUnits.subjectId, subjectId));
  const proofIds = proofRows.map((r) => r.proofId);

  if (proofIds.length > 0) {
    await db.delete(failureLocatorRecords).where(inArray(failureLocatorRecords.proofId, proofIds));
    const batchItemRows = await db
      .select({ batchId: anchorBatchItems.batchId })
      .from(anchorBatchItems)
      .where(inArray(anchorBatchItems.proofId, proofIds));
    await db.delete(anchorBatchItems).where(inArray(anchorBatchItems.proofId, proofIds));
    const batchIds = [...new Set(batchItemRows.map((r) => r.batchId))];
    if (batchIds.length > 0) {
      await db.delete(anchorBatches).where(inArray(anchorBatches.id, batchIds));
    }
  }

  await db.delete(proofUnits).where(eq(proofUnits.subjectId, subjectId));

  const canonRows = await db
    .select({ rawEventId: canonicalEvents.rawEventId })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, organizationId),
        eq(canonicalEvents.environmentId, environmentId),
        eq(canonicalEvents.subjectId, subjectId),
      ),
    );
  const rawIds = [...new Set(canonRows.map((r) => r.rawEventId))];

  await db
    .delete(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, organizationId),
        eq(canonicalEvents.environmentId, environmentId),
        eq(canonicalEvents.subjectId, subjectId),
      ),
    );

  if (rawIds.length > 0) {
    await db
      .delete(rawEvents)
      .where(
        and(
          eq(rawEvents.organizationId, organizationId),
          eq(rawEvents.environmentId, environmentId),
          inArray(rawEvents.id, rawIds),
        ),
      );
  }

  await db.delete(subjectUserLogs).where(eq(subjectUserLogs.subjectId, subjectId));
  await db.delete(baselines).where(eq(baselines.subjectId, subjectId));
  await db.delete(subjects).where(eq(subjects.id, subjectId));
}
