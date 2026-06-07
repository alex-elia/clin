import { z } from "zod";

export const queuePatchSchema = z
  .object({
    status: z.enum(["pending", "reviewed", "dismissed", "deferred"]).optional(),
    draftOutreach: z.string().max(16_000).nullable().optional(),
    outreachDecision: z
      .enum(["pending", "approved", "skipped", "sent"])
      .optional(),
    removalDecision: z.enum(["keep", "approve_removal"]).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, {
    message: "At least one field required",
  });

export type QueuePatchInput = z.infer<typeof queuePatchSchema>;
