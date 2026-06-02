import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDirectory } from "@/lib/dataPaths";
import {
  appEventToCloudRow,
  pushTelemetryToCloudAsync,
} from "@/lib/telemetry/cloudSink";
import { getTelemetryCloudConfig } from "@/lib/telemetry/cloudConfig";

export type AppEventKind = "feature" | "orchestration";

export type AppEvent = {
  id: string;
  at: string;
  kind: AppEventKind;
  /** Stable action key, e.g. capture_ingest, campaign_autopilot. */
  action: string;
  ok: boolean;
  durationMs?: number;
  error?: string;
  meta?: Record<string, string | number | boolean | null>;
};

const LOG_FILE = "app-events.jsonl";
const MAX_LINES = 800;

function logPath(): string {
  return path.join(resolveDataDirectory(), LOG_FILE);
}

export async function appendAppEvent(
  input: Omit<AppEvent, "id" | "at">,
): Promise<AppEvent> {
  const row: AppEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ...input,
  };

  const dir = resolveDataDirectory();
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(logPath(), `${JSON.stringify(row)}\n`, "utf8");
  await trimAppEventLogFile();

  const cloudCfg = await getTelemetryCloudConfig();
  if (cloudCfg) {
    pushTelemetryToCloudAsync(appEventToCloudRow(row, cloudCfg.instanceId));
  }

  return row;
}

async function trimAppEventLogFile(): Promise<void> {
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

export async function listAllAppEvents(): Promise<AppEvent[]> {
  try {
    const raw = await fs.readFile(logPath(), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const entries: AppEvent[] = [];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        entries.push(JSON.parse(lines[i]!) as AppEvent);
      } catch {
        /* skip */
      }
    }
    return entries;
  } catch {
    return [];
  }
}
