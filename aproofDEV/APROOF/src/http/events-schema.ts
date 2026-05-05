import { z } from "zod";

const MAX_SOURCE_TYPE_KEY_LENGTH = 256;
const MAX_TRACE_ID_LENGTH = 512;

export const postEventBodySchema = z
  .object({
    organization_id: z.string().uuid(),
    environment_id: z.string().uuid(),
    source_type_key: z.string().min(1).max(MAX_SOURCE_TYPE_KEY_LENGTH),
    subject_id: z.string().uuid(),
    event_id: z.string().uuid().optional(),
    artifact_id: z.string().uuid().optional(),
    event_lineage_id: z.string().uuid().optional(),
    event_version: z.number().int().positive().optional(),
    trace_id: z.string().min(1).max(MAX_TRACE_ID_LENGTH),
    occurred_at: z.coerce.date(),
    payload: z.record(z.any()),
    idempotency_key: z.string().max(512).optional(),
    ingestion_source: z.string().max(256).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.payload === null || data.payload === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "payload must be a plain object (null not allowed)",
        path: ["payload"],
      });
    }
    if (Array.isArray(data.payload)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "payload must be a plain object (arrays not allowed)",
        path: ["payload"],
      });
    }
  });

export type PostEventBody = z.infer<typeof postEventBodySchema>;
