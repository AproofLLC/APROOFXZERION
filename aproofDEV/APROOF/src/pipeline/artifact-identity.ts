import { createHash } from "node:crypto";
import type { PostEventBody } from "../http/events-schema.js";
import { stableStringify } from "../protocol/event-hashing.js";

export type ArtifactIdentityReason =
  | "ARTIFACT_ID_CONFLICT_WITH_DERIVED"
  | "ARTIFACT_ID_NOT_DERIVABLE"
  | "ARTIFACT_STABLE_IDENTITY_CONFLICT"
  | "ARTIFACT_ID_AMBIGUOUS"
  | "ARTIFACT_IDENTITY_INSUFFICIENT";

export type ArtifactIdentitySource =
  | "provided"
  | "provided_validated"
  | "derived"
  | "candidate_match";

export type ArtifactIdentityQuality =
  | "explicit"
  | "derived_strong"
  | "derived_generic"
  | "candidate_match_exact"
  | "insufficient"
  | "ambiguous";

export type ArtifactIdentityResolution =
  | {
      ok: true;
      artifact_id: string;
      source: ArtifactIdentitySource;
      stable_identity_fields: string[];
      stable_identity_map: Record<string, string>;
      stable_identity_summary: string;
      derivation_rule_id: string | null;
      candidate_keys: string[];
      quality: ArtifactIdentityQuality;
      compatible_source_match: string | null;
      confidence: "high";
    }
  | {
      ok: false;
      reason: ArtifactIdentityReason;
      stable_identity_fields: string[];
      stable_identity_map: Record<string, string>;
      derivation_rule_id: string | null;
      candidate_keys: string[];
      quality: ArtifactIdentityQuality;
      compatible_source_match: string | null;
      detail: string;
    };

type DerivationRule = {
  rule_id: string;
  stable_keys: readonly CanonicalStableKey[];
};

type CanonicalStableKey =
  | "artifact"
  | "object"
  | "record"
  | "study"
  | "image"
  | "document"
  | "resource"
  | "patch"
  | "config"
  | "file"
  | "chart"
  | "xray"
  | "patient"
  | "vial_set"
  | "host";

type StableExtractionResult = {
  derivation_rule_id: string | null;
  stable_identity_map: Record<string, string>;
  stable_identity_fields: string[];
  stable_identity_summary: string;
  derivable: boolean;
  quality: ArtifactIdentityQuality;
  candidate_keys: string[];
  detail: string;
  conflict: boolean;
};

const DERIVATION_RULES_BY_SOURCE_TYPE_KEY: Record<string, DerivationRule> = {
  xray_processed: { rule_id: "source_type:xray_processed", stable_keys: ["xray"] },
  chart_updated: { rule_id: "source_type:chart_updated", stable_keys: ["chart"] },
  vial_updated: { rule_id: "source_type:vial_updated", stable_keys: ["patient", "vial_set"] },
  "e2e.strict_xray": { rule_id: "source_type:e2e.strict_xray", stable_keys: ["xray"] },
  "e2e.idempotency": { rule_id: "source_type:e2e.idempotency", stable_keys: ["host"] },
  "e2e.alias": { rule_id: "source_type:e2e.alias", stable_keys: ["host"] },
  "e2e.compat.upload": { rule_id: "source_type:e2e.compat.upload", stable_keys: ["image"] },
  "e2e.compat.analysis": { rule_id: "source_type:e2e.compat.analysis", stable_keys: ["image"] },
};

const GENERIC_STABLE_KEYS: readonly CanonicalStableKey[] = [
  "artifact",
  "object",
  "record",
  "document",
  "study",
  "image",
  "xray",
  "chart",
  "patch",
  "config",
  "file",
  "resource",
];

const ALIAS_PATHS_BY_CANONICAL_KEY: Record<CanonicalStableKey, readonly string[]> = {
  artifact: ["artifact_id", "artifact_ref", "artifact.id", "artifact.ref", "artifactId", "artifactRef"],
  object: ["object_id", "object_ref", "object.id", "object.ref", "objectId", "objectRef"],
  record: ["record_id", "record_ref", "record.id", "record.ref", "recordId", "recordRef"],
  study: ["study_id", "study_uid", "study.id", "study.uid", "studyId"],
  image: ["image_id", "image_ref", "image.uid", "image.id", "imageId", "imageRef"],
  document: ["document_id", "document_ref", "document.id", "documentId"],
  resource: ["resource_id", "resource_ref", "resource.id", "resource.ref", "resourceId"],
  patch: ["patch_id", "patch_ref", "patch.id", "patchId"],
  config: ["config_id", "config_ref", "config.id", "configId"],
  file: ["file_id", "file_ref", "file.id", "fileId"],
  chart: ["chart_id", "chart_ref", "chart.id", "chartId"],
  xray: ["xray_id", "xray_ref", "xray.id", "xray.uid", "xrayId"],
  patient: ["patient_id", "patient.id", "patientId"],
  vial_set: ["vial_set_id", "vialSetId", "vial_set.id"],
  host: ["host"],
};

const SOURCE_COMPATIBILITY_GROUPS: Record<string, readonly string[]> = {
  "e2e.compat.upload": ["e2e.compat.analysis"],
  "e2e.compat.analysis": ["e2e.compat.upload"],
  "e2e.image.upload": ["e2e.image.analysis"],
  "e2e.image.analysis": ["e2e.image.upload"],
  "e2e.config.upload": ["e2e.config.verify"],
  "e2e.config.verify": ["e2e.config.upload"],
  "e2e.document.upload": ["e2e.document.review"],
  "e2e.document.review": ["e2e.document.upload"],
};

function normalizeStableValue(value: unknown): string | null {
  if (typeof value === "string") {
    const collapsed = value.trim().replace(/\s+/g, " ");
    return collapsed ? collapsed.toLowerCase() : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().toLowerCase();
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => normalizeStableValue(v))
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .sort();
    return parts.length > 0 ? parts.join("|") : null;
  }
  return null;
}

function readValueByPath(host: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return host[path];
  const segments = path.split(".");
  let cursor: unknown = host;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function toCanonicalIdentitySummary(identityMap: Record<string, string>): string {
  const pairs = Object.keys(identityMap)
    .sort()
    .map((k) => `${k}=${identityMap[k]}`);
  return pairs.length > 0 ? pairs.join("|") : "none";
}

function extractCanonicalKey(
  payload: Record<string, unknown>,
  key: CanonicalStableKey
): { value: string | null; aliases: string[]; conflict: boolean } {
  const aliases = [...ALIAS_PATHS_BY_CANONICAL_KEY[key]];
  const values = aliases
    .map((alias) => normalizeStableValue(readValueByPath(payload, alias)))
    .filter((v): v is string => v !== null);
  const uniq = [...new Set(values)];
  if (uniq.length > 1) {
    return { value: null, aliases, conflict: true };
  }
  return { value: uniq[0] ?? null, aliases, conflict: false };
}

export function normalizeStableIdentityMap(
  map: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    const canonicalKey = canonicalizeIdentityKey(key);
    const canonicalValue = normalizeStableValue(value);
    if (canonicalKey && canonicalValue) {
      normalized[canonicalKey] = canonicalValue;
    }
  }
  return Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b)));
}

export function stableIdentityMapsEqual(
  left: Record<string, unknown> | null | undefined,
  right: Record<string, unknown> | null | undefined
): boolean {
  const l = normalizeStableIdentityMap(left);
  const r = normalizeStableIdentityMap(right);
  const lKeys = Object.keys(l);
  const rKeys = Object.keys(r);
  if (lKeys.length !== rKeys.length) return false;
  return lKeys.every((key) => r[key] === l[key]);
}

export function canonicalizeIdentityKey(key: string): string | null {
  const lowered = key.trim().toLowerCase();
  if (!lowered) return null;
  for (const [canonical, aliases] of Object.entries(ALIAS_PATHS_BY_CANONICAL_KEY) as Array<
    [CanonicalStableKey, readonly string[]]
  >) {
    if (aliases.some((alias) => alias.toLowerCase() === lowered) || canonical === lowered) {
      return canonical;
    }
  }
  return lowered;
}

export function deterministicUuidFromSeed(seed: string): string {
  const hex = createHash("sha256").update(seed, "utf8").digest("hex");
  const raw = hex.slice(0, 32).split("");
  raw[12] = "5";
  raw[16] = ((parseInt(raw[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${raw.slice(0, 8).join("")}-${raw.slice(8, 12).join("")}-${raw.slice(12, 16).join("")}-${raw.slice(16, 20).join("")}-${raw.slice(20, 32).join("")}`;
}

export function extractStableArtifactIdentity(body: PostEventBody): {
  derivation_rule_id: string | null;
  stable_identity_map: Record<string, string>;
  stable_identity_fields: string[];
  stable_identity_summary: string;
  derivable: boolean;
  quality: ArtifactIdentityQuality;
  candidate_keys: string[];
  detail: string;
  conflict: boolean;
} {
  const payload = body.payload as Record<string, unknown>;
  const explicitRule = DERIVATION_RULES_BY_SOURCE_TYPE_KEY[body.source_type_key];
  const extractForKeys = (
    keys: readonly CanonicalStableKey[],
    params: { derivation_rule_id: string | null; quality: ArtifactIdentityQuality; detailPrefix: string }
  ): StableExtractionResult => {
    const stable_identity_map: Record<string, string> = {};
    const candidate_keys = new Set<string>();
    let conflict = false;
    for (const key of keys) {
      const extracted = extractCanonicalKey(payload, key);
      for (const alias of extracted.aliases) candidate_keys.add(alias);
      if (extracted.conflict) {
        conflict = true;
        continue;
      }
      if (extracted.value) {
        stable_identity_map[key] = extracted.value;
      }
    }
    const normalizedMap = Object.fromEntries(
      Object.entries(stable_identity_map).sort(([a], [b]) => a.localeCompare(b))
    );
    const stable_identity_fields = Object.keys(normalizedMap);
    const derivable = !conflict && stable_identity_fields.length >= (params.quality === "derived_strong" ? keys.length : 1);
    return {
      derivation_rule_id: params.derivation_rule_id,
      stable_identity_map: normalizedMap,
      stable_identity_fields,
      stable_identity_summary: toCanonicalIdentitySummary(normalizedMap),
      derivable,
      quality: conflict
        ? "ambiguous"
        : derivable
          ? params.quality
          : params.quality === "derived_strong"
            ? "insufficient"
            : "insufficient",
      candidate_keys: [...candidate_keys].sort(),
      detail: conflict ? "conflicting flat/nested stable identity aliases" : params.detailPrefix,
      conflict,
    };
  };

  if (explicitRule) {
    const explicit = extractForKeys(explicitRule.stable_keys, {
      derivation_rule_id: explicitRule.rule_id,
      quality: "derived_strong",
      detailPrefix: "explicit stable derivation rule evaluated",
    });
    if (explicit.derivable || explicit.conflict) {
      return explicit;
    }
    const genericFallback = extractForKeys(GENERIC_STABLE_KEYS, {
      derivation_rule_id: explicitRule.rule_id,
      quality: "derived_generic",
      detailPrefix: "explicit rule not derivable; generic stable keys collected for candidate matching",
    });
    if (genericFallback.conflict) {
      return {
        ...genericFallback,
        derivation_rule_id: explicitRule.rule_id,
      };
    }
    if (genericFallback.stable_identity_fields.length > 0) {
      return {
        ...genericFallback,
        derivation_rule_id: explicitRule.rule_id,
        derivable: false,
        quality: "insufficient",
      };
    }
    return explicit;
  }
  const generic = extractForKeys(GENERIC_STABLE_KEYS, {
    derivation_rule_id: "generic_stable_key_allowlist_v2",
    quality: "derived_generic",
    detailPrefix: "generic stable key allowlist evaluated",
  });
  if (!generic.conflict && generic.stable_identity_fields.length === 0) {
    return {
      ...generic,
      derivation_rule_id: null,
      detail: "no stable artifact identity keys found",
      quality: "insufficient",
    };
  }
  return generic;
}

export function deriveArtifactIdFromStableIdentity(params: {
  body: PostEventBody;
  canonical_event_type?: string | null;
  stable_identity_map: Record<string, string>;
}): string {
  const sourceScope = artifactContinuityScope(params.body.source_type_key);
  const seed = stableStringify({
    organization_id: params.body.organization_id,
    environment_id: params.body.environment_id,
    subject_id: params.body.subject_id,
    source_continuity_scope: sourceScope,
    canonical_event_type: params.canonical_event_type ?? null,
    stable_identity_map: params.stable_identity_map,
  });
  return deterministicUuidFromSeed(seed);
}

export function compatibleSourceTypeSearchOrder(sourceTypeKey: string): string[] {
  const compatible = SOURCE_COMPATIBILITY_GROUPS[sourceTypeKey] ?? [];
  return [sourceTypeKey, ...compatible.filter((c) => c !== sourceTypeKey)];
}

export function artifactContinuityScope(sourceTypeKey: string): string {
  const group = [sourceTypeKey, ...(SOURCE_COMPATIBILITY_GROUPS[sourceTypeKey] ?? [])].sort();
  return group.length > 1 ? `compat:${group.join("|")}` : `source:${sourceTypeKey}`;
}

