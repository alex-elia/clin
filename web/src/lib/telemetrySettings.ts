import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataDirectory } from "@/lib/dataPaths";

const SETTINGS_FILE = "telemetry-settings.json";

type TelemetrySettings = {
  consented: boolean | null;
  consentedAt: string | null;
};

function settingsPath(): string {
  return path.join(resolveDataDirectory(), SETTINGS_FILE);
}

let cachedSettings: TelemetrySettings | undefined;

async function loadSettings(): Promise<TelemetrySettings> {
  if (cachedSettings) return cachedSettings;

  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    cachedSettings = JSON.parse(raw) as TelemetrySettings;
    return cachedSettings;
  } catch {
    return { consented: null, consentedAt: null };
  }
}

async function saveSettings(settings: TelemetrySettings): Promise<void> {
  const dir = resolveDataDirectory();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
  cachedSettings = settings;
}

export async function getTelemetryConsent(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.consented === true;
}

export async function setTelemetryConsent(consented: boolean): Promise<void> {
  await saveSettings({
    consented,
    consentedAt: new Date().toISOString(),
  });
}

export async function needsConsentPrompt(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.consented === null;
}
