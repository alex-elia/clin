import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, extensionSnapshots } from "@/db/schema";
import { canonicalizeLinkedInUrl } from "@/lib/url";

export type ParsedInboxListRow = {
  participantName: string | null;
  preview: string | null;
  timeLabel: string | null;
  unread: boolean;
  profileUrl: string | null;
  contactId: string | null;
  contactName: string | null;
  rawPreview: string;
};

export type MessagingInboxSnapshotView = {
  id: string;
  capturedAt: Date;
  sourceUrl: string;
  parseMode: "tiles" | "fallback";
  tileCount: number;
  rows: ParsedInboxListRow[];
  note: string | null;
};

const NOISE_LINES = new Set([
  "messaging",
  "search messages",
  "focused",
  "other",
  "unread",
  "starred",
  "archived",
]);

const TIME_LINE =
  /^(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|Yesterday|Today|Hier|Aujourd'hui|\d+[mhdw]\s+ago)$/i;

function cleanLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function isTimeLine(line: string): boolean {
  return TIME_LINE.test(line.trim());
}

function isNoiseLine(line: string): boolean {
  const t = line.trim().toLowerCase();
  if (!t || NOISE_LINES.has(t)) return true;
  if (/^search\b/i.test(t)) return true;
  return false;
}

export function parseMessagingTileText(raw: string): Omit<
  ParsedInboxListRow,
  "contactId" | "contactName"
> & { profileUrl: string | null } {
  const rawPreview = raw.trim();
  const unread = /\bunread\b/i.test(rawPreview);
  const lines = rawPreview
    .split(/\n/)
    .map(cleanLine)
    .filter((l) => l.length > 0 && !isNoiseLine(l));
  let timeLabel: string | null = null;
  if (lines.length > 0 && isTimeLine(lines[lines.length - 1]!)) {
    timeLabel = lines.pop()!;
  }
  let participantName: string | null = null;
  let preview: string | null = null;
  if (lines.length > 0) {
    participantName = lines[0]!;
    const bodyLines = lines.slice(1).filter((l) => !isTimeLine(l));
    if (bodyLines.length > 0) {
      preview = bodyLines.join(" · ").replace(/^You:\s*/i, "").trim() || null;
    }
  }
  return {
    participantName,
    preview,
    timeLabel,
    unread,
    profileUrl: null,
    rawPreview: rawPreview.length > 600 ? `${rawPreview.slice(0, 597)}…` : rawPreview,
  };
}

type TileInput = { preview?: string; profileUrl?: string };

function parseTilesFromPayload(payload: Record<string, unknown>): {
  rows: Omit<ParsedInboxListRow, "contactId" | "contactName">[];
  parseMode: "tiles" | "fallback";
  note: string | null;
} {
  const note =
    typeof payload.note === "string" && payload.note.trim()
      ? payload.note.trim()
      : null;
  const tiles = payload.tiles;
  if (Array.isArray(tiles) && tiles.length > 0) {
    const rows = tiles
      .map((t) => {
        const tile = t as TileInput;
        const text =
          typeof tile.preview === "string" ? tile.preview : String(t ?? "");
        const parsed = parseMessagingTileText(text);
        const profileUrl =
          typeof tile.profileUrl === "string" && tile.profileUrl.trim()
            ? canonicalizeLinkedInUrl(tile.profileUrl.trim())
            : null;
        return { ...parsed, profileUrl };
      })
      .filter((r) => r.participantName || r.preview);
    return { rows, parseMode: "tiles", note };
  }
  const fallback =
    typeof payload.fallbackPlainText === "string"
      ? payload.fallbackPlainText.trim()
      : "";
  if (!fallback) return { rows: [], parseMode: "fallback", note };
  const blocks = fallback
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 20);
  const rows = blocks
    .map((b) => parseMessagingTileText(b))
    .filter((r) => r.participantName || r.preview);
  return { rows, parseMode: "fallback", note };
}

async function enrichRowsWithContacts(
  rows: ParsedInboxListRow[],
): Promise<ParsedInboxListRow[]> {
  const urls = [
    ...new Set(
      rows
        .map((r) => r.profileUrl)
        .filter((u): u is string => Boolean(u)),
    ),
  ];
  if (urls.length === 0) return rows;
  const db = getDb();
  const contactRows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      linkedinUrlCanonical: contacts.linkedinUrlCanonical,
    })
    .from(contacts)
    .where(inArray(contacts.linkedinUrlCanonical, urls));
  const byUrl = new Map(
    contactRows.map((c) => [c.linkedinUrlCanonical, c]),
  );
  return rows.map((r) => {
    if (!r.profileUrl) return r;
    const c = byUrl.get(r.profileUrl);
    if (!c) return r;
    return {
      ...r,
      contactId: c.id,
      contactName: c.fullName,
    };
  });
}

export async function getLatestMessagingInboxSnapshot(): Promise<MessagingInboxSnapshotView | null> {
  const db = getDb();
  const row = await db
    .select()
    .from(extensionSnapshots)
    .where(eq(extensionSnapshots.kind, "linkedin_messages_inbox_visible"))
    .orderBy(desc(extensionSnapshots.capturedAt))
    .limit(1);
  const snap = row[0];
  if (!snap) return null;
  const { rows, parseMode, note } = parseTilesFromPayload(
    (snap.payloadJson ?? {}) as Record<string, unknown>,
  );
  const enriched = await enrichRowsWithContacts(
    rows.map((r) => ({
      ...r,
      contactId: null,
      contactName: null,
    })),
  );
  return {
    id: snap.id,
    capturedAt: snap.capturedAt,
    sourceUrl: snap.sourceUrl,
    parseMode,
    tileCount: enriched.length,
    rows: enriched,
    note,
  };
}
