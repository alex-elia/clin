import { randomUUID } from "node:crypto";
import { getSqlite } from "@/db";
import type {
  InboxThreadAnalysis,
  StoredThreadAnalysis,
} from "@/lib/inboxThreadAnalysisTypes";

export type SaveThreadAnalysisInput = {
  contactId: string;
  threadKey: string;
  analysis: InboxThreadAnalysis;
  messageCount: number;
  model?: string | null;
};

export async function saveThreadAnalysis(
  input: SaveThreadAnalysisInput,
): Promise<void> {
  const sqlite = getSqlite();
  const now = Date.now();
  const existing = sqlite
    .prepare(
      `SELECT id FROM inbox_thread_analysis WHERE contact_id = ? AND thread_key = ?`,
    )
    .get(input.contactId, input.threadKey) as { id: string } | undefined;

  const payload = JSON.stringify(input.analysis);
  if (existing?.id) {
    sqlite
      .prepare(
        `UPDATE inbox_thread_analysis
         SET analysis_json = ?, message_count = ?, model = ?, analyzed_at = ?
         WHERE id = ?`,
      )
      .run(
        payload,
        input.messageCount,
        input.model ?? null,
        now,
        existing.id,
      );
    return;
  }

  sqlite
    .prepare(
      `INSERT INTO inbox_thread_analysis
       (id, contact_id, thread_key, analysis_json, message_count, model, analyzed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.contactId,
      input.threadKey,
      payload,
      input.messageCount,
      input.model ?? null,
      now,
    );
}

export function getThreadAnalysis(
  contactId: string,
  threadKey: string,
): StoredThreadAnalysis | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT contact_id, thread_key, analysis_json, message_count, model, analyzed_at
       FROM inbox_thread_analysis
       WHERE contact_id = ? AND thread_key = ?`,
    )
    .get(contactId, threadKey) as
    | {
        contact_id: string;
        thread_key: string;
        analysis_json: string;
        message_count: number;
        model: string | null;
        analyzed_at: number;
      }
    | undefined;

  if (!row) return null;
  let analysis: InboxThreadAnalysis;
  try {
    analysis = JSON.parse(row.analysis_json) as InboxThreadAnalysis;
  } catch {
    return null;
  }

  return {
    contactId: row.contact_id,
    threadKey: row.thread_key,
    analysis,
    messageCount: row.message_count,
    model: row.model,
    analyzedAt: new Date(row.analyzed_at),
  };
}

export function loadThreadAnalysesByContactIds(
  pairs: { contactId: string; threadKey: string }[],
): Map<string, StoredThreadAnalysis> {
  const map = new Map<string, StoredThreadAnalysis>();
  for (const { contactId, threadKey } of pairs) {
    const stored = getThreadAnalysis(contactId, threadKey);
    if (stored) map.set(`${contactId}:${threadKey}`, stored);
  }
  return map;
}

export function threadAnalysisKey(contactId: string, threadKey: string): string {
  return `${contactId}:${threadKey}`;
}

export function isThreadAnalysisStale(
  stored: StoredThreadAnalysis | null | undefined,
  currentMessageCount: number,
): boolean {
  if (!stored) return true;
  return stored.messageCount !== currentMessageCount;
}
