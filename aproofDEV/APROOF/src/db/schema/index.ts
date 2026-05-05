/**
 * APROOF Phase 1 — database schema (protocol-aligned).
 * Raw → canonical → gate → proofs → failure locators → anchor batches.
 *
 * SQL migrations: change this file, then `npm run db:generate`; apply with `npm run db:migrate`.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

/** Subject rail: exactly one per subject (spec §3). */
export const railTypeEnum = pgEnum("rail_type", [
  "system",
  "service",
  "agent",
  "model",
  "endpoint",
]);

/**
 * Canonical event types (spec §4).
 * `identity_access_checked` is canonical; `access_token_used` is retained as legacy/deprecated alias.
 */
export const canonicalEventTypeEnum = pgEnum("canonical_event_type", [
  "request_received",
  "record_accessed",
  "retrieval_completed",
  "model_invoked",
  "policy_checked",
  "identity_access_checked",
  "decision_completed",
  "action_completed",
  "writeback_completed",
  "alert_generated",
  "handoff_completed",
  "access_token_used",
  "config_changed",
  "deployment_changed",
]);

/** Integrity angles (spec §5). */
export const integrityAngleEnum = pgEnum("integrity_angle", [
  "deterministic_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "policy_integrity",
  "operational_integrity",
  "identity_access_integrity",
  "cross_system_integrity",
]);

/** Proof unit status (spec §10). */
export const proofStatusEnum = pgEnum("proof_status", [
  "conformant",
  "flagged",
  "violated",
  "unverifiable",
]);

/** Proof anchor lifecycle on the unit (spec §13; starts pending). */
export const proofAnchorStateEnum = pgEnum("proof_anchor_state", [
  "pending",
  "submitted",
  "confirmed",
  "failed",
]);

/** Anchor batch status (spec §13). */
export const anchorBatchStatusEnum = pgEnum("anchor_batch_status", [
  "pending",
  "submitted",
  "confirmed",
  "failed",
]);

/** Traceability / proofability gate outcome on canonical row (spec §7–8). */
export const canonicalProofabilityEnum = pgEnum("canonical_proofability", [
  "pending",
  "proofable",
  "not_proofable",
]);

/* -------------------------------------------------------------------------- */
/* Control plane                                                              */
/* -------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("organizations_created_at_idx").on(t.createdAt)]
);

export const environmentModeEnum = pgEnum("environment_mode", [
  "testnet",
  "staging",
  "production",
]);

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    mode: environmentModeEnum("mode").notNull().default("production"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("environments_org_idx").on(t.organizationId),
    uniqueIndex("environments_org_name_uidx").on(t.organizationId, t.name),
  ]
);

/** User accounts (minimal control-plane auth). */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_uidx").on(t.email),
    index("users_org_idx").on(t.organizationId),
  ]
);

/** Cookie-based sessions for authenticated users. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_token_hash_idx").on(t.tokenHash),
  ]
);

/** API keys: store hash only; prefix for lookup (spec MVP). */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    hashAlgo: text("hash_algo").notNull().default("sha256"),
    keySalt: text("key_salt"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("api_keys_org_env_idx").on(t.organizationId, t.environmentId),
    index("api_keys_prefix_idx").on(t.keyPrefix),
  ]
);

/**
 * Registered subject; rail_type is the single rail for that subject (spec §3).
 * `id` is the canonical internal subject_id. external_key is optional source-facing
 * resolution; when set it must be unique per organization + environment (partial index).
 */
export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    railType: railTypeEnum("rail_type").notNull(),
    externalKey: text("external_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subjects_org_env_idx").on(t.organizationId, t.environmentId),
    uniqueIndex("subjects_org_env_external_present_uidx")
      .on(t.organizationId, t.environmentId, t.externalKey)
      .where(sql`${t.externalKey} is not null`),
  ]
);

/**
 * Mapping rule: presence of a matching rule is required for proofability (spec §8).
 * source_type_key is the ingestion-side discriminator (not a generic CRUD blob).
 */
export const mappingRules = pgTable(
  "mapping_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    sourceTypeKey: text("source_type_key").notNull(),
    canonicalEventType: canonicalEventTypeEnum("canonical_event_type").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("mapping_rules_org_env_idx").on(t.organizationId, t.environmentId),
    uniqueIndex("mapping_rules_active_uidx").on(
      t.organizationId,
      t.environmentId,
      t.sourceTypeKey
    ),
  ]
);

/**
 * Baseline: versioned, immutable row; time-aware validity (spec §9).
 * One active baseline per (subject, angle) at event time is enforced in application logic.
 */
export const baselines = pgTable(
  "baselines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    angle: integrityAngleEnum("angle").notNull(),
    version: integer("version").notNull(),
    definition: jsonb("definition").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("baselines_subject_angle_effective_idx").on(
      t.subjectId,
      t.angle,
      t.effectiveFrom
    ),
    uniqueIndex("baselines_subject_angle_version_uidx").on(
      t.subjectId,
      t.angle,
      t.version
    ),
  ]
);

/* -------------------------------------------------------------------------- */
/* Pipeline storage                                                           */
/* -------------------------------------------------------------------------- */

/** Immutable raw ingest (spec §2, §14). */
export const rawEvents = pgTable(
  "raw_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    payload: jsonb("payload").notNull(),
    /** SHA256(sorted raw JSON) — spec §12. */
    rawPayloadHash: text("raw_payload_hash").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("raw_events_org_env_received_idx").on(
      t.organizationId,
      t.environmentId,
      t.receivedAt
    ),
    index("raw_events_raw_hash_idx").on(t.rawPayloadHash),
  ]
);

/**
 * Canonical event: full traceability contract (spec §7).
 * event_id is the primary key. No mutation after insert (spec §14).
 */
export const canonicalEvents = pgTable(
  "canonical_events",
  {
    eventId: uuid("event_id").primaryKey(),
    rawEventId: uuid("raw_event_id")
      .notNull()
      .references(() => rawEvents.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    artifactId: uuid("artifact_id").notNull(),
    subjectType: railTypeEnum("subject_type").notNull(),
    railType: railTypeEnum("rail_type").notNull(),
    eventLineageId: uuid("event_lineage_id").notNull(),
    eventVersion: integer("event_version").notNull(),
    traceId: text("trace_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    rawPayloadHash: text("raw_payload_hash").notNull(),
    /** SHA256({ event_id, trace_id, subject_id, event_type, occurred_at }) — spec §12. */
    canonicalHash: text("canonical_hash").notNull(),
    /** SHA256({ trace_id, subject_id, event_type, occurred_at }) — content identity excluding event_id. */
    logicalHash: text("logical_hash").notNull(),
    eventType: canonicalEventTypeEnum("event_type").notNull(),
    sourceTypeKey: text("source_type_key").notNull().default("unknown"),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    proofability: canonicalProofabilityEnum("proofability")
      .notNull()
      .default("pending"),
    /** Set when proofability is not_proofable (quarantine detail). */
    quarantineReason: text("quarantine_reason"),
    /** Snapshot of lineage resolver output at ingest — required for stable proof_digest on GET reconstruction. */
    lineageStatus: text("lineage_status").notNull().default("new_lineage"),
    lineageReason: text("lineage_reason").notNull().default(""),
    matchedPriorEventId: uuid("matched_prior_event_id"),
    matchedPriorVersion: integer("matched_prior_version"),
    /** Lineage resolver `artifact_hash` (stableStringify blob) at ingest — avoids JSON round-trip drift on GET. */
    resolverArtifactHash: text("resolver_artifact_hash"),
    /** Lineage resolver `occurrence_hash` at ingest. */
    resolverOccurrenceHash: text("resolver_occurrence_hash"),
    occurrenceHash: text("occurrence_hash"),
    stateHash: text("state_hash"),
    artifactIdentitySource: text("artifact_identity_source"),
    artifactIdentityRuleId: text("artifact_identity_rule_id"),
    artifactIdentityConfidence: text("artifact_identity_confidence"),
    artifactIdentityQuality: text("artifact_identity_quality"),
    artifactIdentityCandidateKeys: jsonb("artifact_identity_candidate_keys"),
    artifactIdentityCompatibleSourceMatch: text("artifact_identity_compatible_source_match"),
    artifactStableIdentityJson: jsonb("artifact_stable_identity_json"),
    artifactIdentitySummary: text("artifact_identity_summary"),
    idempotencyKey: text("idempotency_key"),
    ingestionSource: text("ingestion_source"),
    pipelineStageJson: jsonb("pipeline_stage_json")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("canonical_events_raw_event_uidx").on(t.rawEventId),
    uniqueIndex("canonical_events_org_env_lineage_version_uidx").on(
      t.organizationId,
      t.environmentId,
      t.eventLineageId,
      t.eventVersion
    ),
    index("canonical_events_org_env_occurred_idx").on(
      t.organizationId,
      t.environmentId,
      t.occurredAt
    ),
    index("canonical_events_subject_occurred_idx").on(t.subjectId, t.occurredAt),
    index("canonical_events_lineage_idx").on(t.eventLineageId),
    index("canonical_events_canonical_hash_idx").on(t.canonicalHash),
    index("canonical_events_logical_hash_idx").on(t.logicalHash),
    uniqueIndex("canonical_events_org_env_idempotency_key_uidx")
      .on(t.organizationId, t.environmentId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    check("canonical_events_event_version_positive_int_chk", sql`${t.eventVersion} > 0`),
  ]
);

/** Proof units: immutable after creation (spec §10, §14). */
export const proofUnits = pgTable(
  "proof_units",
  {
    proofId: uuid("proof_id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => canonicalEvents.eventId),
    eventLineageId: uuid("event_lineage_id").notNull(),
    rawEventId: uuid("raw_event_id")
      .notNull()
      .references(() => rawEvents.id),
    canonicalEventId: uuid("canonical_event_id")
      .notNull()
      .references(() => canonicalEvents.eventId),
    artifactId: uuid("artifact_id").notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    matchedPriorEventId: uuid("matched_prior_event_id"),
    anchorBatchId: uuid("anchor_batch_id"),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    angle: integrityAngleEnum("angle").notNull(),
    baselineId: uuid("baseline_id").references(() => baselines.id),
    status: proofStatusEnum("status").notNull(),
    severity: text("severity"),
    deltaCode: text("delta_code"),
    expectedJson: jsonb("expected_json"),
    observedJson: jsonb("observed_json"),
    evidenceJson: jsonb("evidence_json"),
    anchorState: proofAnchorStateEnum("anchor_state").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("proof_units_event_idx").on(t.eventId),
    uniqueIndex("proof_units_event_angle_uidx").on(t.eventId, t.angle),
    index("proof_units_anchor_state_idx").on(t.anchorState),
    index("proof_units_subject_angle_idx").on(t.subjectId, t.angle),
  ]
);

/** Only for flagged | violated proofs (spec §11). */
export const failureLocatorRecords = pgTable(
  "failure_locator_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proofId: uuid("proof_id")
      .notNull()
      .references(() => proofUnits.proofId),
    eventId: uuid("event_id")
      .notNull()
      .references(() => canonicalEvents.eventId),
    rawEventId: uuid("raw_event_id")
      .notNull()
      .references(() => rawEvents.id),
    canonicalEventId: uuid("canonical_event_id")
      .notNull()
      .references(() => canonicalEvents.eventId),
    eventLineageId: uuid("event_lineage_id").notNull(),
    artifactId: uuid("artifact_id").notNull(),
    failureZone: text("failure_zone").notNull(),
    subject: text("subject").notNull(),
    host: text("host").notNull(),
    angle: integrityAngleEnum("angle").notNull(),
    inspectionPath: text("inspection_path").notNull(),
    step: text("step").notNull().default("angle_evaluation"),
    reasonCode: text("reason_code").notNull().default("UNKNOWN"),
    detail: text("detail").notNull().default(""),
    failureType: text("failure_type"),
    baselineRuleId: text("baseline_rule_id"),
    missingFields: jsonb("missing_fields"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("failure_locator_records_proof_uidx").on(t.proofId),
    index("failure_locator_records_angle_idx").on(t.angle),
  ]
);

/**
 * Deterministic local/sandbox batching (MVP) — Solana-shaped sandbox route today; real devnet = writer swap-in.
 * `chain_name` = route label (e.g. solana-sandbox); not a public L1 tx until `tx_ref` is set by a real writer.
 */
export const anchorBatches = pgTable(
  "anchor_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA256(ordered proof digests) — deterministic batch commitment (spec §12 + MVP rule). */
    batchHash: text("batch_hash").notNull(),
    /** MVP: identical to batch_hash; reserved for future Merkle root. */
    rootHash: text("root_hash").notNull(),
    proofCount: integer("proof_count").notNull(),
    /** Network family for read models and future multi-route support (Solana in sandbox). */
    chainFamily: text("chain_family").notNull().default("solana"),
    /** Local/sandbox route id (e.g. solana-sandbox) — not a public-chain tx. */
    chainName: text("chain_name").notNull().default("solana-sandbox"),
    /** Writer mode used to produce this batch attestation. */
    anchorMode: text("anchor_mode").notNull().default("sandbox-mock"),
    /** Honest local cluster label for Solana-oriented sandbox (not a live RPC target until external write). */
    cluster: text("cluster").notNull().default("sandbox-devnet"),
    /** External attestation (e.g. real chain tx ref) — null until a real write exists. */
    txRef: text("tx_ref"),
    /** Canonical Solana tx signature field; kept in sync with tx_ref for compatibility. */
    txSignature: text("tx_signature"),
    explorerUrl: text("explorer_url"),
    walletPublicKey: text("wallet_public_key"),
    confirmationStatus: text("confirmation_status"),
    /**
     * Deterministic Solana-sandbox identifiers — not layer-1 Ed25519 signatures; derived from `batch_hash`.
     * The real devnet writer will still commit the same `anchor_payload`; only the attestation ref changes.
     */
    simulatedSignature: text("simulated_signature"),
    /** Decimal string, plausible u64 range; stable for a given `batch_hash`. */
    simulatedSlot: text("simulated_slot"),
    /** Local sandbox “finality” of the batch row — not external chain `finalized` consensus. */
    simulatedCommitment: text("simulated_commitment").notNull().default("simulated_finalized"),
    /** True when an external attestation (e.g. devnet) has been recorded. Sandbox route keeps false. */
    externalAttested: boolean("external_attested").notNull().default(false),
    /** Serialized commitment, e.g. aproof:v1:<batch_hash>. */
    anchorPayload: text("anchor_payload"),
    status: anchorBatchStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    anchoredAt: timestamp("anchored_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("anchor_batches_batch_hash_uidx").on(t.batchHash),
    index("anchor_batches_status_idx").on(t.status),
  ]
);

/**
 * Ordered membership; ordinals define proof_digest order for batch_hash (spec §12).
 */
export const anchorBatchItems = pgTable(
  "anchor_batch_items",
  {
    batchId: uuid("batch_id")
      .notNull()
      .references(() => anchorBatches.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    proofId: uuid("proof_id")
      .notNull()
      .references(() => proofUnits.proofId),
  },
  (t) => [
    uniqueIndex("anchor_batch_items_batch_ordinal_uidx").on(t.batchId, t.ordinal),
    uniqueIndex("anchor_batch_items_proof_uidx").on(t.proofId),
    index("anchor_batch_items_batch_idx").on(t.batchId),
  ]
);

/**
 * Subject-scoped user / activity logs — ingested as-is; not canonical events and not proof pipeline.
 * Separate storage from `canonical_events` and `proof_units`.
 */
export const subjectUserLogs = pgTable(
  "subject_user_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actionType: text("action_type").notNull(),
    actionTitle: text("action_title").notNull(),
    summary: text("summary"),
    source: text("source"),
    actorId: text("actor_id"),
    actorType: text("actor_type"),
    traceId: text("trace_id"),
    relatedEventId: uuid("related_event_id"),
    relatedProofId: uuid("related_proof_id"),
    relatedLineageId: uuid("related_lineage_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subject_user_logs_scope_occurred_id_idx").on(
      t.organizationId,
      t.environmentId,
      t.subjectId,
      t.occurredAt,
      t.id
    ),
  ]
);

/* -------------------------------------------------------------------------- */
/* Relations (optional; useful for Drizzle queries later)                      */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [sessions.organizationId],
    references: [organizations.id],
  }),
  environment: one(environments, {
    fields: [sessions.environmentId],
    references: [environments.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  environments: many(environments),
  apiKeys: many(apiKeys),
  subjects: many(subjects),
  users: many(users),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [environments.organizationId],
    references: [organizations.id],
  }),
  apiKeys: many(apiKeys),
  subjects: many(subjects),
}));

export const rawEventsRelations = relations(rawEvents, ({ one }) => ({
  canonicalEvent: one(canonicalEvents, {
    fields: [rawEvents.id],
    references: [canonicalEvents.rawEventId],
  }),
}));

export const canonicalEventsRelations = relations(
  canonicalEvents,
  ({ one, many }) => ({
    rawEvent: one(rawEvents, {
      fields: [canonicalEvents.rawEventId],
      references: [rawEvents.id],
    }),
    subject: one(subjects, {
      fields: [canonicalEvents.subjectId],
      references: [subjects.id],
    }),
    proofUnits: many(proofUnits),
  })
);

export const proofUnitsRelations = relations(proofUnits, ({ one }) => ({
  canonicalEvent: one(canonicalEvents, {
    fields: [proofUnits.eventId],
    references: [canonicalEvents.eventId],
  }),
  baseline: one(baselines, {
    fields: [proofUnits.baselineId],
    references: [baselines.id],
  }),
  failureLocator: one(failureLocatorRecords, {
    fields: [proofUnits.proofId],
    references: [failureLocatorRecords.proofId],
  }),
  anchorBatchItem: one(anchorBatchItems, {
    fields: [proofUnits.proofId],
    references: [anchorBatchItems.proofId],
  }),
}));

export const failureLocatorRecordsRelations = relations(
  failureLocatorRecords,
  ({ one }) => ({
    proof: one(proofUnits, {
      fields: [failureLocatorRecords.proofId],
      references: [proofUnits.proofId],
    }),
  })
);

export const anchorBatchItemsRelations = relations(anchorBatchItems, ({ one }) => ({
  batch: one(anchorBatches, {
    fields: [anchorBatchItems.batchId],
    references: [anchorBatches.id],
  }),
  proof: one(proofUnits, {
    fields: [anchorBatchItems.proofId],
    references: [proofUnits.proofId],
  }),
}));

export const anchorBatchesRelations = relations(anchorBatches, ({ many }) => ({
  items: many(anchorBatchItems),
}));
