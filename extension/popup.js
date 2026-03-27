const DEFAULT_BASE = "http://127.0.0.1:3000";

const baseInput = document.getElementById("base");
const activityEl = document.getElementById("activity");
const outreachEl = document.getElementById("outreach");
const dashLink = document.getElementById("dash-link");

function getBase() {
  return (baseInput.value.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

function setStatus(text, cls) {
  activityEl.textContent = text;
  const base = "activity";
  if (cls === "ok") activityEl.className = `${base} is-ok`;
  else if (cls === "err") activityEl.className = `${base} is-err`;
  else activityEl.className = base;
}

function initTabs() {
  const tabBar = document.querySelector(".tab-bar");
  if (!tabBar) return;
  const buttons = [...tabBar.querySelectorAll("button[data-panel]")];
  const panels = new Map(
    buttons.map((b) => [b.dataset.panel, document.getElementById(`panel-${b.dataset.panel}`)]),
  );

  function activate(name) {
    for (const btn of buttons) {
      const on = btn.dataset.panel === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
    for (const [id, panel] of panels) {
      if (!panel) continue;
      const on = id === name;
      panel.classList.toggle("is-active", on);
      panel.toggleAttribute("hidden", !on);
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.panel));
  });

  activate("capture");
}

function syncDashHref() {
  dashLink.href = `${getBase()}/`;
}

initTabs();

chrome.storage.sync.get(["clinApiBase"], (r) => {
  baseInput.value = r.clinApiBase || DEFAULT_BASE;
  syncDashHref();
  loadReadyOutreach();
  refreshHygieneStatus();
  chrome.runtime.sendMessage({ type: "CLIN_POLL_PENDING_SELF" }, () => {
    void chrome.runtime.lastError;
  });
});

baseInput.addEventListener("input", syncDashHref);

document.getElementById("save").addEventListener("click", () => {
  const v = baseInput.value.trim() || DEFAULT_BASE;
  chrome.storage.sync.set({ clinApiBase: v }, () => {
    setStatus("Saved API base.", "ok");
    syncDashHref();
    loadReadyOutreach();
  });
});

document.getElementById("ping").addEventListener("click", async () => {
  const base = getBase();
  setStatus("Checking…");
  try {
    const res = await fetch(`${base}/api/health`);
    const j = await res.json();
    setStatus(JSON.stringify(j, null, 2), res.ok ? "ok" : "err");
  } catch (e) {
    setStatus(String(e), "err");
  }
});

document.getElementById("cap").addEventListener("click", () => {
  setStatus("Capturing…");
  chrome.runtime.sendMessage({ type: "CLIN_CAPTURE" }, (resp) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    if (!resp?.ok) {
      setStatus(resp?.error || "Capture failed.", "err");
      return;
    }
    if (resp.mode === "connections" && resp.data) {
      const d = resp.data;
      setStatus(
        `List import: ${d.imported} people (${d.created} new, ${d.updated} updated).` +
          (d.skippedDueToHourlyCap
            ? `\nSkipped (hourly cap): ${d.skippedDueToHourlyCap} — raise limit in /settings or wait.`
            : "") +
          `\nDeduped from ${d.receivedCount} links (${d.dedupedProfileCount} profiles).`,
        "ok",
      );
      return;
    }
    setStatus(
      `Saved.\nContact: ${resp.data?.contactId || "?"}\n${resp.data?.canonicalUrl || ""}`,
      "ok",
    );
  });
});

document.getElementById("refresh-outreach").addEventListener("click", () => {
  loadReadyOutreach();
});

const hygieneStatusEl = document.getElementById("hygiene-status");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same rules as background.js — LinkedIn often hits "complete" before URL is /in/…. */
function isLinkedInProfilePageUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().endsWith("linkedin.com")) return false;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "in" && parts[1]) return true;
    if (parts[0] === "sales" && parts[1] === "lead" && parts[2]) return true;
    return false;
  } catch {
    return false;
  }
}

function formatHygieneUrlWaitProgress({ url, status, elapsedMs }) {
  const sec = Math.max(0, Math.round(elapsedMs / 1000));
  const raw =
    url && url.trim()
      ? url
      : "(no URL yet — navigation may still be pending)";
  const short = raw.length > 88 ? `${raw.slice(0, 85)}…` : raw;
  return (
    `Hygiene: waiting for profile URL (/in/…) — ${sec}s\n` +
    `Tab: ${status || "?"}\n` +
    short
  );
}

/**
 * Do not use tabs.onUpdated "complete" alone — LinkedIn redirects / hydrates after that.
 * @param {(info: { url: string; status: string; elapsedMs: number }) => void} [onProgress]
 *        Called on first poll and then about every 2s so the popup shows live URL/state.
 */
async function waitForLinkedInProfileTab(tabId, timeoutMs = 90000, onProgress) {
  const start = Date.now();
  let lastUrl = "";
  let lastStatus = "";
  let lastProgressAt = 0;
  const progressEveryMs = 2000;

  while (Date.now() - start < timeoutMs) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      throw new Error("The LinkedIn tab was closed.");
    }
    lastUrl = tab?.url || "";
    lastStatus = tab?.status || "";
    if (lastUrl && isLinkedInProfilePageUrl(lastUrl)) {
      await sleep(700);
      return;
    }
    const now = Date.now();
    if (
      onProgress &&
      (lastProgressAt === 0 || now - lastProgressAt >= progressEveryMs)
    ) {
      lastProgressAt = now;
      onProgress({
        url: lastUrl,
        status: lastStatus,
        elapsedMs: now - start,
      });
    }
    await sleep(400);
  }
  const hint =
    lastUrl.includes("authwall") || lastUrl.includes("login")
      ? " You may need to log in to LinkedIn in this browser."
      : "";
  throw new Error(
    `Timed out waiting for a profile URL (/in/…). Last load state: ${lastStatus || "?"}. Last URL:\n${lastUrl || "(empty)"}${hint}`,
  );
}

async function refreshHygieneStatus() {
  if (!hygieneStatusEl) return;
  const base = getBase();
  try {
    const res = await fetch(`${base}/api/automation/status`);
    const j = await res.json();
    if (!res.ok) {
      hygieneStatusEl.textContent = "";
      return;
    }
    const a = j.automation;
    hygieneStatusEl.textContent = a?.enabled
      ? `Hygiene: ${j.todayCount ?? "?"}/${a.maxPerDay} visits today (${j.remainingToday ?? "?"} left).`
      : "Hygiene automation is off (enable in Clin → Settings).";
  } catch {
    hygieneStatusEl.textContent = "";
  }
}

async function postAck(base, contactId, outcome) {
  await fetch(`${base}/api/automation/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, outcome }),
  });
}

document.getElementById("hygiene-run").addEventListener("click", async () => {
  const raw = Number(document.getElementById("hygiene-steps").value);
  const maxSteps = Math.min(8, Math.max(1, Number.isFinite(raw) ? raw : 3));

  setStatus("Hygiene: starting…");
  const base = getBase();

  let tabList;
  try {
    tabList = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    setStatus(String(e), "err");
    return;
  }
  const tab = tabList[0];
  if (!tab?.id) {
    setStatus("No active tab.", "err");
    return;
  }

  for (let i = 0; i < maxSteps; i++) {
    const first = i === 0 ? "1" : "0";
    let nextRes;
    try {
      nextRes = await fetch(`${base}/api/automation/next?first=${first}`);
    } catch (e) {
      setStatus(String(e), "err");
      return;
    }
    let next;
    try {
      next = await nextRes.json();
    } catch {
      setStatus("Bad response from /api/automation/next", "err");
      return;
    }
    if (!nextRes.ok) {
      setStatus(next.error || `HTTP ${nextRes.status}`, "err");
      refreshHygieneStatus();
      return;
    }
    if (next.done || !next.contact) {
      setStatus(
        next.reason === "daily_limit"
          ? "Daily hygiene cap reached. Try tomorrow or raise the limit in Settings."
          : next.reason === "no_contacts"
            ? "No contacts in the local database."
            : "Hygiene batch finished.",
        "ok",
      );
      refreshHygieneStatus();
      return;
    }

    if (next.waitBeforeMs > 0) {
      const sec = Math.max(1, Math.round(next.waitBeforeMs / 1000));
      setStatus(`Hygiene: waiting ${sec}s before opening next profile…`);
      await sleep(next.waitBeforeMs);
    }

    setStatus(
      `Hygiene: opening ${next.contact.fullName || next.contact.id}…`,
      "",
    );
    try {
      await chrome.tabs.update(tab.id, { url: next.contact.linkedinUrl });
      await waitForLinkedInProfileTab(tab.id, 90000, (info) => {
        setStatus(formatHygieneUrlWaitProgress(info), "");
      });
    } catch (e) {
      await postAck(base, next.contact.id, "error");
      setStatus(e instanceof Error ? e.message : String(e), "err");
      refreshHygieneStatus();
      return;
    }

    await sleep(2000 + Math.floor(Math.random() * 3000));

    const step = await chrome.runtime.sendMessage({
      type: "CLIN_HYGIENE_CAPTURE_STEP",
      tabId: tab.id,
    });
    if (chrome.runtime.lastError) {
      await postAck(base, next.contact.id, "error");
      setStatus(chrome.runtime.lastError.message, "err");
      refreshHygieneStatus();
      return;
    }
    if (!step?.ok) {
      await postAck(base, next.contact.id, "error");
      setStatus(step?.error || "Hygiene capture failed.", "err");
      refreshHygieneStatus();
      return;
    }
    const savedId = step.data?.contactId;
    if (savedId && savedId !== next.contact.id) {
      await postAck(base, next.contact.id, "error");
      setStatus(
        "Capture returned a different contact than planned; marked as error. Check the active tab.",
        "err",
      );
      refreshHygieneStatus();
      return;
    }

    await postAck(base, next.contact.id, "ok");
    setStatus(
      `Hygiene: saved ${i + 1}/${maxSteps} — ${next.contact.fullName || next.contact.id}`,
      "ok",
    );
  }

  setStatus(`Hygiene: finished ${maxSteps} profile(s).`, "ok");
  refreshHygieneStatus();
});

async function loadReadyOutreach() {
  outreachEl.replaceChildren();
  const hint = document.createElement("p");
  hint.className = "text-muted";
  hint.textContent = "Loading…";
  outreachEl.appendChild(hint);

  const base = getBase();
  try {
    const res = await fetch(`${base}/api/outreach/ready`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      hint.textContent = data?.error || `HTTP ${res.status}`;
      hint.classList.add("is-err");
      return;
    }
    outreachEl.replaceChildren();
    const items = data.items || [];
    if (items.length === 0) {
      const p = document.createElement("p");
      p.className = "text-muted";
      p.textContent =
        "No approved outreach. Approve drafts in the dashboard → Decisions → Ready.";
      outreachEl.appendChild(p);
      return;
    }

    const cap = document.createElement("p");
    cap.className = "text-muted";
    cap.textContent = `${data.count} ready (showing first ${Math.min(5, items.length)})`;
    outreachEl.appendChild(cap);

    for (const it of items.slice(0, 5)) {
      outreachEl.appendChild(renderOutreachCard(it, base));
    }
  } catch (e) {
    outreachEl.replaceChildren();
    const p = document.createElement("p");
    p.className = "text-muted is-err";
    p.textContent = String(e);
    outreachEl.appendChild(p);
  }
}

function renderOutreachCard(it, base) {
  const card = document.createElement("div");
  card.className = "card";

  const h3 = document.createElement("h3");
  h3.className = "card-title";
  h3.textContent = it.fullName || "Unknown";
  card.appendChild(h3);

  const ta = document.createElement("textarea");
  ta.className = "card-draft";
  ta.readOnly = true;
  ta.value = it.draftOutreach?.trim() || "(No draft)";
  card.appendChild(ta);

  const row1 = document.createElement("div");
  row1.className = "btn-row";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn btn-secondary";
  copyBtn.textContent = "Copy draft";
  copyBtn.addEventListener("click", () => {
    const text = it.draftOutreach || "";
    navigator.clipboard.writeText(text).catch(() => {
      window.prompt("Copy:", text);
    });
  });
  row1.appendChild(copyBtn);

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "btn btn-secondary";
  openBtn.textContent = "Open profile";
  openBtn.addEventListener("click", () => {
    if (it.linkedinUrl) {
      window.open(it.linkedinUrl, "_blank", "noopener,noreferrer");
    }
  });
  row1.appendChild(openBtn);
  card.appendChild(row1);

  const sentBtn = document.createElement("button");
  sentBtn.type = "button";
  sentBtn.className = "btn btn-primary";
  sentBtn.textContent = "Mark sent (manual)";
  sentBtn.addEventListener("click", async () => {
    sentBtn.disabled = true;
    try {
      const r = await fetch(`${base}/api/queue/${it.queueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachDecision: "sent" }),
      });
      if (!r.ok) {
        const err = await r.text();
        setStatus(err || `Mark sent failed ${r.status}`, "err");
        sentBtn.disabled = false;
        return;
      }
      setStatus("Marked sent. Refresh list if needed.", "ok");
      loadReadyOutreach();
    } catch (err) {
      setStatus(String(err), "err");
      sentBtn.disabled = false;
    }
  });
  card.appendChild(sentBtn);

  return card;
}
