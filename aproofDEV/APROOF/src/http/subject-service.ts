/**
 * Subject lifecycle service: create, list, get.
 * Creating a subject initializes exactly 7 baseline records.
 */
import { and, count, eq, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "../db/client.js";
import {
  baselines,
  canonicalEvents,
  environments,
  mappingRules,
  proofUnits,
  subjects,
  anchorBatches,
  anchorBatchItems,
} from "../db/schema/index.js";
import { UNIVERSAL_ANGLES } from "../product/product-proof.js";
import type { RailType } from "../protocol/angle-applicability.js";
import { buildInitialBaselineDefinition } from "../baselines/angle-control.js";
import type { SubjectCoreBlock } from "./subject-contract.js";
import { buildSubjectCoreBlock } from "./subject-assembler.js";

export type SubjectSummary = SubjectCoreBlock;

/**
 * When an org+environment has no mapping rules yet, the first subject creation provisions one
 * default rule so POST /events can resolve a canonical type without a sandbox-only ingest path.
 * Same behavior for production and testnet.
 */
export const APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY = "aproof.default.action_completed";

async function ensureDefaultIngestMappingIfEmpty(
  db: Db,
  organizationId: string,
  environmentId: string,
): Promise<void> {
  const [row] = await db
    .select({ c: count() })
    .from(mappingRules)
    .where(
      and(eq(mappingRules.organizationId, organizationId), eq(mappingRules.environmentId, environmentId)),
    );
  if (Number(row?.c ?? 0) > 0) return;
  await db
    .insert(mappingRules)
    .values({
      organizationId,
      environmentId,
      sourceTypeKey: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
      canonicalEventType: "action_completed",
      isActive: true,
    })
    .onConflictDoNothing({
      target: [mappingRules.organizationId, mappingRules.environmentId, mappingRules.sourceTypeKey],
    });
}

export async function createSubject(
  db: Db,
  params: {
    organizationId: string;
    environmentId: string;
    railType: RailType;
    externalKey?: string;
    /** When set (e.g. deterministic sandbox templates), uses this id instead of a random UUID. */
    subjectId?: string;
  }
): Promise<SubjectSummary> {
  const subjectId = params.subjectId ?? randomUUID();

  await db.insert(subjects).values({
    id: subjectId,
    organizationId: params.organizationId,
    environmentId: params.environmentId,
    railType: params.railType,
    externalKey: params.externalKey ?? null,
  });

  const now = new Date();
  const rail = params.railType;
  for (const angle of UNIVERSAL_ANGLES) {
    await db.insert(baselines).values({
      organizationId: params.organizationId,
      environmentId: params.environmentId,
      subjectId,
      angle,
      version: 1,
      definition: buildInitialBaselineDefinition(rail, angle),
      effectiveFrom: now,
    });
  }

  await ensureDefaultIngestMappingIfEmpty(db, params.organizationId, params.environmentId);

  const envName = await resolveEnvName(db, params.environmentId);
  return buildSubjectCoreBlock(
    {
      id: subjectId,
      organizationId: params.organizationId,
      environmentId: params.environmentId,
      railType: params.railType,
      createdAt: now,
      externalKey: params.externalKey ?? null,
    },
    {
      latest_event_timestamp: null,
      latest_proof_timestamp: null,
      latest_anchor_timestamp: null,
    },
    envName,
  );
}

export async function enrichSubjectTimestamps(
  db: Db,
  subjectId: string
): Promise<{
  latest_event_timestamp: string | null;
  latest_proof_timestamp: string | null;
  latest_anchor_timestamp: string | null;
}> {
  const [eventRow] = await db
    .select({ latest: max(canonicalEvents.occurredAt) })
    .from(canonicalEvents)
    .where(eq(canonicalEvents.subjectId, subjectId));

  const [proofRow] = await db
    .select({ latest: max(proofUnits.createdAt) })
    .from(proofUnits)
    .where(eq(proofUnits.subjectId, subjectId));

  const [anchorRow] = await db
    .select({ latest: max(anchorBatches.createdAt) })
    .from(anchorBatches)
    .innerJoin(anchorBatchItems, eq(anchorBatchItems.batchId, anchorBatches.id))
    .innerJoin(proofUnits, eq(proofUnits.proofId, anchorBatchItems.proofId))
    .where(eq(proofUnits.subjectId, subjectId));

  return {
    latest_event_timestamp: eventRow?.latest ? new Date(eventRow.latest).toISOString() : null,
    latest_proof_timestamp: proofRow?.latest ? new Date(proofRow.latest).toISOString() : null,
    latest_anchor_timestamp: anchorRow?.latest ? new Date(anchorRow.latest).toISOString() : null,
  };
}

function toSummary(
  row: { id: string; organizationId: string; environmentId: string; railType: string; createdAt: Date },
  ts: { latest_event_timestamp: string | null; latest_proof_timestamp: string | null; latest_anchor_timestamp: string | null },
  envName: string,
): SubjectSummary {
  return buildSubjectCoreBlock(row, ts, envName);
}

export async function subjectExistsInScope(
  db: Db,
  params: { subjectId: string; organizationId: string; environmentId: string },
): Promise<boolean> {
  const [row] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId),
      ),
    )
    .limit(1);
  return !!row;
}

async function resolveEnvName(db: Db, envId: string): Promise<string> {
  const [env] = await db.select({ name: environments.name }).from(environments).where(eq(environments.id, envId)).limit(1);
  return env?.name ?? "unknown";
}

export async function patchSubject(
  db: Db,
  params: {
    subjectId: string;
    organizationId: string;
    environmentId: string;
    externalKey?: string | null;
  }
): Promise<SubjectSummary | null> {
  const scope = and(
    eq(subjects.id, params.subjectId),
    eq(subjects.organizationId, params.organizationId),
    eq(subjects.environmentId, params.environmentId)
  );
  const [row] = await db.select().from(subjects).where(scope).limit(1);
  if (!row) return null;

  const updates: Record<string, unknown> = {};
  if (params.externalKey !== undefined) updates.externalKey = params.externalKey;
  if (Object.keys(updates).length > 0) {
    await db.update(subjects).set(updates).where(scope);
  }

  const [updated] = await db.select().from(subjects).where(scope).limit(1);
  if (!updated) return null;
  const ts = await enrichSubjectTimestamps(db, updated.id);
  const envName = await resolveEnvName(db, updated.environmentId);
  return toSummary(updated, ts, envName);
}

export async function getSubject(
  db: Db,
  params: { subjectId: string; organizationId: string; environmentId: string }
): Promise<SubjectSummary | null> {
  const [row] = await db
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId)
      )
    )
    .limit(1);
  if (!row) return null;
  const ts = await enrichSubjectTimestamps(db, row.id);
  const envName = await resolveEnvName(db, row.environmentId);
  return toSummary(row, ts, envName);
}

export async function listSubjects(
  db: Db,
  params: { organizationId: string; environmentId: string; limit: number; offset: number }
): Promise<{ items: SubjectSummary[]; total: number }> {
  const scope = and(
    eq(subjects.organizationId, params.organizationId),
    eq(subjects.environmentId, params.environmentId)
  );

  const [countRow] = await db
    .select({ c: count() })
    .from(subjects)
    .where(scope);
  const total = Number(countRow?.c ?? 0);

  const rows = await db
    .select()
    .from(subjects)
    .where(scope)
    .orderBy(subjects.createdAt, subjects.id)
    .limit(params.limit)
    .offset(params.offset);

  const envName = await resolveEnvName(db, params.environmentId);
  const items: SubjectSummary[] = [];
  for (const row of rows) {
    const ts = await enrichSubjectTimestamps(db, row.id);
    items.push(toSummary(row, ts, envName));
  }

  return { items, total };
}
