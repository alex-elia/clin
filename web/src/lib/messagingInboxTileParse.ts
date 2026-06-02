/**
 * Client-safe inbox list tile parsing (no server/db imports).
 * Used when re-parsing extension snapshot text on the server.
 */

export type ParsedInboxTileFields = {
  participantName: string | null;
  preview: string | null;
  timeLabel: string | null;
  unread: boolean;
  fromMe: boolean;
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
]);

const TIME_LINE =
  /^(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|Yesterday|Today|Hier|Aujourd'hui|\d+\s*[hmdwj](?:\s+ago)?|\d+\s*[hmdwj]\.?)$/i;

const A11Y_NOISE =
  /^(Appuyez sur la touche retour|Press (the )?return|Le statut est\s*:|Status is\s*:|Statut\s*:|Tap to open|Ouvrir la conversation)/i;

const CONVERSATION_WITH =
  /(?:votre\s+)?conversation(?:\s+de\s+groupe)?\s+(?:avec|with)\s+(.+?)(?:\s+(?:et|and)\s+(.+?))?(?:[.!]|$)/i;

const YOU_PREFIX = /^(You|Vous)\s*:\s*/i;

/** LinkedIn FR inbox: "Pierre : merci…" or "Vous : Bonjour…" */
const NAME_COLON_PREFIX = /^([A-ZÀ-ÖØ-Þ][\wÀ-ÿ'.-]+)\s*:\s*(.+)$/;

export function normalizeLinkedInMessageSnippet(
  raw: string | null | undefined,
  participantName?: string | null,
): { preview: string | null; fromMe: boolean } {
  const t = cleanLine(raw ?? "");
  if (!t) return { preview: null, fromMe: false };

  const firstLine = t.split(/\n/).map(cleanLine).find((l) => l.length > 0) || t;

  const vous = firstLine.match(/^(Vous|You)\s*:\s*(.+)$/i);
  if (vous?.[2]) {
    return { preview: vous[2].trim(), fromMe: true };
  }

  const named = firstLine.match(NAME_COLON_PREFIX);
  if (named?.[1] && named[2]) {
    const tag = named[1].trim();
    const body = named[2].trim();
    const full = participantName?.trim() || "";
    const fromThem =
      full &&
      (full.toLowerCase().startsWith(tag.toLowerCase()) ||
        tag.toLowerCase() === full.split(/\s+/)[0]?.toLowerCase());
    if (fromThem || !/^(vous|you)$/i.test(tag)) {
      return { preview: body, fromMe: false };
    }
    return { preview: body, fromMe: true };
  }

  if (YOU_PREFIX.test(firstLine)) {
    return {
      preview: firstLine.replace(YOU_PREFIX, "").trim(),
      fromMe: true,
    };
  }

  return { preview: t.length > 320 ? `${t.slice(0, 317)}…` : t, fromMe: false };
}

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
  if (A11Y_NOISE.test(line)) return true;
  return false;
}

function looksLikePersonName(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 64 || t.length < 3) return false;
  if (/^(You|Vous|Unknown|LinkedIn|Messagerie|Messaging)$/i.test(t)) return false;
  if (YOU_PREFIX.test(t)) return false;
  if (isTimeLine(t)) return false;
  if (A11Y_NOISE.test(t)) return false;
  if (/^\d/.test(t)) return false;
  return /^[A-ZÀ-ÖØ-Þ]/.test(t);
}

/** Extract participant from LinkedIn a11y strings (FR/EN). */
export function extractNameFromAccessibilityText(text: string): string | null {
  const t = cleanLine(text);
  const selectFr = t.match(
    /S[ée]lectionner la conversation avec\s+([A-ZÀ-ÖØ-Þ][^.!?]+?)(?:\s*$|[.!?,])/i,
  );
  if (selectFr?.[1] && looksLikePersonName(selectFr[1])) {
    return cleanLine(selectFr[1]);
  }
  const selectEn = t.match(
    /Select conversation with\s+([A-ZÀ-ÖØ-Þ][^.!?]+?)(?:\s*$|[.!?,])/i,
  );
  if (selectEn?.[1] && looksLikePersonName(selectEn[1])) {
    return cleanLine(selectEn[1]);
  }
  const conv = t.match(CONVERSATION_WITH);
  if (conv?.[1]) {
    const first = cleanLine(conv[1]);
    if (looksLikePersonName(first)) return first;
  }
  const frDetail = t.match(
    /d[ée]tail de la conversation(?:\s+de\s+groupe)?\s+avec\s+(.+?)(?:\s+et\s+(.+?))?(?:[.!]|$)/i,
  );
  if (frDetail?.[1]) {
    const first = cleanLine(frDetail[1]);
    if (looksLikePersonName(first)) return first;
  }
  const enDetail = t.match(
    /details of (?:your )?conversation with\s+(.+?)(?:\s+and\s+(.+?))?(?:[.!]|$)/i,
  );
  if (enDetail?.[1]) {
    const first = cleanLine(enDetail[1]);
    if (looksLikePersonName(first)) return first;
  }
  return null;
}

function extractNameFromBody(text: string): string | null {
  const fromA11y = extractNameFromAccessibilityText(text);
  if (fromA11y) return fromA11y;

  const afterTime = text.match(
    /\d{1,2}:\d{2}\s+([A-ZÀ-ÖØ-Þ][\wÀ-ÿ'.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'.-]+){0,3})/,
  );
  if (afterTime?.[1] && looksLikePersonName(afterTime[1])) return afterTime[1].trim();

  const beforeMsg = text.match(
    /^([A-ZÀ-ÖØ-Þ][\wÀ-ÿ'.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'.-]+){0,3})\s+(?:merci|bonjour|hello|hi|salut|thanks|ok|yes|no|oui|dear|cher)/i,
  );
  if (beforeMsg?.[1] && looksLikePersonName(beforeMsg[1])) return beforeMsg[1].trim();

  return null;
}

function extractPreviewLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (isNoiseLine(line)) continue;
    if (CONVERSATION_WITH.test(line)) continue;
    if (/d[ée]tail de la conversation/i.test(line)) continue;
    if (/details of (?:your )?conversation/i.test(line)) continue;
    if (isTimeLine(line) && line.length < 8) continue;

    const youMatch = line.match(YOU_PREFIX);
    if (youMatch) {
      const rest = line.replace(YOU_PREFIX, "").trim();
      if (rest) out.push(rest);
      continue;
    }

    const nameColon = line.match(NAME_COLON_PREFIX);
    if (nameColon?.[2]) {
      out.push(nameColon[2].trim());
      continue;
    }

    const stripped = line.replace(/^\d{1,2}:\d{2}\s+/, "");
    if (stripped !== line) {
      const embeddedColon = stripped.match(NAME_COLON_PREFIX);
      if (embeddedColon?.[2]) {
        out.push(embeddedColon[2].trim());
        continue;
      }
    }
    const nameThenMsg = stripped.match(
      /^([A-ZÀ-ÖØ-Þ][\wÀ-ÿ'.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'.-]+){0,3})\s+(.{4,})$/,
    );
    if (nameThenMsg?.[2]) {
      out.push(nameThenMsg[2].trim());
      continue;
    }

    if (stripped.length >= 4) out.push(stripped);
  }
  return out;
}

export function parseMessagingTileText(raw: string): ParsedInboxTileFields {
  const rawTrim = raw.trim();
  const unread = /\bunread\b/i.test(rawTrim);
  const fromMe = /^(You|Vous)\s*:/im.test(rawTrim);

  const lines = rawTrim
    .split(/\n/)
    .map(cleanLine)
    .filter((l) => l.length > 0);

  let timeLabel: string | null = null;
  for (const line of [...lines].reverse()) {
    if (isTimeLine(line)) {
      timeLabel = line;
      break;
    }
    const embedded = line.match(/(\d{1,2}:\d{2})\s/);
    if (embedded?.[1]) {
      timeLabel = embedded[1];
      break;
    }
  }

  let participantName: string | null = extractNameFromBody(rawTrim);

  for (const line of lines) {
    if (participantName) break;
    if (isNoiseLine(line)) {
      const fromLine = extractNameFromAccessibilityText(line);
      if (fromLine) participantName = fromLine;
      continue;
    }
    if (looksLikePersonName(line) && line.length <= 64 && !YOU_PREFIX.test(line)) {
      participantName = line.replace(/\s*[•·]\s*(1er|2e|3e|\d+(?:st|nd|rd|th)).*$/i, "").trim();
      break;
    }
    const degreeSplit = line.match(
      /^(.+?)\s*[•·]\s*(1er|2e|3e|\d+(?:st|nd|rd|th|er|e|re))\b/i,
    );
    if (degreeSplit?.[1] && looksLikePersonName(degreeSplit[1])) {
      participantName = degreeSplit[1].trim();
      break;
    }
  }

  const previewLines = extractPreviewLines(
    lines.filter((l) => !isNoiseLine(l) && l !== participantName),
  );
  let preview = previewLines.join(" · ").trim() || null;

  if (!preview) {
    for (const line of lines) {
      const norm = normalizeLinkedInMessageSnippet(line, participantName);
      if (norm.preview && line !== participantName) {
        preview = norm.preview;
        break;
      }
    }
  }

  if (preview) {
    const norm = normalizeLinkedInMessageSnippet(preview, participantName);
    preview = norm.preview;
  }
  if (preview && preview.length > 320) preview = `${preview.slice(0, 317)}…`;

  if (!participantName && preview) {
    participantName = extractNameFromBody(preview);
  }

  return {
    participantName,
    preview,
    timeLabel,
    unread,
    fromMe:
      fromMe ||
      (preview ? normalizeLinkedInMessageSnippet(rawTrim, participantName).fromMe : false),
  };
}

export function mergeStructuredTile(
  structured: {
    participantName?: string | null;
    preview?: string | null;
    timeLabel?: string | null;
    unread?: boolean;
    fromMe?: boolean;
  },
  rawText?: string | null,
): ParsedInboxTileFields {
  const parsed = rawText ? parseMessagingTileText(rawText) : {
    participantName: null,
    preview: null,
    timeLabel: null,
    unread: false,
    fromMe: false,
  };

  return {
    participantName:
      structured.participantName?.trim() ||
      parsed.participantName ||
      null,
    preview: (() => {
      const structuredPreview = structured.preview?.trim();
      if (structuredPreview) {
        return (
          normalizeLinkedInMessageSnippet(
            structuredPreview,
            structured.participantName || parsed.participantName,
          ).preview || structuredPreview
        );
      }
      return parsed.preview;
    })(),
    timeLabel:
      structured.timeLabel?.trim() ||
      parsed.timeLabel ||
      null,
    unread: structured.unread ?? parsed.unread,
    fromMe:
      structured.fromMe ??
      (structured.preview
        ? normalizeLinkedInMessageSnippet(
            structured.preview,
            structured.participantName,
          ).fromMe
        : parsed.fromMe),
  };
}
