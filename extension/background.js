/**
 * Clin extension — manual capture. Posts JSON to your local Clin API.
 * Profile: one contact. Connections / people search: visible list rows (scroll/load more, then capture again).
 */

const DEFAULT_BASE = "http://127.0.0.1:3000";
const CAPTURE_TIMES_KEY = "clin_capture_timestamps_ms";
const LAST_ERROR_KEY = "clin_last_pace_message";

async function getApiBase() {
  const { clinApiBase } = await chrome.storage.sync.get(["clinApiBase"]);
  return (typeof clinApiBase === "string" && clinApiBase.trim()) || DEFAULT_BASE;
}

/**
 * Verify the API base is the live Clin instance (correct port, DB, revision).
 */
async function fetchClinHealth(base) {
  const root = base.replace(/\/$/, "");
  try {
    const res = await fetch(`${root}/api/health`, { cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        error: `Health check failed: HTTP ${res.status} at ${root}`,
      };
    }
    const health = await res.json();
    if (health?.service !== "clin") {
      return {
        ok: false,
        error: `Not Clin at ${root} (got service=${health?.service ?? "?"})`,
      };
    }
    if (!health.db) {
      return {
        ok: false,
        error:
          `Clin DB unavailable at ${root}. In clin/web run: npm rebuild better-sqlite3 then npm run dev`,
        health,
      };
    }
    return { ok: true, health };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Cannot reach Clin at ${root}: ${msg}. Is npm run dev running on that port?`,
    };
  }
}

async function fetchPace(base) {
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/settings`);
    if (!res.ok) return null;
    const j = await res.json();
    return j?.pace ?? null;
  } catch {
    return null;
  }
}

/** Fail open if API is down; respect Clin → Settings automation toggle. */
async function fetchConnectionsSprintAllowed(base) {
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/automation/settings`);
    if (!res.ok) return true;
    const j = await res.json();
    if (j?.automation?.connectionsSprintEnabled === false) return false;
    return true;
  } catch {
    return true;
  }
}

function pruneHour(timestamps, now) {
  const cutoff = now - 60 * 60 * 1000;
  return timestamps.filter((t) => t > cutoff);
}

/**
 * @returns {{ ok: true, pruned: number[] } | { ok: false, kind: 'hourly', message: string } | { ok: false, kind: 'gap', message: string, waitSeconds: number, waitMs: number }}
 */
async function checkPaceForCapture(base) {
  const pace = await fetchPace(base);
  const maxPerHour = pace?.captureMaxPerHour ?? 40;
  const minGapSec = pace?.minSecondsBetweenCaptures ?? 45;
  const minGapMsFallback = minGapSec * 1000;
  const minGapMs =
    typeof pace?.captureGapMsRequired === "number" &&
    Number.isFinite(pace.captureGapMsRequired) &&
    pace.captureGapMsRequired > 0
      ? pace.captureGapMsRequired
      : minGapMsFallback;

  const { [CAPTURE_TIMES_KEY]: raw } = await chrome.storage.local.get(
    CAPTURE_TIMES_KEY,
  );
  const now = Date.now();
  const list = Array.isArray(raw)
    ? raw.map(Number).filter((n) => Number.isFinite(n))
    : [];
  const pruned = pruneHour(list, now);

  if (pruned.length >= maxPerHour) {
    return {
      ok: false,
      kind: "hourly",
      message: `Client pace: ${maxPerHour} capture rows max per rolling hour (matches server). Take a break or raise the limit in Clin /settings.`,
    };
  }

  const last = pruned.length ? Math.max(...pruned) : 0;
  if (last && now - last < minGapMs) {
    const waitMs = Math.max(0, Math.ceil(minGapMs - (now - last)));
    const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000));
    return {
      ok: false,
      kind: "gap",
      waitMs,
      waitSeconds,
      message: `Client pace: wait ${waitSeconds}s before the next import (humanized interval, matches server).`,
    };
  }

  return { ok: true, pruned };
}

/** Background-only: sleep until min gap passes (hygiene, pending-self). Hourly cap still throws. */
async function waitForPaceGapAllowCapture(base) {
  for (;;) {
    const r = await checkPaceForCapture(base);
    if (r.ok) return r.pruned;
    if (r.kind === "hourly") throw new Error(r.message);
    await sleep(r.waitMs + 80);
  }
}

async function recordBatchCaptureSuccess(pruned, importedCount) {
  const n = Math.max(0, Math.min(Number(importedCount) || 0, 500));
  const now = Date.now();
  const stamps = Array.from({ length: n }, () => now);
  await chrome.storage.local.set({
    [CAPTURE_TIMES_KEY]: pruneHour([...pruned, ...stamps], now),
  });
}

const CAMPAIGN_CTX_TTL_MS = 30_000;
let campaignContextFetchedAt = 0;
/** @type {Record<string, unknown> | null} */
let campaignContextPayload = null;

async function getExtensionCampaignContext(root) {
  const now = Date.now();
  if (
    campaignContextFetchedAt > 0 &&
    now - campaignContextFetchedAt < CAMPAIGN_CTX_TTL_MS
  ) {
    return campaignContextPayload;
  }
  try {
    const r = await fetch(`${root}/api/extension/campaign-context`);
    campaignContextFetchedAt = now;
    if (!r.ok) {
      campaignContextPayload = null;
      return null;
    }
    campaignContextPayload = await r.json();
    return campaignContextPayload;
  } catch {
    campaignContextFetchedAt = now;
    campaignContextPayload = null;
    return null;
  }
}

function attachCampaignIdToPayload(payload, ctx) {
  const id = ctx && ctx.captureTargetCampaignId;
  if (typeof id !== "string" || !id.trim()) return payload;
  return { ...payload, outreachCampaignId: id.trim() };
}

const IMPORT_CAMPAIGN_KEY = "clinImportCampaignChoice";

async function applyOutreachCampaignId(payload) {
  const { [IMPORT_CAMPAIGN_KEY]: choice } = await chrome.storage.sync.get([
    IMPORT_CAMPAIGN_KEY,
  ]);
  const pick = typeof choice === "string" ? choice.trim() : "";
  if (pick && pick !== "__none__") {
    if (pick === "__clin_default__") {
      const base = (await getApiBase()).replace(/\/$/, "");
      const ctx = await getExtensionCampaignContext(base);
      const id = ctx?.captureTargetCampaignId;
      if (typeof id === "string" && id.trim()) {
        return { ...payload, outreachCampaignId: id.trim() };
      }
    } else {
      return { ...payload, outreachCampaignId: pick };
    }
  }
  const base = (await getApiBase()).replace(/\/$/, "");
  const ctx = await getExtensionCampaignContext(base);
  return attachCampaignIdToPayload(payload, ctx);
}

function isMessagingThreadUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith("linkedin.com") &&
      /\/messaging\/thread\//i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

function isLinkedInProfilePageUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("linkedin.com")) return false;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) return true;
    if (parts[0] === "sales" && parts[1] === "lead" && parts[2]) return true;
    return false;
  } catch {
    return false;
  }
}

function isConnectionsListPageUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("linkedin.com")) return false;
    const p = u.pathname.toLowerCase();
    if (p.includes("/mynetwork/invite-connect/connections")) return true;
    if (p.includes("/mynetwork/connection-manager")) return true;
    if (p.includes("/search/results/people")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Page world — 1:1 messaging thread visible bubbles.
 */
function scrapeMessagingThread() {
  function clean(s) {
    if (!s) return undefined;
    const t = String(s).replace(/\s+/g, " ").trim();
    return t.length ? t : undefined;
  }

  function firstParticipantProfileFrom(root) {
    if (!root) return { url: undefined, name: undefined };
    const links = root.querySelectorAll('a[href*="/in/"]');
    for (const a of links) {
      const raw = a.getAttribute("href");
      if (!raw || raw.includes("/edit/")) continue;
      try {
        const abs = new URL(raw, "https://www.linkedin.com");
        if (!abs.hostname.endsWith("linkedin.com")) continue;
        const m = abs.pathname.match(/^\/in\/([^/?#]+)\/?/i);
        if (!m?.[1]) continue;
        return {
          url: `https://www.linkedin.com/in/${m[1]}/`,
          name: clean(a.getAttribute("aria-label")) || clean(a.textContent),
        };
      } catch {
        continue;
      }
    }
    return { url: undefined, name: undefined };
  }

  const sourceUrl = window.location.href;
  let messagingThreadId;
  try {
    const u = new URL(sourceUrl);
    const m = u.pathname.match(/\/messaging\/thread\/([^/?#]+)/i);
    if (m?.[1]) messagingThreadId = decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }

  const main =
    document.querySelector(".msg-overlay-conversation-bubble") ||
    document.querySelector("[class*='msg-overlay-conversation']") ||
    document.querySelector('main[role="main"]') ||
    document.querySelector("main") ||
    document.body;

  const header =
    main.querySelector(".msg-overlay-conversation-bubble-header") ||
    main.querySelector(".msg-overlay-bubble-header") ||
    main.querySelector("[data-test-conversation-header]") ||
    main.querySelector(".msg-thread-modern-header") ||
    main.querySelector("header");

  let messagingParticipantProfileUrl;
  let messagingParticipantName;
  const headerPick = firstParticipantProfileFrom(header);
  if (headerPick.url) {
    messagingParticipantProfileUrl = headerPick.url;
    messagingParticipantName = headerPick.name;
  }
  if (!messagingParticipantProfileUrl) {
    const listRoot =
      document.querySelector("ul.msg-s-message-list") ||
      document.querySelector(".msg-s-message-list");
    const bubble =
      listRoot?.closest(".msg-overlay-conversation-bubble") ||
      listRoot?.closest("section") ||
      main;
    const bubblePick = firstParticipantProfileFrom(bubble);
    messagingParticipantProfileUrl = bubblePick.url;
    messagingParticipantName = bubblePick.name ?? messagingParticipantName;
  }

  const messagingMessages = [];
  function pushMsg(from, body) {
    const b = clean(body);
    if (!b || b.length < 2) return;
    messagingMessages.push({ from, body: b });
  }

  const list =
    document.querySelector("ul.msg-s-message-list") ||
    document.querySelector(".msg-s-message-list");
  if (list) {
    const events = list.querySelectorAll(
      "li.msg-s-message-list__event, li[class*='msg-s-message-list__event']",
    );
    events.forEach((li) => {
      const group =
        li.querySelector(".msg-s-message-group") ||
        li.querySelector("[class*='msg-s-message-group']");
      if (!group) return;
      const isSent =
        group.classList.contains("msg-s-message-group--sent") ||
        /\bmsg-s-message-group--sent\b/.test(group.className);
      const bodyEl =
        group.querySelector(".msg-s-event-listitem__body") ||
        group.querySelector(".msg-s-message-group__content") ||
        group.querySelector("[class*='message-bubble']") ||
        group;
      pushMsg(isSent ? "me" : "them", bodyEl.innerText || "");
    });
  }

  const ef = {
    messagingParticipantProfileUrl,
    messagingThreadId,
    messagingParticipantName,
    messagingMessages,
  };
  const fieldPresence = {
    messagingParticipantProfileUrl: Boolean(messagingParticipantProfileUrl),
    messagingMessages: messagingMessages.length > 0,
  };
  const filled = Object.values(fieldPresence).filter(Boolean).length;
  const confidence = filled >= 2 ? 0.85 : filled * 0.4;

  return {
    schemaVersion: "1",
    pageType: "messaging",
    sourceUrl,
    capturedAt: new Date().toISOString(),
    confidence,
    extractedFields: ef,
    fieldPresence,
  };
}

/**
 * Page world — structured scrape for LinkedIn creator analytics (FR/EN).
 */
function scrapeLinkedInAnalyticsStructured() {
  function clean(s) {
    if (!s) return "";
    return String(s).replace(/\s+/g, " ").trim();
  }
  function parseNum(raw) {
    if (!raw) return null;
    let t = String(raw).replace(/[\u00A0\u202F\s]/g, "");
    if (/^\d+,\d+$/.test(t)) t = t.replace(",", ".");
    else t = t.replace(/,/g, "");
    const n = Number(t);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  function metricAfterLabel(block, labelRe) {
    const m = block.match(
      new RegExp(`${labelRe.source}\\s*\\n\\s*([\\d][\\d\\s\\u202F,.]*)`, "i"),
    );
    if (!m?.[1]) return null;
    return parseNum(m[1].split("\n")[0].trim());
  }
  function metricBeforeLabel(block, labelRe) {
    const m = block.match(
      new RegExp(`([\\d][\\d\\s\\u202F,.]*)\\s*\\n\\s*${labelRe.source}`, "i"),
    );
    if (!m?.[1]) return null;
    return parseNum(m[1].split("\n")[0].trim());
  }
  function pickMetric(block, labelRe) {
    return metricAfterLabel(block, labelRe) ?? metricBeforeLabel(block, labelRe);
  }
  function extractPostMetrics(text) {
    const impressions =
      (text.match(/(?:▲|▼)?\s*([\d\s\u202F,.]+)\s+Impressions\b/i) ||
        text.match(/(?:▲|▼)?\s*([\d\s\u202F,.]+)\s*\n\s*Impressions\b/i) ||
        text.match(/\n\s*([\d\s\u202F,.]+)\s*\n\s*Impressions\b/i))?.[1];
    const comM = text.match(/(\d+)\s*commentaires?\b/i);
    const comments = comM ? parseNum(comM[1]) : null;
    let reactions = null;
    const rbc = text.match(/\n(\d+)\s*\n\s*\d+\s*commentaires?\b/i);
    if (rbc) reactions = parseNum(rbc[1]);
    return {
      impressions: impressions ? parseNum(impressions) : null,
      reactions,
      comments,
    };
  }

  const main =
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.body;
  const full = main?.innerText || "";
  const rankPeriodM = full.match(
    /(?:p[eé]riode allant du|period from|from)\s+(.+?)\s+(?:au|to)\s+(.+?)(?:\n|$)/i,
  );
  const rankPeriod = rankPeriodM
    ? `${clean(rankPeriodM[1])} – ${clean(rankPeriodM[2])}`
    : null;

  let discoveryText = "";
  for (const el of main.querySelectorAll("section, div, article")) {
    const t = el.innerText || "";
    if (
      /D[eé]couverte|Discovery/i.test(t) &&
      /Membres touch|Members reached/i.test(t) &&
      t.length > 20 &&
      t.length < 4000
    ) {
      if (!discoveryText || t.length < discoveryText.length) discoveryText = t;
    }
  }
  const overviewBlock = discoveryText || full;
  const trends = [...overviewBlock.matchAll(/(?:▼|▲)?\s*([\d,.]+)\s*%[^\n]*/gi)].map(
    (m) => m[1],
  );
  const domOverview = {
    rankPeriod,
    impressions: pickMetric(overviewBlock, /Impressions/),
    membersReached: pickMetric(
      overviewBlock,
      /(?:Membres touch[eé]s|Members reached)/,
    ),
    impressionsTrend: trends[0] ? `${trends[0]}%` : null,
    membersTrend: trends[1] ? `${trends[1]}%` : null,
  };

  const rawCards = [...main.querySelectorAll("div, li, article")].filter((el) => {
    const t = el.innerText || "";
    return (
      /a publi[eé] ceci •|posted this •/i.test(t) &&
      /\d+\s*commentaires?|\d+\s*comments?/i.test(t) &&
      /Impressions/i.test(t) &&
      t.length > 60 &&
      t.length < 8000
    );
  });
  const innermost = rawCards.filter(
    (el) => !rawCards.some((other) => other !== el && el.contains(other)),
  );
  const domTopPosts = [];
  const seenKeys = new Set();
  for (const card of innermost.slice(0, 40)) {
    const t = card.innerText || "";
    const header = t.match(/a publi[eé] ceci •\s*([^\n]+)|posted this •\s*([^\n]+)/i);
    const ageLabel = clean(header?.[1] || header?.[2] || "") || null;
    const metrics = extractPostMetrics(t);
    if (metrics.impressions == null && metrics.comments == null) continue;
    const key = `${ageLabel}:${metrics.impressions}:${metrics.comments}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    domTopPosts.push({
      ageLabel,
      impressions: metrics.impressions,
      reactions: metrics.reactions,
      comments: metrics.comments,
      preview: clean(t.slice(0, 220)),
    });
  }
  return { domOverview, domTopPosts };
}

function scrapeExtensionSnapshot(kindRaw) {
  const kind =
    typeof kindRaw === "string" ? kindRaw : "linkedin_messages_inbox_visible";

  function clean(s) {
    if (!s) return "";
    return String(s).replace(/\s+/g, " ").trim();
  }

  const sourceUrl = window.location.href;

  function mainDump(maxChars) {
    const main =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.body;
    let t = clean(main?.innerText || "");
    if (t.length > maxChars) t = `${t.slice(0, maxChars)}…`;
    return t;
  }

  const capturedAt = new Date().toISOString();

  if (kind === "linkedin_messages_inbox_visible") {
    function profileUrlFromTile(el) {
      const links = el.querySelectorAll('a[href*="/in/"]');
      for (const a of links) {
        const raw = a.getAttribute("href");
        if (!raw || raw.includes("/edit/")) continue;
        try {
          const abs = new URL(raw, "https://www.linkedin.com");
          const m = abs.pathname.match(/^\/in\/([^/?#]+)\/?/i);
          if (m?.[1]) return `https://www.linkedin.com/in/${m[1]}/`;
        } catch {
          continue;
        }
      }
      return undefined;
    }
    const selectors = [
      ".msg-conversation-card",
      "li.msg-conversation-listitem",
      "[class*='conversation-list-item']",
    ];
    const tiles = [];
    const seen = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (tiles.length >= 160) return;
        const t = clean(el.innerText);
        if (!t || t.length < 20) return;
        const key = t.slice(0, 120);
        if (seen.has(key)) return;
        seen.add(key);
        const tile = { preview: t.slice(0, 1200), len: t.length };
        const profileUrl = profileUrlFromTile(el);
        if (profileUrl) tile.profileUrl = profileUrl;
        tiles.push(tile);
      });
    }
    const payload =
      tiles.length === 0
        ? {
            fallbackPlainText: mainDump(48000),
            note: "No conversation rows matched — dumped main text.",
          }
        : { tiles, tileCount: tiles.length };
    return { kind, sourceUrl, capturedAt, payload };
  }

  if (kind === "linkedin_post_analytics_visible") {
    const structured = scrapeLinkedInAnalyticsStructured();
    return {
      kind,
      sourceUrl,
      capturedAt,
      payload: {
        title: clean(document.title),
        plainText: mainDump(80000),
        domOverview: structured.domOverview,
        domTopPosts: structured.domTopPosts,
      },
    };
  }

  return {
    kind,
    sourceUrl,
    capturedAt,
    payload: { error: `Unknown kind "${kind}".` },
  };
}

/**
 * Page world — wait for profile top card before scrape (LinkedIn hydrates after "complete").
 */
async function waitForProfileDomReady(maxMs) {
  const deadline = Date.now() + (maxMs || 5000);
  function hasNameSignal() {
    if (document.querySelector('[data-anonymize="person-name"]')) return true;
    if (document.querySelector('a[href*="/in/"] h1')) return true;
    if (document.querySelector("main h1")) return true;
    const t = document.title || "";
    if (/^[^|]+\|\s*LinkedIn/i.test(t)) return true;
    return false;
  }
  while (Date.now() < deadline) {
    if (hasNameSignal()) return { ready: true, waitedMs: maxMs - (deadline - Date.now()) };
    await new Promise((r) => setTimeout(r, 180));
  }
  return { ready: false, waitedMs: maxMs };
}

/**
 * Runs in the page world via scripting API — must not close over extension scope.
 */
function scrapeVisibleProfile() {
  function clean(s) {
    if (!s) return undefined;
    const t = String(s).replace(/\s+/g, " ").trim();
    return t.length ? t : undefined;
  }

  function firstText(...selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const t = clean(el?.innerText || el?.textContent);
      if (t) return t;
    }
    return undefined;
  }

  const sourceUrl = window.location.href;

  function vanitySlugFromUrl() {
    try {
      const parts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
      if (parts[0] === "in" && parts[1]) {
        return decodeURIComponent(parts[1]).toLowerCase();
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }

  function isNotificationUiChrome(text) {
    return /gérer les notifications|manage notifications|turn on notifications|notification preferences|paramètres de notification/i.test(
      text,
    );
  }

  function acceptNameCandidate(raw) {
    const t = clean(raw);
    if (!t) return undefined;
    if (isNotificationUiChrome(t)) {
      const fr = t.match(/au sujet de (.+)$/i);
      if (fr?.[1]) return clean(fr[1]);
      const en = t.match(/about (.+)$/i);
      if (en?.[1]) return clean(en[1]);
      return undefined;
    }
    if (/^(gérer|manage|voir le profil|view profile|open profile)\b/i.test(t)) {
      return undefined;
    }
    if (t.length > 90 && /\bnotifications?\b/i.test(t)) return undefined;
    return t;
  }

  function nameFromDocumentTitle() {
    const t = document.title || "";
    const m = t.match(/^(.+?)\s*(?:\||[-–—])\s*LinkedIn/i);
    if (!m) return undefined;
    return acceptNameCandidate(m[1]);
  }

  function nameFromOpenGraph() {
    const og =
      document.querySelector('meta[property="og:title"]') ||
      document.querySelector('meta[name="og:title"]');
    let c = clean(og?.getAttribute("content"));
    if (!c) return undefined;
    c = c.replace(/\s*[-|–—]\s*LinkedIn.*$/i, "").trim();
    return acceptNameCandidate(c);
  }

  function nameFromProfileAnchors() {
    const slug = vanitySlugFromUrl();
    const links = slug
      ? document.querySelectorAll(
          `a[href*="/in/${slug}"], a[href*="/in/${encodeURIComponent(slug)}"]`,
        )
      : document.querySelectorAll('a[href*="/in/"]');
    for (const a of links) {
      const h1 = a.querySelector("h1");
      if (h1) {
        const t = acceptNameCandidate(h1.innerText || h1.textContent);
        if (t) return t;
      }
      const label = clean(a.getAttribute("aria-label"));
      if (
        label &&
        label.length >= 2 &&
        label.length < 120 &&
        !/view\s+profile|profile\s+photo|background\s+image/i.test(label)
      ) {
        const fromLabel = acceptNameCandidate(label);
        if (fromLabel) return fromLabel;
      }
    }
    const loose = document.querySelector('a[href*="/in/"] h1');
    if (loose) {
      const t = acceptNameCandidate(loose.innerText || loose.textContent);
      if (t) return t;
    }
    return undefined;
  }

  function nameFromHeadingCandidates() {
    const selectors = [
      '[data-anonymize="person-name"]',
      "main h1.text-heading-xlarge",
      "main h1.inline",
      "main h1",
      "h1.text-heading-xlarge",
      ".pv-text-details__left-panel h1",
      '[data-view-name*="profile"] h1',
      '[componentkey*="Topcard"] h1',
    ];
    for (const sel of selectors) {
      const t = acceptNameCandidate(firstText(sel));
      if (t) return t;
    }
    for (const h1 of document.querySelectorAll("h1")) {
      const t = acceptNameCandidate(h1.innerText || h1.textContent);
      if (!t) continue;
      if (/^(home|linkedin|notifications|jobs|messaging|search)$/i.test(t)) {
        continue;
      }
      if (h1.closest("main") || h1.closest("[data-view-name]")) return t;
    }
    return undefined;
  }

  const fullName =
    nameFromHeadingCandidates() ||
    nameFromDocumentTitle() ||
    nameFromOpenGraph() ||
    nameFromProfileAnchors() ||
    undefined;

  let headline = firstText(
    '[data-anonymize="headline"]',
    "main .text-body-medium",
    ".pv-text-details__left-panel .text-body-medium",
    ".ph5 .text-body-medium",
  );
  if (headline === fullName) headline = undefined;

  let company;
  let location = firstText(
    '[data-test-id="profile-location"] span',
    '[data-anonymize="location"]',
    ".pv-text-details__left-panel .text-body-small",
  );

  const expRoot =
    document.querySelector('section[data-section="experience"]') ||
    document.getElementById("experience")?.closest("section") ||
    document.querySelector("#experience");
  if (expRoot) {
    const firstLi =
      expRoot.querySelector("ul li") ||
      expRoot.querySelector(".pvs-list__paged-list-item") ||
      expRoot.querySelector("li.artdeco-list__item");
    if (firstLi) {
      const hiddenSpans = firstLi.querySelectorAll("span[aria-hidden='true']");
      const parts = [];
      hiddenSpans.forEach((sp) => {
        const t = clean(sp.textContent);
        if (t && t.length < 200) parts.push(t);
      });
      if (parts.length >= 2) {
        if (!company) company = parts[1];
        if (!headline) headline = parts[0];
      } else if (parts.length === 1) {
        if (!headline) headline = parts[0];
        const h3 = clean(firstLi.querySelector("h3")?.textContent);
        if (h3 && !headline) headline = h3;
        const coLink = firstLi.querySelector(
          'a[href*="/company/"], span.t-14.t-normal span',
        );
        const co = clean(coLink?.textContent);
        if (co && !company) company = co;
      }
      if (!company) {
        const coA = firstLi.querySelector('a[href*="/company/"]');
        company = clean(coA?.textContent) || company;
      }
    }
  }

  if (!company) {
    const topCo = document.querySelector(
      'a[data-field="experience_company_logo"]',
    );
    if (topCo) {
      const wrap = topCo.closest("div")?.parentElement;
      const t = clean(wrap?.querySelector("span")?.textContent);
      if (t) company = t;
    }
  }

  let connectionDegree = firstText(
    "span.dist-value",
    ".distance-badge .dist-value",
    ".artdeco-entity-lockup__degree",
    '[componentkey*="Topcard"] span.text-body-small',
  );
  // English: 1st, 2nd — French UI: 1er, 2e, 3e, etc. Do not drop non-English labels.
  if (connectionDegree) {
    const t = connectionDegree.trim();
    if (t.length > 48) connectionDegree = undefined;
    else if (!/\d/.test(t)) connectionDegree = undefined;
    else connectionDegree = t;
  }

  function scrapeAboutBlock() {
    const aboutRoot =
      document.querySelector('section[data-section="summary"]') ||
      document.querySelector("#about")?.closest("section");
    if (!aboutRoot) return undefined;
    let t = clean(aboutRoot.innerText);
    if (!t) return undefined;
    if (/^about\s+/i.test(t)) t = t.replace(/^about\s+/i, "").trim();
    if (t.length > 12000) t = t.slice(0, 11997) + "…";
    return t || undefined;
  }

  function scrapeListSectionBullets(root, maxItems, maxChars) {
    if (!root) return undefined;
    const nodes = root.querySelectorAll(
      "li.artdeco-list__item, li.pvs-list__paged-list-item, .pvs-list__paged-list-item",
    );
    const seen = new Set();
    const bullets = [];
    nodes.forEach((li) => {
      if (bullets.length >= maxItems) return;
      let t = clean(li.innerText);
      if (!t || t.length < 4) return;
      const key = t.slice(0, 100);
      if (seen.has(key)) return;
      seen.add(key);
      if (t.length > maxChars) t = t.slice(0, maxChars - 3) + "...";
      bullets.push(t);
    });
    return bullets.length ? bullets : undefined;
  }

  const about = scrapeAboutBlock();
  const eduRoot =
    document.querySelector('section[data-section="education"]') ||
    document.getElementById("education")?.closest("section");
  const educationBullets = scrapeListSectionBullets(eduRoot, 12, 420);
  const experienceBullets = expRoot
    ? scrapeListSectionBullets(expRoot, 18, 520)
    : undefined;

  const extractedFields = {
    fullName,
    headline,
    company,
    location,
    connectionDegree,
    ...(about ? { about } : {}),
    ...(experienceBullets ? { experienceBullets } : {}),
    ...(educationBullets ? { educationBullets } : {}),
  };

  const fieldPresence = {
    fullName: Boolean(fullName),
    headline: Boolean(headline),
    company: Boolean(company),
    location: Boolean(location),
    connectionDegree: Boolean(connectionDegree),
    about: Boolean(about),
    experienceBullets: Boolean(experienceBullets?.length),
    educationBullets: Boolean(educationBullets?.length),
  };

  const filled = Object.values(fieldPresence).filter(Boolean).length;
  const confidence = filled / 5;

  return {
    schemaVersion: "1",
    pageType: "profile",
    sourceUrl,
    capturedAt: new Date().toISOString(),
    confidence,
    extractedFields,
    fieldPresence,
  };
}

/** Wait for LinkedIn top card, then scrape profile fields from a tab. */
async function scrapeProfileFromTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: waitForProfileDomReady,
      args: [5000],
    });
  } catch {
    /* best-effort: scrape even if wait injection failed */
  }
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeVisibleProfile,
  });
  return injected[0]?.result;
}

/**
 * Page world — scroll the connections / people-search list to load more rows.
 */
function scrollConnectionsListViewport() {
  function tryScroll(el, dy) {
    if (!el) return false;
    const sh = el.scrollHeight;
    const ch = el.clientHeight;
    if (sh > ch + 24) {
      el.scrollBy({ top: dy, behavior: "instant" });
      return true;
    }
    return false;
  }
  const main =
    document.querySelector("main.scaffold-layout__main") ||
    document.querySelector('main[role="main"]') ||
    document.querySelector("main");
  const innerSelectors = [
    ".scaffold-finite-scroll__content",
    ".scaffold-finite-scroll",
    ".search-results-container",
    ".mn-connections__list-container",
    ".artdeco-list",
  ];
  for (const sel of innerSelectors) {
    const el = (main && main.querySelector(sel)) || document.querySelector(sel);
    if (tryScroll(el, Math.min(950, Math.floor((el?.scrollHeight || 800) * 0.4)))) {
      return { scrolled: true };
    }
  }
  if (tryScroll(main, 720)) return { scrolled: true };
  window.scrollBy({ top: 680, behavior: "instant" });
  return { scrolled: true, fallback: "window" };
}

/**
 * Visible /in/ links on Connections or people search (page world).
 */
function scrapeConnectionsList() {
  function clean(s) {
    if (!s) return undefined;
    const t = String(s).replace(/\s+/g, " ").trim();
    return t.length ? t : undefined;
  }

  function splitRoleCompany(line) {
    const t = clean(line);
    if (!t) return { headline: undefined, company: undefined };
    const dot = " · ";
    if (t.includes(dot)) {
      const i = t.indexOf(dot);
      const a = t.slice(0, i).trim();
      const b = t.slice(i + dot.length).trim();
      if (b.length > 0 && b.length < 120) return { headline: a, company: b };
    }
    const at = /\s+at\s+/i;
    const m = t.match(at);
    if (m) {
      const idx = t.search(at);
      return {
        headline: t.slice(0, idx).trim(),
        company: t.slice(idx + m[0].length).trim(),
      };
    }
    return { headline: t, company: undefined };
  }

  function nameFromImgAlt(card) {
    const img = card?.querySelector("img[alt]");
    const alt = img?.getAttribute("alt");
    if (!alt) return undefined;
    const stripped = alt
      .replace(/\s*profile photo.*$/i, "")
      .replace(/’s$/i, "")
      .replace(/'s$/i, "")
      .trim();
    if (stripped.length > 1 && stripped.length < 120) return stripped;
    return undefined;
  }

  function findCard(a) {
    return (
      a.closest(".mn-connection-card") ||
      a.closest(".reusable-search__result-container") ||
      a.closest(".entity-result") ||
      a.closest("[data-chameleon-result-urn]") ||
      a.closest('[data-view-name="profile-card"]') ||
      a.closest("li") ||
      a.closest("article") ||
      a.parentElement?.closest("li")
    );
  }

  const listSourceUrl = window.location.href;
  const seen = new Set();
  const rows = [];
  const anchors = document.querySelectorAll('a[href*="/in/"]');

  for (const a of anchors) {
    const href = a.href;
    if (!href || href.includes("/edit/")) continue;
    try {
      const u = new URL(href);
      if (!u.hostname.endsWith("linkedin.com")) continue;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] !== "in" || !parts[1]) continue;
      const vanity = decodeURIComponent(parts[1]);
      if (!vanity || vanity === "me") continue;
      const profileUrl = `${u.origin}/${parts[0]}/${parts[1]}`;
      const key = profileUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const card = findCard(a) || a.parentElement?.parentElement;
      const normPath = u.pathname.replace(/\/$/, "").toLowerCase();
      let fullName;

      const nameEl =
        card?.querySelector('[data-anonymize="person-name"]') ||
        card?.querySelector(".mn-connection-card__name a") ||
        card?.querySelector(".entity-result__title-text a") ||
        card?.querySelector(".entity-result__title-line a");
      fullName = clean(nameEl?.textContent);

      if (!fullName && card) {
        let best = "";
        card.querySelectorAll("a[href]").forEach((link) => {
          try {
            const lu = new URL(link.href);
            if (lu.pathname.replace(/\/$/, "").toLowerCase() !== normPath) return;
            const t = clean(link.textContent);
            if (!t || t.includes("http")) return;
            if (t.length > best.length && t.length < 120) best = t;
          } catch {
            /* skip */
          }
        });
        fullName = best || undefined;
      }

      if (!fullName) {
        fullName = nameFromImgAlt(card);
      }

      if (!fullName) {
        const t = clean(a.textContent);
        if (t && t.length < 120 && !t.includes("http")) fullName = t.split("\n")[0];
      }

      let headline;
      let company;

      const prim =
        card?.querySelector(
          '[data-anonymize="title"], [data-anonymize="headline"], .entity-result__primary-subtitle, .mn-connection-card__subtitle, .subline-level-1, .entity-result__summary',
        ) || null;
      const sec = card?.querySelector(
        ".entity-result__secondary-subtitle, .entity-result__insights, .reusable-search-simple-insight",
      );

      headline = clean(prim?.textContent);
      company = clean(sec?.textContent);

      if (headline && !company) {
        const sp = splitRoleCompany(headline);
        headline = sp.headline;
        company = sp.company;
      }

      rows.push({
        profileUrl,
        fullName: fullName || undefined,
        headline: headline || undefined,
        company: company || undefined,
        connectionDegree: "1st",
      });
    } catch {
      continue;
    }
  }

  return {
    schemaVersion: "1",
    pageType: "connections",
    listSourceUrl,
    capturedAt: new Date().toISOString(),
    rows,
  };
}

const PENDING_SELF_ALARM = "clin-pending-self-capture";
const PENDING_SELF_LOCK_KEY = "clin_pending_self_capture_lock_ms";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function profilePathKey(urlStr) {
  try {
    const u = new URL(urlStr);
    const h = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!h.endsWith("linkedin.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) {
      return `/in/${parts[1].toLowerCase()}`;
    }
    if (parts[0] === "sales" && parts[1] === "lead" && parts[2]) {
      return `/sales/lead/${parts[2].toLowerCase()}`;
    }
    return u.pathname.replace(/\/+$/, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

async function findOrOpenProfileTab(targetUrl) {
  const want = profilePathKey(targetUrl);
  if (!want) {
    const t = await chrome.tabs.create({ url: targetUrl, active: true });
    return t.id;
  }
  const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
  for (const t of tabs) {
    if (!t.id || !t.url) continue;
    const k = profilePathKey(t.url);
    if (k && k === want) {
      await chrome.tabs.update(t.id, { active: true });
      if (t.windowId !== undefined) {
        try {
          await chrome.windows.update(t.windowId, { focused: true });
        } catch {
          /* ignore */
        }
      }
      return t.id;
    }
  }
  const created = await chrome.tabs.create({ url: targetUrl, active: true });
  return created.id;
}

async function waitForLinkedInProfileTab(tabId, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      throw new Error("The LinkedIn tab was closed.");
    }
    const url = tab?.url || "";
    if (url && isLinkedInProfilePageUrl(url)) {
      await sleep(700);
      return;
    }
    await sleep(400);
  }
  throw new Error(
    "Timed out waiting for profile URL. Log into LinkedIn in this browser and try again.",
  );
}

async function postProfileCaptureForTab(tabId, root, pruned) {
  const tab = await chrome.tabs.get(tabId);
  if (!isLinkedInProfilePageUrl(tab.url)) {
    return { ok: false, error: "Not on a profile page." };
  }
  const result = await scrapeProfileFromTab(tabId);
  if (!result) {
    return { ok: false, error: "Extractor returned nothing." };
  }
  const ctx = await getExtensionCampaignContext(root);
  const capBody = attachCampaignIdToPayload(result, ctx);
  const res = await fetch(`${root}/api/ingest/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(capBody),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: json?.error || text || `HTTP ${res.status}`,
    };
  }
  await recordBatchCaptureSuccess(pruned, 1);
  await chrome.storage.local.remove(LAST_ERROR_KEY);
  return { ok: true, json };
}

async function pollPendingSelfCapture() {
  const base = await getApiBase();
  const root = base.replace(/\/$/, "");
  const now = Date.now();
  const { [PENDING_SELF_LOCK_KEY]: lockUntil } = await chrome.storage.local.get(
    PENDING_SELF_LOCK_KEY,
  );
  if (typeof lockUntil === "number" && lockUntil > now) return;

  let jobRes;
  try {
    jobRes = await fetch(`${root}/api/extension/pending-self-capture`);
  } catch {
    return;
  }
  if (!jobRes.ok) return;
  const job = await jobRes.json();
  if (!job?.url || job.requestedAt == null) return;

  await chrome.storage.local.set({
    [PENDING_SELF_LOCK_KEY]: now + 120_000,
  });

  try {
    let pruned;
    try {
      pruned = await waitForPaceGapAllowCapture(base);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await chrome.storage.local.set({ [LAST_ERROR_KEY]: err });
      return;
    }

    const tabId = await findOrOpenProfileTab(job.url);
    await waitForLinkedInProfileTab(tabId);
    await sleep(1500 + Math.floor(Math.random() * 1500));

    const out = await postProfileCaptureForTab(tabId, root, pruned);
    if (out.ok) {
      await fetch(`${root}/api/extension/pending-self-capture/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedAt: job.requestedAt }),
      });
    } else if (out.error) {
      await chrome.storage.local.set({ [LAST_ERROR_KEY]: out.error });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await chrome.storage.local.set({ [LAST_ERROR_KEY]: msg });
  } finally {
    await chrome.storage.local.remove(PENDING_SELF_LOCK_KEY);
  }
}

function ensurePendingSelfAlarm() {
  chrome.alarms.get(PENDING_SELF_ALARM, (a) => {
    if (!a) {
      chrome.alarms.create(PENDING_SELF_ALARM, { periodInMinutes: 1 });
    }
  });
}

/** Toolbar icon opens the docked side panel (stays visible while you use the page). */
function ensureSidePanelOpensOnToolbarClick() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
}

ensureSidePanelOpensOnToolbarClick();

chrome.runtime.onInstalled.addListener(() => {
  ensureSidePanelOpensOnToolbarClick();
  ensurePendingSelfAlarm();
  pollPendingSelfCapture();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PENDING_SELF_ALARM) {
    pollPendingSelfCapture();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CLIN_POLL_PENDING_SELF") {
    pollPendingSelfCapture()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CLIN_HEALTH_CHECK") {
    (async () => {
      const base = typeof msg.apiBase === "string" ? msg.apiBase : await getApiBase();
      sendResponse(await fetchClinHealth(base));
    })();
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "CLIN_CAPTURE") return;

  (async () => {
    try {
      campaignContextFetchedAt = 0;
      campaignContextPayload = null;

      const base = await getApiBase();
      const healthCheck = await fetchClinHealth(base);
      if (!healthCheck.ok) {
        sendResponse({ ok: false, error: healthCheck.error });
        return;
      }

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id || !tab.url) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      if (!tab.url.includes("linkedin.com")) {
        sendResponse({
          ok: false,
          error: "Active tab is not LinkedIn.",
        });
        return;
      }

      const paceCheck = await checkPaceForCapture(base);
      if (!paceCheck.ok) {
        await chrome.storage.local.set({ [LAST_ERROR_KEY]: paceCheck.message });
        if (paceCheck.kind === "gap") {
          sendResponse({
            ok: false,
            error: paceCheck.message,
            paceKind: "gap",
            paceWaitSeconds: paceCheck.waitSeconds,
          });
        } else {
          sendResponse({
            ok: false,
            error: paceCheck.message,
            paceKind: "hourly",
          });
        }
        return;
      }
      const pruned = paceCheck.pruned;

      const root = base.replace(/\/$/, "");

      if (isMessagingThreadUrl(tab.url)) {
        const [{ result: msgPayload }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeMessagingThread,
        });
        if (
          !msgPayload?.extractedFields?.messagingParticipantProfileUrl ||
          !msgPayload?.extractedFields?.messagingMessages?.length
        ) {
          sendResponse({
            ok: false,
            error:
              "Could not read this thread — scroll messages into view and try again.",
          });
          return;
        }
        const capBody = await applyOutreachCampaignId(msgPayload);
        const res = await fetch(`${root}/api/ingest/capture`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(capBody),
        });
        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }
        if (!res.ok) {
          sendResponse({
            ok: false,
            error: json?.error || text || `HTTP ${res.status}`,
          });
          return;
        }
        await recordBatchCaptureSuccess(pruned, 1);
        await chrome.storage.local.remove(LAST_ERROR_KEY);
        sendResponse({ ok: true, data: json, mode: "messaging" });
        return;
      }

      if (isConnectionsListPageUrl(tab.url)) {
        const [{ result: listPayload }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeConnectionsList,
        });
        if (!listPayload?.rows?.length) {
          sendResponse({
            ok: false,
            error:
              "No profile links found on this page. Scroll to load people, or use My Network → Connections.",
          });
          return;
        }

        const listBody = await applyOutreachCampaignId(listPayload);
        const res = await fetch(`${root}/api/ingest/connections-page`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(listBody),
        });

        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }

        if (!res.ok) {
          sendResponse({
            ok: false,
            error: json?.error || text || `HTTP ${res.status}`,
          });
          return;
        }

        await recordBatchCaptureSuccess(pruned, json.imported);
        await chrome.storage.local.remove(LAST_ERROR_KEY);
        sendResponse({ ok: true, data: json, mode: "connections" });
        return;
      }

      if (!isLinkedInProfilePageUrl(tab.url)) {
        sendResponse({
          ok: false,
          error:
            "Open a profile (/in/…) or your Connections / people search list, then capture.",
        });
        return;
      }

      const result = await scrapeProfileFromTab(tab.id);

      if (!result) {
        sendResponse({ ok: false, error: "Extractor returned nothing." });
        return;
      }

      const capBody = await applyOutreachCampaignId(result);
      const res = await fetch(`${root}/api/ingest/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capBody),
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }

      if (!res.ok) {
        sendResponse({
          ok: false,
          error: json?.error || text || `HTTP ${res.status}`,
        });
        return;
      }

      await recordBatchCaptureSuccess(pruned, 1);
      await chrome.storage.local.remove(LAST_ERROR_KEY);
      const scrapeFp = result.fieldPresence;
      sendResponse({
        ok: true,
        data: { ...json, fieldPresence: json.fieldPresence ?? scrapeFp },
        mode: "profile",
      });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();

  return true;
});

/**
 * Hygiene batch: scrape + POST capture for a given tab (profile page).
 * Pacing matches manual profile capture.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "CLIN_HYGIENE_CAPTURE_STEP") return;

  (async () => {
    try {
      const tabId = msg.tabId;
      if (typeof tabId !== "number") {
        sendResponse({ ok: false, error: "Missing tab id." });
        return;
      }

      const base = await getApiBase();
      let pruned;
      try {
        pruned = await waitForPaceGapAllowCapture(base);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await chrome.storage.local.set({ [LAST_ERROR_KEY]: err });
        sendResponse({ ok: false, error: err });
        return;
      }

      const tab = await chrome.tabs.get(tabId);
      if (!tab?.url?.includes("linkedin.com")) {
        sendResponse({
          ok: false,
          error: "Tab is not on LinkedIn.",
        });
        return;
      }

      if (!isLinkedInProfilePageUrl(tab.url)) {
        const u = tab.url || "(no URL)";
        sendResponse({
          ok: false,
          error: `Not on a profile page yet. Expected /in/… or Sales lead URL; tab shows:\n${u}`,
        });
        return;
      }

      const result = await scrapeProfileFromTab(tabId);

      if (!result) {
        sendResponse({ ok: false, error: "Extractor returned nothing." });
        return;
      }

      const root = base.replace(/\/$/, "");
      const ctx = await getExtensionCampaignContext(root);
      const capBody = attachCampaignIdToPayload(result, ctx);
      const res = await fetch(`${root}/api/ingest/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capBody),
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }

      if (!res.ok) {
        sendResponse({
          ok: false,
          error: json?.error || text || `HTTP ${res.status}`,
        });
        return;
      }

      await recordBatchCaptureSuccess(pruned, 1);
      await chrome.storage.local.remove(LAST_ERROR_KEY);
      sendResponse({ ok: true, data: json });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();

  return true;
});

/**
 * One round: optional scroll → wait for capture pacing → scrape list → POST
 * connections-page (429 gap retry once). Caller (popup) loops for multi-round sprint.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "CLIN_CONNECTIONS_SPRINT_STEP") return;

  (async () => {
    const tabId = msg.tabId;
    const round = Number(msg.round) || 0;
    const postScrollMs = Math.min(
      12000,
      Math.max(500, Number(msg.postScrollMs) || 2500),
    );

    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "Missing tab id.", stopSprint: true });
      return;
    }

    try {
      const base = await getApiBase();
      if (!(await fetchConnectionsSprintAllowed(base))) {
        sendResponse({
          ok: false,
          error:
            "Connections list sprint is off in Clin → Settings → hygiene automation.",
          stopSprint: true,
        });
        return;
      }

      const tab = await chrome.tabs.get(tabId);
      if (!tab?.url?.includes("linkedin.com")) {
        sendResponse({
          ok: false,
          error: "Tab is not LinkedIn.",
          stopSprint: true,
        });
        return;
      }
      if (!isConnectionsListPageUrl(tab.url)) {
        sendResponse({
          ok: false,
          error:
            "Open My Network → Connections or LinkedIn people search results first.",
          stopSprint: true,
        });
        return;
      }

      if (round > 0) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: scrollConnectionsListViewport,
        });
        await sleep(postScrollMs);
      }

      let pruned;
      try {
        pruned = await waitForPaceGapAllowCapture(base);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await chrome.storage.local.set({ [LAST_ERROR_KEY]: err });
        sendResponse({ ok: false, error: err, stopSprint: true });
        return;
      }

      const [{ result: listPayload }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: scrapeConnectionsList,
      });
      if (!listPayload?.rows?.length) {
        sendResponse({
          ok: false,
          error:
            round === 0
              ? "No profile links on screen. Scroll until rows load, then run sprint again."
              : "No rows after scroll — end of list or layout changed.",
          stopSprint: round > 0,
        });
        return;
      }

      const root = base.replace(/\/$/, "");

      const doPost = async () => {
        const ctx = await getExtensionCampaignContext(root);
        const listBody = attachCampaignIdToPayload(listPayload, ctx);
        return fetch(`${root}/api/ingest/connections-page`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(listBody),
        });
      };

      let res = await doPost();
      let text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }

      if (res.status === 429) {
        const errMsg = String(json?.error || text || "");
        const hourly = /rolling hourly|hourly capture limit|max per rolling hour/i.test(
          errMsg,
        );
        if (hourly) {
          sendResponse({
            ok: false,
            error:
              json?.error ||
              "Rolling hourly capture limit — raise cap in Clin /settings or wait.",
            stopSprint: true,
          });
          return;
        }
        const retrySec = Math.max(
          1,
          parseInt(res.headers.get("Retry-After") || "45", 10) || 45,
        );
        await sleep(retrySec * 1000);
        try {
          pruned = await waitForPaceGapAllowCapture(base);
        } catch (e2) {
          const err = e2 instanceof Error ? e2.message : String(e2);
          sendResponse({ ok: false, error: err, stopSprint: true });
          return;
        }
        res = await doPost();
        text = await res.text();
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }
      }

      if (!res.ok) {
        sendResponse({
          ok: false,
          error: json?.error || text || `HTTP ${res.status}`,
          stopSprint: res.status === 429,
        });
        return;
      }

      await recordBatchCaptureSuccess(pruned, json.imported);
      await chrome.storage.local.remove(LAST_ERROR_KEY);
      sendResponse({ ok: true, data: json, round });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        stopSprint: true,
      });
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "CLIN_GENERATE_CAMPAIGN_DRAFT") return;

  (async () => {
    try {
      const rawBase =
        typeof msg.apiBase === "string" && msg.apiBase.trim()
          ? msg.apiBase.trim()
          : await getApiBase();
      const root = rawBase.replace(/\/$/, "");
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.url) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      if (!isLinkedInProfilePageUrl(tab.url)) {
        sendResponse({
          ok: false,
          error: "Open a LinkedIn profile (/in/…) in the active tab first.",
        });
        return;
      }
      const res = await fetch(`${root}/api/extension/generate-outreach-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl: tab.url }),
      });
      const text = await res.text();
      let j = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch {
        j = { error: text ? text.slice(0, 500) : `HTTP ${res.status}` };
      }
      if (!res.ok) {
        sendResponse({
          ok: false,
          error: j.error || `HTTP ${res.status}`,
          stage: j.stage,
          ollama: j.ollama,
        });
        return;
      }
      sendResponse({ ok: true, data: j });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "CLIN_MANUAL_SNAPSHOT") return;

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id || !tab.url?.includes("linkedin.com")) {
        sendResponse({ ok: false, error: "Open a LinkedIn tab first." });
        return;
      }
      const kind =
        msg.kind === "linkedin_post_analytics_visible"
          ? "linkedin_post_analytics_visible"
          : "linkedin_messages_inbox_visible";
      const [{ result: snap }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeExtensionSnapshot,
        args: [kind],
      });
      if (!snap?.kind) {
        sendResponse({ ok: false, error: "Snapshot returned nothing." });
        return;
      }
      const base = (await getApiBase()).replace(/\/$/, "");
      const res = await fetch(`${base}/api/extension/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "1",
          kind: snap.kind,
          sourceUrl: snap.sourceUrl,
          capturedAt: snap.capturedAt,
          payload: snap.payload,
        }),
      });
      const text = await res.text();
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { error: text };
      }
      if (!res.ok) {
        sendResponse({
          ok: false,
          error: json?.error || text || `HTTP ${res.status}`,
        });
        return;
      }
      sendResponse({ ok: true, id: json.id, kind: snap.kind });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();

  return true;
});

const OUTREACH_RUN_KEY = "clinOutreachRunActive";

/** Page world — best-effort DM composer fill on LinkedIn messaging. */
function clinOutreachFillComposer(draftText, autoSend) {
  const editor =
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector(".msg-form__contenteditable") ||
    document.querySelector('[data-artdeco-is-focused="true"]');
  if (!editor) {
    return { ok: false, error: "Composer not found — open the message thread first." };
  }
  editor.focus();
  try {
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, draftText);
  } catch {
    editor.textContent = draftText;
  }
  if (!autoSend) {
    return { ok: true, sent: false, needsConfirm: true };
  }
  const sendBtn =
    document.querySelector("button.msg-form__send-button") ||
    [...document.querySelectorAll("button")].find((b) =>
      /^(send|envoyer)$/i.test((b.textContent || "").trim()),
    );
  if (!sendBtn) {
    return { ok: true, sent: false, needsConfirm: true, error: "Send button not found" };
  }
  sendBtn.click();
  return { ok: true, sent: true };
}

async function outreachRunStep(tabId, base) {
  const root = base.replace(/\/$/, "");
  const nextRes = await fetch(`${root}/api/extension/outreach-queue/next`);
  const nextJson = await nextRes.json().catch(() => ({}));
  if (!nextRes.ok) {
    return { ok: false, error: nextJson?.error || `HTTP ${nextRes.status}` };
  }
  if (!nextJson.item) {
    return {
      ok: true,
      done: true,
      reason: nextJson.reason || "queue_empty",
      waitMs: nextJson.waitMs || 0,
    };
  }

  const item = nextJson.item;
  const url = item.linkedinUrl;
  if (!url) {
    await fetch(`${root}/api/extension/outreach-queue/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: item.memberId,
        outcome: "failed",
        action: "dm",
        error: "missing_linkedin_url",
      }),
    });
    return { ok: true, skipped: true };
  }

  await chrome.tabs.update(tabId, { url });
  await new Promise((r) => setTimeout(r, 4500));

  const autoSend = item.sendMode === "auto";
  const [{ result: fill }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: clinOutreachFillComposer,
    args: [item.draftOutreach || "", autoSend],
  });

  if (!fill?.ok) {
    return {
      ok: true,
      item,
      needsConfirm: true,
      hint: fill?.error || "Open messaging for this contact, then confirm send.",
    };
  }

  if (fill.sent) {
    await fetch(`${root}/api/extension/outreach-queue/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: item.memberId,
        outcome: "sent",
        action: "dm",
      }),
    });
    return { ok: true, item, sent: true };
  }

  return {
    ok: true,
    item,
    needsConfirm: true,
    hint: "Draft inserted (or profile opened). Click Send on LinkedIn, then confirm in Clin.",
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CLIN_OUTREACH_RUN_STOP") {
    chrome.storage.local.set({ [OUTREACH_RUN_KEY]: false });
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "CLIN_OUTREACH_RUN_STEP") {
    (async () => {
      try {
        const base = await getApiBase();
        const stored = await chrome.storage.local.get([OUTREACH_RUN_KEY]);
        if (!stored[OUTREACH_RUN_KEY]) {
          sendResponse({ ok: false, error: "Outreach run stopped." });
          return;
        }
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          sendResponse({ ok: false, error: "No active tab." });
          return;
        }
        const step = await outreachRunStep(tab.id, base);
        sendResponse(step);
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }
  if (msg?.type === "CLIN_OUTREACH_CONFIRM_SENT") {
    (async () => {
      try {
        const base = await getApiBase();
        const root = base.replace(/\/$/, "");
        const memberId = msg.memberId;
        if (!memberId) {
          sendResponse({ ok: false, error: "memberId required" });
          return;
        }
        await fetch(`${root}/api/extension/outreach-queue/ack`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId,
            outcome: "sent",
            action: "dm",
          }),
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "CLIN_OUTREACH_RUN_START") return false;
  (async () => {
    try {
      await chrome.storage.local.set({ [OUTREACH_RUN_KEY]: true });
      const base = await getApiBase();
      let steps = 0;
      const maxSteps = Math.min(20, Number(msg.maxSteps) || 5);
      while (steps < maxSteps) {
        const stored = await chrome.storage.local.get([OUTREACH_RUN_KEY]);
        if (!stored[OUTREACH_RUN_KEY]) break;
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          sendResponse({ ok: false, error: "No active tab." });
          return;
        }
        const step = await outreachRunStep(tab.id, base);
        if (step.done) {
          sendResponse({ ok: true, done: true, reason: step.reason });
          return;
        }
        if (step.waitMs && step.waitMs > 0) {
          await new Promise((r) => setTimeout(r, Math.min(step.waitMs, 120000)));
        }
        if (step.needsConfirm) {
          sendResponse({
            ok: true,
            paused: true,
            item: step.item,
            hint: step.hint,
          });
          return;
        }
        steps += 1;
        await new Promise((r) => setTimeout(r, 2000));
      }
      sendResponse({ ok: true, done: true, steps });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await chrome.storage.local.set({ [OUTREACH_RUN_KEY]: false });
    }
  })();
  return true;
});

ensurePendingSelfAlarm();
