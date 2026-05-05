import {
  CANONICAL_ANGLE_KEYS,
  PROOF_DETAIL_ANGLE_ORDER,
  formatAngleLabel,
  type CanonicalAngleKey,
  type ProofDetailAngleKey,
} from "../constants/proof-engine";
import type { AngleSummary, ProductAngleResult } from "../api/types";

export type OverviewAngleRow = {
  angle: CanonicalAngleKey;
  label: string;
  status: string | null;
  reason_code: string | null;
};

export function mergeOverviewAngles(
  summary: Array<{ angle: string; status: string; reason_code: string }> | undefined,
): OverviewAngleRow[] {
  const byAngle = new Map<string, { status: string; reason_code: string }>();
  for (const row of summary ?? []) {
    byAngle.set(row.angle, { status: row.status, reason_code: row.reason_code });
  }
  return CANONICAL_ANGLE_KEYS.map((angle) => {
    const s = byAngle.get(angle);
    return {
      angle,
      label: formatAngleLabel(angle),
      status: s?.status ?? null,
      reason_code: s?.reason_code ?? null,
    };
  });
}

export type ProofAngleRow = {
  angle: CanonicalAngleKey;
  label: string;
  data: ProductAngleResult | null;
};

export function mergeProductAngles(angles: ProductAngleResult[] | undefined): ProofAngleRow[] {
  const byAngle = new Map<string, ProductAngleResult>();
  for (const a of angles ?? []) {
    byAngle.set(a.angle, a);
  }
  return CANONICAL_ANGLE_KEYS.map((angle) => ({
    angle,
    label: formatAngleLabel(angle),
    data: byAngle.get(angle) ?? null,
  }));
}

export type ProofDetailAngleRow = {
  angle: ProofDetailAngleKey;
  label: string;
  data: ProductAngleResult | null;
};

/** Proof detail panels: fixed order may differ from overview / PRODUCT_ANGLE_NAMES. */
export function mergeProductAnglesDetailOrder(angles: ProductAngleResult[] | undefined): ProofDetailAngleRow[] {
  const byAngle = new Map<string, ProductAngleResult>();
  for (const a of angles ?? []) {
    byAngle.set(a.angle, a);
  }
  return PROOF_DETAIL_ANGLE_ORDER.map((angle) => ({
    angle,
    label: formatAngleLabel(angle),
    data: byAngle.get(angle) ?? null,
  }));
}

export type BaselineAngleRow = {
  angle: CanonicalAngleKey;
  label: string;
  data: AngleSummary | null;
};

export function mergeBaselineAngles(baselines: AngleSummary[] | undefined): BaselineAngleRow[] {
  const byAngle = new Map<string, AngleSummary>();
  for (const b of baselines ?? []) {
    byAngle.set(b.angle, b);
  }
  return CANONICAL_ANGLE_KEYS.map((angle) => ({
    angle,
    label: formatAngleLabel(angle),
    data: byAngle.get(angle) ?? null,
  }));
}

export function baselineFallbackState(row: BaselineAngleRow): string {
  if (!row.data) return "not evaluated";
  if (row.data.sources_state === "no sources") return "no sources";
  if (!row.data.baseline_present) return "no baseline";
  return "evaluated";
}
