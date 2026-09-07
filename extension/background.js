/**
 * Clin extension — manual capture. Posts JSON to your local Clin API.
 * Profile: one contact. Connections / people search: visible list rows (scroll/load more, then capture again).
 */

const DEFAULT_BASE = "http://127.0.0.1:3100";
const LIST_IMPORT_TIMES_KEY = "clin_list_import_timestamps_ms";
const PROFILE_CAPTURE_TIMES_KEY = "clin_profile_capture_timestamps_ms";
/** @deprecated migrated to split keys on first read */
const LEGACY_CAPTURE_TIMES_KEY = "clin_capture_timestamps_ms";
const LAST_ERROR_KEY = "clin_last_pace_message";
const CAPTURE_TECH_LOG_KEY = "clinCaptureTechLog";
const CAPTURE_TECH_LOG_MAX = 50;
const PIPELINE_RUN_KEY = "clinPipelineRunActive";
const PIPELINE_STATE_KEY = "clinPipelineState";
const PIPELINE_TAB_ID_KEY = "clinPipelineTabId";
const PIPELINE_ALARM = "clinPipelineTick";
const LAST_OUTREACH_MEMBER_KEY = "clinLastOutreachMember";
const OUTREACH_MEMBER_CONTEXT_TTL_MS = 45 * 60 * 1000;

function cleanScrapeText(s) {
  if (!s) return undefined;
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length ? t : undefined;
}

/** English / French LinkedIn degree labels → 1st | 2nd | 3rd+ */
function parseConnectionDegree(text) {
  const t = cleanScrapeText(text);
  if (!t) return undefined;
  if (/\b1er\b/i.test(t) || /\b1\s*(?:er|re|st)\b/i.test(t) || /\b1st\b/i.test(t)) {
    return "1st";
  }
  if (/\b2e\b/i.test(t) || /\b2\s*(?:e|nd)\b/i.test(t) || /\b2nd\b/i.test(t)) {
    return "2nd";
  }
  if (/\b3e\b/i.test(t) || /\b3\s*(?:e|rd)?\+?\b/i.test(t) || /\b3rd/i.test(t)) {
    return "3rd+";
  }
  return undefined;
}

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
async function fetchAutomationSettings(base) {
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/automation/settings`);
    if (!res.ok) return null;
    const j = await res.json();
    return j?.automation ?? null;
  } catch {
    return null;
  }
}

async function fetchConnectionsSprintAllowed(base) {
  const a = await fetchAutomationSettings(base);
  if (!a) return true;
  if (a.connectionsSprintEnabled === false) return false;
  return true;
}

async function postAutomationAck(base, contactId, outcome) {
  try {
    await fetch(`${base.replace(/\/$/, "")}/api/automation/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, outcome }),
    });
  } catch {
    /* ignore */
  }
}

function pruneHour(timestamps, now) {
  const cutoff = now - 60 * 60 * 1000;
  return timestamps.filter((t) => t > cutoff);
}

async function loadPaceTimestamps(storageKey) {
  const stored = await chrome.storage.local.get([
    storageKey,
    LEGACY_CAPTURE_TIMES_KEY,
  ]);
  let raw = stored[storageKey];
  if (!Array.isArray(raw) || raw.length === 0) {
    const legacy = stored[LEGACY_CAPTURE_TIMES_KEY];
    if (Array.isArray(legacy) && legacy.length > 0) {
      raw = legacy;
      await chrome.storage.local.set({ [storageKey]: legacy });
      await chrome.storage.local.remove(LEGACY_CAPTURE_TIMES_KEY);
    }
  }
  const now = Date.now();
  const list = Array.isArray(raw)
    ? raw.map(Number).filter((n) => Number.isFinite(n))
    : [];
  return pruneHour(list, now);
}

function profileMaxPerHour(pace) {
  return (
    pace?.profileCaptureMaxPerHour ??
    pace?.captureMaxPerHour ??
    40
  );
}

function listMaxPerHour(pace) {
  return pace?.listImportMaxPerHour ?? 120;
}

function profileGapMs(pace) {
  const minGapSec = pace?.minSecondsBetweenCaptures ?? 40;
  const minGapMsFallback = minGapSec * 1000;
  const rolled =
    pace?.profileCaptureGapMsRequired ?? pace?.captureGapMsRequired;
  if (
    typeof rolled === "number" &&
    Number.isFinite(rolled) &&
    rolled > 0
  ) {
    return Math.max(rolled, minGapMsFallback);
  }
  return minGapMsFallback;
}

function listGapMs(pace) {
  const minGapSec = pace?.minSecondsBetweenListImports ?? 10;
  const minGapMsFallback = minGapSec * 1000;
  const rolled = pace?.listImportGapMsRequired;
  if (
    typeof rolled === "number" &&
    Number.isFinite(rolled) &&
    rolled > 0
  ) {
    return Math.max(rolled, minGapMsFallback);
  }
  return minGapMsFallback;
}

/**
 * @returns {{ ok: true, pruned: number[] } | { ok: false, kind: 'hourly', message: string } | { ok: false, kind: 'gap', message: string, waitSeconds: number, waitMs: number }}
 */
async function checkPaceForProfileCapture(base) {
  const pace = await fetchPace(base);
  const maxPerHour = profileMaxPerHour(pace);
  const minGapMs = profileGapMs(pace);
  const now = Date.now();
  const pruned = await loadPaceTimestamps(PROFILE_CAPTURE_TIMES_KEY);

  if (pruned.length >= maxPerHour) {
    return {
      ok: false,
      kind: "hourly",
      message: `Client pace: ${maxPerHour} profile captures max per rolling hour (list imports use a separate budget). Raise limit in Clin /settings or wait.`,
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
      message: `Client pace: wait ${waitSeconds}s before the next profile capture (humanized interval, matches server).`,
    };
  }

  return { ok: true, pruned };
}

/**
 * @returns {{ ok: true, pruned: number[] } | { ok: false, kind: 'hourly', message: string } | { ok: false, kind: 'gap', message: string, waitSeconds: number, waitMs: number }}
 */
async function checkPaceForListImport(base) {
  const pace = await fetchPace(base);
  const maxPerHour = listMaxPerHour(pace);
  const minGapMs = listGapMs(pace);
  const now = Date.now();
  const pruned = await loadPaceTimestamps(LIST_IMPORT_TIMES_KEY);

  if (pruned.length >= maxPerHour) {
    return {
      ok: false,
      kind: "hourly",
      message: `Client pace: ${maxPerHour} list rows max per rolling hour (profile captures use a separate budget). Raise limit in Clin /settings or wait.`,
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
      message: `Client pace: wait ${waitSeconds}s before the next list import (humanized interval, matches server).`,
    };
  }

  return { ok: true, pruned };
}

/** Background-only: sleep until min profile gap passes. Hourly cap still throws. */
async function waitForProfileCaptureGap(base) {
  for (;;) {
    const r = await checkPaceForProfileCapture(base);
    if (r.ok) return r.pruned;
    if (r.kind === "hourly") throw new Error(r.message);
    await sleep(r.waitMs + 80);
  }
}

/** Background-only: sleep until min list import gap passes. Hourly cap still throws. */
async function waitForListImportGap(base) {
  for (;;) {
    const r = await checkPaceForListImport(base);
    if (r.ok) return r.pruned;
    if (r.kind === "hourly") throw new Error(r.message);
    await sleep(r.waitMs + 80);
  }
}

async function recordProfileCaptureSuccess(pruned) {
  const now = Date.now();
  await chrome.storage.local.set({
    [PROFILE_CAPTURE_TIMES_KEY]: pruneHour([...pruned, now], now),
  });
}

async function recordListImportSuccess(pruned, importedCount) {
  const n = Math.max(0, Math.min(Number(importedCount) || 0, 500));
  const now = Date.now();
  const stamps = Array.from({ length: n }, () => now);
  await chrome.storage.local.set({
    [LIST_IMPORT_TIMES_KEY]: pruneHour([...pruned, ...stamps], now),
  });
}

async function resetExtensionPaceCounters() {
  await chrome.storage.local.remove([
    LIST_IMPORT_TIMES_KEY,
    PROFILE_CAPTURE_TIMES_KEY,
    LEGACY_CAPTURE_TIMES_KEY,
    LAST_ERROR_KEY,
  ]);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CLIN_GET_CAPTURE_TECH_LOG") {
    (async () => {
      try {
        const stored = await chrome.storage.local.get([CAPTURE_TECH_LOG_KEY]);
        sendResponse({
          ok: true,
          items: stored[CAPTURE_TECH_LOG_KEY] || [],
        });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }
  if (msg?.type !== "CLIN_RESET_PACE_COUNTERS") return;
  (async () => {
    try {
      await resetExtensionPaceCounters();
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();
  return true;
});

const CAMPAIGN_CTX_TTL_MS = 30_000;
let campaignContextFetchedAt = 0;
/** @type {Record<string, unknown> | null} */
let campaignContextPayload = null;
let campaignContextKey = "";

function invalidateExtensionCampaignContext() {
  campaignContextFetchedAt = 0;
  campaignContextPayload = null;
  campaignContextKey = "";
}

async function getExtensionCampaignContext(root, campaignId, opts = {}) {
  const now = Date.now();
  const attemptedMemberIds = Array.isArray(opts.attemptedMemberIds)
    ? opts.attemptedMemberIds.filter((id) => typeof id === "string" && id.trim())
    : [];
  const campaignPart =
    typeof campaignId === "string" ? campaignId.trim() : "";
  const attemptedPart =
    attemptedMemberIds.length > 0 ? attemptedMemberIds.slice().sort().join(",") : "";
  const key = `${root}::${campaignPart}::${attemptedPart}`;
  const canUseCache =
    attemptedMemberIds.length === 0 &&
    key === campaignContextKey &&
    campaignContextFetchedAt > 0 &&
    now - campaignContextFetchedAt < CAMPAIGN_CTX_TTL_MS;
  if (canUseCache) {
    return campaignContextPayload;
  }
  try {
    const params = new URLSearchParams();
    if (campaignPart) params.set("campaignId", campaignPart);
    if (attemptedMemberIds.length > 0) {
      params.set("attemptedMemberIds", attemptedMemberIds.join(","));
    }
    const q = params.toString() ? `?${params.toString()}` : "";
    const r = await fetch(`${root}/api/extension/campaign-context${q}`);
    campaignContextKey = key;
    campaignContextFetchedAt = now;
    if (!r.ok) {
      campaignContextPayload = null;
      return null;
    }
    campaignContextPayload = await r.json();
    return campaignContextPayload;
  } catch {
    campaignContextKey = key;
    campaignContextFetchedAt = now;
    campaignContextPayload = null;
    return null;
  }
}

const IMPORT_CAMPAIGN_KEY = "clinImportCampaignChoice";

/** Campaign chosen in extension popup only (not Clin web capture target). */
async function resolveExtensionImportCampaignId() {
  const { [IMPORT_CAMPAIGN_KEY]: choice } = await chrome.storage.sync.get([
    IMPORT_CAMPAIGN_KEY,
  ]);
  const pick = typeof choice === "string" ? choice.trim() : "";
  if (!pick || pick === "__none__" || pick === "__clin_default__") return null;
  return pick;
}

async function applyOutreachCampaignId(payload) {
  const id = await resolveExtensionImportCampaignId();
  if (!id) return payload;
  return { ...payload, outreachCampaignId: id };
}

function linkedinVanityFromUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const m = new URL(url.trim()).pathname.match(/^\/in\/([^/?#]+)\/?/i);
    if (!m?.[1] || m[1].toLowerCase() === "me") return null;
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return null;
  }
}

async function setLastOutreachMemberContext(item) {
  if (!item?.memberId) return;
  await chrome.storage.local.set({
    [LAST_OUTREACH_MEMBER_KEY]: {
      memberId: item.memberId,
      contactId: item.contactId,
      linkedinUrl: item.linkedinUrl,
      fullName: item.fullName,
      at: Date.now(),
    },
  });
}

async function getLastOutreachMemberContext() {
  const stored = await chrome.storage.local.get([LAST_OUTREACH_MEMBER_KEY]);
  const ctx = stored[LAST_OUTREACH_MEMBER_KEY];
  if (!ctx || typeof ctx !== "object") return null;
  const age = Date.now() - (ctx.at || 0);
  if (age > OUTREACH_MEMBER_CONTEXT_TTL_MS) return null;
  return ctx;
}

async function attachProfileCaptureContext(payload, explicitCtx) {
  let out = await applyOutreachCampaignId(payload);
  const ctx =
    explicitCtx && (explicitCtx.memberId || explicitCtx.linkedinUrl)
      ? explicitCtx
      : await getLastOutreachMemberContext();
  if (!ctx) return out;
  if (ctx.memberId) out = { ...out, outreachMemberId: ctx.memberId };
  if (ctx.linkedinUrl) {
    const url = ensureLinkedInAbsoluteUrl(ctx.linkedinUrl);
    if (url) out = { ...out, expectedParticipantProfileUrl: url };
  }
  return out;
}

async function attachMessagingCaptureContext(payload) {
  let out = await applyOutreachCampaignId(payload);
  const ctx = await getLastOutreachMemberContext();
  if (!ctx) return out;
  if (ctx.memberId) out = { ...out, outreachMemberId: ctx.memberId };
  if (ctx.linkedinUrl) {
    out = { ...out, expectedParticipantProfileUrl: ctx.linkedinUrl };
  }
  return out;
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

function isMessagingPageUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith("linkedin.com") &&
      /\/messaging\//i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

function isLinkedInFeedUpdateUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith("linkedin.com") &&
      /\/feed\/update\//i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

function isProfilePostsContextUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("linkedin.com")) return false;
    if (/\/recent-activity\//i.test(u.pathname)) return true;
    if (isLinkedInFeedUpdateUrl(url)) return true;
    if (isLinkedInProfilePageUrl(url)) return true;
    return false;
  } catch {
    return false;
  }
}

function normalizeCaptureScope(raw) {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "auto";
  if (
    s === "profile" ||
    s === "posts" ||
    s === "messaging" ||
    s === "connections" ||
    s === "auto"
  ) {
    return s;
  }
  return "auto";
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

function linkedInProfileSlug(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) {
      return decodeURIComponent(parts[1]).toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function profileNavigationTargetKey(url) {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function ensureLinkedInAbsoluteUrl(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  let candidate = t;
  if (!/^https?:\/\//i.test(candidate)) {
    if (candidate.startsWith("/")) {
      candidate = `https://www.linkedin.com${candidate}`;
    } else if (/^(www\.)?linkedin\.com\//i.test(candidate)) {
      candidate = `https://${candidate.replace(/^https?:\/\//i, "")}`;
    } else {
      return null;
    }
  }
  try {
    const u = new URL(candidate);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.endsWith("linkedin.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) {
      const slug = decodeURIComponent(parts[1]).toLowerCase();
      return `https://www.linkedin.com/in/${slug}`;
    }
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Avoid reloading the same profile when LinkedIn redirects vanity → ACoAAA slug. */
let lastProfileNavigation = { tabId: null, targetUrl: "", at: 0 };

function profileCaptureHasMeaningfulFields(result) {
  const fp = result?.fieldPresence || {};
  return Boolean(
    fp.fullName ||
      fp.headline ||
      fp.company ||
      fp.about ||
      fp.experienceBullets ||
      fp.educationBullets,
  );
}

function summarizeFieldPresence(fieldPresence) {
  if (!fieldPresence || typeof fieldPresence !== "object") return "";
  return Object.entries(fieldPresence)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(",");
}

async function appendCaptureTechLog(entry) {
  const stored = await chrome.storage.local.get([CAPTURE_TECH_LOG_KEY]);
  const prev = Array.isArray(stored[CAPTURE_TECH_LOG_KEY])
    ? stored[CAPTURE_TECH_LOG_KEY]
    : [];
  const row = {
    at: Date.now(),
    ...entry,
  };
  await chrome.storage.local.set({
    [CAPTURE_TECH_LOG_KEY]: [row, ...prev].slice(0, CAPTURE_TECH_LOG_MAX),
  });
}

function finalizeProfileCapturePayload(body, tabUrl, chainOpts = {}) {
  const out = { ...(body || {}) };
  const fromTab = ensureLinkedInAbsoluteUrl(tabUrl);
  const fromBody = ensureLinkedInAbsoluteUrl(out.sourceUrl);
  const fromExpected = ensureLinkedInAbsoluteUrl(
    chainOpts.outreachMemberContext?.linkedinUrl ||
      out.expectedParticipantProfileUrl,
  );
  out.sourceUrl = fromBody || fromTab || fromExpected || out.sourceUrl;
  if (!out.expectedParticipantProfileUrl && fromExpected) {
    out.expectedParticipantProfileUrl = fromExpected;
  }
  delete out.captureDiagnostics;
  delete out.captureMethods;
  return out;
}

function isConnectionsListPageUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("linkedin.com")) return false;
    const p = u.pathname.toLowerCase();
    if (p.includes("/mynetwork/invite-connect/connections")) return true;
    if (p.includes("/mynetwork/connection-manager")) return true;
    if (p.includes("/search/results/people")) return true;
    if (p.includes("/search/results/all") && /people/i.test(u.search)) return true;
    if (p.includes("/sales/search/people")) return true;
    return false;
  } catch {
    return false;
  }
}

/** Page world — is a messaging thread UI visible (full page or overlay). */
function isMessagingDomVisiblePage() {
  const list = findMessagingScrollContainer();
  const header =
    document.querySelector(".msg-overlay-conversation-bubble-header") ||
    document.querySelector(".msg-thread__header") ||
    document.querySelector("[data-test-conversation-header]") ||
    document.querySelector("[class*='msg-thread'][class*='header']");
  const composer =
    document.querySelector('.msg-form__contenteditable[contenteditable="true"]') ||
    document.querySelector('[data-lexical-editor="true"][contenteditable="true"]');
  return {
    visible: Boolean(list || (header && composer)),
    onThreadUrl: /\/messaging\/thread\//i.test(window.location.pathname),
  };
}

/** Page world — scrollable message list in overlay or full-page thread. */
function findMessagingScrollContainer() {
  const selectors = [
    "ul.msg-s-message-list",
    ".msg-s-message-list",
    "[class*='msg-s-message-list']",
    ".msg-thread__message-list",
    "[class*='msg-thread'] [role='log']",
    "[class*='msg-overlay-conversation'] [role='log']",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  const bubble =
    document.querySelector(".msg-overlay-conversation-bubble") ||
    document.querySelector("[class*='msg-overlay-conversation']") ||
    document.querySelector(".msg-convo-wrapper");
  if (bubble instanceof HTMLElement) {
    const scrollables = bubble.querySelectorAll(
      "[style*='overflow'], [class*='scrollable'], [class*='scroll']",
    );
    for (const el of scrollables) {
      if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 20) {
        return el;
      }
    }
    for (const el of bubble.querySelectorAll("[role='log'], [role='list']")) {
      if (el instanceof HTMLElement && el.querySelector("li, [class*='message']")) {
        return el;
      }
    }
  }
  return null;
}

/** Page world — thread id / conversation URN from URL, sidebar, or DOM attributes. */
function resolveMessagingThreadIdFromDom() {
  let threadId;
  let conversationUrn;
  let numericId;

  try {
    const m = window.location.pathname.match(/\/messaging\/thread\/([^/?#]+)/i);
    if (m?.[1]) threadId = decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }

  function scanUrn(raw) {
    if (!raw || typeof raw !== "string") return;
    const msgMatch = raw.match(/urn:li:msg_conversation:\(([^)]+)\)/i);
    if (msgMatch?.[1]) {
      conversationUrn = `urn:li:msg_conversation:(${msgMatch[1]})`;
      const part = msgMatch[1].split(",").pop()?.trim().replace(/^["']|["']$/g, "");
      if (part && !threadId) threadId = part;
    }
    const fsMatch = raw.match(/urn:li:fs_conversation:(\d+)/i);
    if (fsMatch?.[1]) numericId = fsMatch[1];
  }

  for (const el of document.querySelectorAll(
    "[data-conversation-urn],[data-thread-urn],[data-conversation-id]",
  )) {
    scanUrn(el.getAttribute("data-conversation-urn") || el.getAttribute("data-thread-urn"));
    if (!threadId) {
      const cid = el.getAttribute("data-conversation-id");
      if (cid) threadId = cid.trim();
    }
  }

  if (!threadId) {
    const activeLink =
      document.querySelector(
        '.msg-conversation-listitem--active a[href*="/messaging/thread/"]',
      ) ||
      document.querySelector('a.msg-thread-listitem--active[href*="/messaging/thread/"]') ||
      document.querySelector(
        '[class*="conversation-list-item"][class*="active"] a[href*="/messaging/thread/"]',
      ) ||
      document.querySelector('a[href*="/messaging/thread/"][aria-current="page"]');
    if (activeLink instanceof HTMLAnchorElement && activeLink.href) {
      const m = activeLink.href.match(/\/messaging\/thread\/([^/?#]+)/i);
      if (m?.[1]) threadId = decodeURIComponent(m[1]);
    }
  }

  if (!threadId) {
    for (const a of document.querySelectorAll('a[href*="/messaging/thread/"]')) {
      if (!(a instanceof HTMLAnchorElement)) continue;
      const active =
        a.getAttribute("aria-current") === "page" ||
        a.closest('[class*="active"],[class*="selected"]');
      if (!active) continue;
      const m = a.href.match(/\/messaging\/thread\/([^/?#]+)/i);
      if (m?.[1]) {
        threadId = decodeURIComponent(m[1]);
        break;
      }
    }
  }

  if (!conversationUrn && threadId) {
    const root =
      document.querySelector(".msg-overlay-conversation-bubble") ||
      document.querySelector(".msg-convo-wrapper") ||
      document.querySelector("main");
    const html = root?.innerHTML?.slice(0, 80_000) || "";
    const m = html.match(
      /urn:li:msg_conversation:\((urn:li:fsd_profile:[^,]+,\s*[^)]+)\)/i,
    );
    if (m?.[1]) conversationUrn = `urn:li:msg_conversation:(${m[1]})`;
  }

  return { threadId, conversationUrn, numericId };
}

/**
 * Page world — 1:1 messaging thread (overlay + /messaging/thread/… full page).
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
        if (!m?.[1] || m[1].toLowerCase() === "me") continue;
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

  let messagingThreadId;
  const resolved = resolveMessagingThreadIdFromDom();
  messagingThreadId = resolved.threadId;

  let sourceUrl = window.location.href;
  if (messagingThreadId && !sourceUrl.includes("/messaging/")) {
    sourceUrl = `https://www.linkedin.com/messaging/thread/${encodeURIComponent(messagingThreadId)}/`;
  }

  const threadRoot =
    document.querySelector(".msg-overlay-conversation-bubble") ||
    document.querySelector("[class*='msg-overlay-conversation']") ||
    document.querySelector(".msg-convo-wrapper") ||
    document.querySelector('[data-view-name*="message"]') ||
    document.querySelector('main[role="main"]') ||
    document.querySelector("main") ||
    document.body;

  const header =
    threadRoot.querySelector(".msg-overlay-conversation-bubble-header") ||
    threadRoot.querySelector(".msg-overlay-bubble-header") ||
    threadRoot.querySelector(".msg-thread__header") ||
    threadRoot.querySelector("[data-test-conversation-header]") ||
    threadRoot.querySelector(".msg-thread-modern-header") ||
    threadRoot.querySelector("header");

  let messagingParticipantProfileUrl;
  let messagingParticipantName;
  for (const root of [header, threadRoot, document.body]) {
    const pick = firstParticipantProfileFrom(root);
    if (pick.url) {
      messagingParticipantProfileUrl = pick.url;
      messagingParticipantName = pick.name;
      break;
    }
  }

  const messagingMessages = [];
  const seen = new Set();
  function pushMsg(from, body) {
    const b = clean(body);
    if (!b || b.length < 2) return;
    const key = `${from}:${b.slice(0, 120)}`;
    if (seen.has(key)) return;
    seen.add(key);
    messagingMessages.push({ from, body: b.slice(0, 20_000) });
  }

  function isSentGroup(el) {
    if (!el) return false;
    const cn = el.className || "";
    return (
      el.classList?.contains("msg-s-message-group--sent") ||
      /\bmsg-s-message-group--sent\b/.test(cn) ||
      /\bmessage-group--sent\b/.test(cn) ||
      el.closest?.("[class*='--sent']") != null
    );
  }

  function scrapeFromList(list) {
    if (!list) return;
    const events = list.querySelectorAll(
      "li.msg-s-message-list__event, li[class*='msg-s-message-list__event'], li[class*='message-list__event']",
    );
    events.forEach((li) => {
      const group =
        li.querySelector(".msg-s-message-group") ||
        li.querySelector("[class*='msg-s-message-group']") ||
        li;
      const bodyEl =
        group.querySelector(".msg-s-event-listitem__body") ||
        group.querySelector(".msg-s-message-group__content") ||
        group.querySelector("[class*='message-bubble']") ||
        group.querySelector("p") ||
        group;
      pushMsg(isSentGroup(group) ? "me" : "them", bodyEl.innerText || "");
    });

    list.querySelectorAll(".msg-s-event-listitem, [class*='event-listitem']").forEach((item) => {
      const group = item.closest("[class*='message-group']") || item.parentElement;
      const body =
        item.querySelector(".msg-s-event-listitem__body") ||
        item.querySelector("[class*='body']") ||
        item;
      pushMsg(isSentGroup(group) ? "me" : "them", body.innerText || "");
    });
  }

  const lists = document.querySelectorAll(
    "ul.msg-s-message-list, .msg-s-message-list, [class*='msg-s-message-list']",
  );
  lists.forEach((list) => scrapeFromList(list));
  if (lists.length === 0) scrapeFromList(threadRoot);

  if (messagingMessages.length === 0) {
    const groups = threadRoot.querySelectorAll(
      "[class*='msg-s-message-group'], [class*='message-group'], [class*='msg__bubble'], li[class*='event-listitem']",
    );
    groups.forEach((group) => {
      const bodyEl =
        group.querySelector(".msg-s-event-listitem__body") ||
        group.querySelector("[class*='message-bubble']") ||
        group.querySelector("[class*='message-content']") ||
        group.querySelector("[data-lexical-text='true']") ||
        group.querySelector("p");
      const text = (bodyEl?.innerText || group.innerText || "").trim();
      if (!text || text.length < 2) return;
      if (/^\d{1,2}:\d{2}(\s*(AM|PM))?$/i.test(text)) return;
      if (/^(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(text) && text.length < 24) {
        return;
      }
      pushMsg(isSentGroup(group) ? "me" : "them", text);
    });
  }

  if (messagingMessages.length === 0) {
    const bubbleBodies = threadRoot.querySelectorAll(
      ".msg-s-event-listitem__body, [class*='message-bubble'], [class*='msg-s-event-listitem']",
    );
    bubbleBodies.forEach((bodyEl) => {
      const group = bodyEl.closest("[class*='message-group']") || bodyEl.parentElement;
      const text = (bodyEl.innerText || "").trim();
      if (!text || text.length < 2) return;
      pushMsg(isSentGroup(group) ? "me" : "them", text);
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
 * Page world — Voyager + DOM messaging (single injection).
 */
async function captureMessagingBundleInPage() {
  function voyagerHeaders() {
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const jsession = cookies.find((c) => c.startsWith("JSESSIONID="));
    let csrf =
      jsession?.split("=")[1]?.replace(/^"|"$/g, "")?.trim() || "";
    if (!csrf) {
      csrf =
        document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")?.trim() || "";
    }
    return {
      "csrf-token": csrf,
      "x-restli-protocol-version": "2.0.0",
      accept: "application/vnd.linkedin.normalized+json+2.1",
    };
  }

  function parseVoyagerMessages(json, threadId) {
    const included = Array.isArray(json?.included) ? json.included : [];
    const messages = [];
    const seen = new Set();
    function pushMsg(from, body, createdAt) {
      const b = String(body || "").replace(/\s+/g, " ").trim();
      if (!b || b.length < 2) return;
      const key = `${from}:${b.slice(0, 100)}`;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({
        from,
        body: b.slice(0, 20_000),
        createdAt: typeof createdAt === "number" ? createdAt : 0,
      });
    }
    function extractBody(item) {
      const body =
        item?.eventContent?.attributedBody?.text ||
        item?.eventContent?.messageBody?.text ||
        item?.body?.text ||
        item?.messageBody?.text ||
        (typeof item?.body === "string" ? item.body : undefined) ||
        item?.text?.text;
      if (body) return body;
      const ec = item?.eventContent || item?.body;
      if (ec && typeof ec === "object") {
        const attr = ec.attributedBody;
        if (attr?.text) return attr.text;
        if (typeof ec.text === "string") return ec.text;
      }
      return undefined;
    }
    function extractFrom(item) {
      if (item?.fromSelf === true) return "me";
      if (item?.fromSelf === false) return "them";
      const sender = item?.sender || item?.from;
      if (sender && typeof sender === "object") {
        const profile =
          sender.participantProfile || sender.profile || sender.member?.miniProfile;
        if (profile?.publicIdentifier) return "them";
      }
      return "unknown";
    }
    for (const item of included) {
      const type = item?.$type || "";
      if (!/Event|Message|messaging/i.test(type)) continue;
      const body = extractBody(item);
      if (!body) continue;
      const createdAt =
        item?.createdAt ?? item?.deliveredAt ?? item?.originToken ?? 0;
      pushMsg(extractFrom(item), body, createdAt);
    }
    const gqlElements =
      json?.data?.messengerMessagesBySyncToken?.elements ||
      json?.data?.messengerMessages?.elements ||
      json?.data?.data?.messengerMessages?.elements;
    if (Array.isArray(gqlElements)) {
      for (const event of gqlElements) {
        if (!event || typeof event !== "object") continue;
        const body = extractBody(event);
        if (!body) continue;
        const createdAt = event.createdAt ?? event.deliveredAt ?? 0;
        pushMsg(extractFrom(event), body, createdAt);
      }
    }
    if (!messages.length) return null;
    messages.sort((a, b) => a.createdAt - b.createdAt);
    const normalized = messages.map(({ from, body }) => ({ from, body }));
    let messagingParticipantProfileUrl;
    let messagingParticipantName;
    for (const item of included) {
      if (item?.publicIdentifier && item?.firstName) {
        messagingParticipantProfileUrl = `https://www.linkedin.com/in/${item.publicIdentifier}/`;
        messagingParticipantName = [item.firstName, item.lastName].filter(Boolean).join(" ");
        break;
      }
    }
    const oldestCreatedAt = messages[0]?.createdAt || 0;
    return {
      messagingThreadId: threadId,
      messagingParticipantProfileUrl,
      messagingParticipantName,
      messagingMessages: normalized,
      captureMethod: "voyager",
      oldestCreatedAt,
    };
  }

  async function fetchVoyagerThreadPage(conversationKey, beforeCreatedAt) {
    const base =
      `https://www.linkedin.com/voyager/api/messaging/conversations/${encodeURIComponent(conversationKey)}/events` +
      "?keyVersion=LEGACY_INBOX&q=events&count=80";
    const url =
      beforeCreatedAt && beforeCreatedAt > 0
        ? `${base}&createdBefore=${beforeCreatedAt}`
        : base;
    const resp = await fetch(url, { headers, credentials: "include" });
    if (!resp.ok) return null;
    const json = await resp.json();
    return parseVoyagerMessages(json, threadId);
  }

  async function fetchGraphQLMessages(conversationUrn) {
    const QUERY_ID = "messengerMessages.21eabeb3ee872254060ef21b793ea7d0";
    const gqlHeaders = {
      ...headers,
      Accept: "application/graphql",
      "x-li-page-instance": "urn:li:page:d_flagship3_messaging",
    };
    const variables = `(conversationUrn:${conversationUrn},count:50)`;
    const url =
      `https://www.linkedin.com/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${QUERY_ID}&variables=${encodeURIComponent(variables)}`;
    try {
      const resp = await fetch(url, { headers: gqlHeaders, credentials: "include" });
      if (!resp.ok) return null;
      const json = await resp.json();
      return parseVoyagerMessages(json, threadId);
    } catch {
      return null;
    }
  }

  async function buildConversationUrnIfNeeded(resolved) {
    if (resolved.conversationUrn?.startsWith("urn:li:msg_conversation:")) {
      return resolved.conversationUrn;
    }
    if (!resolved.threadId || !/^2-/.test(resolved.threadId)) return resolved.conversationUrn;
    try {
      const resp = await fetch("https://www.linkedin.com/voyager/api/me", {
        headers,
        credentials: "include",
      });
      if (!resp.ok) return resolved.conversationUrn;
      const json = await resp.json();
      const included = Array.isArray(json?.included) ? json.included : [];
      let profileUrn;
      for (const item of included) {
        const urn = item?.entityUrn || item?.dashEntityUrn;
        if (typeof urn === "string" && urn.includes("fsd_profile")) {
          profileUrn = urn;
          break;
        }
      }
      profileUrn =
        profileUrn ||
        json?.data?.entityUrn ||
        json?.miniProfile?.dashEntityUrn ||
        json?.miniProfile?.entityUrn;
      if (profileUrn) {
        return `urn:li:msg_conversation:(${profileUrn},${resolved.threadId})`;
      }
    } catch {
      /* ignore */
    }
    return resolved.conversationUrn;
  }

  const deadline = Date.now() + 8000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const list = findMessagingScrollContainer();
  if (list) {
    for (let i = 0; i < 8 && Date.now() < deadline; i++) {
      list.scrollTop = list.scrollHeight;
      await sleep(450);
      list.scrollTop = 0;
      await sleep(350);
    }
    list.scrollTop = list.scrollHeight;
    await sleep(400);
  }

  const resolved = resolveMessagingThreadIdFromDom();
  let threadId = resolved.threadId;
  const conversationIds = [];
  if (threadId) conversationIds.push(threadId);
  if (resolved.numericId && resolved.numericId !== threadId) {
    conversationIds.push(resolved.numericId);
  }

  let voyager = null;
  const headers = voyagerHeaders();
  const conversationUrn = await buildConversationUrnIfNeeded(resolved);

  if (headers["csrf-token"]) {
    if (conversationUrn?.startsWith("urn:li:msg_conversation:")) {
      voyager = await fetchGraphQLMessages(conversationUrn);
    }

    for (const convKey of conversationIds) {
      if (voyager?.messagingMessages?.length) break;
      let mergedPage = null;
      let before = 0;
      for (let page = 0; page < 4; page++) {
        const parsed = await fetchVoyagerThreadPage(convKey, before);
        if (!parsed?.messagingMessages?.length) break;
        if (!mergedPage) {
          mergedPage = parsed;
        } else {
          const seen = new Set(
            mergedPage.messagingMessages.map(
              (m) => `${m.from}:${m.body.slice(0, 100)}`,
            ),
          );
          for (const m of parsed.messagingMessages) {
            const key = `${m.from}:${m.body.slice(0, 100)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            mergedPage.messagingMessages.push(m);
          }
        }
        const nextBefore = parsed.oldestCreatedAt;
        if (!nextBefore || nextBefore === before) break;
        before = nextBefore;
        if (mergedPage.messagingMessages.length >= 240) break;
      }
      if (mergedPage?.messagingMessages?.length) {
        voyager = mergedPage;
        break;
      }
    }

    if (!voyager?.messagingMessages?.length && conversationUrn) {
      const dashUrl =
        "https://www.linkedin.com/voyager/api/voyagerMessagingDashMessengerMessages" +
        `?action=execute&q=findConversation&conversationId=${encodeURIComponent(conversationUrn)}`;
      try {
        const resp = await fetch(dashUrl, { headers, credentials: "include" });
        if (resp.ok) {
          const json = await resp.json();
          const parsed = parseVoyagerMessages(json, threadId);
          if (parsed?.messagingMessages?.length) voyager = parsed;
        }
      } catch {
        /* ignore */
      }
    }
  }

  const domResult = scrapeMessagingThread();
  return { voyager, dom: domResult };
}

/**
 * Page world — scroll thread to load older messages before scrape.
 */
async function prepMessagingThreadForScrape(maxMs) {
  const deadline = Date.now() + (maxMs || 8000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const list = findMessagingScrollContainer();
  if (!list) return { prepped: false };
  for (let i = 0; i < 10 && Date.now() < deadline; i++) {
    list.scrollTop = list.scrollHeight;
    await sleep(500);
    list.scrollTop = 0;
    await sleep(400);
  }
  list.scrollTop = list.scrollHeight;
  await sleep(350);
  return { prepped: true };
}

/** Page world — Voyager messaging events for open thread (self-contained for injection). */
async function fetchMessagingViaVoyagerPage() {
  function voyagerHeaders() {
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const jsession = cookies.find((c) => c.startsWith("JSESSIONID="));
    const csrf =
      jsession?.split("=")[1]?.replace(/^"|"$/g, "")?.trim() || "";
    return {
      "csrf-token": csrf,
      "x-restli-protocol-version": "2.0.0",
      accept: "application/vnd.linkedin.normalized+json+2.1",
    };
  }

  function parsePayload(json, threadId) {
    const included = Array.isArray(json?.included) ? json.included : [];
    const messages = [];
    const seen = new Set();
    function pushMsg(from, body) {
      const b = String(body || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!b || b.length < 2) return;
      const key = `${from}:${b.slice(0, 80)}`;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({ from, body: b.slice(0, 20_000) });
    }
    for (const item of included) {
      const type = item?.$type || "";
      if (!/Event|Message|messaging/i.test(type)) continue;
      const body =
        item?.eventContent?.attributedBody?.text ||
        item?.eventContent?.messageBody?.text ||
        item?.body?.text ||
        item?.messageBody?.text ||
        (typeof item?.body === "string" ? item.body : undefined) ||
        item?.text?.text;
      if (!body) continue;
      let from = "unknown";
      if (item?.fromSelf === true) from = "me";
      else if (item?.fromSelf === false) from = "them";
      pushMsg(from, body);
    }
    if (messages.length === 0) return null;
    let messagingParticipantProfileUrl;
    let messagingParticipantName;
    for (const item of included) {
      if (item?.publicIdentifier && item?.firstName) {
        messagingParticipantProfileUrl = `https://www.linkedin.com/in/${item.publicIdentifier}/`;
        messagingParticipantName = [item.firstName, item.lastName]
          .filter(Boolean)
          .join(" ");
        break;
      }
    }
    return {
      messagingThreadId: threadId,
      messagingParticipantProfileUrl,
      messagingParticipantName,
      messagingMessages: messages,
    };
  }

  const headers = voyagerHeaders();
  if (!headers["csrf-token"]) return null;

  let threadId;
  const resolved = resolveMessagingThreadIdFromDom();
  threadId = resolved.threadId;
  if (!threadId) return null;

  const conversationKeys = [threadId];
  if (resolved.numericId && resolved.numericId !== threadId) {
    conversationKeys.push(resolved.numericId);
  }

  for (const convKey of conversationKeys) {
    const urls = [
      `https://www.linkedin.com/voyager/api/messaging/conversations/${encodeURIComponent(convKey)}/events?keyVersion=LEGACY_INBOX&q=events&count=50`,
      `https://www.linkedin.com/voyager/api/voyagerMessagingDashMessengerMessages?action=execute&q=findConversation&conversationId=${encodeURIComponent(convKey)}`,
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { headers, credentials: "include" });
        if (!resp.ok) continue;
        const json = await resp.json();
        const parsed = parsePayload(json, threadId);
        if (parsed?.messagingMessages?.length) {
          return { ...parsed, captureMethod: "voyager" };
        }
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function parseVoyagerMessagingPayload(json, threadId) {
  const included = Array.isArray(json?.included) ? json.included : [];
  const messages = [];
  const seen = new Set();

  function pushMsg(from, body) {
    const b = String(body || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!b || b.length < 2) return;
    const key = `${from}:${b.slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);
    messages.push({ from, body: b.slice(0, 20_000) });
  }

  for (const item of included) {
    const type = item?.$type || "";
    if (!/Event|Message|messaging/i.test(type)) continue;

    const body =
      item?.eventContent?.attributedBody?.text ||
      item?.eventContent?.messageBody?.text ||
      item?.body?.text ||
      item?.messageBody?.text ||
      (typeof item?.body === "string" ? item.body : undefined) ||
      item?.text?.text;
    if (!body) continue;

    let from = "unknown";
    if (
      item?.fromSelf === true ||
      /sent|outgoing|self/i.test(String(item?.actorType || item?.senderType || ""))
    ) {
      from = "me";
    } else if (
      item?.fromSelf === false ||
      /received|incoming/i.test(String(item?.actorType || ""))
    ) {
      from = "them";
    } else if (/MessageEvent/i.test(type)) {
      from = item?.from?.includes?.("urn:li:fsd_profile") ? "them" : "unknown";
    }

    pushMsg(from, body);
  }

  if (messages.length === 0 && Array.isArray(json?.elements)) {
    for (const el of json.elements) {
      const body = el?.text?.text || el?.body;
      if (body) pushMsg("unknown", body);
    }
  }

  if (messages.length === 0) return null;

  let messagingParticipantProfileUrl;
  let messagingParticipantName;
  for (const item of included) {
    if (item?.publicIdentifier && item?.firstName) {
      messagingParticipantProfileUrl = `https://www.linkedin.com/in/${item.publicIdentifier}/`;
      messagingParticipantName = [item.firstName, item.lastName]
        .filter(Boolean)
        .join(" ");
      break;
    }
  }

  return {
    messagingThreadId: threadId,
    messagingParticipantProfileUrl,
    messagingParticipantName,
    messagingMessages: messages,
  };
}

/** Service worker — merge Voyager + DOM messaging captures. */
function mergeMessagingExtractions(voyager, domResult, opts) {
  const dom = domResult?.extractedFields || {};
  const domEf = domResult || {};
  const expectedVanity = opts?.expectedProfileVanity || null;

  function urlMatchesExpected(url) {
    if (!expectedVanity || !url) return false;
    return linkedinVanityFromUrl(url) === expectedVanity;
  }

  const urlCandidates = [
    voyager?.messagingParticipantProfileUrl,
    dom.messagingParticipantProfileUrl,
  ].filter(Boolean);
  let pickUrl = urlCandidates[0];
  if (expectedVanity) {
    const preferred = urlCandidates.find((u) => urlMatchesExpected(u));
    if (preferred) pickUrl = preferred;
    else if (opts?.fallbackProfileUrl) pickUrl = opts.fallbackProfileUrl;
  }

  const nameCandidates = [
    voyager?.messagingParticipantName,
    dom.messagingParticipantName,
  ].filter(Boolean);
  const pickName = nameCandidates[0];
  const threadId =
    voyager?.messagingThreadId ||
    dom.messagingThreadId ||
    domEf.messagingThreadId;

  const mergedMsgs = [];
  const seen = new Set();
  for (const src of [
    voyager?.messagingMessages,
    dom.messagingMessages,
  ]) {
    if (!Array.isArray(src)) continue;
    for (const m of src) {
      if (!m?.body) continue;
      const key = `${m.from}:${m.body.slice(0, 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mergedMsgs.push({
        from: m.from === "me" || m.from === "them" ? m.from : "unknown",
        body: String(m.body).slice(0, 20_000),
      });
    }
  }

  const extractedFields = {
    messagingParticipantProfileUrl: pickUrl,
    messagingThreadId: threadId,
    messagingParticipantName: pickName,
    messagingMessages: mergedMsgs,
  };
  const fieldPresence = {
    messagingParticipantProfileUrl: Boolean(pickUrl),
    messagingMessages: mergedMsgs.length > 0,
  };
  const methods = [voyager?.captureMethod, "dom"].filter(Boolean);

  return {
    schemaVersion: "1",
    pageType: "messaging",
    sourceUrl: domResult?.sourceUrl || "",
    capturedAt: new Date().toISOString(),
    confidence:
      mergedMsgs.length >= 3
        ? 0.9
        : mergedMsgs.length > 0
          ? 0.7
          : 0.3,
    extractedFields,
    fieldPresence,
    captureMethods: methods,
  };
}

async function scrapeMessagingFromTab(tabId) {
  const outreachCtx = await getLastOutreachMemberContext();
  const expectedProfileVanity = linkedinVanityFromUrl(outreachCtx?.linkedinUrl);
  const mergeOpts = {
    expectedProfileVanity,
    fallbackProfileUrl: outreachCtx?.linkedinUrl || undefined,
  };

  const runCapture = async () => {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: captureMessagingBundleInPage,
    });
    return injected[0]?.result;
  };

  const mergeBundle = (bundle) => {
    if (!bundle?.dom && !bundle?.voyager) return undefined;
    const merged = mergeMessagingExtractions(bundle.voyager, bundle.dom, mergeOpts);
    const threadId = merged.extractedFields?.messagingThreadId;
    if (bundle.dom?.sourceUrl) merged.sourceUrl = bundle.dom.sourceUrl;
    else if (threadId) {
      merged.sourceUrl = `https://www.linkedin.com/messaging/thread/${encodeURIComponent(threadId)}/`;
    }
    return merged;
  };

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: prepMessagingThreadForScrape,
      args: [8000],
    });
    await sleep(2000);

    let bundle = await runCapture();
    let merged = mergeBundle(bundle);
    if (merged?.extractedFields?.messagingMessages?.length) return merged;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: prepMessagingThreadForScrape,
      args: [6000],
    });
    await sleep(2500);
    bundle = await runCapture();
    return mergeBundle(bundle);
  } catch {
    return undefined;
  }
}

/**
 * Page world — scroll profile activity / recent-activity feed.
 */
async function prepProfilePostsForScrape(maxMs) {
  const deadline = Date.now() + (maxMs || 8000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const activityAnchor =
    document.getElementById("content_collections") ||
    document.querySelector('[id*="recent-activity"]') ||
    document.querySelector('[componentkey*="Activity"]');

  if (activityAnchor) {
    activityAnchor.scrollIntoView({ behavior: "instant", block: "start" });
    await sleep(500);
  }

  for (let i = 0; i < 8 && Date.now() < deadline; i++) {
    window.scrollBy({
      top: Math.min(900, window.innerHeight || 800),
      behavior: "instant",
    });
    await sleep(450);
  }
  return { prepped: true };
}

function resolveProfileUrnFromVoyagerJson(json) {
  const included = Array.isArray(json?.included) ? json.included : [];
  for (const item of included) {
    const urn = item?.entityUrn;
    if (typeof urn === "string" && urn.includes("fsd_profile")) return urn;
  }
  const data = json?.data;
  if (data?.entityUrn?.includes?.("fsd_profile")) return data.entityUrn;
  if (typeof data === "object" && data["*elements"]?.[0]) {
    return data["*elements"][0];
  }
  return null;
}

async function resolveProfileUrnForPage(vanity) {
  if (!vanity) return null;
  const headers = linkedInVoyagerHeaders();
  if (!headers["csrf-token"]) return null;
  const decorationId =
    "com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-16";
  const url =
    "https://www.linkedin.com/voyager/api/identity/dash/profiles" +
    `?q=memberIdentity&memberIdentity=${encodeURIComponent(vanity)}` +
    `&decorationId=${encodeURIComponent(decorationId)}`;
  try {
    const resp = await fetch(url, { headers, credentials: "include" });
    if (!resp.ok) return null;
    const json = await resp.json();
    return resolveProfileUrnFromVoyagerJson(json);
  } catch {
    return null;
  }
}

function parseVoyagerProfilePosts(json) {
  const included = Array.isArray(json?.included) ? json.included : [];
  const posts = [];
  const seen = new Set();

  for (const item of included) {
    const type = item?.$type || "";
    if (
      !/Update|Share|Activity|Feed/i.test(type) &&
      !item?.commentary &&
      !item?.message
    ) {
      continue;
    }
    const post = voyagerItemToProfilePost(item, included);
    if (!post) continue;
    const key = `${post.postKind || "o"}:${(post.userComment || post.text).slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push(post);
    if (posts.length >= 25) break;
  }

  return posts.length ? posts : null;
}

function trimPostField(s, max) {
  if (!s) return undefined;
  const t = String(s).replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

function findVoyagerIncluded(included, ref) {
  if (!ref || !Array.isArray(included)) return null;
  const urn =
    typeof ref === "string"
      ? ref
      : ref?.entityUrn || ref?.updateUrn || ref?.["*update"];
  if (typeof urn !== "string") return null;
  return (
    included.find(
      (x) =>
        x?.entityUrn === urn ||
        x?.updateUrn === urn ||
        (typeof x?.entityUrn === "string" && urn.includes(x.entityUrn)),
    ) || null
  );
}

function extractVoyagerPostText(item) {
  if (!item || typeof item !== "object") return undefined;
  return (
    item?.commentary?.text?.text ||
    item?.commentary?.text ||
    item?.message?.text ||
    (typeof item?.text === "string" ? item.text : undefined)
  );
}

function extractVoyagerArticleMeta(item) {
  if (!item || typeof item !== "object") {
    return {
      sharedTitle: undefined,
      sharedExcerpt: undefined,
      sharedSource: undefined,
    };
  }
  const content = item?.content || item?.article || {};
  const title =
    content?.title?.text ||
    content?.title ||
    item?.article?.title?.text ||
    item?.articleComponent?.title?.text;
  const excerpt =
    content?.subtitle?.text ||
    content?.description?.text ||
    item?.article?.description?.text;
  const source =
    content?.source?.text ||
    item?.article?.source?.text ||
    item?.provider?.name;
  return {
    sharedTitle: trimPostField(title, 500),
    sharedExcerpt: trimPostField(excerpt, 2000),
    sharedSource: trimPostField(source, 200),
  };
}

function voyagerItemToProfilePost(item, included) {
  const commentary = trimPostField(extractVoyagerPostText(item), 4000);
  const reshareRef = item?.resharedUpdate || item?.["*resharedUpdate"];
  const reshared = reshareRef
    ? findVoyagerIncluded(included, reshareRef)
    : null;
  const articleFromReshare = reshared
    ? extractVoyagerArticleMeta(reshared)
    : { sharedTitle: undefined, sharedExcerpt: undefined, sharedSource: undefined };
  const articleFromSelf = extractVoyagerArticleMeta(item);
  const sharedTitle =
    articleFromReshare.sharedTitle || articleFromSelf.sharedTitle;
  const sharedExcerpt =
    articleFromReshare.sharedExcerpt || articleFromSelf.sharedExcerpt;
  const sharedSource =
    articleFromReshare.sharedSource || articleFromSelf.sharedSource;
  const hasArticle = Boolean(sharedTitle);
  const isReshare = Boolean(
    reshared || /reshared|repost/i.test(String(item?.$type || "")),
  );
  let postKind = "original";
  if (isReshare && hasArticle) postKind = "news_share";
  else if (isReshare || (hasArticle && !commentary)) postKind = "reshare";
  else if (hasArticle && commentary) postKind = "news_share";

  const text =
    commentary ||
    sharedTitle ||
    trimPostField(extractVoyagerPostText(reshared || item), 12000);
  if (!text || text.length < 8) return null;

  const sub = item?.subDescription?.text || item?.actor?.subDescription?.text;
  return {
    text: text.slice(0, 12_000),
    postKind,
    ...(commentary && postKind !== "original" ? { userComment: commentary } : {}),
    ...(sharedTitle ? { sharedTitle } : {}),
    ...(sharedExcerpt ? { sharedExcerpt } : {}),
    ...(sharedSource ? { sharedSource } : {}),
    ...(typeof sub === "string" ? { ageLabel: sub.trim().slice(0, 120) } : {}),
  };
}

/** Page world — member share feed via Voyager (self-contained for injection). */
async function fetchPostsViaVoyagerPage() {
  function voyagerHeaders() {
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const jsession = cookies.find((c) => c.startsWith("JSESSIONID="));
    const csrf =
      jsession?.split("=")[1]?.replace(/^"|"$/g, "")?.trim() || "";
    return {
      "csrf-token": csrf,
      "x-restli-protocol-version": "2.0.0",
      accept: "application/vnd.linkedin.normalized+json+2.1",
    };
  }

  function vanityFromUrl() {
    try {
      const parts = new URL(window.location.href).pathname
        .split("/")
        .filter(Boolean);
      if (parts[0] === "in" && parts[1]) return decodeURIComponent(parts[1]);
    } catch {
      /* ignore */
    }
    return null;
  }

  function vanityFromActorLinks() {
    const selectors = [
      ".update-components-actor__meta-link",
      ".feed-shared-actor__container-link",
      'a[href*="/in/"][class*="actor"]',
      'a[href*="/in/"]',
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!(el instanceof HTMLAnchorElement) || !el.pathname) continue;
        const m = el.pathname.match(/\/in\/([^/]+)/i);
        if (!m?.[1]) continue;
        const slug = decodeURIComponent(m[1]).toLowerCase();
        if (slug === "feed" || slug === "company" || slug === "school") continue;
        return decodeURIComponent(m[1]);
      }
    }
    return null;
  }

  function parsePosts(json) {
    const included = Array.isArray(json?.included) ? json.included : [];
    const posts = [];
    const seen = new Set();
    for (const item of included) {
      const type = item?.$type || "";
      if (
        !/Update|Share|Activity|Feed/i.test(type) &&
        !item?.commentary &&
        !item?.message
      ) {
        continue;
      }
      const post = voyagerItemToProfilePost(item, included);
      if (!post) continue;
      const key = `${post.postKind || "o"}:${(post.userComment || post.text).slice(0, 120)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      posts.push(post);
      if (posts.length >= 25) break;
    }
    return posts.length ? posts : null;
  }

  async function resolveUrn(vanity, headers) {
    const decorationId =
      "com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-16";
    const url =
      "https://www.linkedin.com/voyager/api/identity/dash/profiles" +
      `?q=memberIdentity&memberIdentity=${encodeURIComponent(vanity)}` +
      `&decorationId=${encodeURIComponent(decorationId)}`;
    try {
      const resp = await fetch(url, { headers, credentials: "include" });
      if (!resp.ok) return null;
      const json = await resp.json();
      const included = Array.isArray(json?.included) ? json.included : [];
      for (const item of included) {
        const urn = item?.entityUrn;
        if (typeof urn === "string" && urn.includes("fsd_profile")) return urn;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  const vanity = vanityFromUrl() || vanityFromActorLinks();
  if (!vanity) return null;
  const headers = voyagerHeaders();
  if (!headers["csrf-token"]) return null;

  const profileUrn = await resolveUrn(vanity, headers);
  if (!profileUrn) return null;

  const urls = [
    `https://www.linkedin.com/voyager/api/identity/profileUpdatesV2?count=20&includeLongTermHistory=true&profileUrn=${encodeURIComponent(profileUrn)}&q=memberShareFeed`,
    `https://www.linkedin.com/voyager/api/feed/updates?profileUrn=${encodeURIComponent(profileUrn)}&q=memberShareFeed&count=20`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers, credentials: "include" });
      if (!resp.ok) continue;
      const json = await resp.json();
      const profilePosts = parsePosts(json);
      if (profilePosts?.length) {
        return {
          targetProfileUrl: `https://www.linkedin.com/in/${vanity}/`,
          profilePosts,
          captureMethod: "voyager",
        };
      }
    } catch {
      /* next */
    }
  }
  return null;
}

/** Page world — visible activity cards on profile / recent-activity. */
function scrapeVisibleProfilePosts() {
  function clean(s) {
    if (!s) return undefined;
    const t = String(s).replace(/\s+/g, " ").trim();
    return t.length ? t : undefined;
  }

  function extractPostFromActivityCard(card) {
    const cardText = String(card.innerText || "");
    const headerText = clean(
      card.querySelector(
        ".update-components-header__text-view, .feed-shared-actor__description, .update-components-actor__description, [class*='feed-shared-actor']",
      )?.innerText,
    );
    const articleEl = card.querySelector(
      ".update-components-article, .feed-shared-article, [class*='feed-shared-article'], [class*='update-components-article']",
    );
    const isReshare =
      /reposted this|shared this|a republié|a partagé|republié cette|shared an article/i.test(
        `${headerText || ""} ${cardText.slice(0, 400)}`,
      ) || Boolean(articleEl);

    const userComment = clean(
      card.querySelector(
        ".feed-shared-update-v2__commentary .feed-shared-text, .update-components-update-v2__commentary .update-components-text",
      )?.innerText ||
        (!articleEl
          ? card.querySelector(".feed-shared-text, .update-components-text")
              ?.innerText
          : card.querySelector(
              ".feed-shared-update-v2__commentary .feed-shared-text, .update-components-text",
            )?.innerText),
    );
    const sharedTitle = clean(
      card.querySelector(
        ".update-components-article__title, .feed-shared-article__title, [class*='article__title']",
      )?.innerText,
    );
    const sharedExcerpt = clean(
      card.querySelector(
        ".update-components-article__subtitle, .feed-shared-article__subtitle, [class*='article__description']",
      )?.innerText,
    );
    const sharedSource = clean(
      card.querySelector(
        ".update-components-article__meta, .feed-shared-article__meta, [class*='article__meta']",
      )?.innerText,
    );

    let postKind = "original";
    if (isReshare && sharedTitle) postKind = "news_share";
    else if (isReshare) postKind = "reshare";

    let text =
      userComment ||
      sharedTitle ||
      clean(
        card.querySelector(".feed-shared-text, .update-components-text")
          ?.innerText,
      );
    if (!text || text.length < 12) return null;
    if (/^(like|comment|repost|send)\b/i.test(text)) return null;

    const ageM = cardText.match(
      /(\d+\s*(?:j|d|w|mo|yr|h|min|semaines?|jours?|mois|ans)\b.*|\d{1,2}\s+[a-zéû]+(?:\s+\d{4})?)/i,
    );

    return {
      text: text.slice(0, 12_000),
      postKind,
      ...(userComment && postKind !== "original" ? { userComment } : {}),
      ...(sharedTitle ? { sharedTitle } : {}),
      ...(sharedExcerpt ? { sharedExcerpt } : {}),
      ...(sharedSource ? { sharedSource } : {}),
      ...(ageM?.[0] ? { ageLabel: ageM[0].trim().slice(0, 120) } : {}),
    };
  }

  let vanity;
  try {
    const parts = new URL(window.location.href).pathname
      .split("/")
      .filter(Boolean);
    if (parts[0] === "in" && parts[1]) vanity = decodeURIComponent(parts[1]);
  } catch {
    /* ignore */
  }
  if (!vanity) {
    for (const el of document.querySelectorAll(
      ".update-components-actor__meta-link, .feed-shared-actor__container-link, a[href*='/in/']",
    )) {
      if (!(el instanceof HTMLAnchorElement) || !el.pathname) continue;
      const m = el.pathname.match(/\/in\/([^/]+)/i);
      if (!m?.[1]) continue;
      const slug = decodeURIComponent(m[1]).toLowerCase();
      if (slug === "feed" || slug === "company" || slug === "school") continue;
      vanity = decodeURIComponent(m[1]);
      break;
    }
  }
  const targetProfileUrl = vanity
    ? `https://www.linkedin.com/in/${vanity}/`
    : undefined;
  const sourceUrl = window.location.href;
  const posts = [];
  const seen = new Set();

  const cardSelectors = [
    ".feed-shared-update-v2",
    "[data-urn*='urn:li:activity']",
    ".profile-creator-shared-feed-update__container",
    "div[class*='feed-shared-update']",
  ];

  const cards = new Set();
  for (const sel of cardSelectors) {
    document.querySelectorAll(sel).forEach((el) => {
      if (cards.size >= 30) return;
      const t = clean(el.innerText);
      if (!t || t.length < 40 || t.length > 15_000) return;
      cards.add(el);
    });
  }

  for (const card of cards) {
    if (posts.length >= 20) break;
    const post = extractPostFromActivityCard(card);
    if (!post) continue;
    const key = `${post.postKind || "o"}:${(post.userComment || post.text).slice(0, 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push(post);
  }

  const fieldPresence = {
    profilePosts: posts.length > 0,
    targetProfileUrl: Boolean(targetProfileUrl),
  };

  return {
    schemaVersion: "1",
    pageType: "posts",
    sourceUrl,
    capturedAt: new Date().toISOString(),
    confidence: posts.length >= 3 ? 0.85 : posts.length > 0 ? 0.65 : 0.2,
    extractedFields: {
      targetProfileUrl,
      profilePosts: posts,
    },
    fieldPresence,
  };
}

function mergePostsExtractions(voyager, domResult) {
  const dom = domResult?.extractedFields || {};
  const targetProfileUrl =
    voyager?.targetProfileUrl || dom.targetProfileUrl || domResult?.sourceUrl;
  const merged = [];
  const seen = new Set();
  for (const src of [voyager?.profilePosts, dom.profilePosts]) {
    if (!Array.isArray(src)) continue;
    for (const p of src) {
      const text = String(p?.text || "").trim();
      if (!text || text.length < 8) continue;
      const key = text.slice(0, 100);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        text: text.slice(0, 12_000),
        ...(p.ageLabel ? { ageLabel: String(p.ageLabel).slice(0, 120) } : {}),
        ...(p.postKind ? { postKind: p.postKind } : {}),
        ...(p.userComment
          ? { userComment: String(p.userComment).slice(0, 4000) }
          : {}),
        ...(p.sharedTitle
          ? { sharedTitle: String(p.sharedTitle).slice(0, 500) }
          : {}),
        ...(p.sharedExcerpt
          ? { sharedExcerpt: String(p.sharedExcerpt).slice(0, 2000) }
          : {}),
        ...(p.sharedSource
          ? { sharedSource: String(p.sharedSource).slice(0, 200) }
          : {}),
        ...(p.postUrl ? { postUrl: p.postUrl } : {}),
      });
      if (merged.length >= 25) break;
    }
  }

  const fieldPresence = {
    profilePosts: merged.length > 0,
    targetProfileUrl: Boolean(targetProfileUrl),
  };

  return {
    schemaVersion: "1",
    pageType: "posts",
    sourceUrl: domResult?.sourceUrl,
    capturedAt: new Date().toISOString(),
    confidence: merged.length >= 3 ? 0.88 : merged.length > 0 ? 0.68 : 0.2,
    extractedFields: {
      targetProfileUrl,
      profilePosts: merged,
    },
    fieldPresence,
    captureMethods: [voyager?.captureMethod, "dom"].filter(Boolean),
  };
}

async function scrapePostsFromTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: prepProfilePostsForScrape,
      args: [8000],
    });
  } catch {
    /* best-effort */
  }

  let voyager = null;
  try {
    const v = await chrome.scripting.executeScript({
      target: { tabId },
      func: fetchPostsViaVoyagerPage,
    });
    voyager = v[0]?.result ?? null;
  } catch {
    /* ignore */
  }

  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeVisibleProfilePosts,
  });
  const domResult = injected[0]?.result;
  if (!domResult && !voyager) return undefined;
  const merged = mergePostsExtractions(voyager, domResult);
  if (domResult?.sourceUrl) merged.sourceUrl = domResult.sourceUrl;
  return merged;
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

/**
 * Page world — messaging inbox list snapshot (DOM tiles + optional Voyager).
 */
async function scrapeMessagingInboxSnapshotInPage() {
  const kind = "linkedin_messages_inbox_visible";
  const sourceUrl = window.location.href;
  const capturedAt = new Date().toISOString();

  function clean(s) {
    if (!s) return "";
    return String(s).replace(/\s+/g, " ").trim();
  }

  function profileUrlFromTile(el) {
    const links = el.querySelectorAll('a[href*="/in/"]');
    for (const a of links) {
      const raw = a.getAttribute("href");
      if (!raw || raw.includes("/edit/")) continue;
      try {
        const abs = new URL(raw, "https://www.linkedin.com");
        const m = abs.pathname.match(/^\/in\/([^/?#]+)\/?/i);
        if (m?.[1] && m[1].toLowerCase() !== "me") {
          return `https://www.linkedin.com/in/${m[1]}/`;
        }
      } catch {
        continue;
      }
    }
    return undefined;
  }

  function findMessagingListRoot() {
    const selectors = [
      "ul.msg-conversations-container__conversations-list",
      ".msg-conversations-container",
      "[class*='msg-conversations-container']",
      "[data-test-messaging-conversations-list]",
      "[class*='msg-thread-list']",
      "[class*='messaging-inbox']",
      "aside [class*='msg-conversations']",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    if (/\/messaging/i.test(sourceUrl)) {
      const main = document.querySelector("main");
      const nested =
        main?.querySelector("ul.msg-conversations-container__conversations-list") ||
        main?.querySelector("[class*='conversation-list']") ||
        main?.querySelector("[class*='msg-conversation']");
      if (nested) return nested;
    }
    return null;
  }

  function parseConversationTileElement(el) {
    function pickText(selectors) {
      for (const sel of selectors) {
        const node = el.querySelector(sel);
        const t = clean(node?.textContent || "");
        if (t) return t;
      }
      return undefined;
    }

    function nameFromCheckboxLabel(root) {
      const label = root.querySelector(
        "label.msg-selectable-entity__checkbox-label[aria-label]",
      );
      const aria = label?.getAttribute("aria-label") || "";
      const fr = aria.match(
        /S[ée]lectionner la conversation avec\s+([A-ZÀ-ÖØ-Þ][^.!?]+?)(?:\s*$|[.!?,])/i,
      );
      if (fr?.[1]) return clean(fr[1]);
      const en = aria.match(
        /Select conversation with\s+([A-ZÀ-ÖØ-Þ][^.!?]+?)(?:\s*$|[.!?,])/i,
      );
      if (en?.[1]) return clean(en[1]);
      return undefined;
    }

    function isTimeLine(s) {
      return /^\d{1,2}:\d{2}$/.test(String(s || "").trim());
    }

    function normalizeSnippet(text, participantName) {
      if (!text) return undefined;
      const t = clean(text);
      const vous = t.match(/^(Vous|You)\s*:\s*(.+)$/i);
      if (vous?.[2]) return { preview: vous[2].trim(), fromMe: true };
      const named = t.match(/^([A-ZÀ-ÖØ-Þ][\wÀ-ÿ'.-]+)\s*:\s*(.+)$/);
      if (named?.[2]) {
        const tag = named[1].trim();
        const body = named[2].trim();
        const full = participantName || "";
        const fromThem =
          full &&
          (full.toLowerCase().startsWith(tag.toLowerCase()) ||
            tag.toLowerCase() === full.split(/\s+/)[0]?.toLowerCase());
        return { preview: body, fromMe: !fromThem && /^(vous|you)$/i.test(tag) };
      }
      return { preview: t, fromMe: /^(Vous|You)\s*:/i.test(t) };
    }

    const card =
      el.classList?.contains("msg-conversation-card")
        ? el
        : el.querySelector(".msg-conversation-card") || el;

    const participantName =
      pickText([
        ".msg-conversation-listitem__participant-names span",
        ".msg-conversation-listitem__participant-names",
        ".msg-conversation-card__participant-names span",
        ".msg-conversation-card__participant-names",
        "h3",
      ]) ||
      nameFromCheckboxLabel(card) ||
      clean(card.querySelector(".presence-entity__image[alt]")?.getAttribute("alt"));

    const snippetRaw =
      pickText([
        "p.msg-conversation-card__message-snippet",
        ".msg-conversation-card__message-snippet",
      ]) || undefined;

    const timeLabel =
      pickText([
        "time.msg-conversation-listitem__time-stamp",
        "time.msg-conversation-card__time-stamp",
        "time",
      ]) || undefined;

    const snippetNorm = normalizeSnippet(snippetRaw, participantName);
    let preview = snippetNorm?.preview;
    let fromMe = snippetNorm?.fromMe ?? false;

    const rawText = clean(card.innerText || el.innerText);
    const unread =
      /\bunread\b/i.test(rawText) ||
      card.classList?.contains("msg-conversation-card--unread");

    if (!preview && rawText) {
      const lines = rawText.split(/\n/).map(clean).filter(Boolean);
      for (const line of lines) {
        if (line === participantName || isTimeLine(line)) continue;
        if (/^(Appuyez|Press|Le statut|Status|S[ée]lectionner|Ouvrir la liste)/i.test(line)) {
          continue;
        }
        const norm = normalizeSnippet(line, participantName);
        if (norm?.preview && norm.preview.length >= 4) {
          preview = norm.preview;
          fromMe = norm.fromMe;
          break;
        }
      }
    }

    if (!preview && snippetRaw) {
      const norm = normalizeSnippet(snippetRaw, participantName);
      preview = norm?.preview;
      fromMe = norm?.fromMe ?? fromMe;
    }

    const profileUrl = profileUrlFromTile(card);
    return {
      participantName,
      preview: preview?.slice(0, 800),
      timeLabel,
      profileUrl,
      fromMe,
      unread,
      previewText: rawText.slice(0, 1200),
    };
  }

  function collectTiles(searchRoot) {
    const tiles = [];
    const seen = new Set();

    function addTile(parsed) {
      const hasContent =
        parsed.participantName ||
        parsed.preview ||
        (parsed.previewText && parsed.previewText.length >= 12);
      if (!hasContent) return;
      const key = `${parsed.participantName || "?"}:${(parsed.preview || parsed.previewText || "").slice(0, 80)}:${parsed.timeLabel || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      tiles.push(parsed);
    }

    function collectFromScope(scope) {
      if (!scope?.querySelectorAll) return 0;
      let added = 0;

      const ul =
        scope.matches?.("ul.msg-conversations-container__conversations-list")
          ? scope
          : scope.querySelector("ul.msg-conversations-container__conversations-list");
      const listRoot = ul || scope;

      listRoot.querySelectorAll("li.msg-conversation-listitem").forEach((el) => {
        if (tiles.length >= 160) return;
        const before = tiles.length;
        addTile(parseConversationTileElement(el));
        if (tiles.length > before) added += 1;
      });
      if (added > 0) return added;

      scope.querySelectorAll(".msg-conversation-card").forEach((el) => {
        if (tiles.length >= 160) return;
        const before = tiles.length;
        addTile(parseConversationTileElement(el));
        if (tiles.length > before) added += 1;
      });
      return added;
    }

    const scopes = [];
    const globalUl = document.querySelector(
      "ul.msg-conversations-container__conversations-list",
    );
    if (globalUl) scopes.push(globalUl);
    if (searchRoot && searchRoot !== globalUl) scopes.push(searchRoot);
    scopes.push(document);

    for (const scope of scopes) {
      if (collectFromScope(scope) > 0) break;
    }

    return tiles;
  }

  function voyagerHeaders() {
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const jsession = cookies.find((c) => c.startsWith("JSESSIONID="));
    let csrf =
      jsession?.split("=")[1]?.replace(/^"|"$/g, "")?.trim() || "";
    if (!csrf) {
      csrf =
        document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")?.trim() ||
        "";
    }
    return {
      "csrf-token": csrf,
      "x-restli-protocol-version": "2.0.0",
      accept: "application/vnd.linkedin.normalized+json+2.1",
    };
  }

  function parseVoyagerInboxList(json) {
    const included = Array.isArray(json?.included) ? json.included : [];
    const elements = Array.isArray(json?.elements) ? json.elements : [];
    const profiles = new Map();
    for (const item of included) {
      const id = item?.publicIdentifier;
      const name = [item?.firstName, item?.lastName].filter(Boolean).join(" ");
      if (id && name) {
        profiles.set(item.entityUrn || item.objectUrn || id, {
          name,
          profileUrl: `https://www.linkedin.com/in/${id}/`,
        });
      }
    }

    const tiles = [];
    const seen = new Set();
    const convs = [
      ...elements,
      ...included.filter((i) => /Conversation|conversation/i.test(i?.$type || "")),
    ];

    for (const conv of convs) {
      let preview =
        conv?.lastMessage?.text ||
        conv?.lastMessage?.body?.text ||
        conv?.events?.[0]?.body?.text ||
        conv?.eventContent?.attributedBody?.text;
      if (!preview && Array.isArray(conv?.events) && conv.events[0]) {
        preview =
          conv.events[0]?.body?.text ||
          conv.events[0]?.eventContent?.attributedBody?.text;
      }
      preview = clean(preview || "");
      if (!preview || preview.length < 2) continue;

      let participantName;
      let profileUrl;
      const parts = conv?.participants || conv["*participants"] || conv.participantUrns;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          const urn = typeof p === "string" ? p : p?.entityUrn || p?.profileUrn;
          const prof = urn ? profiles.get(urn) : null;
          if (prof) {
            participantName = prof.name;
            profileUrl = prof.profileUrl;
            break;
          }
        }
      }
      for (const item of included) {
        if (participantName) break;
        if (!/MiniProfile|Member|Profile/i.test(item?.$type || "")) continue;
        if (item?.publicIdentifier && item?.firstName) {
          participantName = [item.firstName, item.lastName].filter(Boolean).join(" ");
          profileUrl = `https://www.linkedin.com/in/${item.publicIdentifier}/`;
          break;
        }
      }

      const key = `${participantName || "?"}:${preview.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let timeLabel;
      const ts = conv?.lastActivityAt || conv?.updatedAt || conv?.createdAt;
      if (typeof ts === "number" && ts > 1e11) {
        const diffH = Math.round((Date.now() - ts) / 3_600_000);
        if (diffH < 48) timeLabel = `${diffH} h`;
      }

      const text = [participantName, preview].filter(Boolean).join("\n");
      tiles.push({
        participantName,
        preview,
        previewText: text.slice(0, 1200),
        profileUrl,
        timeLabel,
      });
      if (tiles.length >= 80) break;
    }
    return tiles.length ? tiles : null;
  }

  async function fetchInboxViaVoyager() {
    const headers = voyagerHeaders();
    if (!headers["csrf-token"]) return null;
    const urls = [
      "https://www.linkedin.com/voyager/api/messaging/conversations?keyVersion=LEGACY_INBOX&count=40",
      "https://www.linkedin.com/voyager/api/voyagerMessagingDashConversations?count=40&start=0",
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { headers, credentials: "include" });
        if (!resp.ok) continue;
        const json = await resp.json();
        const parsed = parseVoyagerInboxList(json);
        if (parsed?.length) return parsed;
      } catch {
        /* next */
      }
    }
    return null;
  }

  const listRoot = findMessagingListRoot();
  let tiles = collectTiles(listRoot || document);

  if (tiles.length === 0) {
    const voyagerTiles = await fetchInboxViaVoyager();
    if (voyagerTiles?.length) {
      return {
        kind,
        sourceUrl,
        capturedAt,
        payload: { voyagerTiles, tileCount: voyagerTiles.length },
      };
    }
  }

  if (tiles.length > 0) {
    return {
      kind,
      sourceUrl,
      capturedAt,
      payload: { tiles, tileCount: tiles.length },
    };
  }

  const onMessaging = /\/messaging/i.test(sourceUrl);
  const dumpRoot =
    document.querySelector("ul.msg-conversations-container__conversations-list") ||
    document.querySelector(".msg-conversations-container") ||
    listRoot ||
    (onMessaging ? document.querySelector("main") : null);
  let dumpText = dumpRoot ? clean(dumpRoot.innerText || "") : "";
  if (dumpText.length > 16000) dumpText = `${dumpText.slice(0, 16000)}…`;

  const note = listRoot
    ? "Conversation rows not matched — dumped messaging sidebar text for server parsing."
    : onMessaging
      ? "No messaging sidebar found — scroll the inbox list and snapshot again."
      : "Not on messaging — open linkedin.com/messaging before snapshot (feed was skipped).";

  return {
    kind,
    sourceUrl,
    capturedAt,
    payload: {
      fallbackPlainText: dumpText,
      note,
    },
  };
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
    return {
      kind,
      sourceUrl,
      capturedAt,
      payload: {
        error:
          "Use scrapeMessagingInboxSnapshotInPage() for messaging snapshots.",
      },
    };
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
  const deadline = Date.now() + (maxMs || 8000);
  function hasProfileSignal() {
    if (document.querySelector('[data-anonymize="person-name"]')) return true;
    if (document.querySelector('[data-anonymize="headline"]')) return true;
    if (document.querySelector(".text-body-medium.break-words")) return true;
    if (document.querySelector('[class*="text-body-medium"][class*="break-words"]')) {
      return true;
    }
    if (document.querySelector('[data-view-name="profile-top-card"]')) return true;
    if (document.querySelector('[data-view-name*="profile-top-card"]')) return true;
    if (document.querySelector('a[href*="/in/"] h1')) return true;
    if (document.querySelector("main h1")) return true;
    const t = document.title || "";
    if (/^[^|]+\|\s*LinkedIn/i.test(t)) return true;
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld?.textContent?.includes('"@type":"Person"')) return true;
    return false;
  }
  while (Date.now() < deadline) {
    if (hasProfileSignal()) {
      return { ready: true, waitedMs: maxMs - (deadline - Date.now()) };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { ready: false, waitedMs: maxMs };
}

/**
 * Scroll profile and expand "see more" so Experience / About lazy-load before scrape.
 */
async function prepProfilePageForScrape(maxMs) {
  const deadline = Date.now() + (maxMs || 8000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await waitForProfileDomReady(Math.min(6000, Math.max(1200, maxMs || 8000)));

  const scrollRoots = () => {
    const roots = [document.scrollingElement || document.documentElement];
    for (const el of document.querySelectorAll("main, section, div")) {
      try {
        if (!el || roots.includes(el)) continue;
        if (el.scrollHeight > el.clientHeight + 120) roots.push(el);
      } catch {
        /* ignore */
      }
    }
    return roots.slice(0, 6);
  };

  const stepScroll = (dy) => {
    for (const root of scrollRoots()) {
      try {
        if (typeof root.scrollBy === "function") {
          root.scrollBy({ top: dy, behavior: "instant" });
        } else {
          root.scrollTop = (root.scrollTop || 0) + dy;
        }
      } catch {
        /* ignore */
      }
    }
    try {
      window.scrollBy({ top: dy, behavior: "instant" });
    } catch {
      /* ignore */
    }
  };

  window.scrollTo({ top: 0, behavior: "instant" });
  await sleep(300);

  for (let i = 0; i < 10 && Date.now() < deadline; i++) {
    stepScroll(Math.min(920, window.innerHeight || 800));
    await sleep(450);
  }

  for (const el of document.querySelectorAll(
    "button, span[role='button'], a.inline-show-more-text",
  )) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (
      t &&
      /^(see more|voir plus|show more|afficher plus|see all|voir tout)$/i.test(t) &&
      t.length < 48
    ) {
      try {
        el.click();
      } catch {
        /* ignore */
      }
      await sleep(400);
      break;
    }
  }

  for (const root of scrollRoots()) {
    try {
      if (typeof root.scrollTo === "function") {
        root.scrollTo({ top: 0, behavior: "instant" });
      } else {
        root.scrollTop = 0;
      }
    } catch {
      /* ignore */
    }
  }
  window.scrollTo({ top: 0, behavior: "instant" });
  await sleep(350);
  return { prepped: true };
}

/** Page world — CSRF from session cookie (same as LinkedIn web app). */
function linkedInVoyagerHeaders() {
  const cookies = document.cookie.split(";").map((c) => c.trim());
  const jsession = cookies.find((c) => c.startsWith("JSESSIONID="));
  const csrf =
    jsession?.split("=")[1]?.replace(/^"|"$/g, "")?.trim() || "";
  return {
    "csrf-token": csrf,
    "x-restli-protocol-version": "2.0.0",
    accept: "application/vnd.linkedin.normalized+json+2.1",
  };
}

function profileVanityFromPageUrl() {
  try {
    const parts = new URL(window.location.href).pathname
      .split("/")
      .filter(Boolean);
    if (parts[0] === "in" && parts[1]) {
      return decodeURIComponent(parts[1]);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function textFromLiField(field) {
  if (!field) return undefined;
  if (typeof field === "string") return field;
  if (typeof field.text === "string") return field.text;
  return undefined;
}

/**
 * Page world — parse Voyager `included` array (identity dash / profileView).
 */
function parseVoyagerIncludedProfile(included, data) {
  if (!Array.isArray(included)) included = [];
  const out = {};

  const profile =
    included.find((i) => i?.firstName && (i.lastName != null)) ||
    included.find(
      (i) =>
        i?.publicIdentifier &&
        (i?.$type?.includes("Profile") || i?.$type?.includes("MiniProfile")),
    ) ||
    (data?.firstName ? data : null);
  let profileHeadline = "";
  if (profile) {
    const fn = [profile.firstName, profile.lastName]
      .filter((x) => x != null && String(x).trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (fn) out.fullName = fn;
    const hl = textFromLiField(profile.headline) || profile.headline;
    if (typeof hl === "string" && hl.trim()) profileHeadline = hl.trim();
    if (typeof profile.summary === "string" && profile.summary.trim()) {
      out.about = profile.summary.trim().slice(0, 12000);
    }
    if (profile.locationName) out.location = String(profile.locationName).trim();
    else if (profile.geoLocation && typeof profile.geoLocation === "object") {
      const g = profile.geoLocation;
      out.location = [g.city, g.state, g.countryCode]
        .filter(Boolean)
        .join(", ")
        .trim();
    }
  }

  function resolveCompanyName(pos) {
    if (pos.companyName) return String(pos.companyName).trim();
    const urn = pos["*company"] || pos.companyUrn;
    if (!urn) return undefined;
    const co = included.find(
      (i) =>
        i.entityUrn === urn ||
        i["*company"] === urn ||
        (i.name && String(i.entityUrn || "").includes("company")),
    );
    return co?.name ? String(co.name).trim() : undefined;
  }

  const positions = included
    .filter(
      (i) =>
        i?.$type?.includes("Position") ||
        (i?.title && (i.companyName || i["*company"])),
    )
    .map((p) => ({
      title: textFromLiField(p.title) || p.title,
      company: resolveCompanyName(p),
      raw: p,
    }));

  if (positions.length) {
    const sorted = sortPositionsCurrentFirst(positions);
    const cur = sorted[0];
    if (cur?.title) out.headline = String(cur.title).trim();
    if (cur?.company) out.company = String(cur.company).trim();
    else if (profileHeadline && !out.headline) out.headline = profileHeadline;
    out.experienceBullets = sorted
      .slice(0, 18)
      .map((p) => {
        const bits = [p.title, p.company].filter(Boolean);
        return bits.join(" · ").trim();
      })
      .filter((s) => s.length > 3);
  } else if (profileHeadline) {
    out.headline = profileHeadline;
  }

  const educations = included.filter(
    (i) =>
      i?.$type?.includes("Education") ||
      i?.schoolName ||
      (i?.school && (i.degreeName || i.fieldOfStudy)),
  );
  if (educations.length) {
    out.educationBullets = educations
      .slice(0, 12)
      .map((e) => {
        const school =
          e.schoolName ||
          textFromLiField(e.school) ||
          e.school?.name ||
          "";
        const degree = e.degreeName || e.fieldOfStudy || "";
        return [school, degree].filter(Boolean).join(" — ").trim();
      })
      .filter((s) => s.length > 3);
  }

  return Object.keys(out).length ? out : null;
}

/**
 * Page world — Voyager + BPR in one injection (must be fully self-contained).
 * Separate executeScript calls cannot see sibling functions in this file.
 */
async function fetchProfileStructuredDataPage() {
  const diagnostics = {
    vanity: null,
    csrf: false,
    voyagerStatus: null,
    bprHits: 0,
  };

  function voyagerHeaders() {
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const jsession = cookies.find((c) => c.startsWith("JSESSIONID="));
    let csrf =
      jsession?.split("=")[1]?.replace(/^"|"$/g, "")?.trim() || "";
    if (!csrf) {
      csrf =
        document
          .querySelector('meta[name="csrf-token"]')
          ?.getAttribute("content")
          ?.trim() || "";
    }
    return {
      "csrf-token": csrf,
      "x-restli-protocol-version": "2.0.0",
      accept: "application/vnd.linkedin.normalized+json+2.1",
    };
  }

  function vanityFromUrl() {
    try {
      const parts = new URL(window.location.href).pathname
        .split("/")
        .filter(Boolean);
      if (parts[0] === "in" && parts[1]) {
        return decodeURIComponent(parts[1]);
      }
      if (parts[0] === "sales" && parts[1] === "lead" && parts[2]) {
        return decodeURIComponent(parts[2]);
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function textField(field) {
    if (!field) return undefined;
    if (typeof field === "string") return field;
    if (typeof field.text === "string") return field.text;
    return undefined;
  }

  function parseIncluded(included, data) {
    if (!Array.isArray(included)) included = [];
    const out = {};

    function isCurrentPos(raw) {
      if (!raw || typeof raw !== "object") return false;
      if (raw.current === true) return true;
      const tp = raw.timePeriod || raw.dateRange;
      if (tp && typeof tp === "object") {
        const end = tp.endDate ?? tp.end;
        if (end == null) return true;
        if (typeof end === "object" && (end.year == null || end.year === 0)) {
          return true;
        }
      }
      return false;
    }

    function startYear(raw) {
      const tp = raw?.timePeriod || raw?.dateRange;
      const start = tp?.startDate ?? tp?.start;
      if (start && typeof start === "object" && start.year) return start.year;
      return 0;
    }

    function sortPositions(list) {
      return [...list].sort((a, b) => {
        const ac = isCurrentPos(a.raw) ? 1 : 0;
        const bc = isCurrentPos(b.raw) ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return startYear(b.raw) - startYear(a.raw);
      });
    }

    const profile =
      included.find((i) => i?.firstName && i.lastName != null) ||
      included.find(
        (i) =>
          i?.publicIdentifier &&
          (i?.$type?.includes("Profile") || i?.$type?.includes("MiniProfile")),
      ) ||
      (data?.firstName ? data : null);

    let profileHeadline = "";
    if (profile) {
      const fn = [profile.firstName, profile.lastName]
        .filter((x) => x != null && String(x).trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (fn) out.fullName = fn;
      const hl = textField(profile.headline) || profile.headline;
      if (typeof hl === "string" && hl.trim()) profileHeadline = hl.trim();
      if (typeof profile.summary === "string" && profile.summary.trim()) {
        out.about = profile.summary.trim().slice(0, 12000);
      }
      if (profile.locationName) {
        out.location = String(profile.locationName).trim();
      } else if (profile.geoLocation && typeof profile.geoLocation === "object") {
        const g = profile.geoLocation;
        out.location = [g.city, g.state, g.countryCode]
          .filter(Boolean)
          .join(", ")
          .trim();
      }
    }

    function companyForPosition(pos) {
      if (pos.companyName) return String(pos.companyName).trim();
      const urn = pos["*company"] || pos.companyUrn;
      if (!urn) return undefined;
      const co = included.find(
        (i) =>
          i.entityUrn === urn ||
          (i.name && String(i.entityUrn || "").includes("company")),
      );
      return co?.name ? String(co.name).trim() : undefined;
    }

    const positions = included
      .filter(
        (i) =>
          i?.$type?.includes("Position") ||
          (i?.title && (i.companyName || i["*company"])),
      )
      .map((p) => ({
        title: textField(p.title) || p.title,
        company: companyForPosition(p),
        raw: p,
      }));

    if (positions.length) {
      const sorted = sortPositions(positions);
      const cur = sorted[0];
      if (cur?.title) out.headline = String(cur.title).trim();
      if (cur?.company) out.company = String(cur.company).trim();
      else if (profileHeadline && !out.headline) out.headline = profileHeadline;
      out.experienceBullets = sorted
        .slice(0, 18)
        .map((p) => [p.title, p.company].filter(Boolean).join(" · ").trim())
        .filter((s) => s.length > 3);
    } else if (profileHeadline) {
      out.headline = profileHeadline;
    }

    const educations = included.filter(
      (i) =>
        i?.$type?.includes("Education") ||
        i?.schoolName ||
        (i?.school && (i.degreeName || i.fieldOfStudy)),
    );
    if (educations.length) {
      out.educationBullets = educations
        .slice(0, 12)
        .map((e) => {
          const school =
            e.schoolName || textField(e.school) || e.school?.name || "";
          const degree = e.degreeName || e.fieldOfStudy || "";
          return [school, degree].filter(Boolean).join(" — ").trim();
        })
        .filter((s) => s.length > 3);
    }

    return Object.keys(out).length ? out : null;
  }

  function parseDashElements(body) {
    const elements = body?.elements;
    if (!Array.isArray(elements) || !elements[0]) return null;
    const el = elements[0];
    const out = {};
    const fn = [el.firstName, el.lastName]
      .filter((x) => x != null && String(x).trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (fn) out.fullName = fn;
    const hl = textField(el.headline) || el.headline;
    if (typeof hl === "string" && hl.trim()) out.headline = hl.trim();
    if (typeof el.summary === "string" && el.summary.trim()) {
      out.about = el.summary.trim().slice(0, 12000);
    }
    if (el.locationName) out.location = String(el.locationName).trim();
    else if (el.geoLocation && typeof el.geoLocation === "object") {
      const g = el.geoLocation;
      out.location = [g.city, g.state, g.countryCode]
        .filter(Boolean)
        .join(", ")
        .trim();
    }
    return Object.keys(out).length ? out : null;
  }

  function mergeParsedProfiles(...parts) {
    const out = {};
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      for (const [k, v] of Object.entries(part)) {
        if (v == null) continue;
        if (Array.isArray(v) && v.length) {
          if (!Array.isArray(out[k]) || v.length > out[k].length) out[k] = v;
        } else if (typeof v === "string" && v.trim() && !out[k]) {
          out[k] = v.trim();
        }
      }
    }
    return Object.keys(out).length ? out : null;
  }

  function profilePayloadUseful(parsed) {
    if (!parsed) return false;
    return Boolean(
      parsed.headline ||
        parsed.company ||
        parsed.about ||
        parsed.experienceBullets?.length ||
        parsed.educationBullets?.length ||
        (parsed.fullName && (parsed.location || parsed.headline)),
    );
  }

  function findGraphqlProfileQueryId() {
    const html = document.documentElement.innerHTML;
    const m = html.match(/voyagerIdentityDashProfiles\.[a-f0-9]{10,}/i);
    return m ? m[0] : null;
  }

  function parseBprCaches() {
    const tryPayload = (payload, method) => {
      if (!payload || typeof payload !== "object") return null;
      const included = payload.included || payload.data?.included;
      const parsed = parseIncluded(
        Array.isArray(included) ? included : [],
        payload.data,
      );
      if (parsed) return { ...parsed, captureMethod: method };
      return null;
    };

    for (const datalet of document.querySelectorAll(
      'code[id^="datalet-bpr-guid"]',
    )) {
      try {
        const meta = JSON.parse(datalet.textContent || "");
        const req = meta?.request || "";
        if (!/profile|identity\/dash\/profiles|profileView/i.test(req)) {
          continue;
        }
        diagnostics.bprHits += 1;
        const bodyId = meta.body;
        if (!bodyId) continue;
        const payloadEl = document.getElementById(String(bodyId));
        if (!payloadEl?.textContent) continue;
        const hit = tryPayload(JSON.parse(payloadEl.textContent), "bpr");
        if (hit) return hit;
      } catch {
        /* next */
      }
    }

    for (const code of document.querySelectorAll('code[id*="bpr-guid"]')) {
      try {
        const raw = code.textContent?.trim();
        if (!raw || raw.length < 80 || raw[0] !== "{") continue;
        if (!/"included"\s*:/.test(raw) && !/"firstName"\s*:/.test(raw)) {
          continue;
        }
        diagnostics.bprHits += 1;
        const hit = tryPayload(JSON.parse(raw), "bpr-direct");
        if (hit) return hit;
      } catch {
        /* next */
      }
    }
    return null;
  }

  const vanity = vanityFromUrl();
  diagnostics.vanity = vanity;
  const headers = voyagerHeaders();
  diagnostics.csrf = Boolean(headers["csrf-token"]);

  let voyager = null;
  let bpr = parseBprCaches();

  if (vanity && headers["csrf-token"]) {
    const decorations = [
      "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-95",
      "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-94",
      "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93",
      "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-92",
      "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-91",
      "com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-17",
      "com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-16",
    ];
    const urls = [
      ...decorations.map(
        (decorationId) =>
          "https://www.linkedin.com/voyager/api/identity/dash/profiles" +
          `?q=memberIdentity&memberIdentity=${encodeURIComponent(vanity)}` +
          `&decorationId=${encodeURIComponent(decorationId)}`,
      ),
      `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(vanity)}/profileView`,
      `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(vanity)}/profileView?locale=en_US`,
    ];

    const qid = findGraphqlProfileQueryId();
    if (qid) {
      urls.push(
        "https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true" +
          `&variables=(vanityName:${encodeURIComponent(vanity)})` +
          `&queryId=${encodeURIComponent(qid)}`,
      );
    }

    for (const url of urls) {
      diagnostics.voyagerAttempts = (diagnostics.voyagerAttempts || 0) + 1;
      try {
        const resp = await fetch(url, { headers, credentials: "include" });
        diagnostics.voyagerStatus = resp.status;
        if (!resp.ok) continue;
        const json = await resp.json();
        const parsed = mergeParsedProfiles(
          parseDashElements(json),
          parseIncluded(json.included, json.data),
        );
        if (parsed && profilePayloadUseful(parsed)) {
          voyager = {
            ...parsed,
            captureMethod: url.includes("/graphql") ? "graphql" : "voyager",
          };
          break;
        }
        if (parsed?.fullName && !voyager) {
          voyager = { ...parsed, captureMethod: "voyager-partial" };
        }
      } catch {
        /* next url */
      }
    }
  }

  return { voyager, bpr, diagnostics };
}

/** Service worker — detect ongoing role from Voyager timePeriod / flags. */
function isCurrentPositionRaw(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (raw.current === true || raw.isCurrent === true) return true;
  const tp = raw.timePeriod || raw.dateRange;
  if (tp && typeof tp === "object") {
    const end = tp.endDate ?? tp.end;
    if (end == null) return true;
    if (typeof end === "object" && (end.year == null || end.year === 0)) {
      return true;
    }
  }
  const cap = String(raw.caption || raw.employmentType || "");
  if (/\b(present|présent|aujourd'hui|today|actuel|current)\b/i.test(cap)) {
    return true;
  }
  return false;
}

function positionStartYearRaw(raw) {
  const tp = raw?.timePeriod || raw?.dateRange;
  const start = tp?.startDate ?? tp?.start;
  if (start && typeof start === "object" && start.year) return start.year;
  return 0;
}

function sortPositionsCurrentFirst(positions) {
  return [...positions].sort((a, b) => {
    const ac = isCurrentPositionRaw(a.raw) ? 1 : 0;
    const bc = isCurrentPositionRaw(b.raw) ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return positionStartYearRaw(b.raw) - positionStartYearRaw(a.raw);
  });
}

function parseRoleFromExperienceBullet(bullet) {
  if (!bullet || typeof bullet !== "string") return null;
  const t = bullet.replace(/\s+/g, " ").trim();
  const dot = t.indexOf(" · ");
  if (dot > 0) {
    return {
      title: t.slice(0, dot).trim(),
      company: t.slice(dot + 3).trim(),
    };
  }
  const at = t.match(/^(.+?)\s+at\s+(.+)$/i);
  if (at?.[1] && at[2]) {
    return { title: at[1].trim(), company: at[2].trim() };
  }
  const chez = t.match(/^(.+?)\s+chez\s+(.+)$/i);
  if (chez?.[1] && chez[2]) {
    return { title: chez[1].trim(), company: chez[2].trim() };
  }
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash?.[1] && dash[2] && dash[2].length < 80) {
    return { title: dash[1].trim(), company: dash[2].trim() };
  }
  return null;
}

function stringsOverlap(a, b) {
  if (!a || !b) return false;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al.includes(bl) || bl.includes(al)) return true;
  const aw = al.split(/\s+/).filter((w) => w.length > 3);
  return aw.some((w) => bl.includes(w));
}

function pickCurrentExperienceBullet(bullets) {
  if (!Array.isArray(bullets) || !bullets.length) return null;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (typeof b !== "string") continue;
    if (
      /\b(present|présent|aujourd'hui|today|actuel|current|cdi|cdd)\b/i.test(b) ||
      /\b(19|20)\d{2}\s*[-–—]\s*(present|présent|aujourd'hui|today)\b/i.test(b)
    ) {
      return b;
    }
  }
  return typeof bullets[0] === "string" ? bullets[0] : null;
}

/** Align headline/company with current experience (top card often differs). */
function reconcileCurrentRoleFields(fields) {
  if (!fields || typeof fields !== "object") return fields;
  const bullets = fields.experienceBullets;
  const currentBullet = pickCurrentExperienceBullet(bullets);
  const role = parseRoleFromExperienceBullet(currentBullet);
  if (!role?.title) return fields;

  let headline = fields.headline || "";
  let company = fields.company || "";

  const titleAligned = stringsOverlap(headline, role.title);
  const companyAligned =
    !role.company || !company || stringsOverlap(company, role.company);

  if (!titleAligned || !companyAligned) {
    headline = role.title;
    if (role.company) company = role.company;
  }

  return { ...fields, headline: headline || undefined, company: company || undefined };
}

/** Service worker — reject employment date blobs wrongly stored as company. */
function sanitizeCompanyCandidate(company, headline) {
  if (!company || typeof company !== "string") return { company, headline };
  const t = company.replace(/\s+/g, " ").trim();
  if (!t) return { company: undefined, headline };

  const looksLikeDates =
    /\b(19|20)\d{2}\b/.test(t) &&
    /\b(jan|feb|mar|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[eé]c|today|aujourd|present|pr[eé]sent|mois|month|year|ans|yr)\b/i.test(
      t,
    );
  const looksLikeContract =
    /\b(CDI|CDD|freelance|internship|stage|temps plein|full[- ]?time)\b/i.test(t);
  const looksLikeTitle =
    /\b(Chief|Officer|Director|Directeur|Directrice|Manager|Head of|VP|President|CIO|CTO|CEO|COO|CFO)\b/i.test(
      t,
    );

  if ((looksLikeDates || looksLikeContract) && looksLikeTitle) {
    return {
      company: undefined,
      headline: headline || t,
    };
  }
  if (looksLikeDates && t.length > 50) {
    return {
      company: undefined,
      headline: headline || t,
    };
  }
  if (t.length > 100 && looksLikeDates) {
    return { company: undefined, headline: headline || t };
  }
  return { company: t, headline };
}

/** Service worker — Voyager > BPR > DOM, same strategy as mature capture extensions. */
function mergeProfileExtractions(voyager, bpr, domResult) {
  const dom = domResult?.extractedFields || {};
  const sources = [voyager, bpr, dom].filter(Boolean);

  function pickScalar(key) {
    for (const s of sources) {
      const v = s[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  }

  function pickBullets(key) {
    let best;
    for (const s of sources) {
      const v = s[key];
      if (Array.isArray(v) && v.length > (best?.length || 0)) best = v;
    }
    if (!best?.length) return undefined;
    const maxChars = key === "educationBullets" ? 500 : 600;
    return best
      .slice(0, key === "educationBullets" ? 20 : 25)
      .map((item) => {
        if (typeof item !== "string") return null;
        const t = item.trim();
        if (!t) return null;
        return t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t;
      })
      .filter(Boolean);
  }

  let fullName = pickScalar("fullName");
  let headline = pickScalar("headline");
  let company = pickScalar("company");
  const location = pickScalar("location");
  const connectionDegree = parseConnectionDegree(pickScalar("connectionDegree"));
  const about = pickScalar("about");
  const experienceBullets = pickBullets("experienceBullets");
  const educationBullets = pickBullets("educationBullets");

  const sanitized = sanitizeCompanyCandidate(company, headline);
  company = sanitized.company;
  headline = sanitized.headline;

  const extractedFields = reconcileCurrentRoleFields({
    fullName,
    headline,
    company,
    location,
    connectionDegree,
    ...(about ? { about } : {}),
    ...(experienceBullets ? { experienceBullets } : {}),
    ...(educationBullets ? { educationBullets } : {}),
  });
  headline = extractedFields.headline;
  company = extractedFields.company;

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

  const methods = [voyager?.captureMethod, bpr?.captureMethod, "dom"].filter(
    Boolean,
  );
  const filled = Object.values(fieldPresence).filter(Boolean).length;

  return {
    schemaVersion: "1",
    pageType: "profile",
    sourceUrl: domResult?.sourceUrl || voyager?.sourceUrl,
    capturedAt: new Date().toISOString(),
    confidence: filled / 8,
    extractedFields,
    fieldPresence,
    captureMethods: methods,
  };
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

  function firstTextIn(root, ...selectors) {
    if (!root) return undefined;
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      const t = clean(el?.innerText || el?.textContent);
      if (t) return t;
    }
    return undefined;
  }

  function parseJsonLdPerson() {
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    for (const s of scripts) {
      try {
        const raw = s.textContent?.trim();
        if (!raw) continue;
        const data = JSON.parse(raw);
        const candidates = [];
        if (data && typeof data === "object") {
          if (Array.isArray(data["@graph"])) candidates.push(...data["@graph"]);
          else candidates.push(data);
        }
        for (const item of candidates) {
          const type = item?.["@type"];
          const types = Array.isArray(type) ? type : [type];
          if (types.some((x) => x === "Person")) return item;
        }
      } catch {
        /* ignore invalid JSON-LD */
      }
    }
    return null;
  }

  function fieldsFromJsonLd(person) {
    if (!person || typeof person !== "object") return {};
    const out = {};
    if (typeof person.name === "string") out.fullName = clean(person.name);
    if (typeof person.jobTitle === "string") out.headline = clean(person.jobTitle);
    const wf = person.worksFor;
    if (wf) {
      const w = Array.isArray(wf) ? wf[0] : wf;
      if (typeof w === "string") out.company = clean(w);
      else if (w && typeof w.name === "string") out.company = clean(w.name);
    }
    const addr = person.address;
    if (addr && typeof addr === "object") {
      const loc =
        addr.addressLocality ||
        addr.name ||
        (typeof addr === "string" ? addr : undefined);
      if (typeof loc === "string") out.location = clean(loc);
    }
    if (typeof person.description === "string" && person.description.length > 40) {
      out.about = person.description.slice(0, 12000);
    }
    return out;
  }

  function findProfileSection(...labels) {
    for (const label of labels) {
      const id = label.toLowerCase().replace(/\s+/g, "-");
      const anchor =
        document.getElementById(id) ||
        document.getElementById(label) ||
        document.querySelector(`#${id}`);
      if (anchor) {
        const root =
          anchor.closest("section") ||
          anchor.closest(".artdeco-card") ||
          anchor.closest("div.pvs-list__outer-container")?.parentElement ||
          anchor.parentElement?.parentElement;
        if (root) return root;
      }
    }
    const re = new RegExp(
      labels
        .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|"),
      "i",
    );
    for (const h of document.querySelectorAll(
      "h2, h3, .pvs-header__title, [class*='pvs-header']",
    )) {
      const t = clean(h.textContent);
      if (!t || t.length > 80 || !re.test(t)) continue;
      const root =
        h.closest("section") ||
        h.closest(".artdeco-card") ||
        h.closest("div[class*='pvs']") ||
        h.parentElement?.parentElement;
      if (root) return root;
    }
    return null;
  }

  function isEmploymentMetaBlob(s) {
    if (!s) return false;
    return (
      /\b(CDI|CDD|internship|stage|aujourd'hui|present|présent)\b/i.test(s) ||
      (/\b(19|20)\d{2}\b/.test(s) &&
        /\b(mois|month|year|ans|yr|·)\b/i.test(s))
    );
  }

  function isLikelyCompanyName(s) {
    if (!s || s.length < 2 || s.length > 120) return false;
    if (isEmploymentMetaBlob(s)) return false;
    if (
      /\b(Chief|Officer|Director|Directeur|Directrice|Manager|Head of)\b/i.test(
        s,
      ) &&
      s.length > 45
    ) {
      return false;
    }
    return true;
  }

  function scrapeTopCardFields(fullName) {
    const card =
      document.querySelector("main .artdeco-card") ||
      document.querySelector('[data-view-name*="profile-top-card"]') ||
      document.querySelector("main section") ||
      document.querySelector("main");
    const headline =
      firstTextIn(
        card,
        '[data-anonymize="headline"]',
        ".text-body-medium.break-words",
        "[class*='text-body-medium'][class*='break-words']",
        "div.text-body-medium",
        ".pv-text-details__left-panel .text-body-medium",
      ) ||
      firstText(
        '[data-anonymize="headline"]',
        ".text-body-medium.break-words",
        "[class*='text-body-medium'][class*='break-words']",
        "main .text-body-medium",
      );
    let headlineOut =
      headline && headline !== fullName && headline.length < 500
        ? headline
        : undefined;
    const location =
      firstTextIn(
        card,
        '[data-anonymize="location"]',
        ".text-body-small.inline.t-black--light",
        ".pv-text-details__left-panel .text-body-small",
      ) ||
      firstText(
        '[data-test-id="profile-location"] span',
        '[data-anonymize="location"]',
        ".pv-text-details__left-panel .text-body-small",
      );
    return { headline: headlineOut, location };
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

  const jsonLd = fieldsFromJsonLd(parseJsonLdPerson());

  const fullName =
    nameFromHeadingCandidates() ||
    nameFromDocumentTitle() ||
    nameFromOpenGraph() ||
    nameFromProfileAnchors() ||
    jsonLd.fullName ||
    undefined;

  const topCard = scrapeTopCardFields(fullName);

  function headlineFromMeta() {
    const og = document.querySelector('meta[property="og:description"]');
    const c = clean(og?.getAttribute("content"));
    if (c && c !== fullName && c.length > 4 && c.length < 500) return c;
    const desc = document.querySelector('meta[name="description"]');
    const d = clean(desc?.getAttribute("content"));
    if (d && d !== fullName && !/^see\s+/i.test(d) && d.length < 500) return d;
    return undefined;
  }

  function headlineFromTopCardComponent() {
    const root =
      document.querySelector('[componentkey*="Topcard"]') ||
      document.querySelector('[data-view-name*="profile-top-card"]');
    if (!root) return undefined;
    const lines = (root.innerText || "")
      .split("\n")
      .map((l) => clean(l))
      .filter(Boolean);
    for (const line of lines) {
      if (line === fullName) continue;
      if (line.length < 4 || line.length > 500) continue;
      if (/^(message|more|connect|follow|pending)/i.test(line)) continue;
      if (/^\d/.test(line) && line.length < 30) continue;
      return line;
    }
    return undefined;
  }

  let headline =
    topCard.headline ||
    headlineFromMeta() ||
    headlineFromTopCardComponent() ||
    firstText(
      '[data-anonymize="headline"]',
      ".text-body-medium.break-words",
      "[class*='text-body-medium'][class*='break-words']",
      "main .text-body-medium",
      ".pv-text-details__left-panel .text-body-medium",
      ".ph5 .text-body-medium",
      '[class*="top-card"] .text-body-medium',
    ) ||
    jsonLd.headline ||
    undefined;
  if (headline === fullName) headline = undefined;

  let company = jsonLd.company;
  let location =
    topCard.location ||
    firstText(
      '[data-test-id="profile-location"] span',
      '[data-anonymize="location"]',
      ".pv-text-details__left-panel .text-body-small",
    ) ||
    jsonLd.location ||
    undefined;

  const expRoot =
    findProfileSection("experience", "expérience", "experience") ||
    document.querySelector('section[data-section="experience"]') ||
    document.getElementById("experience")?.closest("section") ||
    document.querySelector("#experience") ||
    document.querySelector('[componentkey*="Experience"]');
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
        if (!headline && parts[0]) headline = parts[0];
        if (!company && isLikelyCompanyName(parts[1])) company = parts[1];
        else if (!headline && isEmploymentMetaBlob(parts[1])) {
          headline = parts[0];
        }
      } else if (parts.length === 1) {
        if (!headline && !isEmploymentMetaBlob(parts[0])) headline = parts[0];
        const h3 = clean(firstLi.querySelector("h3")?.textContent);
        if (h3 && !headline) headline = h3;
        const coLink = firstLi.querySelector(
          'a[href*="/company/"], span.t-14.t-normal span',
        );
        const co = clean(coLink?.textContent);
        if (co && !company && isLikelyCompanyName(co)) company = co;
      }
      if (!company) {
        const coA = firstLi.querySelector('a[href*="/company/"]');
        const coTxt = clean(coA?.textContent);
        if (coTxt && isLikelyCompanyName(coTxt)) company = coTxt;
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

  const connectionDegree = parseConnectionDegree(
    firstText(
      "span.dist-value",
      ".distance-badge .dist-value",
      ".artdeco-entity-lockup__degree",
      '[componentkey*="Topcard"] span.text-body-small',
    ),
  );

  function scrapeAboutBlock() {
    const aboutRoot =
      findProfileSection("about", "à propos", "a propos", "summary") ||
      document.querySelector('section[data-section="summary"]') ||
      document.querySelector("#about")?.closest("section");
    if (!aboutRoot) return jsonLd.about;
    let t = clean(aboutRoot.innerText);
    if (!t) return jsonLd.about;
    if (/^about\s+/i.test(t)) t = t.replace(/^about\s+/i, "").trim();
    if (/^à propos\s+/i.test(t)) t = t.replace(/^à propos\s+/i, "").trim();
    if (t.length > 12000) t = t.slice(0, 11997) + "…";
    return t || jsonLd.about || undefined;
  }

  function scrapeListSectionBullets(root, maxItems, maxChars) {
    if (!root) return undefined;
    const nodes = root.querySelectorAll(
      "li.artdeco-list__item, li.pvs-list__paged-list-item, .pvs-list__paged-list-item, div.pvs-entity, li[id*='profile-position']",
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
    findProfileSection("education", "formation", "education") ||
    document.querySelector('section[data-section="education"]') ||
    document.getElementById("education")?.closest("section") ||
    document.querySelector("#education");
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
async function scrapeProfileFromTab(tabId, opts = {}) {
  await focusAutomationTab(
    tabId,
    opts.forceFocusForScrape ? { forceFocus: true } : opts,
  );
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: waitForProfileDomReady,
      args: [8000],
    });
  } catch {
    /* best-effort */
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: prepProfilePageForScrape,
      args: [8000],
    });
  } catch {
    /* best-effort */
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: waitForProfileDomReady,
      args: [3000],
    });
  } catch {
    /* best-effort */
  }

  let voyager = null;
  let bpr = null;
  let captureDiagnostics = null;
  try {
    const v = await chrome.scripting.executeScript({
      target: { tabId },
      func: fetchProfileStructuredDataPage,
    });
    const bundle = v[0]?.result;
    voyager = bundle?.voyager ?? null;
    bpr = bundle?.bpr ?? null;
    captureDiagnostics = bundle?.diagnostics ?? null;
  } catch {
    /* session / API unavailable */
  }

  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeVisibleProfile,
  });
  const domResult = injected[0]?.result;
  if (!domResult && !voyager && !bpr) return undefined;
  const merged = mergeProfileExtractions(voyager, bpr, domResult);
  let tabUrl = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    tabUrl = tab?.url || "";
  } catch {
    /* ignore */
  }
  if (domResult?.sourceUrl) {
    merged.sourceUrl = domResult.sourceUrl;
  } else if (tabUrl && isLinkedInProfilePageUrl(tabUrl)) {
    merged.sourceUrl = tabUrl;
  }
  if (captureDiagnostics) merged.captureDiagnostics = captureDiagnostics;
  return merged;
}

/**
 * Page world — scroll the connections / people-search list to load more rows.
 * Multiple passes so lazy-loaded cards appear (background tabs often need focus too).
 */
async function scrollConnectionsListViewport() {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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
    ".reusable-search__entity-result-list",
  ];
  const targets = [];
  for (const sel of innerSelectors) {
    const el = (main && main.querySelector(sel)) || document.querySelector(sel);
    if (el && !targets.includes(el)) targets.push(el);
  }
  if (main && !targets.includes(main)) targets.push(main);

  let usedFallback = false;
  for (let pass = 0; pass < 5; pass++) {
    let moved = false;
    for (const el of targets) {
      const dy = Math.min(950, Math.floor((el.scrollHeight || 800) * 0.35));
      if (tryScroll(el, dy)) moved = true;
    }
    if (!moved) {
      window.scrollBy({ top: 680, behavior: "instant" });
      usedFallback = true;
    }
    await pause(380);
  }
  return { scrolled: true, passes: 5, fallback: usedFallback };
}

/** Bring the LinkedIn automation tab to the foreground (required for lazy-load / scroll). */
async function focusAutomationTab(tabId, opts = {}) {
  if (typeof tabId !== "number") return;
  if (opts?.suppressFocus && !opts?.forceFocus) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.id) return;
    await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId != null) {
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch {
        /* ignore */
      }
    }
    await sleep(400);
  } catch {
    /* tab closed */
  }
}

/** Focus tab, auto-scroll list, wait for new rows to render. */
async function prepareListPageForScrape(tabId, postScrollMs, opts = {}) {
  await focusAutomationTab(tabId, opts);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: scrollConnectionsListViewport,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not scroll the list (is the LinkedIn tab still open?). ${msg}`,
    );
  }
  await sleep(postScrollMs);
}

/**
 * Visible people on Connections or LinkedIn people search (page world).
 * Card-first: avoids mutual-connection / sidebar /in/ links inside each row.
 */
function scrapeConnectionsList() {
  function clean(s) {
    if (!s) return undefined;
    const t = String(s).replace(/\s+/g, " ").trim();
    return t.length ? t : undefined;
  }

  function stripDegreeFromName(name) {
    const t = clean(name);
    if (!t) return undefined;
    const stripped = t
      .replace(/\s*[•·|]\s*(?:\d+\s*(?:er|e|re|nd|st)\+?|1er|2e|3e)\s*$/i, "")
      .replace(/\s+·\s+.*$/, "")
      .trim();
    return stripped.length > 1 ? stripped : t;
  }

  const TITLE_LEAD =
    /^(Chef|Directeur|Directrice|Manager|Ingénieur|Engineer|Head|Lead|Senior|CIO|CTO|CEO|VP|Developer|Founder|Chief|President|General Manager|Software|Data|Product|Officer|Partner|Consultant)\b/i;

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
    const roleAt = /\s+(?:at|@|chez)\s+/i;
    const m = t.match(roleAt);
    if (m) {
      const idx = t.search(roleAt);
      return {
        headline: t.slice(0, idx).trim(),
        company: t.slice(idx + m[0].length).trim(),
      };
    }
    return { headline: t, company: undefined };
  }

  function looksLikeMutualLine(s) {
    if (!s) return false;
    return /mutual connection|connections? in common|relations? que vous avez en commun|connexion(s)? en commun|autres? relations? en commun|and \d+ other(s)?/i.test(
      s,
    );
  }

  function looksLikeLocation(s) {
    const t = clean(s);
    if (!t || looksLikeMutualLine(t)) return false;
    if (/,/.test(t)) return true;
    if (/\bet périphérie\b/i.test(t)) return true;
    if (
      /\b(France|Belgium|Germany|United Kingdom|UK|United States|Canada|Switzerland|Spain|Italy|Netherlands|Région|Area|Metropolitan)\b/i.test(
        t,
      )
    ) {
      return true;
    }
    if (t.length <= 48 && !TITLE_LEAD.test(t) && !/\|/.test(t) && !/\bat\b|\bchez\b/i.test(t)) {
      return true;
    }
    return false;
  }

  function degreeFromCard(card) {
    const badge = card.querySelector(
      ".entity-result__badge, .image-text-lockup__text, .dist-value, .mn-connection-card__badge",
    );
    const fromBadge = parseConnectionDegree(badge?.textContent);
    if (fromBadge) return fromBadge;
    const titleWrap =
      card.querySelector(".entity-result__title-text") ||
      card.querySelector(".entity-result__title-line") ||
      card.querySelector(".mn-connection-card__name");
    return parseConnectionDegree(titleWrap?.textContent);
  }

  function nameFromImgAlt(card) {
    const img = card?.querySelector("img[alt]");
    const alt = img?.getAttribute("alt");
    if (!alt) return undefined;
    const stripped = alt
      .replace(/\s*profile photo.*$/i, "")
      .replace(/(?:’s|'s)\s*photo.*$/i, "")
      .replace(/’s$/i, "")
      .replace(/'s$/i, "")
      .trim();
    if (stripped.length > 1 && stripped.length < 120) return stripped;
    return undefined;
  }

  function profileAnchorInCard(card) {
    const titleSel =
      '.entity-result__title-text a[href*="/in/"], .entity-result__title-line a[href*="/in/"], .mn-connection-card__name a[href*="/in/"], [data-anonymize="person-name"] a[href*="/in/"]';
    const direct = card.querySelector(titleSel);
    if (direct?.href && !direct.href.includes("/edit/")) return direct;

    const skip = new Set();
    card
      .querySelectorAll(
        '.entity-result__insights a[href*="/in/"], .reusable-search-simple-insight a[href*="/in/"], .entity-result__social-network-insight a[href*="/in/"]',
      )
      .forEach((el) => skip.add(el));

    let best;
    let bestScore = -1;
    card.querySelectorAll('a[href*="/in/"]').forEach((a) => {
      if (skip.has(a) || !a.href || a.href.includes("/edit/")) return;
      const t = clean(a.textContent);
      let score = 0;
      if (t && t.length > 1 && t.length < 120 && !t.includes("http")) score += t.length;
      if (a.closest(".entity-result__title-text, .entity-result__title-line, .mn-connection-card__name")) {
        score += 200;
      }
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    });
    return best;
  }

  function collectCards() {
    const selectors = [
      "li[data-occludable-entity-urn]",
      "li.reusable-search__result-container",
      ".reusable-search__result-container",
      'div[data-view-name="search-entity-result-universal-template"]',
      "div.entity-result",
      ".mn-connection-card",
      "[data-chameleon-result-urn]",
      '[data-view-name="search-result"]',
    ];
    const cards = [];
    const seenEl = new WeakSet();
    const seenUrn = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (seenEl.has(el)) return;
        const urn =
          el.getAttribute("data-chameleon-result-urn") ||
          el.getAttribute("data-occludable-entity-urn");
        if (urn && seenUrn.has(urn)) return;
        if (urn) seenUrn.add(urn);
        seenEl.add(el);
        if (el.querySelector('a[href*="/in/"]')) cards.push(el);
      });
    }
    return cards;
  }

  function extractRowFromCard(card) {
    const a = profileAnchorInCard(card);
    if (!a?.href) return null;
    try {
      const u = new URL(a.href);
      if (!u.hostname.endsWith("linkedin.com")) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] !== "in" || !parts[1]) return null;
      const vanity = decodeURIComponent(parts[1]);
      if (!vanity || vanity === "me") return null;
      const profileUrl = `${u.origin}/${parts[0]}/${parts[1]}`;
      const normPath = u.pathname.replace(/\/$/, "").toLowerCase();

      const nameEl =
        card.querySelector('[data-anonymize="person-name"]') ||
        card.querySelector(".mn-connection-card__name a") ||
        card.querySelector(".entity-result__title-text a") ||
        card.querySelector(".entity-result__title-line a");
      let fullName = stripDegreeFromName(nameEl?.textContent);
      if (!fullName) {
        let best = "";
        card.querySelectorAll('a[href*="/in/"]').forEach((link) => {
          try {
            const lu = new URL(link.href);
            if (lu.pathname.replace(/\/$/, "").toLowerCase() !== normPath) return;
            const t = clean(link.textContent);
            if (!t || t.includes("http") || t.length > 120) return;
            const nt = stripDegreeFromName(t);
            if (nt && nt.length > best.length) best = nt;
          } catch {
            /* skip */
          }
        });
        fullName = best || undefined;
      }
      if (!fullName) fullName = stripDegreeFromName(nameFromImgAlt(card));
      if (!fullName) {
        const t = stripDegreeFromName(a.textContent);
        if (t && t.length < 120) fullName = t;
      }

      const subLines = [];
      card
        .querySelectorAll(
          '[data-anonymize="title"], [data-anonymize="headline"], .entity-result__primary-subtitle, .entity-result__secondary-subtitle, .entity-result__tertiary-subtitle, .mn-connection-card__subtitle, .subline-level-1, .entity-result__summary, div[class*="primary-subtitle"], div[class*="secondary-subtitle"]',
        )
        .forEach((el) => {
          const t = clean(el.textContent);
          if (t && !looksLikeMutualLine(t)) subLines.push(t);
        });

      let headline;
      let company;
      let location;
      let mutualConnectionsHint;

      const insight = card.querySelector(
        ".entity-result__insights, .reusable-search-simple-insight, .entity-result__social-network-insight",
      );
      const insightText = clean(insight?.textContent);
      if (insightText && looksLikeMutualLine(insightText)) {
        mutualConnectionsHint = insightText;
      }

      for (const line of subLines) {
        if (looksLikeMutualLine(line)) {
          if (!mutualConnectionsHint) mutualConnectionsHint = line;
          continue;
        }
        if (!headline) {
          headline = line;
          continue;
        }
        if (!location && looksLikeLocation(line)) {
          location = line;
          continue;
        }
        if (!company && !looksLikeLocation(line)) {
          company = line;
          continue;
        }
        if (!location) location = line;
      }

      if (headline) {
        const sp = splitRoleCompany(headline);
        headline = sp.headline;
        if (!company && sp.company) company = sp.company;
      }

      const connectionDegree = degreeFromCard(card);

      return {
        profileUrl,
        fullName: fullName || undefined,
        headline: headline || undefined,
        company: company || undefined,
        location: location || undefined,
        connectionDegree: connectionDegree || undefined,
        mutualConnectionsHint: mutualConnectionsHint || undefined,
      };
    } catch {
      return null;
    }
  }

  const listSourceUrl = window.location.href;
  const seen = new Set();
  const rows = [];

  const cards = collectCards();
  if (cards.length > 0) {
    for (const card of cards) {
      const row = extractRowFromCard(card);
      if (!row) continue;
      const key = row.profileUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  } else {
    const anchors = document.querySelectorAll('a[href*="/in/"]');
    for (const a of anchors) {
      const row = extractRowFromCard(
        a.closest(".entity-result") ||
          a.closest(".reusable-search__result-container") ||
          a.closest(".mn-connection-card") ||
          a.parentElement?.parentElement ||
          a,
      );
      if (!row) continue;
      const key = row.profileUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
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

/** After opening recent activity — LinkedIn may land on /feed/update/… permalink. */
async function waitForProfilePostsContextTab(tabId, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      throw new Error("The LinkedIn tab was closed.");
    }
    const url = tab?.url || "";
    if (url && isProfilePostsContextUrl(url)) {
      await sleep(700);
      return url;
    }
    await sleep(400);
  }
  throw new Error(
    "Timed out waiting for activity feed. Scroll their Recent activity and try again.",
  );
}

async function returnTabToProfileAfterPostsCapture(tabId, profileUrl, timeoutMs = 20000) {
  if (typeof profileUrl !== "string" || !profileUrl.trim()) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isLinkedInProfilePageUrl(tab?.url || "")) return;
    await chrome.tabs.update(tabId, { url: profileUrl });
    try {
      await waitForLinkedInProfileTab(tabId, timeoutMs);
    } catch {
      /* best-effort — pipeline will navigate on next step */
    }
  } catch {
    /* ignore */
  }
}

/** Navigate to a profile and wait — retries help when the tab is in the background. */
async function navigateToProfileForAutomation(tabId, profileUrl, opts = {}) {
  const timeoutMs = opts.suppressFocus ? 180000 : 90000;
  const attempts = opts.suppressFocus ? 3 : 2;
  const targetKey = profileNavigationTargetKey(profileUrl);
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      let tab = await chrome.tabs.get(tabId);
      const currentUrl = tab?.url || "";
      const recentlyNavigated =
        lastProfileNavigation.tabId === tabId &&
        lastProfileNavigation.targetUrl === targetKey &&
        Date.now() - lastProfileNavigation.at < 120000;
      const sameSlug =
        linkedInProfileSlug(currentUrl) &&
        linkedInProfileSlug(profileUrl) &&
        linkedInProfileSlug(currentUrl) === linkedInProfileSlug(profileUrl);
      if (
        !opts.forceReload &&
        isLinkedInProfilePageUrl(currentUrl) &&
        (recentlyNavigated || sameSlug)
      ) {
        await sleep(900);
        return;
      }
      await chrome.tabs.update(tabId, { url: profileUrl });
      await waitForLinkedInProfileTab(tabId, timeoutMs);
      lastProfileNavigation = {
        tabId,
        targetUrl: targetKey,
        at: Date.now(),
      };
      return;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(2500 * (i + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Accept profile URL, messaging URL, or visible messaging overlay (LinkedIn often keeps profile URL). */
async function waitForProfileOrMessagingTab(tabId, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      throw new Error("The LinkedIn tab was closed.");
    }
    const url = tab?.url || "";
    if (
      url &&
      (isLinkedInProfilePageUrl(url) ||
        isMessagingThreadUrl(url) ||
        isMessagingPageUrl(url))
    ) {
      await sleep(500);
      return url;
    }
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: isMessagingDomVisiblePage,
      });
      if (result?.visible || result?.onThreadUrl) {
        await sleep(500);
        return url;
      }
    } catch {
      /* ignore */
    }
    await sleep(350);
  }
  throw new Error(
    "Timed out waiting for LinkedIn profile or messaging.",
  );
}

async function pollOutreachThreadReady(
  tabId,
  expectedVanity,
  expectedName,
  timeoutMs = 10000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: verifyOutreachThreadReadyPage,
        args: [expectedVanity || "", expectedName || ""],
      });
      if (result?.ready) return result;
    } catch {
      /* ignore */
    }
    await sleep(400);
  }
  return { ready: false, reason: "poll_timeout" };
}

/** Page world — React-friendly pointer activation. */
function pointerActivateElement(el) {
  if (!(el instanceof HTMLElement)) return false;
  const target =
    el.closest("button, a[href], [role='button']") instanceof HTMLElement
      ? el.closest("button, a[href], [role='button']")
      : el;
  try {
    target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const opts = { bubbles: true, cancelable: true, view: window };
    for (const type of [
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
    ]) {
      target.dispatchEvent(new MouseEvent(type, opts));
    }
    if (typeof target.click === "function") target.click();
    return true;
  } catch {
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  }
}

function profileActionLabel(el) {
  if (!(el instanceof HTMLElement)) return "";
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.textContent ||
    ""
  ).trim();
}

function isExcludedProfileAction(el) {
  const label = profileActionLabel(el).toLowerCase();
  if (!label) return false;
  return (
    /\b(connect|connecter|inviter|invite|follow|suivre|se connecter|pending|en attente)\b/i.test(
      label,
    ) || /\binmail\b/i.test(label)
  );
}

function isProfileMessageElement(el) {
  if (!(el instanceof HTMLElement) || isExcludedProfileAction(el)) return false;
  if (el instanceof HTMLAnchorElement && el.href?.includes("messaging")) return true;
  const label = profileActionLabel(el).toLowerCase();
  if (/\b(message|messager|envoyer un message)\b/i.test(label)) return true;
  if (/^message\b/i.test(label) || /^messager\b/i.test(label)) return true;
  if (el.classList?.contains("message-anywhere-button")) return true;
  if (el.getAttribute("data-control-name") === "message") return true;
  const text = (el.textContent || "").trim();
  if (/^(message|messager)$/i.test(text)) return true;
  if (/envoyer un message/i.test(text)) return true;
  return false;
}

function profileActionRoots() {
  return [
    document.querySelector(".pvs-profile-actions"),
    document.querySelector('[data-view-name="profile-actions"]'),
    document.querySelector(".pv-top-card-v2-ctas"),
    document.querySelector(".pv-top-card"),
    document.querySelector("main"),
  ].filter(Boolean);
}

function findProfileMessageElement(scope) {
  if (!scope) return null;
  const selectors = [
    'a[data-control-name="message"]',
    "button.message-anywhere-button",
    'a[href*="/messaging/"]',
    'button[aria-label*="Message"]',
    'button[aria-label*="Messager"]',
    'a[aria-label*="Message"]',
    'a[aria-label*="Messager"]',
  ];
  for (const sel of selectors) {
    for (const el of scope.querySelectorAll(sel)) {
      if (isProfileMessageElement(el)) return el;
    }
  }
  for (const el of scope.querySelectorAll("button, a, [role='button']")) {
    if (isProfileMessageElement(el)) return el;
  }
  return null;
}

function findProfileMoreButton() {
  for (const root of profileActionRoots()) {
    const selectors = [
      'button[aria-label*="More actions"]',
      'button[aria-label*="Plus d"]',
      "button.pvs-profile-actions__action--overflow",
      'button[id*="profile-overflow"]',
      "button.artdeco-dropdown__trigger",
    ];
    for (const sel of selectors) {
      const btn = root.querySelector(sel);
      if (btn instanceof HTMLButtonElement && !btn.disabled) {
        return btn;
      }
    }
    for (const btn of root.querySelectorAll("button, [role='button']")) {
      if (!(btn instanceof HTMLElement) || btn.disabled) continue;
      const label = profileActionLabel(btn).toLowerCase();
      if (label === "more" || label === "plus" || /^plus d/i.test(label)) {
        return btn;
      }
    }
  }
  return null;
}

/** Page world — profile CTAs (Message or More) are in the DOM. */
function isProfileActionsChromeReadyPage() {
  for (const root of profileActionRoots()) {
    if (findProfileMessageElement(root)) {
      return { ready: true, hasMessage: true };
    }
  }
  if (findProfileMoreButton()) {
    return { ready: true, hasMessage: false, hasMore: true };
  }
  return { ready: false };
}

/** Page world — Message link on profile actions only (avoid inbox sidebar links). */
function getMessagingHrefFromProfilePage() {
  const roots = profileActionRoots();
  if (!roots.length) return null;

  const selectors = [
    'a[data-control-name="message"][href*="/messaging/"]',
    'a[data-control-name="message"]',
    'a[href*="/messaging/thread/"]',
    'a[href*="messaging/thread"]',
    'a[href*="messaging/compose"]',
  ];
  for (const root of roots) {
    for (const sel of selectors) {
      const a = root.querySelector(sel);
      if (
        a instanceof HTMLAnchorElement &&
        a.href &&
        a.href.includes("linkedin.com") &&
        a.href.includes("messaging")
      ) {
        return a.href;
      }
    }
    const msg = findProfileMessageElement(root);
    if (msg instanceof HTMLAnchorElement && msg.href?.includes("messaging")) {
      return msg.href;
    }
  }

  const menuRoots = [
    document.querySelector(".artdeco-dropdown__content--is-open"),
    document.querySelector('[role="menu"]'),
    document.querySelector(".artdeco-dropdown__content"),
  ].filter(Boolean);
  for (const menuRoot of menuRoots) {
    const msg = findProfileMessageElement(menuRoot);
    if (msg instanceof HTMLAnchorElement && msg.href?.includes("messaging")) {
      return msg.href;
    }
  }
  return null;
}

/** Page world — click Message on profile; opens More menu when needed. */
function clickProfileMessageButton() {
  for (const root of profileActionRoots()) {
    const direct = findProfileMessageElement(root);
    if (direct && pointerActivateElement(direct)) {
      return { clicked: true, method: "direct" };
    }
  }

  const more = findProfileMoreButton();
  if (more) {
    pointerActivateElement(more);
    const menuRoots = [
      document.querySelector(".artdeco-dropdown__content--is-open"),
      document.querySelector('[role="menu"]'),
      document.querySelector(".artdeco-dropdown__content"),
      document.body,
    ].filter(Boolean);
    for (const menuRoot of menuRoots) {
      const msg = findProfileMessageElement(menuRoot);
      if (msg && pointerActivateElement(msg)) {
        return { clicked: true, method: "more_menu" };
      }
    }
  }

  const fallback = [...document.querySelectorAll("button, a[role='button'], a")].find(
    (el) => isProfileMessageElement(el),
  );
  if (fallback && pointerActivateElement(fallback)) {
    return { clicked: true, method: "fallback_scan" };
  }
  return { clicked: false };
}

/** Page world — injected alone for outreach pre-check. */
function isOutreachComposerVisiblePage() {
  const selectors = [
    '.msg-form__contenteditable[contenteditable="true"]',
    'div.msg-form__msg-content-container [contenteditable="true"]',
    '[data-lexical-editor="true"]',
    '[contenteditable="true"][role="textbox"]',
    ".msg-form__contenteditable",
  ];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (!(el instanceof HTMLElement)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      return true;
    }
  }
  return false;
}

async function ensureMessagingThreadUrlForCapture(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
  if (isMessagingThreadUrl(tab.url || "")) return tab;

  let threadUrl = null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: resolveMessagingThreadIdFromDom,
    });
    if (result?.threadId) {
      threadUrl = `https://www.linkedin.com/messaging/thread/${encodeURIComponent(result.threadId)}/`;
    }
  } catch {
    return tab;
  }
  if (!threadUrl) return tab;

  try {
    await chrome.tabs.update(tabId, { url: threadUrl });
    await waitForMessagingThreadTab(tabId, 35000);
    return await chrome.tabs.get(tabId);
  } catch {
    return tab;
  }
}

async function waitForMessagingThreadTab(tabId, timeoutMs = 75000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      throw new Error("The LinkedIn tab was closed.");
    }
    const url = tab?.url || "";
    if (url && isMessagingThreadUrl(url)) {
      await sleep(900);
      return;
    }
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: isMessagingDomVisiblePage,
      });
      if (result?.onThreadUrl || result?.visible) {
        await sleep(900);
        return;
      }
    } catch {
      /* ignore */
    }
    await sleep(400);
  }
  throw new Error("Timed out waiting for messaging thread.");
}

async function tryAutoCaptureMessagingThread(tabId, root) {
  try {
    await sleep(2000);
    await ensureMessagingThreadUrlForCapture(tabId);
    const msgPayload = await scrapeMessagingFromTab(tabId);
    if (
      !msgPayload?.extractedFields?.messagingMessages?.length ||
      !msgPayload?.extractedFields?.messagingParticipantProfileUrl
    ) {
      return { captured: false };
    }
    let pruned;
    try {
      pruned = await waitForProfileCaptureGap(root);
    } catch {
      return { captured: false };
    }
    const out = await postMessagingCapturePayload(root, pruned, msgPayload);
    return { captured: out.ok };
  } catch {
    return { captured: false };
  }
}

async function clearStaleCaptureLiveStatus() {
  const stored = await chrome.storage.local.get([LIVE_STATUS_KEY]);
  const state = stored[LIVE_STATUS_KEY];
  if (!state || state.scope !== "capture") return;
  const age = Date.now() - (state.updatedAt || 0);
  if (state.phase === "running" || state.phase === "waiting" || age > 15_000) {
    await clearExtensionLiveStatus();
  }
}

async function postMessagingCapturePayload(root, pruned, msgPayload) {
  const capBody = await attachMessagingCaptureContext(msgPayload);
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
    return { ok: false, error: json?.error || text || `HTTP ${res.status}` };
  }
  await recordProfileCaptureSuccess(pruned);
  return { ok: true, json };
}

/**
 * After profile capture during enrich: overlay scrape or open Message thread.
 * Non-fatal — enrich continues if messaging is unavailable.
 */
async function tryCaptureMessagingAfterProfile(tabId, root, profileUrl) {
  const automation = await fetchAutomationSettings(root);
  if (!automation?.autoCaptureMessagingInEnrich) {
    return { captured: false, reason: "disabled" };
  }

  const hasMessages = (payload) =>
    Boolean(
      payload?.extractedFields?.messagingMessages?.length &&
        payload?.extractedFields?.messagingParticipantProfileUrl,
    );

  let msgPayload = await scrapeMessagingFromTab(tabId);
  if (hasMessages(msgPayload)) {
    let pruned;
    try {
      pruned = await waitForProfileCaptureGap(root);
    } catch (e) {
      return { captured: false, error: e instanceof Error ? e.message : String(e) };
    }
    const out = await postMessagingCapturePayload(root, pruned, msgPayload);
    return out.ok
      ? { captured: true, method: "overlay" }
      : { captured: false, error: out.error };
  }

  let msgUrl = null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: getMessagingHrefFromProfilePage,
    });
    msgUrl = typeof result === "string" ? result : null;
  } catch {
    return { captured: false, reason: "no_message_link" };
  }
  if (!msgUrl) return { captured: false, reason: "no_message_link" };

  try {
    await chrome.tabs.update(tabId, { url: msgUrl });
    await waitForMessagingThreadTab(tabId);
  } catch (e) {
    if (profileUrl) {
      try {
        await chrome.tabs.update(tabId, { url: profileUrl });
        await waitForLinkedInProfileTab(tabId, 45000);
      } catch {
        /* ignore */
      }
    }
    return {
      captured: false,
      reason: "thread_timeout",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  await sleep(1500 + Math.floor(Math.random() * 2500));
  msgPayload = await scrapeMessagingFromTab(tabId);
  if (!hasMessages(msgPayload)) {
    if (profileUrl) {
      try {
        await chrome.tabs.update(tabId, { url: profileUrl });
      } catch {
        /* ignore */
      }
    }
    return { captured: false, reason: "empty_thread" };
  }

  let pruned2;
  try {
    pruned2 = await waitForProfileCaptureGap(root);
  } catch (e) {
    return { captured: false, error: e instanceof Error ? e.message : String(e) };
  }
  const out2 = await postMessagingCapturePayload(root, pruned2, msgPayload);
  if (profileUrl) {
    try {
      await chrome.tabs.update(tabId, { url: profileUrl });
    } catch {
      /* ignore */
    }
  }
  return out2.ok
    ? { captured: true, method: "thread" }
    : { captured: false, error: out2.error };
}

function profileRecentActivityUrl(profileUrl) {
  if (typeof profileUrl !== "string" || !profileUrl.trim()) return null;
  try {
    const u = new URL(profileUrl);
    const m = u.pathname.match(/\/in\/([^/]+)/i);
    if (!m?.[1]) return null;
    return `https://www.linkedin.com/in/${m[1]}/recent-activity/all/`;
  } catch {
    return null;
  }
}

async function postPostsCapturePayload(root, pruned, postsPayload, chainOpts = {}) {
  let capBody = await applyOutreachCampaignId(postsPayload);
  if (chainOpts.captureChainStep) {
    capBody = { ...capBody, captureChainStep: chainOpts.captureChainStep };
  }
  if (chainOpts.captureChainComplete !== undefined) {
    capBody = { ...capBody, captureChainComplete: chainOpts.captureChainComplete };
  }
  const res = await fetch(`${root.replace(/\/$/, "")}/api/ingest/capture`, {
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
    return { ok: false, error: json?.error || text || `HTTP ${res.status}` };
  }
  await recordProfileCaptureSuccess(pruned);
  return { ok: true, json };
}

/**
 * After profile capture during enrich: open recent activity and capture posts.
 */
async function tryCapturePostsAfterProfile(tabId, root, profileUrl) {
  const automation = await fetchAutomationSettings(root);
  if (!automation?.autoCapturePostsInEnrich) {
    return { captured: false, reason: "disabled" };
  }

  const activityUrl = profileRecentActivityUrl(profileUrl);
  if (!activityUrl) return { captured: false, reason: "no_profile_url" };

  try {
    await setExtensionLiveStatus({
      phase: "running",
      scope: "pipeline",
      title: "Automated capture",
      detail: "Loading recent posts…",
      confirmMemberId: null,
    });
    await chrome.tabs.update(tabId, { url: activityUrl });
    try {
      await waitForProfilePostsContextTab(tabId, 25000);
    } catch {
      /* LinkedIn may still hydrate on activity or feed/update permalink */
    }
    await sleep(1500 + Math.floor(Math.random() * 1500));
  } catch (e) {
    return {
      captured: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let result = { captured: false, reason: "no_posts" };
  try {
    const postsPayload = await scrapePostsFromTab(tabId);
    if (!postsPayload?.extractedFields?.profilePosts?.length) {
      result = { captured: false, reason: "no_posts" };
    } else {
      if (!postsPayload.extractedFields.targetProfileUrl && profileUrl) {
        postsPayload.extractedFields.targetProfileUrl = profileUrl;
      }

      let pruned;
      try {
        await setExtensionLiveStatus({
          phase: "waiting",
          scope: "pipeline",
          title: "Automated capture",
          detail: "Pace wait before saving posts…",
          confirmMemberId: null,
        });
        pruned = await waitForProfileCaptureGap(root);
      } catch (e) {
        return { captured: false, error: e instanceof Error ? e.message : String(e) };
      }

      const out = await postPostsCapturePayload(root, pruned, postsPayload, {
        captureChainStep: "posts",
        captureChainComplete: true,
      });

      result = out.ok
        ? {
            captured: true,
            postCount: postsPayload.extractedFields.profilePosts.length,
          }
        : { captured: false, error: out.error };
    }
  } finally {
    await returnTabToProfileAfterPostsCapture(tabId, profileUrl);
  }

  return result;
}

async function postProfileCaptureForTab(tabId, root, pruned, chainOpts = {}) {
  const tab = await chrome.tabs.get(tabId);
  if (!isLinkedInProfilePageUrl(tab.url)) {
    await appendCaptureTechLog({
      ok: false,
      stage: "precheck",
      error: "Not on a profile page.",
      tabUrl: tab?.url || null,
    });
    return { ok: false, error: "Not on a profile page." };
  }
  const result = await scrapeProfileFromTab(tabId, {
    suppressFocus: chainOpts.suppressFocus,
    forceFocusForScrape: Boolean(chainOpts.forceFocusForScrape),
  });
  if (!result) {
    await appendCaptureTechLog({
      ok: false,
      stage: "scrape",
      error: "Extractor returned nothing.",
      tabUrl: tab.url,
    });
    return { ok: false, error: "Extractor returned nothing." };
  }
  if (!profileCaptureHasMeaningfulFields(result)) {
    const diag = result.captureDiagnostics || {};
    const err =
      "Profile page loaded but no fields were extracted. LinkedIn may have changed the layout, or the tab loaded before content was ready.";
    await appendCaptureTechLog({
      ok: false,
      stage: "scrape",
      error: err,
      tabUrl: tab.url,
      diagnostics: diag,
      fields: summarizeFieldPresence(result.fieldPresence),
    });
    return {
      ok: false,
      error: err,
      diagnostics: diag,
    };
  }
  let capBody = await attachProfileCaptureContext(
    result,
    chainOpts.outreachMemberContext,
  );
  capBody = finalizeProfileCapturePayload(capBody, tab.url, chainOpts);
  if (!capBody.sourceUrl) {
    const err = "Missing sourceUrl after scrape (tab URL unavailable).";
    await appendCaptureTechLog({
      ok: false,
      stage: "payload",
      error: err,
      tabUrl: tab.url,
      fields: summarizeFieldPresence(result.fieldPresence),
    });
    return { ok: false, error: err };
  }
  if (chainOpts.captureChainStep) {
    capBody = { ...capBody, captureChainStep: chainOpts.captureChainStep };
  }
  if (chainOpts.captureChainComplete !== undefined) {
    capBody = { ...capBody, captureChainComplete: chainOpts.captureChainComplete };
  }
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
    const err = json?.error || text || `HTTP ${res.status}`;
    await appendCaptureTechLog({
      ok: false,
      stage: "ingest",
      error: err,
      tabUrl: tab.url,
      sourceUrl: capBody.sourceUrl,
      fields: summarizeFieldPresence(result.fieldPresence),
      httpStatus: res.status,
    });
    await publishUserNotice(err, { scope: chainOpts.scope || "capture", isError: true });
    return {
      ok: false,
      error: err,
    };
  }
  await appendCaptureTechLog({
    ok: true,
    stage: "ingest",
    tabUrl: tab.url,
    sourceUrl: capBody.sourceUrl,
    contactId: json?.contactId || null,
    fields: summarizeFieldPresence(result.fieldPresence),
  });
  await recordProfileCaptureSuccess(pruned);
  await chrome.storage.local.remove(LAST_ERROR_KEY);
  return { ok: true, json };
}

/**
 * One list-import round (scroll optional) → POST connections-page.
 */
async function importConnectionsListRound(tabId, base, round, postScrollMs, opts = {}) {
  const root = base.replace(/\/$/, "");
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url?.includes("linkedin.com")) {
    return { ok: false, error: "Tab is not LinkedIn.", stop: true };
  }
  if (!isConnectionsListPageUrl(tab.url)) {
    return {
      ok: false,
      error: "Open a people search or Connections list first.",
      stop: true,
    };
  }
  try {
    await prepareListPageForScrape(tabId, postScrollMs, opts);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stop: true,
    };
  }
  let pruned;
  try {
      pruned = await waitForListImportGap(base);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stop: true,
    };
  }
  const [{ result: listPayload }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeConnectionsList,
  });
  if (!listPayload?.rows?.length) {
    return {
      ok: false,
      error:
        round === 0
          ? "No people visible after auto-scroll — open a people search or Connections list with rows on screen."
          : "No new rows after scroll — end of list or layout changed.",
      stop: round > 0,
      imported: 0,
    };
  }
  const listBody = await applyOutreachCampaignId(listPayload);
  let res = await fetch(`${root}/api/ingest/connections-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(listBody),
  });
  let text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (res.status === 429) {
    const retrySec = Math.max(
      1,
      parseInt(res.headers.get("Retry-After") || "45", 10) || 45,
    );
    await sleep(retrySec * 1000);
    try {
      pruned = await waitForListImportGap(base);
    } catch (e2) {
      return {
        ok: false,
        error: e2 instanceof Error ? e2.message : String(e2),
        stop: true,
      };
    }
    res = await fetch(`${root}/api/ingest/connections-page`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listBody),
    });
    text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  if (!res.ok) {
    return {
      ok: false,
      error: json?.error || text || `HTTP ${res.status}`,
      stop: res.status !== 429,
      imported: 0,
    };
  }
  await recordListImportSuccess(pruned, json.imported ?? 0);
  await chrome.storage.local.remove(LAST_ERROR_KEY);
  return {
    ok: true,
    imported: json.imported ?? 0,
    receivedCount: json.receivedCount,
    stop: false,
  };
}

/** Open next thin/missing profile, capture, ack. Uses Clin pacing + daily cap. */
async function enrichOneProfileStep(tabId, base, firstOpen, opts = {}) {
  const root = base.replace(/\/$/, "");
  const q = firstOpen ? "?first=1" : "?first=0";
  let nextRes;
  try {
    nextRes = await fetch(`${root}/api/automation/next${q}`);
  } catch (e) {
    return { ok: false, error: String(e), done: true };
  }
  let next;
  try {
    next = await nextRes.json();
  } catch {
    return { ok: false, error: "Bad response from Clin.", done: true };
  }
  if (!nextRes.ok) {
    return { ok: false, error: next.error || `HTTP ${nextRes.status}`, done: true };
  }
  if (next.done || !next.contact) {
    return {
      ok: true,
      done: true,
      reason: next.reason || "no_contacts",
    };
  }
  if (next.waitBeforeMs > 0) {
    await sleep(next.waitBeforeMs);
  }
  try {
    await focusAutomationTab(tabId, opts);
    await navigateToProfileForAutomation(tabId, next.contact.linkedinUrl, opts);
  } catch (e) {
    await postAutomationAck(base, next.contact.id, "error");
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      done: false,
    };
  }
  await sleep(2000 + Math.floor(Math.random() * 3000));
  let pruned;
  try {
    pruned = await waitForProfileCaptureGap(base);
  } catch (e) {
    await postAutomationAck(base, next.contact.id, "error");
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      done: false,
    };
  }
  const automation = await fetchAutomationSettings(base);
  const postsEnabled = Boolean(automation?.autoCapturePostsInEnrich);
  const out = await postProfileCaptureForTab(tabId, root, pruned, {
    captureChainStep: "profile",
    captureChainComplete: !postsEnabled,
  });
  if (!out.ok) {
    await postAutomationAck(base, next.contact.id, "error");
    return { ok: false, error: out.error || "Profile capture failed.", done: false };
  }
  const savedId = out.json?.contactId;
  if (savedId && savedId !== next.contact.id) {
    await postAutomationAck(base, next.contact.id, "error");
    return {
      ok: false,
      error: "Capture matched a different contact than planned.",
      done: false,
    };
  }
  await postAutomationAck(base, next.contact.id, "ok");

  let posts = { captured: false };
  if (postsEnabled) {
    try {
      posts = await tryCapturePostsAfterProfile(
        tabId,
        root,
        next.contact.linkedinUrl,
      );
    } catch {
      /* posts are optional */
    }
  }

  let messaging = { captured: false };
  try {
    messaging = await tryCaptureMessagingAfterProfile(
      tabId,
      root,
      next.contact.linkedinUrl,
    );
  } catch {
    /* messaging is optional */
  }

  return {
    ok: true,
    done: false,
    contactName: next.contact.fullName,
    profileDepth: next.contact.profileDepth,
    postsCaptured: Boolean(posts.captured),
    messagingCaptured: Boolean(messaging.captured),
  };
}

/**
 * List import rounds → optional profile enrich steps. Runs in the service worker.
 */
async function runClinPipeline(opts) {
  const tabId = opts.tabId;
  const listRounds = Math.max(0, Math.min(20, Number(opts.listRounds) || 0));
  const enrichSteps = Math.max(0, Math.min(25, Number(opts.enrichSteps) || 0));
  const fullRun = Boolean(opts.fullRun);
  const suppressFocus = Boolean(opts.suppressFocus);
  const runKey = typeof opts.runKey === "string" ? opts.runKey : null;
  const shouldContinue = async () => {
    if (!runKey) return true;
    const stored = await chrome.storage.local.get([runKey]);
    return Boolean(stored[runKey]);
  };
  const postScrollMs = Math.min(
    12000,
    Math.max(500, Number(opts.postScrollMs) || 2800),
  );
  const base = await getApiBase();
  const automation = await fetchAutomationSettings(base);
  if (!automation?.enabled) {
    return {
      ok: false,
      error: "Turn on Background enrich in Clin → Settings.",
    };
  }
  await setExtensionLiveStatus({
    phase: "running",
    scope: "pipeline",
    title: "Automated capture",
    detail: "Starting paced import and profile capture…",
    confirmMemberId: null,
  });
  try {
    await focusAutomationTab(tabId, { suppressFocus });
  } catch {
    return { ok: false, error: "LinkedIn tab was closed." };
  }
  let currentTab;
  try {
    currentTab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, error: "LinkedIn tab was closed." };
  }
  const canImportFromCurrentTab = Boolean(
    currentTab?.url && isConnectionsListPageUrl(currentTab.url),
  );
  const summary = {
    listImported: 0,
    profilesCaptured: 0,
    messagingCaptured: 0,
    errors: [],
    listRoundsRun: 0,
    profileStepsRun: 0,
    campaignCaptureMode: false,
  };

  let requestedListRounds = fullRun ? Math.max(1, listRounds || 12) : listRounds;
  if (requestedListRounds > 0 && !canImportFromCurrentTab) {
    requestedListRounds = 0;
    summary.errors.push(
      "List import skipped: selected tab is not a people-search / Connections page. Continuing campaign profile capture only.",
    );
  }
  let consecutiveNoRows = 0;
  for (let r = 0; r < requestedListRounds; r++) {
    if (!(await shouldContinue())) {
      summary.errors.push("Stopped by user.");
      await setExtensionLiveStatus({
        phase: "success",
        scope: "pipeline",
        title: "Automated capture stopped",
        detail: "Stopped by user during list import.",
        confirmMemberId: null,
      });
      return { ok: true, summary, cancelled: true };
    }
    await setExtensionLiveStatus({
      phase: "running",
      scope: "pipeline",
      title: "Automated capture",
      detail: `Importing list — round ${r + 1} of ${requestedListRounds}…`,
      confirmMemberId: null,
    });
    const round = await importConnectionsListRound(tabId, base, r, postScrollMs, {
      suppressFocus,
    });
    summary.listRoundsRun += 1;
    if (!round.ok) {
      const roundErr = round.error || "List import failed.";
      summary.errors.push(roundErr);
      if (/client pace:/i.test(roundErr)) {
        await publishUserNotice(roundErr, { scope: "pipeline" });
      }
      if (round.stop) break;
      continue;
    }
    const imported = round.imported || 0;
    summary.listImported += imported;
    if (fullRun) {
      consecutiveNoRows = imported > 0 ? 0 : consecutiveNoRows + 1;
    }
    if (round.stop) break;
    if (fullRun && consecutiveNoRows >= 2) break;
  }

  const root = base.replace(/\/$/, "");
  const extensionCampaignId = await resolveExtensionImportCampaignId();
  const campaignCtx = await getExtensionCampaignContext(root, extensionCampaignId);
  const hasCaptureTargetCampaign = Boolean(extensionCampaignId);
  const runCampaignQueueCapture = fullRun && hasCaptureTargetCampaign;
  summary.campaignCaptureMode = runCampaignQueueCapture;

  const steps = runCampaignQueueCapture
    ? Math.max(40, enrichSteps > 0 ? enrichSteps : 250)
    : fullRun
      ? Math.max(
          25,
          enrichSteps > 0
            ? enrichSteps
            : automation.autoEnrichAfterList
              ? Math.min(250, Math.max(40, summary.listImported * 3))
              : 0,
        )
      : enrichSteps > 0
        ? enrichSteps
        : automation.autoEnrichAfterList && summary.listImported > 0
          ? Math.min(15, summary.listImported)
          : 0;

  const attemptedMemberIds = [];
  for (let e = 0; e < steps; e++) {
    if (!(await shouldContinue())) {
      summary.errors.push("Stopped by user.");
      await setExtensionLiveStatus({
        phase: "success",
        scope: "pipeline",
        title: "Automated capture stopped",
        detail: "Stopped by user during profile capture.",
        confirmMemberId: null,
      });
      return { ok: true, summary, cancelled: true };
    }
    await setExtensionLiveStatus({
      phase: "running",
      scope: "pipeline",
      title: "Automated capture",
      detail: runCampaignQueueCapture
        ? `Capturing campaign profile ${e + 1}…`
        : `Enriching profile ${e + 1}${steps ? ` of ${steps}` : ""}…`,
      confirmMemberId: null,
    });
    const step = runCampaignQueueCapture
      ? await captureOneCampaignMemberProfileStep(tabId, base, {
          suppressFocus,
          attemptedMemberIds,
        })
      : await enrichOneProfileStep(tabId, base, e === 0 && listRounds === 0, {
          suppressFocus,
        });
    summary.profileStepsRun += 1;
    if (!step.ok) {
      const stepErr = step.error || "Enrich step failed.";
      summary.errors.push(stepErr);
      if (/client pace:/i.test(stepErr)) {
        await publishUserNotice(stepErr, { scope: "pipeline" });
      }
      if (step.done) break;
      continue;
    }
    if (step.done) break;
    if (step.skipped) continue;
    summary.profilesCaptured += 1;
    if (step.messagingCaptured) summary.messagingCaptured += 1;
    if (step.capturedMemberId && !attemptedMemberIds.includes(step.capturedMemberId)) {
      attemptedMemberIds.push(step.capturedMemberId);
    }
  }

  await setExtensionLiveStatus({
    phase: "success",
    scope: "pipeline",
    title: "Automated capture finished",
    detail: `${summary.profilesCaptured} profile(s) captured · ${summary.listImported} imported from list`,
    confirmMemberId: null,
  });
  return { ok: true, summary };
}

async function skipCaptureQueueMemberRemote(root, campaignId, memberId) {
  const res = await fetch(`${root.replace(/\/$/, "")}/api/extension/capture-queue/skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId,
      ...(memberId ? { memberId } : {}),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  }
  invalidateExtensionCampaignContext();
  return { ok: true, json };
}

async function clearCaptureQueueSkipsRemote(root, campaignId) {
  const res = await fetch(`${root.replace(/\/$/, "")}/api/extension/capture-queue/skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId, clearAll: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  }
  invalidateExtensionCampaignContext();
  return { ok: true, json };
}

async function captureOneCampaignMemberProfileStep(tabId, base, opts = {}) {
  const attempted = Array.isArray(opts.attemptedMemberIds)
    ? opts.attemptedMemberIds
    : [];
  const root = base.replace(/\/$/, "");
  const campaignId = await resolveExtensionImportCampaignId();
  const ctx = await getExtensionCampaignContext(root, campaignId, {
    attemptedMemberIds: attempted,
  });
  const campaignName = ctx?.captureTargetCampaignName || null;
  const nextProfileUrl = ctx?.captureTargetQueue?.nextProfileUrl || null;
  const nextMemberId = ctx?.captureTargetQueue?.nextMemberId || null;
  const nextContactId = ctx?.captureTargetQueue?.nextContactId || null;
  if (!nextProfileUrl) {
    return {
      ok: true,
      done: true,
      reason: campaignName
        ? `campaign_queue_complete:${campaignName}`
        : "campaign_queue_complete",
    };
  }
  if (nextMemberId && attempted.includes(nextMemberId)) {
    invalidateExtensionCampaignContext();
    if (campaignId) {
      await skipCaptureQueueMemberRemote(root, campaignId, nextMemberId);
    }
    return { ok: true, done: false, skipped: true, reason: "already_captured_this_run" };
  }
  try {
    await focusAutomationTab(tabId, opts);
    await navigateToProfileForAutomation(tabId, nextProfileUrl, opts);
  } catch (e) {
    return {
      ok: false,
      done: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  await sleep(1200 + Math.floor(Math.random() * 1400));
  let pruned;
  try {
    pruned = await waitForProfileCaptureGap(base);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      done: /max per rolling hour/i.test(msg),
      error: msg,
    };
  }
  const automation = await fetchAutomationSettings(base);
  const postsEnabled = Boolean(automation?.autoCapturePostsInEnrich);
  if (nextMemberId || nextProfileUrl) {
    await setLastOutreachMemberContext({
      memberId: nextMemberId,
      linkedinUrl: nextProfileUrl,
      fullName: ctx?.captureTargetQueue?.nextProfileName ?? null,
    });
  }
  const out = await postProfileCaptureForTab(tabId, root, pruned, {
    captureChainStep: "profile",
    captureChainComplete: !postsEnabled,
    forceFocusForScrape: true,
    suppressFocus: opts.suppressFocus,
    scope: "pipeline",
    outreachMemberContext:
      nextMemberId || nextProfileUrl
        ? { memberId: nextMemberId, linkedinUrl: nextProfileUrl }
        : undefined,
  });
  if (!out.ok) {
    return {
      ok: false,
      done: false,
      error: out.error || "Campaign profile capture failed.",
    };
  }
  const savedId = out.json?.contactId;
  if (nextContactId && savedId && savedId !== nextContactId) {
    return {
      ok: false,
      done: false,
      error: "Capture matched a different contact than the campaign member.",
    };
  }
  let postsCaptured = false;
  if (postsEnabled) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const posts = await tryCapturePostsAfterProfile(
        tabId,
        root,
        tab.url?.includes("/in/") ? tab.url : nextProfileUrl,
      );
      postsCaptured = Boolean(posts.captured);
    } catch {
      /* optional */
    }
  }

  let messaging = { captured: false };
  try {
    messaging = await tryCaptureMessagingAfterProfile(
      tabId,
      root,
      nextProfileUrl,
    );
  } catch {
    /* messaging is optional */
  }

  invalidateExtensionCampaignContext();

  return {
    ok: true,
    done: false,
    capturedMemberId: nextMemberId || null,
    postsCaptured,
    messagingCaptured: Boolean(messaging.captured),
  };
}

async function loadPipelineState() {
  const stored = await chrome.storage.local.get([PIPELINE_STATE_KEY]);
  return stored[PIPELINE_STATE_KEY] || null;
}

async function savePipelineState(state) {
  await chrome.storage.local.set({ [PIPELINE_STATE_KEY]: state });
}

async function resolvePipelineTabId(preferredTabId) {
  const tryTabId = async (candidate) => {
    if (typeof candidate !== "number") return null;
    try {
      const tab = await chrome.tabs.get(candidate);
      if (!tab?.id || !isLinkedInHostUrl(tab.url || "")) return null;
      return tab.id;
    } catch {
      return null;
    }
  };

  const fromPreferred = await tryTabId(preferredTabId);
  if (fromPreferred != null) return fromPreferred;

  const stored = await chrome.storage.local.get([PIPELINE_TAB_ID_KEY]);
  const fromStored = await tryTabId(stored[PIPELINE_TAB_ID_KEY]);
  if (fromStored != null) return fromStored;

  const linkedInTabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
  for (const tab of linkedInTabs) {
    const valid = await tryTabId(tab?.id);
    if (valid != null) return valid;
  }
  return null;
}

async function pinPipelineTab(tabId) {
  if (typeof tabId !== "number") return;
  await chrome.storage.local.set({ [PIPELINE_TAB_ID_KEY]: tabId });
  try {
    await chrome.tabs.update(tabId, { autoDiscardable: false });
  } catch {
    /* tab may be gone */
  }
}

async function unpinPipelineTab(tabId) {
  if (typeof tabId !== "number") return;
  try {
    await chrome.tabs.update(tabId, { autoDiscardable: true });
  } catch {
    /* ignore */
  }
}

async function schedulePipelineTick(delayMs = 1200) {
  const mins = Math.max(0.01, Math.min(5, delayMs / 60000));
  await chrome.alarms.clear(PIPELINE_ALARM);
  await chrome.alarms.create(PIPELINE_ALARM, { delayInMinutes: mins });
}

async function finishPipelineRun(state, opts = {}) {
  const tabId = state?.tabId;
  await chrome.alarms.clear(PIPELINE_ALARM);
  await chrome.storage.local.set({ [PIPELINE_RUN_KEY]: false });
  if (typeof tabId === "number") await unpinPipelineTab(tabId);

  state.active = false;
  state.finishedAt = Date.now();
  await savePipelineState(state);

  if (opts.cancelled) {
    await setExtensionLiveStatus({
      phase: "success",
      scope: "pipeline",
      title: "Automated capture stopped",
      detail: opts.detail || "Stopped by user.",
      confirmMemberId: null,
    });
    return;
  }
  if (opts.error) {
    await setExtensionLiveStatus({
      phase: "error",
      scope: "pipeline",
      title: "Automated capture stopped",
      detail: opts.error,
      confirmMemberId: null,
    });
    return;
  }
  const s = state?.summary || {};
  await setExtensionLiveStatus({
    phase: "success",
    scope: "pipeline",
    title: "Automated capture finished",
    detail: `${s.profilesCaptured ?? 0} profile(s) captured · ${s.listImported ?? 0} imported from list`,
    confirmMemberId: null,
  });
}

async function computeProfileStepsTotal(state, base, automation) {
  const extensionCampaignId = await resolveExtensionImportCampaignId();
  const runCampaignQueueCapture = state.fullRun && Boolean(extensionCampaignId);
  state.campaignCaptureMode = runCampaignQueueCapture;
  if (runCampaignQueueCapture) {
    const ctx = await getExtensionCampaignContext(
      base.replace(/\/$/, ""),
      extensionCampaignId,
    );
    const q = ctx?.captureTargetQueue;
    const remaining = Math.max(
      0,
      (q?.profileMissing ?? 0) + (q?.profileThin ?? 0) - (q?.skippedCount ?? 0),
    );
    if (state.enrichSteps > 0) {
      return Math.min(state.enrichSteps, Math.max(1, remaining || 1));
    }
    return Math.max(1, Math.min(50, remaining || 1));
  }
  if (state.fullRun) {
    return Math.max(
      25,
      state.enrichSteps > 0
        ? state.enrichSteps
        : automation?.autoEnrichAfterList
          ? Math.min(250, Math.max(40, state.summary.listImported * 3))
          : 0,
    );
  }
  if (state.enrichSteps > 0) return state.enrichSteps;
  if (automation?.autoEnrichAfterList && state.summary.listImported > 0) {
    return Math.min(15, state.summary.listImported);
  }
  return 0;
}

async function beginProfilePhase(state, base, automation) {
  state.phase = "profile";
  state.profileStepIndex = 0;
  state.profileStepsTotal = await computeProfileStepsTotal(state, base, automation);
}

async function runPipelineTick() {
  const state = await loadPipelineState();
  if (!state?.active) {
    const stored = await chrome.storage.local.get([PIPELINE_RUN_KEY]);
    if (stored[PIPELINE_RUN_KEY]) {
      await chrome.storage.local.set({ [PIPELINE_RUN_KEY]: false });
    }
    return;
  }

  if (state.pauseUntil && Date.now() < state.pauseUntil) {
    await schedulePipelineTick(state.pauseUntil - Date.now() + 200);
    return;
  }
  state.pauseUntil = 0;

  const tabId = await resolvePipelineTabId(state.tabId);
  if (tabId == null) {
    await finishPipelineRun(state, { error: "LinkedIn tab was closed." });
    return;
  }
  if (tabId !== state.tabId) {
    state.tabId = tabId;
    await pinPipelineTab(tabId);
  }

  const base = state.base || (await getApiBase());
  state.base = base;
  const automation = await fetchAutomationSettings(base);
  if (!automation?.enabled) {
    await finishPipelineRun(state, {
      error: "Turn on Background enrich in Clin → Settings.",
    });
    return;
  }

  const suppressFocus = Boolean(state.suppressFocus);
  const postScrollMs = state.postScrollMs || 2800;
  const summary = state.summary;

  try {
    if (state.phase === "list") {
      await setExtensionLiveStatus({
        phase: "running",
        scope: "pipeline",
        title: "Automated capture",
        detail: `Importing list — round ${state.listRoundIndex + 1} of ${state.listRoundsTotal}…`,
        confirmMemberId: null,
      });
      const round = await importConnectionsListRound(
        tabId,
        base,
        state.listRoundIndex,
        postScrollMs,
        { suppressFocus },
      );
      summary.listRoundsRun += 1;
      state.listRoundIndex += 1;
      if (!round.ok) {
        const roundErr = round.error || "List import failed.";
        summary.errors.push(roundErr);
        if (/client pace:/i.test(roundErr)) {
          await publishUserNotice(roundErr, { scope: "pipeline" });
        }
        if (round.stop) {
          await beginProfilePhase(state, base, automation);
        } else {
          await savePipelineState(state);
          await schedulePipelineTick(3000);
          return;
        }
      } else {
        const imported = round.imported || 0;
        summary.listImported += imported;
        if (state.fullRun) {
          state.consecutiveNoRows = imported > 0 ? 0 : state.consecutiveNoRows + 1;
        }
        if (round.stop || (state.fullRun && state.consecutiveNoRows >= 2)) {
          await beginProfilePhase(state, base, automation);
        } else if (state.listRoundIndex >= state.listRoundsTotal) {
          await beginProfilePhase(state, base, automation);
        } else {
          await savePipelineState(state);
          await schedulePipelineTick(1500);
          return;
        }
      }
    }

    if (state.phase === "profile") {
      if (state.profileStepsTotal <= 0) {
        await finishPipelineRun(state, { ok: true });
        return;
      }
      if (state.profileStepIndex >= state.profileStepsTotal) {
        await finishPipelineRun(state, { ok: true });
        return;
      }

      await setExtensionLiveStatus({
        phase: "running",
        scope: "pipeline",
        title: "Automated capture",
        detail: state.campaignCaptureMode
          ? `Capturing campaign profile ${state.profileStepIndex + 1}…`
          : `Enriching profile ${state.profileStepIndex + 1} of ${state.profileStepsTotal}…`,
        confirmMemberId: null,
      });

      const step = state.campaignCaptureMode
        ? await captureOneCampaignMemberProfileStep(tabId, base, {
            suppressFocus,
            attemptedMemberIds: state.capturedMemberIdsThisRun || [],
          })
        : await enrichOneProfileStep(
            tabId,
            base,
            state.profileStepIndex === 0 && state.listRoundsTotal === 0,
            { suppressFocus },
          );

      summary.profileStepsRun += 1;
      state.profileStepIndex += 1;

      if (!step.ok) {
        const stepErr = step.error || "Enrich step failed.";
        summary.errors.push(stepErr);
        if (/client pace:/i.test(stepErr)) {
          await publishUserNotice(stepErr, { scope: "pipeline" });
          if (/max per rolling hour/i.test(stepErr)) {
            state.pauseUntil = Date.now() + 3 * 60 * 1000;
            await setExtensionLiveStatus({
              phase: "waiting",
              scope: "pipeline",
              title: "Automated capture — pace wait",
              detail: "Hourly cap hit — resuming in ~3 minutes…",
              confirmMemberId: null,
            });
            await savePipelineState(state);
            await schedulePipelineTick(3 * 60 * 1000);
            return;
          }
        }
        if (step.done) {
          await finishPipelineRun(state, { ok: true });
          return;
        }
        state.transientErrors = (state.transientErrors || 0) + 1;
        const delay = Math.min(30000, 2000 * state.transientErrors);
        await savePipelineState(state);
        await schedulePipelineTick(delay);
        return;
      }

      state.transientErrors = 0;
      if (step.done) {
        await finishPipelineRun(state, { ok: true });
        return;
      }
      if (step.skipped) {
        await savePipelineState(state);
        await schedulePipelineTick(600);
        return;
      }
      summary.profilesCaptured += 1;
      if (step.messagingCaptured) summary.messagingCaptured += 1;
      if (step.capturedMemberId) {
        const seen = state.capturedMemberIdsThisRun || [];
        if (!seen.includes(step.capturedMemberId)) {
          state.capturedMemberIdsThisRun = [...seen, step.capturedMemberId];
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    summary.errors.push(msg);
    state.transientErrors = (state.transientErrors || 0) + 1;
    if (state.transientErrors >= 8) {
      await finishPipelineRun(state, { error: msg });
      return;
    }
    await savePipelineState(state);
    await schedulePipelineTick(Math.min(30000, 3000 * state.transientErrors));
    return;
  }

  await savePipelineState(state);
  await schedulePipelineTick(1500 + Math.floor(Math.random() * 2000));
}

async function startClinPipeline(opts) {
  const tabId = opts.tabId;
  if (typeof tabId !== "number") {
    return { ok: false, error: "Missing tab id." };
  }
  const base = await getApiBase();
  const automation = await fetchAutomationSettings(base);
  if (!automation?.enabled) {
    return {
      ok: false,
      error: "Turn on Background enrich in Clin → Settings.",
    };
  }

  let currentTab;
  try {
    currentTab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, error: "LinkedIn tab was closed." };
  }

  const listRounds = Math.max(0, Math.min(20, Number(opts.listRounds) || 0));
  const enrichSteps = Math.max(0, Math.min(25, Number(opts.enrichSteps) || 0));
  const fullRun = Boolean(opts.fullRun);
  const suppressFocus = Boolean(opts.suppressFocus);
  const postScrollMs = Math.min(
    12000,
    Math.max(500, Number(opts.postScrollMs) || 2800),
  );

  let requestedListRounds = fullRun ? Math.max(1, listRounds || 12) : listRounds;
  const canImportFromCurrentTab = Boolean(
    currentTab?.url && isConnectionsListPageUrl(currentTab.url),
  );
  const summary = {
    listImported: 0,
    profilesCaptured: 0,
    messagingCaptured: 0,
    errors: [],
    listRoundsRun: 0,
    profileStepsRun: 0,
    campaignCaptureMode: false,
  };
  if (requestedListRounds > 0 && !canImportFromCurrentTab) {
    requestedListRounds = 0;
    summary.errors.push(
      "List import skipped: selected tab is not a people-search / Connections page. Continuing campaign profile capture only.",
    );
  }

  await pinPipelineTab(tabId);
  const state = {
    active: true,
    tabId,
    suppressFocus,
    postScrollMs,
    fullRun,
    enrichSteps,
    listRoundIndex: 0,
    listRoundsTotal: requestedListRounds,
    profileStepIndex: 0,
    profileStepsTotal: 0,
    phase: requestedListRounds > 0 ? "list" : "profile",
    consecutiveNoRows: 0,
    transientErrors: 0,
    pauseUntil: 0,
    campaignCaptureMode: false,
    capturedMemberIdsThisRun: [],
    summary,
    base,
  };

  if (state.phase === "profile") {
    await beginProfilePhase(state, base, automation);
  }

  await savePipelineState(state);
  await chrome.storage.local.set({ [PIPELINE_RUN_KEY]: true });
  await setExtensionLiveStatus({
    phase: "running",
    scope: "pipeline",
    title: "Automated capture",
    detail: suppressFocus
      ? "Running in background — you can switch tabs freely."
      : "Starting paced import and profile capture…",
    confirmMemberId: null,
  });
  await schedulePipelineTick(400);
  return { ok: true, started: true, summary };
}

async function resumePipelineIfNeeded() {
  const state = await loadPipelineState();
  if (!state?.active) return;
  const stored = await chrome.storage.local.get([PIPELINE_RUN_KEY]);
  if (!stored[PIPELINE_RUN_KEY]) {
    await chrome.storage.local.set({ [PIPELINE_RUN_KEY]: true });
  }
  const alarm = await chrome.alarms.get(PIPELINE_ALARM);
  if (!alarm) await schedulePipelineTick(2000);
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
      pruned = await waitForProfileCaptureGap(base);
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
  void clearStaleCaptureLiveStatus();
  pollPendingSelfCapture();
  void resumePipelineIfNeeded();
});

chrome.runtime.onStartup.addListener(() => {
  void clearStaleCaptureLiveStatus();
  void resumePipelineIfNeeded();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PENDING_SELF_ALARM) {
    pollPendingSelfCapture();
    return;
  }
  if (alarm.name === PIPELINE_ALARM) {
    void runPipelineTick();
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
      const scope = normalizeCaptureScope(msg.scope);
      campaignContextFetchedAt = 0;
      campaignContextPayload = null;

      const base = await getApiBase();
      const healthCheck = await fetchClinHealth(base);
      if (!healthCheck.ok) {
        sendResponse({ ok: false, error: healthCheck.error });
        return;
      }

      let [tab] = await chrome.tabs.query({
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

      const runListCaptureEarly =
        scope === "connections" ||
        (scope === "auto" && isConnectionsListPageUrl(tab.url));
      const paceCheck = runListCaptureEarly
        ? await checkPaceForListImport(base)
        : await checkPaceForProfileCapture(base);
      if (!paceCheck.ok) {
        await publishUserNotice(paceCheck.message, {
          phase: paceCheck.kind === "gap" ? "waiting" : "error",
          scope: "capture",
        });
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

      let runMessagingCapture = scope === "messaging";
      if (scope === "auto") {
        if (isMessagingThreadUrl(tab.url)) {
          runMessagingCapture = true;
        } else {
          try {
            const [{ result: vis }] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: isMessagingDomVisiblePage,
            });
            runMessagingCapture = Boolean(vis?.visible);
          } catch {
            /* ignore */
          }
        }
      }

      if (runMessagingCapture) {
        let canRun = isMessagingThreadUrl(tab.url);
        if (!canRun) {
          try {
            const [{ result: vis }] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: isMessagingDomVisiblePage,
            });
            canRun = Boolean(vis?.visible);
          } catch {
            /* ignore */
          }
        }
        if (!canRun) {
          sendResponse({
            ok: false,
            error:
              "Open the 1:1 chat: go to linkedin.com/messaging, open the thread, scroll to load messages, then click Capture 1:1 thread in the extension.",
          });
          return;
        }
        tab = (await ensureMessagingThreadUrlForCapture(tab.id)) || tab;
        const msgPayload = await scrapeMessagingFromTab(tab.id);
        if (!msgPayload?.extractedFields?.messagingMessages?.length) {
          sendResponse({
            ok: false,
            error:
              "No messages read — use /messaging/thread/… in the address bar, scroll the thread, wait 2s, try again. Or paste the thread on the contact page for LLM analysis.",
          });
          return;
        }
        if (!msgPayload?.extractedFields?.messagingParticipantProfileUrl) {
          sendResponse({
            ok: false,
            error:
              "Messages found but not their profile link — open the thread from their profile (Message button) and capture again.",
          });
          return;
        }
        const capBody = await attachMessagingCaptureContext(msgPayload);
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
        await recordProfileCaptureSuccess(pruned);
        await chrome.storage.local.remove(LAST_ERROR_KEY);
        sendResponse({
          ok: true,
          data: {
            ...json,
            fieldPresence:
              json.fieldPresence ?? msgPayload.fieldPresence,
            messageCount:
              msgPayload.extractedFields?.messagingMessages?.length ?? 0,
          },
          mode: "messaging",
        });
        return;
      }

      const runPostsCapture = scope === "posts";

      if (runPostsCapture) {
        if (!isProfilePostsContextUrl(tab.url)) {
          sendResponse({
            ok: false,
            error:
              "Open their profile (/in/…), Recent activity, or a post permalink (/feed/update/…), scroll posts into view, then Capture posts.",
          });
          return;
        }
        const postsPayload = await scrapePostsFromTab(tab.id);
        if (!postsPayload?.extractedFields?.profilePosts?.length) {
          sendResponse({
            ok: false,
            error:
              "No posts found — open Recent activity or scroll their profile feed, then try again.",
          });
          return;
        }
        const capBody = await applyOutreachCampaignId(postsPayload);
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
        await recordProfileCaptureSuccess(pruned);
        await chrome.storage.local.remove(LAST_ERROR_KEY);
        sendResponse({
          ok: true,
          data: {
            ...json,
            fieldPresence:
              json.fieldPresence ?? postsPayload.fieldPresence,
            postCount:
              postsPayload.extractedFields?.profilePosts?.length ?? 0,
          },
          mode: "posts",
        });
        return;
      }

      if (
        scope === "connections" ||
        (scope === "auto" && isConnectionsListPageUrl(tab.url))
      ) {
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

        await recordListImportSuccess(pruned, json.imported);
        await chrome.storage.local.remove(LAST_ERROR_KEY);

        const automation = await fetchAutomationSettings(root);
        let pipeline = null;
        if (
          automation?.enabled &&
          automation?.autoEnrichAfterList &&
          (json.imported ?? 0) > 0
        ) {
          const enrichSteps = Math.min(15, json.imported ?? 5);
          pipeline = runClinPipeline({
            tabId: tab.id,
            listRounds: 0,
            enrichSteps,
            postScrollMs: 2800,
          }).catch((err) => ({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }));
        }

        sendResponse({
          ok: true,
          data: {
            ...json,
            enrichQueued: Boolean(pipeline),
            enrichSteps: pipeline ? Math.min(15, json.imported ?? 5) : 0,
          },
          mode: "connections",
        });
        return;
      }

      const runProfileCapture =
        scope === "profile" ||
        (scope === "auto" &&
          isLinkedInProfilePageUrl(tab.url) &&
          !isConnectionsListPageUrl(tab.url));

      if (!runProfileCapture) {
        sendResponse({
          ok: false,
          error:
            "Open a profile (/in/…), messaging thread, connections list, or use Capture posts on a profile.",
        });
        return;
      }

      if (!isLinkedInProfilePageUrl(tab.url)) {
        sendResponse({
          ok: false,
          error: "Open a LinkedIn profile (/in/…) to capture profile fields.",
        });
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: prepProfilePageForScrape,
          args: [9000],
        });
      } catch {
        /* best-effort prep; continue with scrape */
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

      await recordProfileCaptureSuccess(pruned);
      await chrome.storage.local.remove(LAST_ERROR_KEY);
      const scrapeFp = result.fieldPresence;
      sendResponse({
        ok: true,
        data: {
          ...json,
          fieldPresence: json.fieldPresence ?? scrapeFp,
          captureMethods: result.captureMethods,
          captureDiagnostics: result.captureDiagnostics,
        },
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
        pruned = await waitForProfileCaptureGap(base);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await publishUserNotice(err, { scope: "capture" });
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

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: prepProfilePageForScrape,
          args: [9000],
        });
      } catch {
        /* best-effort prep; continue with scrape */
      }
      const result = await scrapeProfileFromTab(tabId);

      if (!result) {
        sendResponse({ ok: false, error: "Extractor returned nothing." });
        return;
      }

      const root = base.replace(/\/$/, "");
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

      await recordProfileCaptureSuccess(pruned);
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

      try {
        await prepareListPageForScrape(tabId, postScrollMs);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await publishUserNotice(err, { scope: "pipeline" });
        sendResponse({ ok: false, error: err, stopSprint: true });
        return;
      }

      let pruned;
      try {
        pruned = await waitForListImportGap(base);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await publishUserNotice(err, { scope: "pipeline" });
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
              ? "No profile links after auto-scroll — open people search or Connections with visible rows."
              : "No rows after scroll — end of list or layout changed.",
          stopSprint: round > 0,
        });
        return;
      }

      const root = base.replace(/\/$/, "");

      const doPost = async () => {
        const listBody = await applyOutreachCampaignId(listPayload);
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
        const hourly = /rolling hourly|hourly .* limit|max per rolling hour|list import limit/i.test(
          errMsg,
        );
        if (hourly) {
          sendResponse({
            ok: false,
            error:
              json?.error ||
              "Rolling hourly list import limit — raise cap in Clin /settings or wait.",
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
          pruned = await waitForListImportGap(base);
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

      await recordListImportSuccess(pruned, json.imported);
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
  if (msg?.type === "CLIN_CAPTURE_QUEUE_SKIP") {
    void (async () => {
      const base = await getApiBase();
      const root = base.replace(/\/$/, "");
      const campaignId =
        typeof msg.campaignId === "string" && msg.campaignId.trim()
          ? msg.campaignId.trim()
          : await resolveExtensionImportCampaignId();
      if (!campaignId) {
        sendResponse({ ok: false, error: "Choose a campaign first." });
        return;
      }
      const memberId =
        typeof msg.memberId === "string" && msg.memberId.trim()
          ? msg.memberId.trim()
          : undefined;
      const out = await skipCaptureQueueMemberRemote(root, campaignId, memberId);
      if (!out.ok) {
        sendResponse(out);
        return;
      }
      if (msg.stopPipeline) {
        const state = await loadPipelineState();
        if (state) {
          state.active = false;
          await savePipelineState(state);
        }
        await chrome.alarms.clear(PIPELINE_ALARM);
        await chrome.storage.local.set({ [PIPELINE_RUN_KEY]: false });
        await chrome.storage.local.remove([PIPELINE_STATE_KEY]);
      }
      sendResponse({ ok: true, ...out.json, stopped: Boolean(msg.stopPipeline) });
    })();
    return true;
  }
  if (msg?.type === "CLIN_CAPTURE_QUEUE_CLEAR") {
    void (async () => {
      const base = await getApiBase();
      const root = base.replace(/\/$/, "");
      const campaignId =
        typeof msg.campaignId === "string" && msg.campaignId.trim()
          ? msg.campaignId.trim()
          : await resolveExtensionImportCampaignId();
      if (!campaignId) {
        sendResponse({ ok: false, error: "Choose a campaign first." });
        return;
      }
      const out = await clearCaptureQueueSkipsRemote(root, campaignId);
      sendResponse(out.ok ? { ok: true, cleared: true } : out);
    })();
    return true;
  }
  if (msg?.type === "CLIN_RUN_PIPELINE_STOP") {
    void (async () => {
      const state = await loadPipelineState();
      if (state) {
        state.active = false;
        await savePipelineState(state);
      }
      await chrome.alarms.clear(PIPELINE_ALARM);
      await chrome.storage.local.set({ [PIPELINE_RUN_KEY]: false });
      if (state?.tabId) await unpinPipelineTab(state.tabId);
      await chrome.storage.local.remove([PIPELINE_STATE_KEY]);
      if (state?.tabId) {
        try {
          const tab = await chrome.tabs.get(state.tabId);
          const url = tab?.url || "";
          if (isLinkedInFeedUpdateUrl(url) || /\/recent-activity\//i.test(url)) {
            await chrome.tabs.update(state.tabId, { url: "https://www.linkedin.com/feed/" });
          }
        } catch {
          /* ignore */
        }
      }
      await setExtensionLiveStatus({
        phase: "success",
        scope: "pipeline",
        title: "Automated capture stopping",
        detail: "Stopped — no further steps will run.",
        confirmMemberId: null,
      });
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg?.type === "CLIN_PIPELINE_STATUS") {
    void (async () => {
      const stored = await chrome.storage.local.get([
        PIPELINE_RUN_KEY,
        PIPELINE_STATE_KEY,
        LIVE_STATUS_KEY,
      ]);
      sendResponse({
        running: Boolean(stored[PIPELINE_RUN_KEY]),
        state: stored[PIPELINE_STATE_KEY] || null,
        liveStatus: stored[LIVE_STATUS_KEY] || null,
      });
    })();
    return true;
  }
  if (msg?.type !== "CLIN_RUN_PIPELINE") return;

  (async () => {
    const tabId = msg.tabId;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "Missing tab id." });
      return;
    }
    try {
      const existing = await loadPipelineState();
      if (existing?.active) {
        sendResponse({
          ok: false,
          error: "Automated capture is already running.",
        });
        return;
      }
      await chrome.storage.local.remove([PIPELINE_STATE_KEY]);
      const result = await startClinPipeline({
        tabId,
        listRounds: msg.listRounds,
        enrichSteps: msg.enrichSteps,
        postScrollMs: msg.postScrollMs,
        fullRun: msg.fullRun,
        suppressFocus: msg.suppressFocus,
        selectedCampaignId:
          typeof msg.selectedCampaignId === "string"
            ? msg.selectedCampaignId
            : undefined,
      });
      sendResponse(result);
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
      const snapFunc =
        kind === "linkedin_messages_inbox_visible"
          ? scrapeMessagingInboxSnapshotInPage
          : scrapeExtensionSnapshot;
      const [{ result: snap }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: snapFunc,
        args: kind === "linkedin_post_analytics_visible" ? [kind] : [],
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
const OUTREACH_RUN_TAB_ID_KEY = "clinOutreachRunTabId";
const LIVE_STATUS_KEY = "clinExtensionLiveStatus";

/** @typedef {"idle"|"running"|"waiting"|"success"|"error"} LiveStatusPhase */
/** @typedef {"outreach"|"pipeline"|"capture"|"general"|""} LiveStatusScope */

/**
 * Persist extension activity for the side panel live status bar.
 * @param {object} patch
 */
async function setExtensionLiveStatus(patch) {
  const stored = await chrome.storage.local.get([LIVE_STATUS_KEY]);
  const prev = stored[LIVE_STATUS_KEY] || {};
  await chrome.storage.local.set({
    [LIVE_STATUS_KEY]: {
      phase: "running",
      scope: "general",
      title: "Clin",
      detail: "",
      confirmMemberId: null,
      ...prev,
      ...patch,
      updatedAt: Date.now(),
    },
  });
}

async function clearExtensionLiveStatus() {
  await chrome.storage.local.set({
    [LIVE_STATUS_KEY]: {
      phase: "idle",
      scope: "",
      title: "",
      detail: "",
      confirmMemberId: null,
      updatedAt: Date.now(),
    },
  });
}

async function publishUserNotice(message, opts = {}) {
  const msg = String(message || "").trim();
  if (!msg) return;
  await chrome.storage.local.set({ [LAST_ERROR_KEY]: msg });
  const isPace = /client pace:/i.test(msg);
  const waiting = /wait \d+s before|next import in/i.test(msg);
  const stored = await chrome.storage.local.get([LIVE_STATUS_KEY]);
  const prev = stored[LIVE_STATUS_KEY] || {};
  await setExtensionLiveStatus({
    phase:
      opts.phase ||
      (waiting ? "waiting" : isPace || opts.isError ? "error" : "error"),
    scope: opts.scope || prev.scope || "general",
    title:
      opts.title ||
      (isPace ? (waiting ? "Pace wait" : "Pace limit") : "Error"),
    detail: msg,
    confirmMemberId: opts.confirmMemberId ?? prev.confirmMemberId ?? null,
  });
}

function isLinkedInHostUrl(url) {
  return typeof url === "string" && /https?:\/\/([^.]+\.)?linkedin\.com\//i.test(url);
}

/**
 * Lock outreach automation to a single LinkedIn tab.
 * Fallback order: explicit tab id -> stored tab id -> active tab -> any LinkedIn tab.
 */
async function resolveOutreachRunTabId(preferredTabId) {
  const tryTabId = async (candidate) => {
    if (typeof candidate !== "number") return null;
    try {
      const tab = await chrome.tabs.get(candidate);
      if (!tab?.id || !isLinkedInHostUrl(tab.url || "")) return null;
      return tab.id;
    } catch {
      return null;
    }
  };

  const fromPreferred = await tryTabId(preferredTabId);
  if (fromPreferred != null) return fromPreferred;

  const stored = await chrome.storage.local.get([OUTREACH_RUN_TAB_ID_KEY]);
  const fromStored = await tryTabId(stored[OUTREACH_RUN_TAB_ID_KEY]);
  if (fromStored != null) return fromStored;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const fromActive = await tryTabId(activeTab?.id);
  if (fromActive != null) return fromActive;

  const linkedInTabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
  for (const tab of linkedInTabs) {
    const valid = await tryTabId(tab?.id);
    if (valid != null) return valid;
  }

  return null;
}

/** Page world — vanity slug from a LinkedIn profile URL. */
function vanityFromProfileUrlPage(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const m = new URL(url.trim(), "https://www.linkedin.com").pathname.match(
      /^\/in\/([^/?#]+)\/?/i,
    );
    if (!m?.[1] || m[1].toLowerCase() === "me") return null;
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return null;
  }
}

/** Page world — messaging thread roots that contain a composer. */
function listMessagingThreadRootsPage() {
  const roots = [];
  const seen = new Set();
  const selectors = [
    ".msg-overlay-conversation-bubble",
    ".msg-convo-wrapper",
    ".msg-thread",
    "main.scaffold-layout__main",
    "main",
  ];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (!(el instanceof HTMLElement) || seen.has(el)) continue;
      if (!el.querySelector('.msg-form, [class*="msg-form"]')) continue;
      seen.add(el);
      roots.push(el);
    }
  }
  return roots;
}

/** Page world — is the visible messaging thread for the expected contact? (self-contained for injection) */
function verifyOutreachThreadReadyPage(expectedVanity, expectedName) {
  function vanityFromUrl(url) {
    if (typeof url !== "string" || !url.trim()) return null;
    try {
      const m = new URL(url.trim(), "https://www.linkedin.com").pathname.match(
        /^\/in\/([^/?#]+)\/?/i,
      );
      if (!m?.[1] || m[1].toLowerCase() === "me") return null;
      return decodeURIComponent(m[1]).toLowerCase();
    } catch {
      return null;
    }
  }

  function normalizeVanity(v) {
    return String(v || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function nameMatches(headerText, name) {
    const tokens = String(name || "")
      .toLowerCase()
      .split(/[\s,.-]+/)
      .filter((t) => t.length >= 2);
    if (tokens.length === 0) return false;
    const hay = String(headerText || "").toLowerCase();
    const required = tokens.length >= 2 ? 2 : 1;
    let hits = 0;
    for (const t of tokens) {
      if (hay.includes(t)) hits += 1;
    }
    return hits >= required;
  }

  function headerText(root) {
    const scope = root instanceof HTMLElement ? root : document.body;
    const header =
      scope.querySelector(".msg-overlay-conversation-bubble-header") ||
      scope.querySelector(".msg-thread__header") ||
      scope.querySelector("[data-test-conversation-header]") ||
      scope.querySelector("[class*='msg-thread'][class*='header']") ||
      scope.querySelector(".msg-overlay-bubble-header");
    return header?.textContent || "";
  }

  function listThreadRoots() {
    const roots = [];
    const seen = new Set();
    for (const sel of [
      ".msg-overlay-conversation-bubble",
      ".msg-convo-wrapper",
      ".msg-thread",
      "main.scaffold-layout__main",
      "main",
    ]) {
      for (const el of document.querySelectorAll(sel)) {
        if (!(el instanceof HTMLElement) || seen.has(el)) continue;
        if (!el.querySelector('.msg-form, [class*="msg-form"]')) continue;
        seen.add(el);
        roots.push(el);
      }
    }
    return roots;
  }

  const vanity = String(expectedVanity || "").toLowerCase();
  const normExpected = normalizeVanity(vanity);
  const roots = listThreadRoots();
  const scanRoots = roots.length > 0 ? roots : [document.body];

  for (const root of scanRoots) {
    for (const a of root.querySelectorAll('a[href*="/in/"]')) {
      if (!(a instanceof HTMLAnchorElement)) continue;
      const v = vanityFromUrl(a.href);
      if (!v) continue;
      if (v === vanity || normalizeVanity(v) === normExpected) {
        return { ready: true, matchedVanity: v };
      }
    }
    if (expectedName && nameMatches(headerText(root), expectedName)) {
      return { ready: true, matchedBy: "name" };
    }
  }

  if (expectedName && nameMatches(headerText(document.body), expectedName)) {
    const hasComposer = Boolean(
      document.querySelector(
        '.msg-form__contenteditable, [data-lexical-editor="true"], [contenteditable="true"][role="textbox"]',
      ),
    );
    if (hasComposer) {
      return { ready: true, matchedBy: "name" };
    }
  }

  const hasComposer = Boolean(
    document.querySelector(
      '.msg-form__contenteditable, [data-lexical-editor="true"], [contenteditable="true"][role="textbox"]',
    ),
  );
  return {
    ready: false,
    hasWrongThread: hasComposer,
    reason: hasComposer ? "wrong_thread" : "no_thread",
  };
}

/** Page world — close a stale messaging overlay so profile Message opens the right thread. */
function dismissWrongMessagingOverlayPage() {
  const closeSelectors = [
    "button.msg-overlay-bubble-header__control--close-btn",
    'button[data-control-name="overlay.close_conversation_window"]',
    'button[aria-label*="Close your conversation"]',
    'button[aria-label*="Fermer la conversation"]',
    'button[aria-label*="Fermer"]',
  ];
  for (const sel of closeSelectors) {
    const btn = document.querySelector(sel);
    if (btn instanceof HTMLButtonElement && !btn.disabled) {
      pointerActivateElement(btn);
      return { closed: true };
    }
  }
  return { closed: false };
}

/** Page world — close up to three stale messaging overlays. */
function dismissStaleMessagingOverlaysPage() {
  let closed = 0;
  for (let i = 0; i < 3; i += 1) {
    const result = dismissWrongMessagingOverlayPage();
    if (!result.closed) break;
    closed += 1;
  }
  return { closed: closed > 0, count: closed };
}

/** Page world — best-effort DM composer fill on LinkedIn messaging (runs in MAIN world). */
async function clinOutreachFillComposer(draftText, autoSend, expectedVanity) {
  const text = String(draftText || "");
  const vanity = (expectedVanity || "").toLowerCase();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function editorContainsSnippet(editor, snippet) {
    const needle = String(snippet || "").slice(0, Math.min(48, snippet.length)).trim();
    if (!needle) return true;
    const root =
      editor.closest('[data-lexical-editor="true"]') ||
      editor.closest(".msg-form") ||
      editor;
    const hay = root.textContent || root.innerText || "";
    return hay.includes(needle);
  }

  function resolveLexicalEditor(editorEl) {
    let node = editorEl;
    while (node) {
      if (node.__lexicalEditor) return node.__lexicalEditor;
      node = node.parentElement;
    }
    const root = editorEl.closest('[data-lexical-editor="true"]');
    return root?.__lexicalEditor || null;
  }

  function buildLexicalStateJson(body) {
    const lines = String(body || "").split("\n");
    const children = lines.map((line) => ({
      children: line
        ? [
            {
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text: line,
              type: "text",
              version: 1,
            },
          ]
        : [],
      direction: "ltr",
      format: "",
      indent: 0,
      type: "paragraph",
      version: 1,
      textFormat: 0,
      textStyle: "",
    }));
    if (!children.length) {
      children.push({
        children: [],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
        textFormat: 0,
        textStyle: "",
      });
    }
    return {
      root: {
        children,
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
  }

  function dispatchSyntheticPaste(target, plainText) {
    const data = new DataTransfer();
    data.setData("text/plain", plainText);
    data.setData("text/html", plainText.replace(/\n/g, "<br>"));
    let evt;
    try {
      evt = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: data,
      });
    } catch {
      evt = new Event("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      Object.defineProperty(evt, "clipboardData", {
        value: data,
        configurable: true,
      });
    }
    return target.dispatchEvent(evt);
  }

  function focusEditor(editor) {
    const form = editor.closest('.msg-form, [class*="msg-form"]');
    const placeholder = form?.querySelector(
      ".msg-form__placeholder, p.msg-form__placeholder",
    );
    if (placeholder instanceof HTMLElement) {
      placeholder.click();
    }
    editor.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    editor.click?.();
    editor.focus?.({ preventScroll: true });
    try {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      /* ignore */
    }
  }

  function findEditor() {
    const selectors = [
      '.msg-form__contenteditable[contenteditable="true"]',
      'div.msg-form__msg-content-container [contenteditable="true"]',
      '[data-lexical-editor="true"][contenteditable="true"]',
      '[data-lexical-editor="true"]',
      '[contenteditable="true"][role="textbox"]',
      ".msg-form__contenteditable",
    ];

    function pickFromRoot(root) {
      const candidates = [];
      for (const sel of selectors) {
        for (const el of root.querySelectorAll(sel)) {
          if (!(el instanceof HTMLElement)) continue;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          candidates.push({ el, area: r.width * r.height });
        }
      }
      candidates.sort((a, b) => b.area - a.area);
      return candidates[0]?.el || null;
    }

    if (vanity) {
      for (const root of listMessagingThreadRootsPage()) {
        let matched = false;
        for (const a of root.querySelectorAll('a[href*="/in/"]')) {
          if (vanityFromProfileUrlPage(a.href) === vanity) {
            matched = true;
            break;
          }
        }
        if (!matched) continue;
        const editor = pickFromRoot(root);
        if (editor) return editor;
      }
    }

    const candidates = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!(el instanceof HTMLElement)) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        candidates.push({ el, area: r.width * r.height });
      }
    }
    candidates.sort((a, b) => b.area - a.area);
    return candidates[0]?.el || null;
  }

  function fillViaLexical(editor, body) {
    const lexical = resolveLexicalEditor(editor);
    if (!lexical) return false;
    try {
      focusEditor(editor);
      const stateJson = JSON.stringify(buildLexicalStateJson(body));
      if (typeof lexical.update === "function" && lexical.parseEditorState) {
        lexical.update(() => {
          const state = lexical.parseEditorState(stateJson);
          lexical.setEditorState(state);
        });
        return editorContainsSnippet(editor, body);
      }
      if (lexical.parseEditorState && lexical.setEditorState) {
        const state = lexical.parseEditorState(stateJson);
        lexical.setEditorState(state);
        return editorContainsSnippet(editor, body);
      }
    } catch {
      return false;
    }
    return false;
  }

  function fillViaSyntheticPaste(editor, body) {
    focusEditor(editor);
    const targets = [
      editor,
      editor.closest('[data-lexical-editor="true"]'),
      editor.closest(".msg-form__msg-content-container"),
    ].filter(Boolean);
    for (const target of targets) {
      try {
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
      } catch {
        /* ignore */
      }
      dispatchSyntheticPaste(target, body);
      if (editorContainsSnippet(editor, body)) return true;
    }
    return false;
  }

  function fillViaInsertText(editor, body) {
    focusEditor(editor);
    try {
      document.execCommand("selectAll", false, null);
      if (document.execCommand("insertText", false, body)) {
        return editorContainsSnippet(editor, body);
      }
    } catch {
      /* fall through */
    }
    return false;
  }

  async function fillViaClipboardPaste(editor, body) {
    try {
      await navigator.clipboard.writeText(body);
      focusEditor(editor);
      await delay(80);
      document.execCommand("paste");
      await delay(120);
      return editorContainsSnippet(editor, body);
    } catch {
      return false;
    }
  }

  function fillViaBeforeInput(editor, body) {
    focusEditor(editor);
    try {
      const beforeEvt = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: body,
      });
      editor.dispatchEvent(beforeEvt);
      const inputEvt = new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: body,
      });
      editor.dispatchEvent(inputEvt);
      return editorContainsSnippet(editor, body);
    } catch {
      return false;
    }
  }

  async function fillEditor(editor) {
    if (fillViaLexical(editor, text)) return true;
    if (fillViaSyntheticPaste(editor, text)) return true;
    if (fillViaBeforeInput(editor, text)) return true;
    if (await fillViaClipboardPaste(editor, text)) return true;
    if (fillViaInsertText(editor, text)) return true;
    return false;
  }

  let editor = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const hasForm = document.querySelector('.msg-form, [class*="msg-form"]');
    if (hasForm) {
      editor = findEditor();
      if (editor) break;
    }
    await delay(400);
  }
  if (!editor) {
    return {
      ok: false,
      step: "no_composer",
      error: "Composer not found — open the message thread first.",
    };
  }

  let filled = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    filled = await fillEditor(editor);
    if (filled) break;
    await delay(350);
    editor = findEditor() || editor;
  }

  if (!editorContainsSnippet(editor, text)) {
    return {
      ok: false,
      step: "insert_failed",
      error:
        "Could not insert draft into LinkedIn composer — paste from Clin manually.",
    };
  }

  if (!autoSend) {
    return { ok: true, sent: false, needsConfirm: true };
  }
  const formRoot =
    editor.closest(".msg-form") ||
    editor.closest('[class*="msg-form"]') ||
    document;
  const sendBtn =
    formRoot.querySelector("button.msg-form__send-button:not([disabled])") ||
    [...formRoot.querySelectorAll("button")].find((b) =>
      /^(send|envoyer)$/i.test(
        (b.textContent || b.getAttribute("aria-label") || "").trim(),
      ),
    );
  if (!sendBtn) {
    return { ok: true, sent: false, needsConfirm: true, error: "Send button not found" };
  }
  sendBtn.click();
  return { ok: true, sent: true };
}

/** Page world — composer visible for outreach (self-contained for injection). */
function isOutreachComposerReadyPage() {
  const form = document.querySelector('.msg-form, [class*="msg-form"]');
  const selectors = [
    '.msg-form__contenteditable[contenteditable="true"]',
    'div.msg-form__msg-content-container [contenteditable="true"]',
    '[data-lexical-editor="true"][contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    ".msg-form__contenteditable",
  ];
  const scope = form || document;
  for (const sel of selectors) {
    for (const el of scope.querySelectorAll(sel)) {
      if (!(el instanceof HTMLElement)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return true;
    }
  }
  return /\/messaging\/thread\//i.test(window.location.pathname);
}

/**
 * Navigate from profile until the messaging composer is reachable for this contact.
 */
async function openMessagingForOutreach(
  tabId,
  targetUrl,
  expectedVanity,
  expectedName,
) {
  async function verify() {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: verifyOutreachThreadReadyPage,
        args: [expectedVanity || "", expectedName || ""],
      });
      return result || { ready: false, reason: "verify_failed" };
    } catch {
      return { ready: false, reason: "verify_failed" };
    }
  }

  async function composerReady() {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: isOutreachComposerReadyPage,
      });
      return Boolean(result);
    } catch {
      return false;
    }
  }

  async function waitForComposerAfterOpen(timeoutMs = 20000) {
    try {
      await waitForMessagingThreadTab(tabId, timeoutMs);
    } catch {
      await sleep(2000);
    }
    await sleep(1000);
    for (let i = 0; i < 12; i += 1) {
      if (await composerReady()) return true;
      const match = await verify();
      if (match.ready) return true;
      await sleep(400);
    }
    return false;
  }

  async function dismissStaleOverlaysIfNeeded() {
    for (let i = 0; i < 4; i += 1) {
      const match = await verify();
      if (match.ready) return;
      if (!match.hasWrongThread && match.reason !== "wrong_thread") break;
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: dismissStaleMessagingOverlaysPage,
        });
        if (!result?.closed) break;
        await sleep(700);
      } catch {
        break;
      }
    }
  }

  async function waitForProfileActions(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: isProfileActionsChromeReadyPage,
        });
        if (result?.ready) return true;
      } catch {
        /* ignore */
      }
      await sleep(400);
    }
    return false;
  }

  async function tryClickMessage() {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: clickProfileMessageButton,
      });
      return Boolean(result?.clicked);
    } catch {
      return false;
    }
  }

  let match = await verify();
  if (match.ready) return { ok: true };
  if (await composerReady()) {
    match = await verify();
    if (match.ready || !match.hasWrongThread) return { ok: true };
  }

  await dismissStaleOverlaysIfNeeded();
  match = await verify();
  if (match.ready) return { ok: true };

  if (isLinkedInProfilePageUrl(targetUrl)) {
    try {
      await waitForLinkedInProfileTab(tabId, 25000);
    } catch (e) {
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        return {
          ok: false,
          step: "profile_load",
          error: e instanceof Error ? e.message : String(e),
        };
      }
      const currentUrl = tab?.url || "";
      if (
        !isMessagingThreadUrl(currentUrl) &&
        !isMessagingPageUrl(currentUrl) &&
        !(await composerReady())
      ) {
        return {
          ok: false,
          step: "profile_load",
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    await waitForProfileActions(8000);
    await sleep(1200);
  } else if (isMessagingThreadUrl(targetUrl) || isMessagingPageUrl(targetUrl)) {
    await sleep(800);
  } else {
    await sleep(1200);
  }

  match = await verify();
  if (match.ready) return { ok: true };

  let clicked = await tryClickMessage();

  if (clicked && (await waitForComposerAfterOpen(20000))) {
    return { ok: true };
  }

  if (await composerReady()) return { ok: true };

  let msgUrl = null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: getMessagingHrefFromProfilePage,
    });
    msgUrl = typeof result === "string" ? result : null;
  } catch {
    /* ignore */
  }

  if (msgUrl && !(await composerReady())) {
    await chrome.tabs.update(tabId, { url: msgUrl });
    if (await waitForComposerAfterOpen(20000)) {
      return { ok: true };
    }
  }

  if (await composerReady()) return { ok: true };

  if (!clicked) {
    clicked = await tryClickMessage();
    if (clicked && (await waitForComposerAfterOpen(15000))) {
      return { ok: true };
    }
  }

  if (await composerReady()) return { ok: true };

  match = await verify();
  if (match.reason === "wrong_thread") {
    return {
      ok: false,
      step: "wrong_thread",
      error:
        "Wrong LinkedIn thread is open — close other conversations and retry.",
    };
  }

  return {
    ok: false,
    step: "no_message",
    error:
      "Message button not found — open their profile and click Message manually.",
  };
}

async function outreachRunStep(tabId, base) {
  const root = base.replace(/\/$/, "");
  await setExtensionLiveStatus({
    phase: "running",
    scope: "outreach",
    title: "Outreach run",
    detail: "Loading next ready contact…",
    confirmMemberId: null,
  });
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
  await setLastOutreachMemberContext(item);
  const contactLabel = item.fullName?.trim() || "contact";
  const url = item.linkedinUrl;
  const expectedVanity = linkedinVanityFromUrl(url);
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

  let threadAlreadyReady = false;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: verifyOutreachThreadReadyPage,
      args: [expectedVanity || "", item.fullName || ""],
    });
    threadAlreadyReady = Boolean(result?.ready);
  } catch {
    /* ignore */
  }

  if (!threadAlreadyReady) {
    await setExtensionLiveStatus({
      phase: "running",
      scope: "outreach",
      title: "Outreach run",
      detail: `Opening ${contactLabel} on LinkedIn…`,
      confirmMemberId: null,
    });
    await chrome.tabs.update(tabId, { url });
    try {
      await waitForLinkedInProfileTab(tabId, 25000);
    } catch {
      /* openMessagingForOutreach will handle partial load */
    }
    await sleep(800);
    await setExtensionLiveStatus({
      phase: "running",
      scope: "outreach",
      title: "Outreach run",
      detail: `Opening message thread for ${contactLabel}…`,
      confirmMemberId: null,
    });
    const opened = await openMessagingForOutreach(
      tabId,
      url,
      expectedVanity,
      item.fullName || "",
    );
    if (!opened.ok) {
      const stepLabel =
        opened.step === "wrong_thread"
          ? "Wrong thread"
          : opened.step === "profile_load"
            ? "Profile load"
            : opened.step === "no_message"
              ? "No Message button"
              : "Open message";
      const hint =
        opened.error || "Could not open messaging for this contact.";
      await setExtensionLiveStatus({
        phase: "waiting",
        scope: "outreach",
        title: `Outreach — ${stepLabel}`,
        detail: hint,
        confirmMemberId: item.memberId,
      });
      return {
        ok: true,
        item,
        needsConfirm: true,
        step: opened.step || "open_message",
        hint,
      };
    }
  }
  await sleep(1500);

  const autoSend = item.sendMode === "auto";
  await setExtensionLiveStatus({
    phase: "running",
    scope: "outreach",
    title: "Outreach run",
    detail: autoSend
      ? `Inserting draft and sending to ${contactLabel}…`
      : `Inserting draft for ${contactLabel}…`,
    confirmMemberId: null,
  });
  const [{ result: fill }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: clinOutreachFillComposer,
    args: [item.draftOutreach || "", autoSend, expectedVanity || ""],
  });

  if (!fill?.ok) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (text) => {
          navigator.clipboard.writeText(String(text || "")).catch(() => {});
        },
        args: [item.draftOutreach || ""],
      });
    } catch {
      /* ignore */
    }
    const stepLabel =
      fill?.step === "no_composer"
        ? "No composer"
        : fill?.step === "insert_failed"
          ? "Paste failed"
          : "Needs you";
    const hint =
      (fill?.error || "Open messaging for this contact, then confirm send.") +
      " Draft copied to clipboard — paste with Ctrl+V if needed.";
    await setExtensionLiveStatus({
      phase: "waiting",
      scope: "outreach",
      title: `Outreach — ${stepLabel}`,
      detail: hint,
      confirmMemberId: item.memberId,
    });
    return {
      ok: true,
      item,
      needsConfirm: true,
      step: fill?.step || "insert_failed",
      hint,
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
    void tryAutoCaptureMessagingThread(tabId, root);
    await setExtensionLiveStatus({
      phase: "success",
      scope: "outreach",
      title: "Outreach — sent",
      detail: `Message sent to ${contactLabel}. Waiting for pace gap before next contact.`,
      confirmMemberId: null,
    });
    return { ok: true, item, sent: true };
  }

  await setExtensionLiveStatus({
    phase: "waiting",
    scope: "outreach",
    title: "Outreach — confirm send",
    detail: autoSend
      ? `Draft inserted for ${contactLabel}. Auto-send did not complete — click Send on LinkedIn, then Confirm below.`
      : `Draft inserted for ${contactLabel}. Click Send on LinkedIn, then Confirm below.`,
    confirmMemberId: item.memberId,
  });
  return {
    ok: true,
    item,
    needsConfirm: true,
    hint: "Draft inserted (or profile opened). Click Send on LinkedIn, then confirm in Clin.",
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CLIN_OUTREACH_RUN_STOP") {
    chrome.storage.local.set({
      [OUTREACH_RUN_KEY]: false,
      [OUTREACH_RUN_TAB_ID_KEY]: null,
    });
    void clearExtensionLiveStatus();
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
        const tabId = await resolveOutreachRunTabId(msg.tabId);
        if (typeof tabId !== "number") {
          sendResponse({
            ok: false,
            error: "No LinkedIn tab found. Open LinkedIn and retry.",
          });
          return;
        }
        await chrome.storage.local.set({ [OUTREACH_RUN_TAB_ID_KEY]: tabId });
        const step = await outreachRunStep(tabId, base);
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
        const tabId = await resolveOutreachRunTabId(msg.tabId);
        if (typeof tabId === "number") {
          void tryAutoCaptureMessagingThread(tabId, root);
        }
        await setExtensionLiveStatus({
          phase: "success",
          scope: "outreach",
          title: "Outreach — sent",
          detail: "Marked sent. Next contact after pace gap.",
          confirmMemberId: null,
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
      const runTabId = await resolveOutreachRunTabId(msg.tabId);
      if (typeof runTabId !== "number") {
        sendResponse({
          ok: false,
          error: "No LinkedIn tab found. Open LinkedIn and retry.",
        });
        return;
      }
      await chrome.storage.local.set({
        [OUTREACH_RUN_KEY]: true,
        [OUTREACH_RUN_TAB_ID_KEY]: runTabId,
      });
      await setExtensionLiveStatus({
        phase: "running",
        scope: "outreach",
        title: "Outreach run",
        detail: "Starting outreach run…",
        confirmMemberId: null,
      });
      const base = await getApiBase();
      let steps = 0;
      const maxSteps = Math.min(20, Number(msg.maxSteps) || 5);
      while (steps < maxSteps) {
        const stored = await chrome.storage.local.get([OUTREACH_RUN_KEY]);
        if (!stored[OUTREACH_RUN_KEY]) break;
        const tabId = await resolveOutreachRunTabId(runTabId);
        if (typeof tabId !== "number") {
          sendResponse({
            ok: false,
            error: "LinkedIn tab closed. Open LinkedIn and start again.",
          });
          return;
        }
        await chrome.storage.local.set({ [OUTREACH_RUN_TAB_ID_KEY]: tabId });
        const step = await outreachRunStep(tabId, base);
        if (step.done) {
          if (step.reason === "pace_wait") {
            await setExtensionLiveStatus({
              phase: "running",
              scope: "outreach",
              title: "Outreach — pace wait",
              detail: `Waiting ${Math.ceil((step.waitMs || 0) / 1000)}s before next send…`,
              confirmMemberId: null,
            });
          } else {
            await setExtensionLiveStatus({
              phase: "success",
              scope: "outreach",
              title: "Outreach run finished",
              detail: step.reason === "queue_empty" ? "Queue empty." : String(step.reason || "Done."),
              confirmMemberId: null,
            });
          }
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
      await chrome.storage.local.set({
        [OUTREACH_RUN_KEY]: false,
        [OUTREACH_RUN_TAB_ID_KEY]: null,
      });
    }
  })();
  return true;
});

const REMOVAL_RUN_KEY = "clinRemovalRunActive";
const ENGAGE_RUN_KEY = "clinEngageRunActive";
const CLEANING_RUN_TAB_ID_KEY = "clinCleaningRunTabId";

async function resolveCleaningRunTabId(preferred) {
  if (typeof preferred === "number") {
    try {
      const tab = await chrome.tabs.get(preferred);
      if (tab?.id && tab.url && /linkedin\.com/i.test(tab.url)) return tab.id;
    } catch {
      /* fall through */
    }
  }
  const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
  const li = tabs.find((t) => typeof t.id === "number");
  return typeof li?.id === "number" ? li.id : null;
}

/** Page world — fill a Lexical/contenteditable field (MAIN world). */
async function clinFillLexicalContentPage(text) {
  const body = String(text || "");
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function editorContainsSnippet(editor, snippet) {
    const needle = String(snippet || "").slice(0, Math.min(48, snippet.length)).trim();
    if (!needle) return true;
    const root =
      editor.closest('[data-lexical-editor="true"]') ||
      editor.closest(".msg-form") ||
      editor.closest(".comments-comment-box") ||
      editor;
    return (root.textContent || root.innerText || "").includes(needle);
  }

  function resolveLexicalEditor(editorEl) {
    let node = editorEl;
    while (node) {
      if (node.__lexicalEditor) return node.__lexicalEditor;
      node = node.parentElement;
    }
    return editorEl.closest('[data-lexical-editor="true"]')?.__lexicalEditor || null;
  }

  function buildLexicalStateJson(raw) {
    const lines = String(raw || "").split("\n");
    return {
      root: {
        children: lines.map((line) => ({
          children: line
            ? [{ detail: 0, format: 0, mode: "normal", style: "", text: line, type: "text", version: 1 }]
            : [],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
          textFormat: 0,
          textStyle: "",
        })),
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
  }

  function dispatchSyntheticPaste(target, plainText) {
    const data = new DataTransfer();
    data.setData("text/plain", plainText);
    const evt = new Event("paste", { bubbles: true, cancelable: true, composed: true });
    Object.defineProperty(evt, "clipboardData", { value: data, configurable: true });
    target.dispatchEvent(evt);
  }

  function findEditor() {
    const selectors = [
      '.comments-comment-box__contenteditable[contenteditable="true"]',
      ".comments-comment-texteditor [contenteditable='true']",
      '.comments-comment-box [contenteditable="true"]',
      '.msg-form__contenteditable[contenteditable="true"]',
      '[data-lexical-editor="true"][contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
    ];
    const candidates = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!(el instanceof HTMLElement)) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        candidates.push({ el, area: r.width * r.height });
      }
    }
    candidates.sort((a, b) => b.area - a.area);
    return candidates[0]?.el || null;
  }

  async function fillEditor(editor) {
    editor.focus?.();
    editor.click?.();
    const lexical = resolveLexicalEditor(editor);
    if (lexical?.parseEditorState && lexical?.setEditorState) {
      try {
        lexical.setEditorState(lexical.parseEditorState(JSON.stringify(buildLexicalStateJson(body))));
        if (editorContainsSnippet(editor, body)) return true;
      } catch {
        /* fall through */
      }
    }
    try {
      document.execCommand("selectAll", false, null);
      if (document.execCommand("insertText", false, body)) {
        if (editorContainsSnippet(editor, body)) return true;
      }
    } catch {
      /* ignore */
    }
    dispatchSyntheticPaste(editor, body);
    if (editorContainsSnippet(editor, body)) return true;
    try {
      await navigator.clipboard.writeText(body);
      await delay(80);
      document.execCommand("paste");
      await delay(120);
    } catch {
      /* ignore */
    }
    return editorContainsSnippet(editor, body);
  }

  let editor = null;
  for (let i = 0; i < 12; i += 1) {
    editor = findEditor();
    if (editor) break;
    await delay(350);
  }
  if (!editor) return { ok: false, error: "editor_not_found" };
  const filled = await fillEditor(editor);
  return filled ? { ok: true, filled: true } : { ok: false, error: "fill_failed" };
}

/** LinkedIn post age labels older than ~1 year (matches Clin server filter). */
function clinIsStalePostAgeLabel(ageLabel) {
  const raw = String(ageLabel || "").trim();
  if (!raw) return false;
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^(today|yesterday|hier|aujourd)/i.test(s)) return false;
  const years = s.match(/(\d+)\s*(?:y|yr|yrs|year|years|ans|an)\b/);
  if (years) return parseInt(years[1], 10) >= 1;
  const months = s.match(/(\d+)\s*(?:mo|mos|month|months|mois)\b/);
  if (months) return parseInt(months[1], 10) >= 12;
  const weeks = s.match(/(\d+)\s*(?:w|wk|wks|week|weeks|sem|semaine|semaines)\b/);
  if (weeks) return parseInt(weeks[1], 10) * 7 > 365;
  const days = s.match(/(\d+)\s*(?:d|day|days|j|jour|jours)\b/);
  if (days) return parseInt(days[1], 10) > 365;
  const yearIn = s.match(/\b(20\d{2})\b/);
  if (yearIn) {
    const y = parseInt(yearIn[1], 10);
    if (new Date().getFullYear() - y > 1) return true;
  }
  return false;
}

function clinExtractCardAgeLabel(card) {
  const t = (card.innerText || "").trim();
  const ageM = t.match(
    /(\d+\s*(?:j|d|w|mo|yr|h|min|semaines?|jours?|mois|ans)\b.*|\d{1,2}\s+[a-zéû]+(?:\s+\d{4})?)/i,
  );
  return ageM?.[0]?.trim() || null;
}

/** Page world — open first post comment box, paste, optionally submit (MAIN world). */
async function clinEngageAutoCommentPage(commentText, autoSubmit) {
  const text = String(commentText || "").trim();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!text) return { ok: false, error: "no_comment" };

  for (let i = 0; i < 6; i += 1) {
    window.scrollBy(0, Math.min(700, window.innerHeight || 600));
    await delay(450);
  }

  const cards = [
    ...document.querySelectorAll(
      ".feed-shared-update-v2, div[class*='feed-shared-update'], [data-urn*='activity']",
    ),
  ];
  let commentBtn = null;
  for (const card of cards) {
    if (!(card instanceof HTMLElement)) continue;
    const ageLabel = clinExtractCardAgeLabel(card);
    if (ageLabel && clinIsStalePostAgeLabel(ageLabel)) continue;
    const btn =
      card.querySelector('button[aria-label*="Comment"]') ||
      card.querySelector('button[aria-label*="commentaire"]') ||
      card.querySelector('button[aria-label*="Commenter"]') ||
      [...card.querySelectorAll("button")].find((b) =>
        /comment|commenter|commentaire/i.test(
          (b.getAttribute("aria-label") || b.textContent || "").trim(),
        ),
      );
    if (btn instanceof HTMLButtonElement && !btn.disabled) {
      commentBtn = btn;
      card.scrollIntoView({ block: "center", behavior: "instant" });
      break;
    }
  }
  if (!commentBtn) {
    return { ok: false, error: "recent_post_not_found" };
  }

  commentBtn.click();
  await delay(1500);

  const fill = await clinFillLexicalContentPage(text);
  if (!fill?.ok) return fill;

  if (!autoSubmit) {
    return { ok: true, filled: true, posted: false };
  }

  await delay(400);
  const postBtn =
    document.querySelector(
      "button.comments-comment-box__submit-button:not([disabled])",
    ) ||
    [...document.querySelectorAll("button")].find((b) => {
      if (b.disabled) return false;
      const label = (b.getAttribute("aria-label") || b.textContent || "").trim();
      return /^(post|comment|publier|commenter|reply|répondre)$/i.test(label);
    });
  if (!(postBtn instanceof HTMLButtonElement)) {
    return { ok: true, filled: true, posted: false, error: "submit_button_not_found" };
  }
  postBtn.click();
  await delay(1200);
  return { ok: true, filled: true, posted: true };
}

/** Page world — profile More → Remove connection → confirm (MAIN world). */
async function clinRemovalAutoDisconnectPage() {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const moreBtn =
    document.querySelector('button[aria-label*="More actions"]') ||
    document.querySelector('button[aria-label*="Plus d\'actions"]') ||
    document.querySelector('[data-control-name="overflow"]') ||
    document.querySelector(".pvs-profile-actions__action--overflow") ||
    document.querySelector(".artdeco-dropdown__trigger");
  if (!(moreBtn instanceof HTMLElement)) {
    return { ok: false, error: "more_button_not_found" };
  }
  moreBtn.click();
  await delay(900);

  const removeEl = [...document.querySelectorAll(
    "div[role='menu'] button, div[role='menuitem'], li.artdeco-dropdown__item, span.artdeco-dropdown__item-text",
  )].find((el) =>
    /remove connection|retirer.*relation|supprimer.*relation|remove\s+connection/i.test(
      (el.textContent || "").trim(),
    ),
  );
  if (!(removeEl instanceof HTMLElement)) {
    return { ok: false, error: "remove_option_not_found" };
  }
  removeEl.click();
  await delay(900);

  const confirmBtn = [...document.querySelectorAll("button")].find((b) => {
    if (b.disabled) return false;
    const label = (b.textContent || b.getAttribute("aria-label") || "").trim();
    return (
      /^remove$/i.test(label) ||
      /^retirer$/i.test(label) ||
      /remove connection/i.test(label) ||
      /retirer.*relation/i.test(label)
    );
  });
  if (!(confirmBtn instanceof HTMLButtonElement)) {
    return { ok: false, error: "confirm_not_found" };
  }
  confirmBtn.click();
  await delay(1500);
  return { ok: true, disconnected: true };
}

/** Page world — show Clin comment-angle hint on activity page. */
function clinEngageShowHint(suggestedComment, angle, hook) {
  const id = "clin-engage-hint";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.style.cssText =
      "position:fixed;bottom:16px;right:16px;max-width:360px;z-index:99999;" +
      "background:#1e293b;color:#f8fafc;padding:12px 14px;border-radius:10px;" +
      "font:13px/1.45 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.25);";
    document.body.appendChild(el);
  }
  el.replaceChildren();
  if (suggestedComment) {
    const title = document.createElement("div");
    title.textContent = "Suggested comment (paste on their post):";
    title.style.cssText = "font-weight:600;margin-bottom:6px;font-size:12px;opacity:.9;";
    const body = document.createElement("div");
    body.textContent = suggestedComment;
    body.style.cssText = "white-space:pre-wrap;margin-bottom:8px;";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Copy comment";
    copyBtn.style.cssText =
      "border:0;border-radius:6px;padding:6px 10px;background:#3b82f6;color:#fff;" +
      "font:12px system-ui,sans-serif;cursor:pointer;";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(suggestedComment).catch(() => {});
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy comment";
      }, 1500);
    });
    el.append(title, body, copyBtn);
    return;
  }
  const parts = [];
  if (angle) parts.push(`Comment angle: ${angle}`);
  if (hook) parts.push(`Hook: ${hook}`);
  el.textContent =
    parts.join(" · ") || "Comment on a recent post, then confirm in Clin.";
}

async function removalRunStep(tabId, base) {
  const root = base.replace(/\/$/, "");
  await setExtensionLiveStatus({
    phase: "running",
    scope: "cleaning",
    title: "Removal run",
    detail: "Loading next approved removal…",
    confirmExecId: null,
    confirmExecKind: null,
  });
  const nextRes = await fetch(`${root}/api/extension/removal-queue/next`);
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
  const autoExec = item.execMode !== "manual_confirm";
  const contactLabel = item.fullName?.trim() || "contact";
  const url = item.linkedinUrl;
  if (!url) {
    await fetch(`${root}/api/extension/removal-queue/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        execId: item.execId,
        outcome: "failed",
        error: "missing_linkedin_url",
      }),
    });
    return { ok: true, skipped: true };
  }

  await setExtensionLiveStatus({
    phase: "running",
    scope: "cleaning",
    title: "Removal run",
    detail: autoExec
      ? `Removing connection with ${contactLabel}…`
      : `Opening ${contactLabel}…`,
    confirmExecId: null,
    confirmExecKind: null,
  });
  await chrome.tabs.update(tabId, { url });
  try {
    await waitForLinkedInProfileTab(tabId, 25000);
  } catch {
    await sleep(2000);
  }
  await sleep(1500);

  if (autoExec) {
    const [{ result: removal }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: clinRemovalAutoDisconnectPage,
    });
    if (removal?.ok && removal?.disconnected) {
      await fetch(`${root}/api/extension/removal-queue/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execId: item.execId, outcome: "disconnected" }),
      });
      await setExtensionLiveStatus({
        phase: "success",
        scope: "cleaning",
        title: "Removal — disconnected",
        detail: `Removed ${contactLabel}. Next after pace gap.`,
        confirmExecId: null,
        confirmExecKind: null,
      });
      return { ok: true, item, completed: true };
    }
  }

  await setExtensionLiveStatus({
    phase: "waiting",
    scope: "cleaning",
    title: "Removal — disconnect manually",
    detail: autoExec
      ? `Auto-remove failed for ${contactLabel}. More → Remove connection, then confirm.`
      : `On ${contactLabel}: More → Remove connection. Then confirm below.`,
    confirmExecId: item.execId,
    confirmExecKind: "removal",
  });
  return {
    ok: true,
    item,
    needsConfirm: true,
    hint: "Remove connection on LinkedIn, then confirm.",
  };
}

async function engageRunStep(tabId, base) {
  const root = base.replace(/\/$/, "");
  await setExtensionLiveStatus({
    phase: "running",
    scope: "cleaning",
    title: "Engage run",
    detail: "Loading next engage contact…",
    confirmExecId: null,
    confirmExecKind: null,
  });
  const nextRes = await fetch(`${root}/api/extension/engage-queue/next`);
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
  const autoExec = item.execMode !== "manual_confirm";
  const contactLabel = item.fullName?.trim() || "contact";
  const profileUrl = item.linkedinUrl;
  if (!profileUrl) {
    await fetch(`${root}/api/extension/engage-queue/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        execId: item.execId,
        outcome: "failed",
        error: "missing_linkedin_url",
      }),
    });
    return { ok: true, skipped: true };
  }

  const activityUrl = profileRecentActivityUrl(profileUrl) || profileUrl;
  const suggestedComment = item.suggestedComment || "";
  await setExtensionLiveStatus({
    phase: "running",
    scope: "cleaning",
    title: "Engage run",
    detail: autoExec
      ? `Commenting on a post for ${contactLabel}…`
      : `Opening activity for ${contactLabel}…`,
    confirmExecId: null,
    confirmExecKind: null,
  });
  await chrome.tabs.update(tabId, { url: activityUrl });
  await sleep(2500);

  if (autoExec && suggestedComment.trim()) {
    const [{ result: engage }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: clinEngageAutoCommentPage,
      args: [suggestedComment, true],
    });
    if (engage?.ok && engage?.posted) {
      await fetch(`${root}/api/extension/engage-queue/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execId: item.execId, outcome: "commented" }),
      });
      await setExtensionLiveStatus({
        phase: "success",
        scope: "cleaning",
        title: "Engage — commented",
        detail: `Comment posted for ${contactLabel}. Next after pace gap.`,
        confirmExecId: null,
        confirmExecKind: null,
      });
      return { ok: true, item, completed: true };
    }
    if (engage?.ok && engage?.filled) {
      await fetch(`${root}/api/extension/engage-queue/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execId: item.execId, outcome: "commented" }),
      });
      await setExtensionLiveStatus({
        phase: "success",
        scope: "cleaning",
        title: "Engage — comment inserted",
        detail: `Draft inserted for ${contactLabel} — verify on LinkedIn if needed.`,
        confirmExecId: null,
        confirmExecKind: null,
      });
      return { ok: true, item, completed: true };
    }
  }

  const angle = item.commentAngle || item.playbook || "";
  const hook = item.engagementHook || "";
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: clinEngageShowHint,
      args: [suggestedComment, angle, hook],
    });
  } catch {
    /* page may block injection */
  }
  const detail = suggestedComment
    ? autoExec
      ? `Auto-comment failed for ${contactLabel} (no recent post in feed?). Paste manually on a post from the last year, then confirm.`
      : `Paste AI comment on a recent post for ${contactLabel}, then confirm.`
    : angle
      ? `Comment angle: ${angle}`
      : hook
        ? `Hook: ${hook}`
        : `Comment on a post for ${contactLabel}, then confirm.`;
  await setExtensionLiveStatus({
    phase: "waiting",
    scope: "cleaning",
    title: suggestedComment ? "Engage — paste AI comment" : "Engage — comment manually",
    detail,
    confirmExecId: item.execId,
    confirmExecKind: "engage",
  });
  return {
    ok: true,
    item,
    needsConfirm: true,
    hint: detail,
  };
}

async function runCleaningLoop(opts) {
  const { runKey, stepFn, scopeTitle } = opts;
  const runTabId = await resolveCleaningRunTabId(opts.tabId);
  if (typeof runTabId !== "number") {
    return { ok: false, error: "No LinkedIn tab found. Open LinkedIn and retry." };
  }
  await chrome.storage.local.set({
    [runKey]: true,
    [CLEANING_RUN_TAB_ID_KEY]: runTabId,
  });
  const base = await getApiBase();
  let steps = 0;
  const maxSteps = Math.min(20, Number(opts.maxSteps) || 5);
  while (steps < maxSteps) {
    const stored = await chrome.storage.local.get([runKey]);
    if (!stored[runKey]) break;
    const tabId = await resolveCleaningRunTabId(runTabId);
    if (typeof tabId !== "number") {
      return { ok: false, error: "LinkedIn tab closed. Open LinkedIn and start again." };
    }
    await chrome.storage.local.set({ [CLEANING_RUN_TAB_ID_KEY]: tabId });
    const step = await stepFn(tabId, base);
    if (step.done) {
      if (step.reason === "pace_wait") {
        await setExtensionLiveStatus({
          phase: "running",
          scope: "cleaning",
          title: `${scopeTitle} — pace wait`,
          detail: `Waiting ${Math.ceil((step.waitMs || 0) / 1000)}s…`,
          confirmExecId: null,
          confirmExecKind: null,
        });
      }
      return { ok: true, done: true, reason: step.reason, waitMs: step.waitMs };
    }
    if (step.waitMs && step.waitMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(step.waitMs, 120000)));
    }
    if (step.needsConfirm) {
      return {
        ok: true,
        paused: true,
        item: step.item,
        hint: step.hint,
      };
    }
    if (step.completed || step.skipped || step.sent) {
      steps += 1;
      await sleep(2000);
      continue;
    }
    steps += 1;
    await sleep(2000);
  }
  return { ok: true, done: true, steps };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CLIN_REMOVAL_RUN_STOP") {
    chrome.storage.local.set({
      [REMOVAL_RUN_KEY]: false,
      [CLEANING_RUN_TAB_ID_KEY]: null,
    });
    void clearExtensionLiveStatus();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "CLIN_ENGAGE_RUN_STOP") {
    chrome.storage.local.set({
      [ENGAGE_RUN_KEY]: false,
      [CLEANING_RUN_TAB_ID_KEY]: null,
    });
    void clearExtensionLiveStatus();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "CLIN_CLEANING_CONFIRM") {
    (async () => {
      try {
        const base = await getApiBase();
        const root = base.replace(/\/$/, "");
        const { execId, kind, outcome } = msg;
        if (!execId || !kind) {
          sendResponse({ ok: false, error: "execId and kind required" });
          return;
        }
        const path =
          kind === "removal"
            ? "removal-queue/ack"
            : kind === "engage"
              ? "engage-queue/ack"
              : null;
        if (!path) {
          sendResponse({ ok: false, error: "invalid kind" });
          return;
        }
        const resolvedOutcome =
          outcome ||
          (kind === "removal" ? "disconnected" : "commented");
        await fetch(`${root}/api/extension/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ execId, outcome: resolvedOutcome }),
        });
        await setExtensionLiveStatus({
          phase: "success",
          scope: "cleaning",
          title: kind === "removal" ? "Removal — done" : "Engage — done",
          detail: "Marked complete. Continuing run…",
          confirmExecId: null,
          confirmExecKind: null,
        });
        sendResponse({ ok: true });

        const runKey = kind === "removal" ? REMOVAL_RUN_KEY : ENGAGE_RUN_KEY;
        const stepFn = kind === "removal" ? removalRunStep : engageRunStep;
        const scopeTitle = kind === "removal" ? "Removal run" : "Engage run";
        const stored = await chrome.storage.local.get([runKey]);
        if (!stored[runKey]) return;
        const tabId = await resolveCleaningRunTabId(
          (await chrome.storage.local.get([CLEANING_RUN_TAB_ID_KEY]))[
            CLEANING_RUN_TAB_ID_KEY
          ],
        );
        if (typeof tabId !== "number") return;
        void runCleaningLoop({
          runKey,
          stepFn,
          scopeTitle,
          tabId,
          maxSteps: 20,
        });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }
  if (msg?.type === "CLIN_REMOVAL_RUN_START") {
    (async () => {
      let paused = false;
      try {
        const res = await runCleaningLoop({
          runKey: REMOVAL_RUN_KEY,
          stepFn: removalRunStep,
          scopeTitle: "Removal run",
          tabId: msg.tabId,
          maxSteps: msg.maxSteps,
        });
        paused = Boolean(res.paused);
        sendResponse(res);
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (!paused) {
          await chrome.storage.local.set({
            [REMOVAL_RUN_KEY]: false,
            [CLEANING_RUN_TAB_ID_KEY]: null,
          });
        }
      }
    })();
    return true;
  }
  if (msg?.type === "CLIN_ENGAGE_RUN_START") {
    (async () => {
      let paused = false;
      try {
        const res = await runCleaningLoop({
          runKey: ENGAGE_RUN_KEY,
          stepFn: engageRunStep,
          scopeTitle: "Engage run",
          tabId: msg.tabId,
          maxSteps: msg.maxSteps,
        });
        paused = Boolean(res.paused);
        sendResponse(res);
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (!paused) {
          await chrome.storage.local.set({
            [ENGAGE_RUN_KEY]: false,
            [CLEANING_RUN_TAB_ID_KEY]: null,
          });
        }
      }
    })();
    return true;
  }
  return false;
});

ensurePendingSelfAlarm();
