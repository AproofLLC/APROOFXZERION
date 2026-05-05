/**
 * Event and artifact identity resolution.
 * Normative derivation rules: docs/event-identity-lineage-spec.md §11.
 */
import type { PostEventBody } from "../http/events-schema.js";
import { stableStringify } from "../protocol/event-hashing.js";
import { rawPayloadHashFromPayload } from "../protocol/event-hashing.js";
import {
  deriveArtifactIdFromStableIdentity,
  deterministicUuidFromSeed,
  extractStableArtifactIdentity,
  type ArtifactIdentityResolution,
} from "./artifact-identity.js";

export type { ArtifactIdentityResolution } from "./artifact-identity.js";

function deriveDeterministicEventIdSeed(params: {
  body: PostEventBody;
  canonical_event_type?: string | null;
}): string {
  const { body, canonical_event_type } = params;
  return stableStringify({
    organization_id: body.organization_id,
    environment_id: body.environment_id,
    subject_id: body.subject_id,
    source_type_key: body.source_type_key,
    trace_id: body.trace_id,
    canonical_event_type: canonical_event_type ?? null,
    occurred_at: body.occurred_at.toISOString(),
    stable_payload_hash: rawPayloadHashFromPayload(body.payload),
  });
}

export function resolveArtifactIdentity(
  body: PostEventBody,
  options?: { canonical_event_type?: string | null }
): ArtifactIdentityResolution {
  const provided = body.artifact_id;
  const extraction = extractStableArtifactIdentity(body);
  const derivedArtifactId = extraction.derivable
    ? deriveArtifactIdFromStableIdentity({
        body,
        canonical_event_type: options?.canonical_event_type ?? null,
        stable_identity_map: extraction.stable_identity_map,
      })
    : null;

  if (provided) {
    if (extraction.conflict) {
      return {
        ok: false,
        reason: "ARTIFACT_STABLE_IDENTITY_CONFLICT",
        stable_identity_fields: extraction.stable_identity_fields,
        stable_identity_map: extraction.stable_identity_map,
        derivation_rule_id: extraction.derivation_rule_id,
        candidate_keys: extraction.candidate_keys,
        quality: "ambiguous",
        compatible_source_match: null,
        detail: extraction.detail,
      };
    }
    if (!derivedArtifactId) {
      return {
        ok: true,
        artifact_id: provided,
        source: "provided",
        stable_identity_fields: extraction.stable_identity_fields,
        stable_identity_map: extraction.stable_identity_map,
        stable_identity_summary: extraction.stable_identity_summary,
        derivation_rule_id: extraction.derivation_rule_id,
        candidate_keys: extraction.candidate_keys,
        quality: "explicit",
        compatible_source_match: null,
        confidence: "high",
      };
    }
    if (provided !== derivedArtifactId) {
      return {
        ok: false,
        reason: "ARTIFACT_ID_CONFLICT_WITH_DERIVED",
        stable_identity_fields: extraction.stable_identity_fields,
        stable_identity_map: extraction.stable_identity_map,
        derivation_rule_id: extraction.derivation_rule_id,
        candidate_keys: extraction.candidate_keys,
        quality: extraction.quality,
        compatible_source_match: null,
        detail: "provided artifact_id conflicts with deterministic stable derivation",
      };
    }
    return {
      ok: true,
      artifact_id: provided,
      source: "provided_validated",
      stable_identity_fields: extraction.stable_identity_fields,
      stable_identity_map: extraction.stable_identity_map,
      stable_identity_summary: extraction.stable_identity_summary,
      derivation_rule_id: extraction.derivation_rule_id,
      candidate_keys: extraction.candidate_keys,
      quality: "explicit",
      compatible_source_match: null,
      confidence: "high",
    };
  }

  if (extraction.conflict) {
    return {
      ok: false,
      reason: "ARTIFACT_STABLE_IDENTITY_CONFLICT",
      stable_identity_fields: extraction.stable_identity_fields,
      stable_identity_map: extraction.stable_identity_map,
      derivation_rule_id: extraction.derivation_rule_id,
      candidate_keys: extraction.candidate_keys,
      quality: "ambiguous",
      compatible_source_match: null,
      detail: extraction.detail,
    };
  }

  if (derivedArtifactId) {
    return {
      ok: true,
      artifact_id: derivedArtifactId,
      source: "derived",
      stable_identity_fields: extraction.stable_identity_fields,
      stable_identity_map: extraction.stable_identity_map,
      stable_identity_summary: extraction.stable_identity_summary,
      derivation_rule_id: extraction.derivation_rule_id,
      candidate_keys: extraction.candidate_keys,
      quality: extraction.quality,
      compatible_source_match: null,
      confidence: "high",
    };
  }

  return {
    ok: false,
    reason: extraction.derivation_rule_id ? "ARTIFACT_ID_NOT_DERIVABLE" : "ARTIFACT_IDENTITY_INSUFFICIENT",
    stable_identity_fields: extraction.stable_identity_fields,
    stable_identity_map: extraction.stable_identity_map,
    derivation_rule_id: extraction.derivation_rule_id,
    candidate_keys: extraction.candidate_keys,
    quality: extraction.quality,
    compatible_source_match: null,
    detail: extraction.detail,
  };
}

export function resolveEventIdentity(body: PostEventBody): {
  event_id: string;
  event_lineage_id: string;
  artifact: ArtifactIdentityResolution;
};
export function resolveEventIdentity(
  body: PostEventBody,
  options: { canonical_event_type?: string | null }
): {
  event_id: string;
  event_lineage_id: string;
  artifact: ArtifactIdentityResolution;
};
export function resolveEventIdentity(
  body: PostEventBody,
  options?: { canonical_event_type?: string | null }
): {
  event_id: string;
  event_lineage_id: string;
  artifact: ArtifactIdentityResolution;
} {
  const event_id =
    body.event_id ??
    deterministicUuidFromSeed(
      deriveDeterministicEventIdSeed({
        body,
        canonical_event_type: options?.canonical_event_type ?? null,
      })
    );
  const artifact = resolveArtifactIdentity(body, {
    canonical_event_type: options?.canonical_event_type ?? null,
  });
  const event_lineage_id =
    body.event_lineage_id ??
    (artifact.ok ? artifact.artifact_id : "");
  return {
    event_id,
    event_lineage_id,
    artifact,
  };
}
