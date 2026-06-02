import { z } from "zod";

const messagingMessageSchema = z.object({
  from: z.enum(["me", "them", "unknown"]),
  body: z.string().min(1).max(20_000),
});

const profilePostSchema = z.object({
  text: z.string().min(1).max(12_000),
  ageLabel: z.string().max(120).optional(),
  reactions: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  postUrl: z.string().url().optional(),
});

export const capturePayloadSchema = z
  .object({
    schemaVersion: z.string().min(1),
    pageType: z.enum([
      "profile",
      "connections",
      "unknown",
      "messaging",
      "posts",
    ]),
    sourceUrl: z.string().url(),
    capturedAt: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    extractedFields: z.object({
      fullName: z.string().optional(),
      headline: z.string().optional(),
      company: z.string().optional(),
      location: z.string().optional(),
      connectionDegree: z.string().optional(),
      about: z.string().max(20_000).optional(),
      experienceBullets: z.array(z.string().max(600)).max(25).optional(),
      educationBullets: z.array(z.string().max(500)).max(20).optional(),
      messagingParticipantProfileUrl: z.string().url().optional(),
      messagingThreadId: z.string().max(200).optional(),
      messagingParticipantName: z.string().max(500).optional(),
      messagingMessages: z.array(messagingMessageSchema).max(500).optional(),
      targetProfileUrl: z.string().url().optional(),
      profilePosts: z.array(profilePostSchema).max(40).optional(),
    }),
    fieldPresence: z.record(z.string(), z.boolean()).optional(),
    outreachCampaignId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.pageType !== "messaging") return;
    const url = data.extractedFields.messagingParticipantProfileUrl?.trim();
    if (!url) {
      ctx.addIssue({
        code: "custom",
        message:
          "Messaging capture requires messagingParticipantProfileUrl (their /in/… link).",
        path: ["extractedFields", "messagingParticipantProfileUrl"],
      });
    }
    const msgs = data.extractedFields.messagingMessages;
    if (!msgs?.length) {
      ctx.addIssue({
        code: "custom",
        message: "Messaging capture requires at least one message.",
        path: ["extractedFields", "messagingMessages"],
      });
    }
    const threadId = data.extractedFields.messagingThreadId?.trim();
    if (!data.sourceUrl.includes("/messaging/") && !threadId) {
      ctx.addIssue({
        code: "custom",
        message:
          "sourceUrl should be the messaging thread URL (open /messaging/thread/… in the address bar).",
        path: ["sourceUrl"],
      });
    }
  })
  .superRefine((data, ctx) => {
    if (data.pageType !== "posts") return;
    const posts = data.extractedFields.profilePosts;
    if (!posts?.length) {
      ctx.addIssue({
        code: "custom",
        message: "Posts capture requires at least one profilePosts entry.",
        path: ["extractedFields", "profilePosts"],
      });
    }
    const target =
      data.extractedFields.targetProfileUrl?.trim() || data.sourceUrl;
    if (!target.includes("/in/")) {
      ctx.addIssue({
        code: "custom",
        message: "Posts capture needs a profile URL (/in/…).",
        path: ["extractedFields", "targetProfileUrl"],
      });
    }
  });

export const connectionRowSchema = z.object({
  profileUrl: z.string().url(),
  fullName: z.string().optional(),
  headline: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  connectionDegree: z.string().optional(),
  /** e.g. "Pierre Delort and 67 other mutual connections" from search cards */
  mutualConnectionsHint: z.string().optional(),
});

export const connectionsPagePayloadSchema = z.object({
  schemaVersion: z.string().min(1),
  pageType: z.literal("connections"),
  listSourceUrl: z.string().url(),
  capturedAt: z.string().optional(),
  rows: z.array(connectionRowSchema).min(1).max(220),
  outreachCampaignId: z.string().min(1).optional(),
});

/** Manual extension dump: visible inbox list, creator/post analytics page, etc. */
export const extensionSnapshotPayloadSchema = z.object({
  schemaVersion: z.string().min(1),
  kind: z.enum([
    "linkedin_messages_inbox_visible",
    "linkedin_post_analytics_visible",
  ]),
  sourceUrl: z.string().url(),
  capturedAt: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const automationAckSchema = z.object({
  contactId: z.string().min(1),
  outcome: z.enum(["ok", "skip", "error"]),
  kind: z.enum(["hygiene", "profile_queue"]).optional(),
});

export const automationSettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    connectionsSprintEnabled: z.boolean().optional(),
    autoEnrichAfterList: z.boolean().optional(),
    autoCaptureMessagingInEnrich: z.boolean().optional(),
    maxPerDay: z.number().int().optional(),
    minGapSeconds: z.number().int().optional(),
    maxGapSeconds: z.number().int().optional(),
    jitterPercent: z.number().int().optional(),
  })
  .strict();

export const contactAnalyzeBodySchema = z
  .object({
    tier: z.enum(["provisional", "refined", "auto"]).default("auto"),
    messageContext: z.string().max(32_000).optional(),
    persistMessageContext: z.boolean().optional(),
  })
  .strict();

export const inboxAnalyzeBodySchema = z
  .object({
    contactId: z.string().min(1),
    threadKey: z.string().min(1).optional(),
  })
  .strict();

export const profileCaptureQueueBodySchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(40),
});
