import fs from "node:fs";
import path from "node:path";

export type MarketEventKind = "holiday" | "thematic" | "quiet_period";

export type MarketCalendarEvent = {
  month: number;
  day: number;
  dayEnd?: number;
  kind: MarketEventKind;
  label: string;
  hint: string;
  priority?: "boost" | "suppress";
};

export type MarketCalendarPack = {
  region: string;
  label: string;
  events: MarketCalendarEvent[];
};

const PACK_FILES: Record<string, string> = {
  fr: "fr-b2b.json",
  eu: "eu-b2b.json",
};

function dataDir(): string {
  const cwd = process.cwd();
  const webData = path.join(cwd, "web", "data", "market-calendars");
  if (fs.existsSync(webData)) return path.join(cwd, "web", "data");
  return path.join(cwd, "data");
}

export function loadMarketCalendarPack(
  region: string,
): MarketCalendarPack | null {
  const file = PACK_FILES[region] ?? PACK_FILES.fr;
  const full = path.join(dataDir(), "market-calendars", file);
  if (!fs.existsSync(full)) return null;
  const raw = JSON.parse(fs.readFileSync(full, "utf8")) as MarketCalendarPack;
  return raw;
}

function eventCoversDate(ev: MarketCalendarEvent, d: Date): boolean {
  if (d.getMonth() + 1 !== ev.month) return false;
  const day = d.getDate();
  const end = ev.dayEnd ?? ev.day;
  return day >= ev.day && day <= end;
}

/** Events active on `date` or within `horizonDays` ahead. */
export function eventsInHorizon(
  pack: MarketCalendarPack,
  from: Date,
  horizonDays: number,
): MarketCalendarEvent[] {
  const seen = new Set<string>();
  const out: MarketCalendarEvent[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    for (const ev of pack.events) {
      if (!eventCoversDate(ev, d)) continue;
      const key = `${ev.month}-${ev.day}-${ev.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
  }
  return out;
}

export function formatMarketCalendarBlock(
  pack: MarketCalendarPack,
  from: Date,
  horizonDays: number,
): string {
  const events = eventsInHorizon(pack, from, horizonDays);
  if (!events.length) {
    return `Market calendar (${pack.label}): no special dates in the next ${horizonDays} days.`;
  }
  const lines = events.map(
    (e) =>
      `- [${e.kind}] ${e.label} (${e.month}/${e.day}${e.dayEnd ? `–${e.dayEnd}` : ""}): ${e.hint}${e.priority === "suppress" ? " (consider fewer posts)" : ""}`,
  );
  return `Market calendar (${pack.label}, next ${horizonDays} days):\n${lines.join("\n")}`;
}
