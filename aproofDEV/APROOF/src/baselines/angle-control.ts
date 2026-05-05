/**
 * Per-angle governance state stored inside `baselines.definition` JSON (additive).
 * Proof pipeline reads `angle_control` to decide whether to evaluate and how to treat gaps.
 */
import type { RailType } from "../protocol/angle-applicability.js";
import type { AngleName } from "../product/product-proof.js";
import { PRODUCT_ANGLE_NAMES } from "../product/product-proof.js";
import { AUTO_ENABLED_ANGLES_BY_RAIL, RAILS_WITH_AUTO_DEFAULTS } from "./auto-enabled-angles-by-rail.js";

export type AngleControlState = {
  enabled: boolean;
  required: boolean;
  default_origin: "auto" | "user";
  config: Record<string, unknown>;
};

/**
 * All 7 integrity angles are universally enabled for every subject rail.
 * Canonical map: see `auto-enabled-angles-by-rail.ts` (SSOT) — UI mirrors that file; integrity checks prevent drift.
 */
const AUTO_ENABLED_BY_RAIL: Record<RailType, ReadonlySet<AngleName>> = (() => {
  const o = {} as Record<RailType, ReadonlySet<AngleName>>;
  for (const r of RAILS_WITH_AUTO_DEFAULTS) {
    o[r] = new Set(AUTO_ENABLED_ANGLES_BY_RAIL[r]);
  }
  return o;
})();

export function isAutoEnabledForRail(rail: RailType, angle: AngleName): boolean {
  return AUTO_ENABLED_BY_RAIL[rail]?.has(angle) ?? false;
}

export function buildInitialBaselineDefinition(_rail: RailType, _angle: AngleName): Record<string, unknown> {
  const enabled = true;
  return {
    angle_control: {
      enabled,
      required: false,
      default_origin: "auto" as const,
      config: {},
    },
    rules: [],
  };
}

function normalizeConfig(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
  return {};
}

/**
 * Read `angle_control` from baseline definition. When absent (legacy rows), all angles are treated as enabled + optional
 * so existing deployments keep prior pipeline behavior.
 */
export function parseAngleControl(
  definition: unknown,
  _rail: RailType,
  _angle: AngleName,
): AngleControlState {
  const def = definition && typeof definition === "object" ? (definition as Record<string, unknown>) : {};
  const raw = def.angle_control;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return {
      enabled: o.enabled === false ? false : true,
      required: o.required === true,
      default_origin: o.default_origin === "user" ? "user" : "auto",
      config: normalizeConfig(o.config),
    };
  }
  return {
    enabled: true,
    required: false,
    default_origin: "auto",
    config: {},
  };
}

export function mergeAngleControlIntoDefinition(
  existingDefinition: unknown,
  patch: Partial<AngleControlState> & { config?: Record<string, unknown> },
): Record<string, unknown> {
  const base =
    existingDefinition && typeof existingDefinition === "object"
      ? { ...(existingDefinition as Record<string, unknown>) }
      : {};
  const prevAc = base.angle_control && typeof base.angle_control === "object" ? (base.angle_control as Record<string, unknown>) : {};
  const prevConfig = normalizeConfig(prevAc.config);
  const nextConfig =
    patch.config !== undefined ? { ...prevConfig, ...patch.config } : prevConfig;
  const merged: AngleControlState = {
    enabled: patch.enabled !== undefined ? patch.enabled : prevAc.enabled === false ? false : true,
    required: patch.required !== undefined ? patch.required : prevAc.required === true,
    default_origin:
      patch.default_origin !== undefined
        ? patch.default_origin
        : prevAc.default_origin === "user"
          ? "user"
          : "auto",
    config: nextConfig,
  };
  const userEdited =
    patch.enabled !== undefined ||
    patch.required !== undefined ||
    patch.config !== undefined ||
    patch.default_origin !== undefined;
  base.angle_control = {
    enabled: merged.enabled,
    required: merged.required,
    default_origin: userEdited ? "user" : merged.default_origin,
    config: merged.config,
  };
  return base;
}

export function validateAngleKeys(angles: Record<string, unknown>): string | null {
  for (const k of Object.keys(angles)) {
    if (!PRODUCT_ANGLE_NAMES.includes(k as AngleName)) {
      return `Unknown angle: ${k}`;
    }
  }
  return null;
}

/**
 * Soft sanity checks for per-angle `config` objects (PATCH). Returns a user-facing error or null.
 */
export function validateAngleConfig(angle: AngleName, config: Record<string, unknown> | undefined): string | null {
  if (config === undefined) return null;
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return `Invalid config for ${angle}: must be a plain object.`;
  }
  const c = config;
  const numOk = (v: unknown) => typeof v === "number" && !Number.isNaN(v);
  const boolOk = (v: unknown) => typeof v === "boolean";

  switch (angle) {
    case "retrieval_integrity": {
      if (c.min_sources !== undefined && (!numOk(c.min_sources) || (c.min_sources as number) < 0)) {
        return "retrieval_integrity.config.min_sources must be a non-negative number if present.";
      }
      if (c.allowed_types !== undefined && !Array.isArray(c.allowed_types)) {
        return "retrieval_integrity.config.allowed_types must be an array if present.";
      }
      break;
    }
    case "identity_access_integrity": {
      if (c.require_actor_id !== undefined && !boolOk(c.require_actor_id)) {
        return "identity_access_integrity.config.require_actor_id must be a boolean if present.";
      }
      if (c.require_actor_type !== undefined && !boolOk(c.require_actor_type)) {
        return "identity_access_integrity.config.require_actor_type must be a boolean if present.";
      }
      break;
    }
    case "model_identity_integrity": {
      if (c.allowed_models !== undefined && !Array.isArray(c.allowed_models)) {
        return "model_identity_integrity.config.allowed_models must be an array if present.";
      }
      if (c.allowed_versions !== undefined && !Array.isArray(c.allowed_versions)) {
        return "model_identity_integrity.config.allowed_versions must be an array if present.";
      }
      if (c.allowed_model_names !== undefined && !Array.isArray(c.allowed_model_names)) {
        return "model_identity_integrity.config.allowed_model_names must be an array if present.";
      }
      break;
    }
    case "cross_system_integrity": {
      if (c.require_related_system_refs !== undefined && !boolOk(c.require_related_system_refs)) {
        return "cross_system_integrity.config.require_related_system_refs must be a boolean if present.";
      }
      break;
    }
    case "deterministic_integrity": {
      if (c.tolerance !== undefined && c.tolerance !== null && typeof c.tolerance !== "number") {
        return "deterministic_integrity.config.tolerance must be a number if present.";
      }
      if (c.comparison !== undefined && c.comparison !== null && typeof c.comparison !== "string") {
        return "deterministic_integrity.config.comparison must be a string if present.";
      }
      break;
    }
    default:
      break;
  }
  return null;
}

/** Validates PATCH payload values for a single angle (partial updates). */
export function parseAnglePatchInput(v: unknown): (Partial<AngleControlState> & { config?: Record<string, unknown> }) | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Partial<AngleControlState> & { config?: Record<string, unknown> } = {};
  if (typeof o.enabled === "boolean") out.enabled = o.enabled;
  if (typeof o.required === "boolean") out.required = o.required;
  if (o.default_origin === "auto" || o.default_origin === "user") out.default_origin = o.default_origin;
  if (o.config !== undefined) {
    if (o.config === null || typeof o.config !== "object" || Array.isArray(o.config)) return null;
    out.config = { ...(o.config as Record<string, unknown>) };
  }
  return out;
}
