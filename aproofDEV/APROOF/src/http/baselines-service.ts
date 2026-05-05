/**
 * Baselines read/version service.
 * Version-safe: edits always create a new version, never mutate history.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { baselines, failureLocatorRecords, proofUnits, subjects } from "../db/schema/index.js";
import type { AngleName } from "../product/product-proof.js";
import { PRODUCT_ANGLE_NAMES } from "../product/product-proof.js";
import type { RailType } from "../protocol/angle-applicability.js";
import {
  buildInitialBaselineDefinition,
  mergeAngleControlIntoDefinition,
  parseAngleControl,
  parseAnglePatchInput,
  type AngleControlState,
  validateAngleConfig,
  validateAngleKeys,
} from "../baselines/angle-control.js";

export type BaselineEvidenceSufficiency = "full" | "qualified" | "insufficient";

export type BaselineListItem = {
  angle: string;
  /** Governance flags (from `definition.angle_control`). */
  enabled: boolean;
  required: boolean;
  default_origin: "auto" | "user";
  config: Record<string, unknown>;
  baseline_present: boolean;
  baseline_summary: string;
  last_updated: string | null;
  baseline_version: number;
  baseline_locked: boolean;
  evidence_sufficiency: BaselineEvidenceSufficiency;
  sources_state: "present" | "no sources";
  metadata: Record<string, unknown>;
};

export type BaselineVersionHistoryEntry = {
  version: number;
  effective_from: string;
  effective_to: string | null;
  baseline_summary: string;
};

export type BaselineDetail = {
  angle: string;
  baseline_present: boolean;
  evidence_sufficiency: BaselineEvidenceSufficiency;
  sources_state: "present" | "no sources";
  definition: unknown;
  baseline_rules: unknown[];
  current_values: unknown;
  editable_fields: string[];
  recent_violations: Array<{
    failure_id: string;
    reason_code: string;
    created_at: string;
  }>;
  baseline_version: number;
  baseline_locked: boolean;
  version_history: BaselineVersionHistoryEntry[];
  metadata: Record<string, unknown>;
};

function classifyBaselineBody(definition: unknown): {
  evidence_sufficiency: BaselineEvidenceSufficiency;
  sources_state: "present" | "no sources";
} {
  const def = definition && typeof definition === "object" ? (definition as Record<string, unknown>) : {};
  const rules = Array.isArray(def.rules) ? def.rules : [];
  const ac = def.angle_control;
  const hasAngleControl =
    ac &&
    typeof ac === "object" &&
    Object.keys(ac as object).length > 0 &&
    ("enabled" in (ac as object) || "required" in (ac as object) || "config" in (ac as object));
  const otherKeys = Object.keys(def).filter((k) => k !== "rules" && k !== "angle_control");
  const hasOther = otherKeys.some((k) => {
    const v = def[k];
    return v !== undefined && v !== null && !(typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);
  });
  const noSources = rules.length === 0 && !hasOther && !hasAngleControl;
  if (noSources) {
    return { evidence_sufficiency: "insufficient", sources_state: "no sources" };
  }
  return { evidence_sufficiency: "full", sources_state: "present" };
}

export async function listBaselinesForSubject(
  db: Db,
  params: { subjectId: string; organizationId: string; environmentId: string }
): Promise<BaselineListItem[]> {
  const [subj] = await db
    .select({ railType: subjects.railType })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId)
      )
    )
    .limit(1);
  const rail = (subj?.railType ?? "system") as RailType;

  const rows = await db
    .select()
    .from(baselines)
    .where(
      and(
        eq(baselines.subjectId, params.subjectId),
        eq(baselines.organizationId, params.organizationId),
        eq(baselines.environmentId, params.environmentId)
      )
    )
    .orderBy(baselines.angle, desc(baselines.version));

  const latestByAngle = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    if (!latestByAngle.has(row.angle)) {
      latestByAngle.set(row.angle, row);
    }
  }

  return PRODUCT_ANGLE_NAMES.map((angle) => {
    const row = latestByAngle.get(angle);
    if (!row) {
      const synth = buildInitialBaselineDefinition(rail, angle);
      const ctrl = parseAngleControl(synth, rail, angle);
      return {
        angle,
        enabled: ctrl.enabled,
        required: ctrl.required,
        default_origin: ctrl.default_origin,
        config: ctrl.config,
        baseline_present: false,
        baseline_summary: "No baseline row (repair by saving from UI)",
        last_updated: null,
        baseline_version: 0,
        baseline_locked: false,
        evidence_sufficiency: "insufficient" as const,
        sources_state: "no sources" as const,
        metadata: {},
      };
    }
    const ctrl = parseAngleControl(row.definition, rail, angle);
    const { evidence_sufficiency, sources_state } = classifyBaselineBody(row.definition);
    return {
      angle,
      enabled: ctrl.enabled,
      required: ctrl.required,
      default_origin: ctrl.default_origin,
      config: ctrl.config,
      baseline_present: true,
      baseline_summary: summarizeDefinition(row.definition),
      last_updated: row.createdAt.toISOString(),
      baseline_version: row.version,
      baseline_locked: !!row.effectiveTo,
      evidence_sufficiency,
      sources_state,
      metadata: {},
    };
  });
}

/**
 * Latest DB-backed angle_control per angle (materializing subject-type defaults when no row exists).
 * Used by proof read paths so governance matches the Baselines tab without a parallel registry truth.
 */
export async function loadBaselineControlSnapshot(
  db: Db,
  params: { subjectId: string; organizationId: string; environmentId: string },
): Promise<Record<AngleName, AngleControlState>> {
  const [subj] = await db
    .select({ railType: subjects.railType })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId),
      ),
    )
    .limit(1);

  const rail = (subj?.railType ?? "system") as RailType;

  const rows = await db
    .select()
    .from(baselines)
    .where(
      and(
        eq(baselines.subjectId, params.subjectId),
        eq(baselines.organizationId, params.organizationId),
        eq(baselines.environmentId, params.environmentId),
      ),
    )
    .orderBy(baselines.angle, desc(baselines.version));

  const latestByAngle = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    if (!latestByAngle.has(row.angle)) {
      latestByAngle.set(row.angle, row);
    }
  }

  const out = {} as Record<AngleName, AngleControlState>;
  for (const angle of PRODUCT_ANGLE_NAMES) {
    const row = latestByAngle.get(angle);
    if (!row) {
      const synth = buildInitialBaselineDefinition(rail, angle);
      out[angle] = parseAngleControl(synth, rail, angle);
    } else {
      out[angle] = parseAngleControl(row.definition, rail, angle);
    }
  }
  return out;
}

function summarizeDefinition(def: unknown): string {
  if (!def || typeof def !== "object") return "Empty baseline";
  const o = def as Record<string, unknown>;
  const ac = o.angle_control;
  if (ac && typeof ac === "object") {
    const e = (ac as Record<string, unknown>).enabled === true;
    const r = (ac as Record<string, unknown>).required === true;
    return `Angle ${e ? "enabled" : "disabled"}${r ? ", required" : ", optional"}`;
  }
  const keys = Object.keys(o).filter((k) => k !== "rules");
  if (keys.length === 0) {
    const rules = Array.isArray(o.rules) ? o.rules : [];
    return rules.length ? `${rules.length} rule(s) defined` : "Empty baseline";
  }
  return `${keys.length + (Array.isArray(o.rules) ? o.rules.length : 0)} field(s) defined`;
}

export async function patchSubjectBaselinesAngles(
  db: Db,
  params: {
    subjectId: string;
    organizationId: string;
    environmentId: string;
    angles: Record<string, unknown>;
  },
): Promise<{ ok: true; baselines: BaselineListItem[] } | { ok: false; error: string }> {
  const keyErr = validateAngleKeys(params.angles);
  if (keyErr) return { ok: false, error: keyErr };

  const scope = and(
    eq(subjects.id, params.subjectId),
    eq(subjects.organizationId, params.organizationId),
    eq(subjects.environmentId, params.environmentId)
  );
  const [subj] = await db.select({ id: subjects.id, railType: subjects.railType }).from(subjects).where(scope).limit(1);
  if (!subj) return { ok: false, error: "Subject not found." };
  const rail = (subj.railType ?? "system") as RailType;

  for (const [angleKey, rawPatch] of Object.entries(params.angles)) {
    const patch = parseAnglePatchInput(rawPatch);
    if (patch === null) {
      return { ok: false, error: `Invalid patch object for angle ${angleKey}.` };
    }
    if (Object.keys(patch).length === 0) continue;

    const [latest] = await db
      .select()
      .from(baselines)
      .where(
        and(
          eq(baselines.subjectId, params.subjectId),
          eq(baselines.angle, angleKey as AngleName),
          eq(baselines.organizationId, params.organizationId),
          eq(baselines.environmentId, params.environmentId)
        )
      )
      .orderBy(desc(baselines.version))
      .limit(1);

    const merged = mergeAngleControlIntoDefinition(latest?.definition ?? {}, patch);
    const ctrl = parseAngleControl(merged, rail, angleKey as AngleName);
    const cfgErr = validateAngleConfig(angleKey as AngleName, ctrl.config);
    if (cfgErr) return { ok: false, error: cfgErr };

    await createBaselineVersion(db, {
      subjectId: params.subjectId,
      angle: angleKey,
      organizationId: params.organizationId,
      environmentId: params.environmentId,
      definition: merged,
    });
  }

  const baselinesOut = await listBaselinesForSubject(db, {
    subjectId: params.subjectId,
    organizationId: params.organizationId,
    environmentId: params.environmentId,
  });
  return { ok: true, baselines: baselinesOut };
}

export async function getBaselineDetail(
  db: Db,
  params: { subjectId: string; angle: string; organizationId: string; environmentId: string }
): Promise<BaselineDetail | null> {
  if (!PRODUCT_ANGLE_NAMES.includes(params.angle as any)) return null;

  const [row] = await db
    .select()
    .from(baselines)
    .where(
      and(
        eq(baselines.subjectId, params.subjectId),
        eq(baselines.angle, params.angle as any),
        eq(baselines.organizationId, params.organizationId),
        eq(baselines.environmentId, params.environmentId)
      )
    )
    .orderBy(desc(baselines.version))
    .limit(1);

  const historyRows = await db
    .select({
      version: baselines.version,
      effectiveFrom: baselines.effectiveFrom,
      effectiveTo: baselines.effectiveTo,
      definition: baselines.definition,
    })
    .from(baselines)
    .where(
      and(
        eq(baselines.subjectId, params.subjectId),
        eq(baselines.angle, params.angle as any),
        eq(baselines.organizationId, params.organizationId),
        eq(baselines.environmentId, params.environmentId)
      )
    )
    .orderBy(asc(baselines.version));

  const version_history: BaselineVersionHistoryEntry[] = historyRows.map((h) => ({
    version: h.version,
    effective_from: h.effectiveFrom.toISOString(),
    effective_to: h.effectiveTo ? h.effectiveTo.toISOString() : null,
    baseline_summary: summarizeDefinition(h.definition),
  }));

  if (!row) {
    const { evidence_sufficiency, sources_state } = classifyBaselineBody({});
    return {
      angle: params.angle,
      baseline_present: false,
      evidence_sufficiency,
      sources_state,
      definition: {},
      baseline_rules: [],
      current_values: {},
      editable_fields: [],
      recent_violations: [],
      baseline_version: 0,
      baseline_locked: false,
      version_history,
      metadata: {},
    };
  }

  const def = (row.definition && typeof row.definition === "object" ? row.definition : {}) as Record<string, unknown>;
  const rules = Array.isArray(def.rules) ? def.rules : [];
  const { evidence_sufficiency, sources_state } = classifyBaselineBody(row.definition);

  // Recent violations for this angle+subject
  const violations = await db
    .select({
      id: failureLocatorRecords.id,
      reasonCode: failureLocatorRecords.reasonCode,
      createdAt: failureLocatorRecords.createdAt,
    })
    .from(failureLocatorRecords)
    .innerJoin(proofUnits, eq(failureLocatorRecords.proofId, proofUnits.proofId))
    .innerJoin(subjects, eq(proofUnits.subjectId, subjects.id))
    .where(
      and(
        eq(proofUnits.subjectId, params.subjectId),
        eq(subjects.organizationId, params.organizationId),
        eq(subjects.environmentId, params.environmentId),
        eq(failureLocatorRecords.angle, params.angle as any),
      ),
    )
    .orderBy(desc(failureLocatorRecords.createdAt))
    .limit(5);

  return {
    angle: params.angle,
    baseline_present: true,
    evidence_sufficiency,
    sources_state,
    definition: row.definition,
    baseline_rules: rules,
    current_values: def,
    editable_fields: Object.keys(def).sort((a, b) => a.localeCompare(b)),
    recent_violations: violations.map((v) => ({
      failure_id: v.id,
      reason_code: v.reasonCode,
      created_at: v.createdAt.toISOString(),
    })),
    baseline_version: row.version,
    baseline_locked: !!row.effectiveTo,
    version_history,
    metadata: {},
  };
}

export async function createBaselineVersion(
  db: Db,
  params: {
    subjectId: string;
    angle: string;
    organizationId: string;
    environmentId: string;
    definition: unknown;
  }
): Promise<BaselineDetail | null> {
  if (!PRODUCT_ANGLE_NAMES.includes(params.angle as any)) return null;

  // Get current latest version (definition needed to preserve angle_control on rule-only POSTs)
  const [current] = await db
    .select({ version: baselines.version, id: baselines.id, definition: baselines.definition })
    .from(baselines)
    .where(
      and(
        eq(baselines.subjectId, params.subjectId),
        eq(baselines.angle, params.angle as any),
        eq(baselines.organizationId, params.organizationId),
        eq(baselines.environmentId, params.environmentId)
      )
    )
    .orderBy(desc(baselines.version))
    .limit(1);

  const newVersion = current ? current.version + 1 : 1;
  const now = new Date();

  const prevDef =
    current?.definition && typeof current.definition === "object"
      ? ({ ...(current.definition as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const incoming =
    params.definition && typeof params.definition === "object"
      ? ({ ...(params.definition as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const mergedDef: Record<string, unknown> = { ...prevDef, ...incoming };
  if (incoming.angle_control === undefined && prevDef.angle_control !== undefined) {
    mergedDef.angle_control = prevDef.angle_control;
  }

  // Close current version
  if (current) {
    await db
      .update(baselines)
      .set({ effectiveTo: now })
      .where(eq(baselines.id, current.id));
  }

  await db.insert(baselines).values({
    organizationId: params.organizationId,
    environmentId: params.environmentId,
    subjectId: params.subjectId,
    angle: params.angle as any,
    version: newVersion,
    definition: mergedDef,
    effectiveFrom: now,
  });

  return getBaselineDetail(db, params);
}
