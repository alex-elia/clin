/**
 * Injected before captureMessagingBundleInPage — shared page-world messaging DOM helpers.
 * Must stay self-contained (no imports from background.js).
 */

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
      if (
        /^(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(
          text,
        ) &&
        text.length < 24
      ) {
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
