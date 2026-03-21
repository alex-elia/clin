import { z } from "zod";

export const capturePayloadSchema = z.object({
  schemaVersion: z.string().min(1),
  pageType: z.enum(["profile", "connections", "unknown"]),
  sourceUrl: z.string().url(),
  capturedAt: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  extractedFields: z.object({
    fullName: z.string().optional(),
    headline: z.string().optional(),
    company: z.string().optional(),
    location: z.string().optional(),
    connectionDegree: z.string().optional(),
  }),
  fieldPresence: z.record(z.string(), z.boolean()).optional(),
});
