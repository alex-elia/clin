import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDirectory } from "@/lib/dataPaths";

export type LlmCallLogEntry = {
  id: string;
  at: string;
  feature: string;
  provider: string;
  model: string;
  durationMs: number;
  ok: boolean;
  error?: string;
  systemChars: number;
  userChars: number;
  responseChars: number;
  /** Last ~2k chars of model output (or error text). */
  responsePreview: string;
  meta?: Record<string, string | number | boolean | null>;
};

const LOG_FILE = "llm-call-log.jsonl";
const MAX_LINES = 400;
const PREVIEW_MAX = 2400;

function logPath(): string {
  return path.join(resolveDataDirectory(), LOG_FILE);
}

function previewText(text: string): string {
  const t = text.trim();
  if (t.length <= PREVIEW_MAX) return t;
  return `…${t.slice(-PREVIEW_MAX)}`;
}

export async function appendLlmCallLog(
  input: Omit<LlmCallLogEntry, "id" | "at" | "responsePreview"> & {
    responseText?: string;
  },
): Promise<LlmCallLogEntry> {
  const { responseText, ...entry } = input;
  const row: LlmCallLogEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    responsePreview: previewText(responseText ?? entry.error ?? ""),
    ...entry,
  };

  const dir = resolveDataDirectory();
  await fs.mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(row)}\n`;
  await fs.appendFile(logPath(), line, "utf8");
  await trimLlmCallLogFile();
  return row;
}

async function trimLlmCallLogFile(): Promise<void> {
  try {
    const raw = await fs.readFile(logPath(), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    if (lines.length <= MAX_LINES) return;
    const kept = lines.slice(-MAX_LINES);
    await fs.writeFile(logPath(), `${kept.join("\n")}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

export async function listLlmCallLogs(limit = 40): Promise<LlmCallLogEntry[]> {
  try {
    const raw = await fs.readFile(logPath(), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const entries: LlmCallLogEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i -= 1) {
      try {
        entries.push(JSON.parse(lines[i]!) as LlmCallLogEntry);
      } catch {
        /* skip bad line */
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function getLlmCallLogById(
  id: string,
): Promise<LlmCallLogEntry | null> {
  const logs = await listLlmCallLogs(200);
  return logs.find((l) => l.id === id) ?? null;
}
