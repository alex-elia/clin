/**
 * Clin extension — manual capture only. Posts JSON to your local Clin API.
 * No timers, no auto-navigation, no anti-detection / “humanized” automation.
 */

const DEFAULT_BASE = "http://127.0.0.1:3000";

async function getApiBase() {
  const { clinApiBase } = await chrome.storage.sync.get(["clinApiBase"]);
  return (typeof clinApiBase === "string" && clinApiBase.trim()) || DEFAULT_BASE;
}

/**
 * Runs in the page world via scripting API — must not close over extension scope.
 * Best-effort DOM scrape; LinkedIn markup changes often.
 */
function scrapeVisibleProfile() {
  const sourceUrl = window.location.href;
  const h1 = document.querySelector("main h1");
  const fullName = h1?.textContent?.trim() || undefined;

  let headline;
  const sub = document.querySelector("main .text-body-medium");
  if (sub && sub !== h1) headline = sub.textContent?.trim();

  let company;
  let location;
  const experience = document.querySelector(
    'section[data-section="experience"]',
  );
  if (experience) {
    const firstTitle = experience.querySelector("h3");
    if (firstTitle) company = firstTitle.textContent?.trim();
  }
  const geo = document.querySelector(
    '[data-test-id="profile-location"] span',
  );
  if (geo) location = geo.textContent?.trim();

  const extractedFields = {
    fullName,
    headline,
    company,
    location,
    connectionDegree: undefined,
  };

  const fieldPresence = {
    fullName: Boolean(fullName),
    headline: Boolean(headline),
    company: Boolean(company),
    location: Boolean(location),
  };

  const filled = Object.values(fieldPresence).filter(Boolean).length;
  const confidence = filled / 4;

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
      const u = new URL(tab.url);
      if (!u.hostname.endsWith("linkedin.com")) {
        sendResponse({
          ok: false,
          error: "Active tab is not LinkedIn. Open a profile first.",
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

      const base = await getApiBase();
      const url = `${base.replace(/\/$/, "")}/api/ingest/capture`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
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
