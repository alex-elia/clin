import { eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import {
  persistLlmAnalysis,
  selectContactLlmExtension,
  tryUpdateLlmMessageContext,
} from "@/lib/contactSqlExtras";
import {
  inferAnalysisTier,
  runContactLlmAnalysis,
} from "@/lib/llmAnalysis";
import {
  getLatestMessagingCaptureForContact,
  resolveMessageContextForAnalysis,
} from "@/lib/messagingContext";
import type { LlmConfig } from "@/lib/llm/types";
import { syncCleaningQueueFromAnalysis } from "@/lib/cleaningQueue";
import { contactAnalyzeBodySchema } from "@/lib/schemas";

type Db = ReturnType<typeof getDb>;
export type ContactAnalyzeInput = z.infer<typeof contactAnalyzeBodySchema>;

export type ExecuteContactAnalysisResult = {
  tier: "provisional" | "refined";
  envelope: Record<string, unknown>;
  contact: Record<string, unknown> | null;
};

/**
 * Shared path for POST /api/contacts/[id]/analyze and autopilot batch runs.
 */
export async function executeContactAnalysis(
  db: Db,
  contactId: string,
  body: ContactAnalyzeInput,
  llm: LlmConfig,
  opts?: {
    llmMeta?: Record<string, string | number | boolean | null>;
  },
): Promise<ExecuteContactAnalysisResult> {
  const row = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!row) throw new Error("Contact not found");

  const storedMsg =
    selectContactLlmExtension(contactId)?.llmMessageContext ?? null;
  const captureMsg = (await getLatestMessagingCaptureForContact(contactId))
    ?.text;
  const msgCtx = resolveMessageContextForAnalysis(
    body.messageContext !== undefined ? body.messageContext : storedMsg,
    captureMsg,
  );

  if (body.persistMessageContext && body.messageContext !== undefined) {
    tryUpdateLlmMessageContext(contactId, body.messageContext);
  }

  const tierIn =
    body.tier === "auto"
      ? await inferAnalysisTier(db, contactId, msgCtx)
      : body.tier;

  const result = await runContactLlmAnalysis(db, {
    contactId,
    tier: tierIn,
    messageContext: msgCtx,
    settings: llm,
    llmMeta: opts?.llmMeta,
  });

  const jsonStr = JSON.stringify(result.envelope);
  persistLlmAnalysis(contactId, result.tier, jsonStr, llm.model);

  await syncCleaningQueueFromAnalysis(
    contactId,
    result.envelope,
    row.segment,
  );

  const updated = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  const llmExt = selectContactLlmExtension(contactId);

  return {
    tier: result.tier,
    envelope: result.envelope,
    contact: updated ? { ...updated, ...(llmExt ?? {}) } : null,
  };
}

export function defaultAutopilotAnalyzeBody(): ContactAnalyzeInput {
  return {
    tier: "auto",
    persistMessageContext: false,
  };
}
