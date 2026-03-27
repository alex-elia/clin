import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

export const OLLAMA_KEYS = {
  baseUrl: "ollama.base_url",
  model: "ollama.model",
} as const;

const ENV_BASE =
  typeof process.env.OLLAMA_BASE_URL === "string" && process.env.OLLAMA_BASE_URL.trim()
    ? process.env.OLLAMA_BASE_URL.trim().replace(/\/$/, "")
    : "http://127.0.0.1:11434";

const ENV_MODEL =
  typeof process.env.OLLAMA_MODEL === "string" && process.env.OLLAMA_MODEL.trim()
    ? process.env.OLLAMA_MODEL.trim()
    : "qwen2.5:8b";

export type OllamaSettings = {
  baseUrl: string;
  model: string;
};

export async function getOllamaSettings(): Promise<OllamaSettings> {
  const db = getDb();
  const keys = Object.values(OLLAMA_KEYS);
  const rows = await db.query.appSettings.findMany({
    where: inArray(appSettings.key, keys),
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const storedBase = map.get(OLLAMA_KEYS.baseUrl)?.trim();
  const storedModel = map.get(OLLAMA_KEYS.model)?.trim();
  return {
    baseUrl: (storedBase || ENV_BASE).replace(/\/$/, ""),
    model: storedModel || ENV_MODEL,
  };
}

export type OllamaSettingsPatch = Partial<{ baseUrl: string; model: string }>;

export async function updateOllamaSettings(
  patch: OllamaSettingsPatch,
): Promise<OllamaSettings> {
  const current = await getOllamaSettings();
  let baseUrl = current.baseUrl;
  let model = current.model;
  if (typeof patch.baseUrl === "string" && patch.baseUrl.trim()) {
    baseUrl = patch.baseUrl.trim().replace(/\/$/, "");
  }
  if (typeof patch.model === "string" && patch.model.trim()) {
    model = patch.model.trim();
  }

  const db = getDb();
  const now = new Date();
  for (const [key, value] of [
    [OLLAMA_KEYS.baseUrl, baseUrl],
    [OLLAMA_KEYS.model, model],
  ] as const) {
    const existing = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, key),
    });
    if (existing) {
      await db
        .update(appSettings)
        .set({ value, updatedAt: now })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value, updatedAt: now });
    }
  }
  return { baseUrl, model };
}
