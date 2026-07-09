import { z } from "zod";
import { COACH_LIMITS } from "@/lib/coachContextLimits";
import {
  CONTENT_POST_FORMATS,
  CONTENT_POST_STATUSES,
} from "@/lib/contentPostsShared";

/** Validated after normalizeCoachActionsPayload() converts to ISO. */
const coachScheduledAtSchema = z.string().max(64).nullable().optional();

export const coachUpdatePostSchema = z.object({
  type: z.literal("update_post"),
  postId: z.string(),
  patch: z
    .object({
      title: z.string().max(300).optional(),
      status: z.enum(CONTENT_POST_STATUSES).optional(),
      format: z.enum(CONTENT_POST_FORMATS).optional(),
      ideaNotes: z.string().max(COACH_LIMITS.ideaNotes).nullable().optional(),
      hook: z.string().max(COACH_LIMITS.hook).nullable().optional(),
      body: z.string().max(COACH_LIMITS.body).nullable().optional(),
      articleBody: z.string().max(COACH_LIMITS.articleBody).nullable().optional(),
      styleNotes: z.string().max(12_000).nullable().optional(),
      language: z.enum(["fr", "en"]).nullable().optional(),
      lastCoachSummary: z.string().max(500).nullable().optional(),
      scheduledAt: coachScheduledAtSchema,
      coachFlags: z.record(z.string(), z.boolean()).nullable().optional(),
    })
    .optional(),
});

export const coachCreatePostSchema = z.object({
  type: z.literal("create_post"),
  post: z.object({
    title: z.string().min(1).max(300),
    status: z.enum(CONTENT_POST_STATUSES).optional(),
    format: z.enum(CONTENT_POST_FORMATS).optional(),
    ideaNotes: z.string().max(COACH_LIMITS.ideaNotes).nullable().optional(),
    hook: z.string().max(COACH_LIMITS.hook).nullable().optional(),
    body: z.string().max(COACH_LIMITS.body).nullable().optional(),
    language: z.enum(["fr", "en"]).nullable().optional(),
    scheduledAt: coachScheduledAtSchema,
  }),
});

export const coachRescheduleSchema = z.object({
  type: z.literal("reschedule_pipeline"),
  items: z.array(
    z.object({
      postId: z.string(),
      scheduledAt: z.string().max(64).nullable(),
      title: z.string().max(300).optional(),
    }),
  ),
});

export const coachMarkPublishedSchema = z.object({
  type: z.literal("mark_published"),
  postId: z.string().optional(),
  titleMatch: z.string().max(300).optional(),
});

export const coachSuggestDoctrineSchema = z.object({
  type: z.literal("suggest_doctrine"),
  contentDoctrine: z.string().max(20_000),
});

export const coachActionSchema = z.discriminatedUnion("type", [
  coachUpdatePostSchema,
  coachCreatePostSchema,
  coachRescheduleSchema,
  coachMarkPublishedSchema,
  coachSuggestDoctrineSchema,
]);

export type CoachAction = z.infer<typeof coachActionSchema>;

export const coachActionsEnvelopeSchema = z.object({
  actions: z.array(coachActionSchema).max(20),
});
