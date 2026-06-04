import { desc, eq, inArray, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, extensionSnapshots } from "@/db/schema";
import {
  mergeStructuredTile,
} from "@/lib/messagingInboxTileParse";
import { canonicalizeLinkedInUrl } from "@/lib/url";

export type ParsedInboxListRow = {
  participantName: string | null;
  preview: string | null;
  timeLabel: string | null;
  unread: boolean;
  fromMe: boolean;
  profileUrl: string | null;
  contactId: string | null;
  contactName: string | null;
  rawPreview: string;
};

export type MessagingInboxSnapshotView = {
  id: string;
  capturedAt: Date;
  sourceUrl: string;
  parseMode: "tiles" | "fallback" | "voyager";
  tileCount: number;
  rows: ParsedInboxListRow[];
  note: string | null;
  parseWarning: string | null;
};

const NOISE_LINES = new Set([
  "messaging",
  "search messages",
  "focused",
  "other",
  "unread",
  "starred",
  "archived",
  "linkedin",
  "accueil",
  "home",
  "mon réseau",
  "my network",
  "emplois",
  "jobs",
  "messagerie",
  "notifications",
  "vous",
  "me",
]);

const TIME_LINE =
  /^(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|Yesterday|Today|Hier|Aujourd'hui|\d+\s*[hmdwj](?:\s+ago)?|\d+\s*[hmdwj]\.?)$/i;

const FEED_NOISE_LINE =
  /impressions?\s+(du|de|on|the)\s+post|^\d+\s+réactions?$|^\d+\s+reactions?$|^commenter$|^republier$|^envoyer$|^répondre$|^like$|^celebrate$|^support$|^love$|^insightful$|^funny$|republications?|followers?|abonnés|activité|activity|créer un post|start a post|publications? récentes|recent posts/i;

const INLINE_DEGREE = /[•·]\s*(1er|2e|3e|\d+(?:st|nd|rd|th|er|e|re))\b/i;

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
  if (FEED_NOISE_LINE.test(line)) return true;
  if (/^[\d,.]+\s*(impressions|views|vues)$/i.test(t)) return true;
  return false;
}

function isFeedNoiseLine(line: string): boolean {
  return FEED_NOISE_LINE.test(line);
}

export function looksLikeFeedDump(text: string): boolean {
  const t = text.slice(0, 8000);
  const feedHits =
    (t.match(/impressions?\s+(du|de|on|the)\s+post/gi)?.length ?? 0) +
    (t.match(/\bcommenter\b|\brepublier\b|\breposts?\b/gi)?.length ?? 0);
  const msgHits =
    (t.match(/\bsearch messages\b|\bmsg-conversation\b|You:\s/gi)?.length ?? 0);
  return feedHits >= 2 && feedHits > msgHits;
}

/** Insert breaks before embedded "8 hName" patterns when newlines are missing. */
export function normalizeFallbackInboxText(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n");
  t = t.replace(/(\d+\s*[hmdwj]\.?)(?=\s*[A-ZÀ-ÖØ-Þ])/gi, "$1\n");
  t = t.replace(/(You:\s|Vous\s*:\s)/gi, "\n$1");
  t = t.replace(/([.!?…])\s*(?=[A-ZÀ-ÖØ-Þ][a-zà-ÿ]{2,}\s+[•·])/g, "$1\n");
  return t;
}

/** Split a fallback plain-text dump into per-conversation blocks. */
export function splitFallbackInboxPlainText(fallback: string): string[] {
  const normalized = normalizeFallbackInboxText(fallback.trim());
  if (!normalized) return [];

  if (looksLikeFeedDump(normalized)) return [];

  const paraBlocks = normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 12 && b.length <= 1200);
  if (paraBlocks.length >= 2) return paraBlocks;

  const lines = normalized
    .split(/\n/)
    .map(cleanLine)
    .filter((l) => l.length > 0 && !isNoiseLine(l));

  const blocks: string[] = [];
  let current: string[] = [];

  function flush() {
    if (!current.length) return;
    const text = current.join("\n").trim();
    if (text.length >= 12 && !looksLikeFeedChunk(text)) blocks.push(text);
    current = [];
  }

  for (const line of lines) {
    if (isFeedNoiseLine(line)) {
      flush();
      continue;
    }

    if (
      current.length >= 2 &&
      isTimeLine(line) &&
      current[current.length - 1] !== line
    ) {
      current.push(line);
      flush();
      continue;
    }

    if (
      current.length >= 1 &&
      (INLINE_DEGREE.test(line) || /^[A-ZÀ-ÖØ-Þ]/.test(line)) &&
      current.some((l) => isTimeLine(l))
    ) {
      flush();
    }

    current.push(line);
  }
  flush();

  if (blocks.length >= 2) return blocks.slice(0, 80);

  if (normalized.length > 400) {
    const embedded = normalized
      .split(/(?=\d+\s*[hmdwj]\.?\s+[A-ZÀ-ÖØ-Þ])/i)
      .map((b) => b.trim())
      .filter((b) => b.length >= 20 && b.length <= 1200 && !looksLikeFeedChunk(b));
    if (embedded.length >= 2) return embedded.slice(0, 80);
  }

  return paraBlocks.length === 1 ? paraBlocks : blocks.slice(0, 80);
}

function looksLikeFeedChunk(text: string): boolean {
  const feedMarkers =
    (text.match(/impressions|réactions|reactions|Commenter|Republier|republications?/gi)
      ?.length ?? 0);
  return feedMarkers >= 2 && !INLINE_DEGREE.test(text) && !/^You:\s/mi.test(text);
}

type TileInput = {
  preview?: string;
  previewText?: string;
  profileUrl?: string;
  participantName?: string;
  timeLabel?: string;
  unread?: boolean;
  fromMe?: boolean;
};

function parseTileRecord(tile: TileInput): Omit<
  ParsedInboxListRow,
  "contactId" | "contactName"
> {
  const isLegacyBlob =
    !tile.participantName &&
    !tile.timeLabel &&
    !tile.previewText &&
    typeof tile.preview === "string" &&
    tile.preview.length > 120;

  let structuredPreview =
    isLegacyBlob ? undefined : tile.preview?.trim() || undefined;
  if (
    structuredPreview &&
    tile.participantName &&
    structuredPreview.startsWith(tile.participantName)
  ) {
    structuredPreview =
      structuredPreview.slice(tile.participantName.length).trim() || structuredPreview;
  }

  const rawText =
    (typeof tile.previewText === "string" && tile.previewText.trim()) ||
    (typeof tile.preview === "string" && tile.preview.trim()) ||
    "";

  const merged = mergeStructuredTile(
    {
      participantName: tile.participantName,
      preview: structuredPreview,
      timeLabel: tile.timeLabel,
      unread: tile.unread,
      fromMe: tile.fromMe,
    },
    rawText,
  );

  const profileUrl =
    typeof tile.profileUrl === "string" && tile.profileUrl.trim()
      ? canonicalizeLinkedInUrl(tile.profileUrl.trim())
      : null;

  return {
    participantName: merged.participantName,
    preview: merged.preview,
    timeLabel: merged.timeLabel,
    unread: merged.unread,
    fromMe: merged.fromMe,
    profileUrl,
    rawPreview: rawText.length > 600 ? `${rawText.slice(0, 597)}…` : rawText,
  };
}

export { parseMessagingTileText } from "@/lib/messagingInboxTileParse";

export function parseTilesFromPayload(payload: Record<string, unknown>): {
  rows: Omit<ParsedInboxListRow, "contactId" | "contactName">[];
  parseMode: "tiles" | "fallback" | "voyager";
  note: string | null;
  parseWarning: string | null;
} {
  const note =
    typeof payload.note === "string" && payload.note.trim()
      ? payload.note.trim()
      : null;

  const voyagerTiles = payload.voyagerTiles;
  if (Array.isArray(voyagerTiles) && voyagerTiles.length > 0) {
    const rows = voyagerTiles
      .map((t) => parseTileRecord(t as TileInput))
      .filter((r) => r.participantName || r.preview);
    return { rows, parseMode: "voyager", note, parseWarning: null };
  }

  const tiles = payload.tiles;
  if (Array.isArray(tiles) && tiles.length > 0) {
    const rows = tiles
      .map((t) => parseTileRecord(t as TileInput))
      .filter((r) => r.participantName || r.preview);
    return { rows, parseMode: "tiles", note, parseWarning: null };
  }

  const fallback =
    typeof payload.fallbackPlainText === "string"
      ? payload.fallbackPlainText.trim()
      : "";
  if (!fallback) {
    return {
      rows: [],
      parseMode: "fallback",
      note,
      parseWarning: note ?? "No inbox text in snapshot.",
    };
  }

  if (looksLikeFeedDump(fallback)) {
    return {
      rows: [],
      parseMode: "fallback",
      note,
      parseWarning:
        "Snapshot looks like the LinkedIn feed, not the messaging inbox. Open linkedin.com/messaging and run Snapshot again.",
    };
  }

  const blocks = splitFallbackInboxPlainText(fallback);
  const rows = blocks
    .map((b) => parseTileRecord({ previewText: b }))
    .filter((r) => r.participantName || r.preview);

  let parseWarning: string | null = null;
  if (rows.length <= 1 && fallback.length > 600) {
    parseWarning =
      note ??
      "Could not split inbox into conversations — open linkedin.com/messaging, wait for the list to load, then snapshot again.";
  }

  return { rows, parseMode: "fallback", note, parseWarning };
}

async function enrichRowsWithContacts(
  rows: ParsedInboxListRow[],
): Promise<ParsedInboxListRow[]> {
  const db = getDb();
  const urls = [
    ...new Set(
      rows
        .map((r) => r.profileUrl)
        .filter((u): u is string => Boolean(u)),
    ),
  ];

  const byUrl = new Map<string, { id: string; fullName: string | null }>();
  if (urls.length > 0) {
    const contactRows = await db
      .select({
        id: contacts.id,
        fullName: contacts.fullName,
        linkedinUrlCanonical: contacts.linkedinUrlCanonical,
      })
      .from(contacts)
      .where(inArray(contacts.linkedinUrlCanonical, urls));
    for (const c of contactRows) {
      byUrl.set(c.linkedinUrlCanonical, { id: c.id, fullName: c.fullName });
    }
  }

  const namesNeedingMatch = [
    ...new Set(
      rows
        .filter((r) => !r.profileUrl && r.participantName)
        .map((r) => r.participantName!.trim()),
    ),
  ];
  const byName = new Map<string, { id: string; fullName: string | null }>();
  for (const name of namesNeedingMatch.slice(0, 40)) {
    const matches = await db
      .select({
        id: contacts.id,
        fullName: contacts.fullName,
      })
      .from(contacts)
      .where(
        or(
          like(contacts.fullName, name),
          like(contacts.fullName, `%${name}%`),
        ),
      )
      .limit(2);
    if (matches.length === 1 && matches[0]) {
      byName.set(name.toLowerCase(), {
        id: matches[0].id,
        fullName: matches[0].fullName,
      });
    }
  }

  return rows.map((r) => {
    if (r.profileUrl) {
      const c = byUrl.get(r.profileUrl);
      if (!c) return r;
      return { ...r, contactId: c.id, contactName: c.fullName };
    }
    const nameKey = r.participantName?.trim().toLowerCase();
    if (nameKey) {
      const c = byName.get(nameKey);
      if (c) return { ...r, contactId: c.id, contactName: c.fullName };
    }
    return r;
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
  const { rows, parseMode, note, parseWarning } = parseTilesFromPayload(
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
    parseWarning,
  };
}
