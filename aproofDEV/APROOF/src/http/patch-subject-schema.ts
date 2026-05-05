import { z } from "zod";

/** PATCH /subjects/:id — only `external_key` is mutable; unknown keys rejected. */
export const patchSubjectBodySchema = z
  .object({
    external_key: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

export type PatchSubjectBody = z.infer<typeof patchSubjectBodySchema>;
