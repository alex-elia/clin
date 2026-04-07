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
      const t = clean(el?.textContent);
      if (t) return t;
    }
    return undefined;
  }

  const sourceUrl = window.location.href;

  const fullName =
    firstText(
      '[data-anonymize="person-name"]',
      "main h1.text-heading-xlarge",
      "main h1",
      "h1.text-heading-xlarge",
      ".pv-text-details__left-panel h1",
    ) || undefined;

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
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeVisibleProfile,
  });
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
  if (msg?.type !== "CLIN_CAPTURE") return;

  (async () => {
    try {
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

      const base = await getApiBase();
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

        const ctx = await getExtensionCampaignContext(root);
        const listBody = attachCampaignIdToPayload(listPayload, ctx);
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

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeVisibleProfile,
      });

      if (!result) {
        sendResponse({ ok: false, error: "Extractor returned nothing." });
        return;
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
        sendResponse({
          ok: false,
          error: json?.error || text || `HTTP ${res.status}`,
        });
        return;
      }

      await recordBatchCaptureSuccess(pruned, 1);
      await chrome.storage.local.remove(LAST_ERROR_KEY);
      sendResponse({ ok: true, data: json, mode: "profile" });
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

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: scrapeVisibleProfile,
      });

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

ensurePendingSelfAlarm();
