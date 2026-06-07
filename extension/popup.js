const DEFAULT_BASE = "http://127.0.0.1:3000";
const LIVE_STATUS_KEY = "clinExtensionLiveStatus";
const LAST_PACE_KEY = "clin_last_pace_message";

const baseInput = document.getElementById("base");
const outreachEl = document.getElementById("outreach");
const brandingPostsEl = document.getElementById("branding-posts");
const dashLink = document.getElementById("dash-link");
const liveStatusBar = document.getElementById("live-status-bar");
const liveStatusTitle = document.getElementById("live-status-title");
const liveStatusDetail = document.getElementById("live-status-detail");
const liveStatusActions = document.getElementById("live-status-actions");

let liveStatusFadeTimer = null;

function getBase() {
  return (baseInput.value.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

/** Retry 404s while Next.js dev compiles routes on first access. */
async function clinFetch(url, init) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 404 || attempt === 7) return res;
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
  }
  throw new Error("clinFetch: unreachable");
}

async function readLiveStatusFromStorage() {
  const stored = await chrome.storage.local.get([LIVE_STATUS_KEY]);
  return stored[LIVE_STATUS_KEY] || null;
}

function renderLiveStatus(state) {
  if (!liveStatusBar) return;
  const phase = state?.phase || "idle";
  const title = (state?.title || "").trim();
  const detail = (state?.detail || "").trim();

  if (phase === "idle" || (!title && !detail)) {
    liveStatusBar.className = "live-status is-hidden";
    liveStatusTitle.textContent = "";
    liveStatusDetail.textContent = "";
    liveStatusActions?.replaceChildren();
    return;
  }

  liveStatusBar.className = `live-status is-${phase}`;
  liveStatusTitle.textContent = title;
  liveStatusDetail.textContent = detail;
  liveStatusActions?.replaceChildren();

  if (state?.confirmMemberId) {
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn btn-primary";
    confirmBtn.textContent = "Confirm sent";
    confirmBtn.addEventListener("click", async () => {
      const ack = await chrome.runtime.sendMessage({
        type: "CLIN_OUTREACH_CONFIRM_SENT",
        memberId: state.confirmMemberId,
      });
      if (ack?.ok) {
        setLiveStatus({
          phase: "success",
          scope: "outreach",
          title: "Outreach — sent",
          detail: "Marked sent.",
          persist: true,
        });
        loadReadyOutreach();
      } else {
        setLiveStatus({
          phase: "error",
          scope: "outreach",
          title: "Confirm failed",
          detail: ack?.error || "Ack failed.",
          persist: true,
        });
      }
    });
    liveStatusActions.appendChild(confirmBtn);
  }

  if (state?.confirmExecId && state?.confirmExecKind) {
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn btn-primary";
    doneBtn.textContent =
      state.confirmExecKind === "removal" ? "Disconnected" : "Commented";
    doneBtn.addEventListener("click", async () => {
      const ack = await chrome.runtime.sendMessage({
        type: "CLIN_CLEANING_CONFIRM",
        execId: state.confirmExecId,
        kind: state.confirmExecKind,
        outcome:
          state.confirmExecKind === "removal" ? "disconnected" : "commented",
      });
      if (ack?.ok) {
        setLiveStatus({
          phase: "success",
          scope: "cleaning",
          title: "Cleaning — done",
          detail: "Marked complete.",
          persist: true,
        });
      } else {
        setLiveStatus({
          phase: "error",
          scope: "cleaning",
          title: "Confirm failed",
          detail: ack?.error || "Ack failed.",
          persist: true,
        });
      }
    });
    liveStatusActions.appendChild(doneBtn);

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "btn btn-secondary";
    skipBtn.textContent = "Skip";
    skipBtn.addEventListener("click", async () => {
      const base = getBase();
      const path =
        state.confirmExecKind === "removal"
          ? "removal-queue/ack"
          : "engage-queue/ack";
      await fetch(`${base}/api/extension/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          execId: state.confirmExecId,
          outcome: "skipped",
        }),
      });
      setLiveStatus({
        phase: "success",
        scope: "cleaning",
        title: "Skipped",
        detail: "Item skipped.",
        persist: true,
      });
    });
    liveStatusActions.appendChild(skipBtn);
  }
}

function setLiveStatus(opts) {
  const state = {
    phase: opts.phase || "running",
    scope: opts.scope || "general",
    title: opts.title || "Clin",
    detail: opts.detail || "",
    confirmMemberId: opts.confirmMemberId || null,
    updatedAt: Date.now(),
  };
  renderLiveStatus(state);
  if (opts.persist) {
    chrome.storage.local.set({ [LIVE_STATUS_KEY]: state });
  }
  if (liveStatusFadeTimer) clearTimeout(liveStatusFadeTimer);
  const shouldFade =
    (opts.phase === "success" || opts.phase === "error") &&
    !opts.confirmMemberId &&
    (opts.scope === "capture" || !opts.persist);
  if (shouldFade) {
    liveStatusFadeTimer = setTimeout(() => {
      if (opts.scope === "capture") {
        void chrome.storage.local.remove(LIVE_STATUS_KEY);
      }
      renderLiveStatus({ phase: "idle", title: "", detail: "" });
    }, opts.phase === "error" ? 8000 : 5000);
  }
}

async function syncLiveStatusFromStorage() {
  const state = await readLiveStatusFromStorage();
  if (!state || state.phase === "idle") {
    renderLiveStatus({ phase: "idle", title: "", detail: "" });
    return;
  }
  const age = Date.now() - (state.updatedAt || 0);
  const staleCapture =
    state.scope === "capture" &&
    (state.phase === "running" || state.phase === "waiting") &&
    age > 90_000;
  const staleSuccess =
    state.scope === "capture" &&
    state.phase === "success" &&
    age > 12_000;
  if (staleCapture || staleSuccess) {
    await chrome.storage.local.remove(LIVE_STATUS_KEY);
    renderLiveStatus({ phase: "idle", title: "", detail: "" });
    return;
  }
  renderLiveStatus(state);
}

function statusMeta(text, cls) {
  const t = String(text || "").trim();
  if (/client pace:/i.test(t) || /pace limit:/i.test(t)) {
    const waiting = /wait \d+s|next import in/i.test(t);
    return {
      phase: waiting ? "waiting" : "error",
      title: waiting ? "Pace wait" : "Pace limit",
    };
  }
  if (cls === "err") return { phase: "error", title: "Error" };
  if (cls === "ok") return { phase: "success", title: "Done" };
  return { phase: "running", title: "Working" };
}

async function setStatus(text, cls) {
  const { phase, title } = statusMeta(text, cls);
  const cur = await readLiveStatusFromStorage();
  const isPaceOrError =
    cls === "err" || phase === "waiting" || phase === "error";
  const pipelineOrOutreachRunning =
    cur?.phase === "running" &&
    (cur.scope === "outreach" || cur.scope === "pipeline");

  if (pipelineOrOutreachRunning && !isPaceOrError) {
    if (cls === "ok" || phase === "running") return;
  }

  const scope = pipelineOrOutreachRunning
    ? cur.scope
    : cur?.scope === "capture"
      ? "capture"
      : "general";

  setLiveStatus({
    phase,
    scope,
    title: isPaceOrError ? title : pipelineOrOutreachRunning ? cur.title : title,
    detail: text,
    persist:
      isPaceOrError ||
      scope === "outreach" ||
      scope === "pipeline" ||
      (cls === "err" && phase === "error"),
    confirmMemberId: cur?.confirmMemberId || null,
  });
}

async function syncLastPaceMessageToLiveStatus() {
  const [stored, cur] = await Promise.all([
    chrome.storage.local.get([LAST_PACE_KEY]),
    readLiveStatusFromStorage(),
  ]);
  const msg = stored[LAST_PACE_KEY];
  if (typeof msg !== "string" || !msg.trim()) return;
  if (
    cur?.phase === "running" &&
    (cur.scope === "outreach" || cur.scope === "pipeline")
  ) {
    return;
  }
  const { phase, title } = statusMeta(msg, "err");
  setLiveStatus({
    phase,
    scope: cur?.scope || "general",
    title,
    detail: msg,
    persist: true,
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[LIVE_STATUS_KEY]) void syncLiveStatusFromStorage();
  if (changes[LAST_PACE_KEY]) {
    const msg = changes[LAST_PACE_KEY].newValue;
    if (typeof msg === "string" && msg.trim()) {
      void readLiveStatusFromStorage().then((cur) => {
        const { phase, title } = statusMeta(msg, "err");
        setLiveStatus({
          phase,
          scope:
            cur?.scope === "pipeline"
              ? "pipeline"
              : cur?.scope === "outreach"
                ? "outreach"
                : "general",
          title,
          detail: msg,
          persist: true,
        });
      });
    }
  }
});

void syncLiveStatusFromStorage().then(() => syncLastPaceMessageToLiveStatus());
setInterval(() => void syncLiveStatusFromStorage(), 1500);

function isMessageChannelClosedError(message) {
  if (typeof message !== "string") return false;
  const t = message.toLowerCase();
  return (
    t.includes("message channel closed before a response was received") ||
    t.includes("the message port closed before a response was received")
  );
}

function initTabs() {
  const tabBar = document.querySelector(".tab-bar");
  if (!tabBar) return;
  const buttons = [...tabBar.querySelectorAll("button[data-panel]")];
  const settingsGear = document.getElementById("open-settings");
  const panels = new Map(
    buttons.map((b) => [b.dataset.panel, document.getElementById(`panel-${b.dataset.panel}`)]),
  );
  const settingsPanel = document.getElementById("panel-settings");
  if (settingsPanel) panels.set("settings", settingsPanel);

  function activate(name) {
    for (const btn of buttons) {
      const on = btn.dataset.panel === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (settingsGear) {
      settingsGear.classList.toggle("is-active", name === "settings");
    }
    for (const [id, panel] of panels) {
      if (!panel) continue;
      const on = id === name;
      panel.classList.toggle("is-active", on);
      panel.toggleAttribute("hidden", !on);
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activate(btn.dataset.panel);
      if (btn.dataset.panel === "data") void refreshCampaignUi();
      if (btn.dataset.panel === "branding") void loadReadyBranding();
      if (btn.dataset.panel === "outreach") void loadOutreachSendSettings();
    });
  });
  settingsGear?.addEventListener("click", () => activate("settings"));

  activate("data");
}

/** Campaign dropdown + capture-target hints (refresh after capture or new campaigns in Clin). */
async function refreshCampaignUi() {
  await Promise.all([loadCampaignCaptureHint(), populateImportCampaignPicker()]);
}

function syncDashHref() {
  dashLink.href = `${getBase()}/`;
}

const extVersionEl = document.getElementById("ext-version");
if (extVersionEl) {
  const v = chrome.runtime.getManifest().version;
  extVersionEl.textContent = `v${v} · `;
}

initTabs();

async function loadCampaignCaptureHint() {
  const el = document.getElementById("campaign-capture-hint");
  const queueEl = document.getElementById("campaign-queue-hint");
  const openNextBtn = document.getElementById("open-next-profile-capture");
  if (!el) return;
  const base = getBase();
  const selectedCampaignId = selectedCampaignIdFromPicker();
  try {
    if (!selectedCampaignId) {
      el.textContent =
        "Choose a campaign above — captures are only added when you pick one here.";
      if (queueEl) queueEl.textContent = "";
      if (openNextBtn) openNextBtn.hidden = true;
      return;
    }
    const j = await fetchCampaignContextForCampaign(base, selectedCampaignId);
    if (!j) {
      el.textContent = "";
      if (queueEl) queueEl.textContent = "";
      if (openNextBtn) openNextBtn.hidden = true;
      return;
    }
    if (j.captureTargetCampaignName) {
      el.textContent = `Captures add to: “${j.captureTargetCampaignName}”.`;
    } else {
      el.textContent = "Selected campaign not found — pick another campaign above.";
    }
    const q = j.captureTargetQueue;
    if (queueEl) {
      if (q && q.memberCount > 0) {
        queueEl.textContent = `Queue: ${q.profileMissing} need profile, ${q.profileThin} need richer capture, ${q.profileOk} detailed.`;
      } else {
        queueEl.textContent = "";
      }
    }
    if (openNextBtn) {
      if (q && q.nextProfileUrl) {
        openNextBtn.hidden = false;
        openNextBtn.dataset.profileUrl = q.nextProfileUrl;
      } else {
        openNextBtn.hidden = true;
        delete openNextBtn.dataset.profileUrl;
      }
    }
  } catch {
    el.textContent = "";
    if (queueEl) queueEl.textContent = "";
    if (openNextBtn) openNextBtn.hidden = true;
  }
}

async function fetchCampaignContext(base) {
  return fetchCampaignContextForCampaign(base, null);
}

async function fetchCampaignContextForCampaign(base, campaignId) {
  try {
    const q =
      typeof campaignId === "string" && campaignId.trim()
        ? `?campaignId=${encodeURIComponent(campaignId.trim())}`
        : "";
    const res = await clinFetch(`${base}/api/extension/campaign-context${q}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function selectedCampaignIdFromPicker() {
  const sel = document.getElementById("import-campaign-picker");
  const raw = typeof sel?.value === "string" ? sel.value.trim() : "";
  if (!raw || raw === "__none__" || raw === "__clin_default__") return null;
  return raw;
}

const IMPORT_CAMPAIGN_KEY = "clinImportCampaignChoice";

async function populateImportCampaignPicker() {
  const sel = document.getElementById("import-campaign-picker");
  if (!sel) return;
  const base = getBase();
  try {
    const res = await clinFetch(`${base}/api/extension/outreach-campaigns`);
    if (!res.ok) return;
    const j = await res.json();
    const stored = await new Promise((resolve) => {
      chrome.storage.sync.get([IMPORT_CAMPAIGN_KEY], (r) =>
        resolve(r[IMPORT_CAMPAIGN_KEY]),
      );
    });
    sel.replaceChildren();
    const none = document.createElement("option");
    none.value = "__none__";
    none.textContent = "— none —";
    sel.appendChild(none);
    for (const c of j.campaigns ?? []) {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    }
    const campaigns = j.campaigns ?? [];
    const validStored =
      typeof stored === "string" &&
      stored &&
      stored !== "__none__" &&
      stored !== "__clin_default__" &&
      campaigns.some((c) => c.id === stored);
    sel.value = validStored ? stored : "__none__";
  } catch {
    /* ignore */
  }
}

document.getElementById("import-campaign-picker")?.addEventListener("change", (e) => {
  const v = e.target.value;
  chrome.storage.sync.set({ [IMPORT_CAMPAIGN_KEY]: v }, () => {
    void loadCampaignCaptureHint();
  });
});

function sendManualSnapshotMessage(kind) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "CLIN_MANUAL_SNAPSHOT", kind }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp ?? { ok: false, error: "No response." });
    });
  });
}

document.getElementById("snapshot-messaging")?.addEventListener("click", async () => {
  setStatus("Snapshotting inbox list…");
  const resp = await sendManualSnapshotMessage("linkedin_messages_inbox_visible");
  if (resp.ok) {
    setStatus(`Inbox list saved. See Clin → Inbox.`, "ok");
  } else {
    setStatus(resp.error || "Snapshot failed.", "err");
  }
});

document.getElementById("snapshot-analytics")?.addEventListener("click", async () => {
  setStatus("Snapshotting analytics…");
  const resp = await sendManualSnapshotMessage("linkedin_post_analytics_visible");
  if (resp.ok) {
    setStatus(`Analytics saved. See Clin → Analytics.`, "ok");
  } else {
    setStatus(resp.error || "Snapshot failed.", "err");
  }
});

chrome.storage.sync.get(["clinApiBase"], (r) => {
  baseInput.value = r.clinApiBase || DEFAULT_BASE;
  syncDashHref();
  loadReadyOutreach();
  loadOutreachSendSettings();
  loadReadyBranding();
  void refreshCampaignUi();
  void refreshPipelineStatus();
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
    void loadOutreachSendSettings();
    loadReadyBranding();
    void refreshCampaignUi();
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void refreshCampaignUi();
    void syncLiveStatusFromStorage();
  }
});

document.getElementById("ping").addEventListener("click", async () => {
  const base = getBase();
  setStatus("Checking Clin…");
  const health = await checkClinHealth(base);
  if (!health.ok) {
    setStatus(health.error || "Health check failed.", "err");
    return;
  }
  const h = health.health;
  setStatus(
    [
      `Clin ${h?.version ?? "?"} · port ${h?.port ?? "?"}`,
      `DB: ${h?.db ? "OK" : "FAIL"} · ${h?.dbPath ?? "?"}`,
      `Revision: ${h?.apiRevision ?? "?"}`,
      `Node: ${h?.nodeVersion ?? "?"}`,
    ].join("\n"),
    h?.db ? "ok" : "err",
  );
});

document.getElementById("open-next-profile-capture")?.addEventListener("click", () => {
  const btn = document.getElementById("open-next-profile-capture");
  const url = btn?.dataset?.profileUrl;
  if (!url) return;
  chrome.tabs.create({ url });
});

/** Cleared when a new capture run starts or finishes. */
let paceCountdownTimer = null;

function clearPaceCountdown() {
  if (paceCountdownTimer != null) {
    clearInterval(paceCountdownTimer);
    paceCountdownTimer = null;
  }
}

function checkClinHealth(base) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "CLIN_HEALTH_CHECK", apiBase: base },
      (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(resp ?? { ok: false, error: "No health response." });
      },
    );
  });
}

function sendCaptureMessage(scope = "auto") {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "CLIN_CAPTURE", scope }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }
      resolve(resp ?? { ok: false, error: "No response from extension." });
    });
  });
}

function campaignAttachLine(d) {
  const ca = d?.campaignAttach;
  if (!ca?.attachedToCampaignId) return "";
  const name = ca.campaignName ? ` “${ca.campaignName}”` : "";
  if (ca.membersAdded) {
    return `\nCampaign${name}: +${ca.membersAdded} member(s).`;
  }
  return `\nLinked to campaign${name} (contact already in campaign).`;
}

function applyCaptureSuccess(resp) {
  clearPaceCountdown();
  if (resp.mode === "messaging" && resp.data) {
    const n = resp.data?.messageCount ?? "?";
    const ca = resp.data?.campaignAttach;
    const campaignHint = ca?.attachedToCampaignId
      ? `\nSee Clin → Campaigns${ca.campaignName ? ` → “${ca.campaignName}”` : ""} for follow-up.`
      : "\nChoose Import into campaign in the extension if this contact should appear in campaign follow-up.";
    setStatus(
      `Thread saved (${n} messages).\nContact: ${resp.data?.contactId || "?"}` +
        campaignAttachLine(resp.data) +
        campaignHint,
      "ok",
    );
    return;
  }
  if (resp.mode === "posts" && resp.data) {
    const n = resp.data?.postCount ?? "?";
    setStatus(
      `Posts saved (${n} items).\nContact: ${resp.data?.contactId || "?"}` +
        campaignAttachLine(resp.data),
      "ok",
    );
    return;
  }
  if (resp.mode === "connections" && resp.data) {
    const d = resp.data;
    const enrichNote = d.enrichQueued
      ? `\nOpening up to ${d.enrichSteps ?? "?"} profiles in the background (keep tab open)…`
      : "";
    setStatus(
      `List import: ${d.imported} people (${d.created} new, ${d.updated} updated).` +
        (d.skippedDueToHourlyCap
          ? `\nSkipped (hourly cap): ${d.skippedDueToHourlyCap} — raise limit in /settings or wait.`
          : "") +
        `\nDeduped from ${d.receivedCount} links (${d.dedupedProfileCount} profiles).` +
        enrichNote +
        campaignAttachLine(d),
      "ok",
    );
    return;
  }
  const fp = resp.data?.fieldPresence;
  const fieldList = fp
    ? Object.entries(fp)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ")
    : "";
  const diag = resp.data?.captureDiagnostics;
  const methods = resp.data?.captureMethods;
  const diagLine = diag
    ? `\nAPI: csrf=${diag.csrf ? "yes" : "NO — log in on linkedin.com"} voyager=${diag.voyagerStatus ?? "—"} bprHits=${diag.bprHits ?? 0}`
    : methods?.length
      ? `\nSources: ${methods.join(", ")}`
      : "";
  const partial =
    fp && !fp.fullName
      ? "\n\nName not detected — let the profile finish loading (scroll to top), then capture again."
      : fp && fieldList === "fullName"
        ? `\n\nOnly name captured — reload extension v0.2.29+, stay logged in, scroll About/Experience, Capture again (Profile button).${diagLine}`
        : "";
  const nameLine = resp.data?.fullName
    ? `\nName: ${resp.data.fullName}`
    : "";
  setStatus(
    `Saved.\nContact: ${resp.data?.contactId || "?"}\n${resp.data?.canonicalUrl || ""}${nameLine}` +
      campaignAttachLine(resp.data) +
      partial,
    fp && !fp.fullName ? "err" : "ok",
  );
}

async function runCaptureFlow(scope = "auto") {
  clearPaceCountdown();
  const base = getBase();
  setStatus("Checking Clin API…");
  const health = await checkClinHealth(base);
  if (!health.ok) {
    setStatus(health.error || "Clin health check failed.", "err");
    return;
  }
  const h = health.health;
  setStatus(
    `Clin OK · ${h?.dbPath ? h.dbPath.split(/[/\\]/).pop() : "db"} · ${h?.apiRevision ?? ""}`,
    "ok",
  );
  await new Promise((r) => setTimeout(r, 400));
  const scopeLabel =
    scope === "posts"
      ? "posts"
      : scope === "messaging"
        ? "1:1 thread"
        : scope === "profile"
          ? "profile"
          : scope === "connections"
            ? "list"
            : "tab";
  setStatus(`Capturing ${scopeLabel}…`);
  setLiveStatus({
    phase: "running",
    scope: "capture",
    title: "Capture",
    detail: `Capturing ${scopeLabel}…`,
  });
  const resp = await sendCaptureMessage(scope);
  if (resp.ok) {
    const n =
      resp.mode === "messaging"
        ? resp.data?.messageCount
        : resp.mode === "posts"
          ? resp.data?.postCount
          : null;
    const detail =
      resp.mode === "messaging" && n != null
        ? `Thread saved (${n} messages).`
        : "Saved to Clin.";
    setLiveStatus({
      phase: "success",
      scope: "capture",
      title: "Capture saved",
      detail,
    });
    applyCaptureSuccess(resp);
    void refreshCampaignUi();
    return;
  }
  if (resp.paceKind === "gap" && resp.paceWaitSeconds > 0) {
    let sec = resp.paceWaitSeconds;
    const paceDetail =
      resp.error ||
      `Client pace: wait ${sec}s before the next import (humanized interval, matches server).`;
    setLiveStatus({
      phase: "waiting",
      scope: "capture",
      title: "Pace wait",
      detail: `${paceDetail}\nRetrying in ${sec}s…`,
      persist: true,
    });
    paceCountdownTimer = window.setInterval(() => {
      sec -= 1;
      if (sec <= 0) {
        clearPaceCountdown();
        void runCaptureFlow(scope);
        return;
      }
      setLiveStatus({
        phase: "waiting",
        scope: "capture",
        title: "Pace wait",
        detail: `${paceDetail}\nRetrying in ${sec}s…`,
        persist: true,
      });
    }, 1000);
    return;
  }
  clearPaceCountdown();
  const errText = resp.error || "Capture failed.";
  setLiveStatus({
    phase: statusMeta(errText, "err").phase,
    scope: "capture",
    title: statusMeta(errText, "err").title,
    detail: errText,
    persist: true,
  });
}

document.getElementById("cap")?.addEventListener("click", () => {
  void runCaptureFlow("auto");
});
document.getElementById("cap-profile")?.addEventListener("click", () => {
  void runCaptureFlow("profile");
});
document.getElementById("cap-posts")?.addEventListener("click", () => {
  void runCaptureFlow("posts");
});
document.getElementById("cap-list")?.addEventListener("click", () => {
  void runCaptureFlow("connections");
});

const genDraftBtn = document.getElementById("campaign-gen-draft");
if (genDraftBtn) {
  genDraftBtn.addEventListener("click", () => {
    setStatus("Generating draft (AI)…");
    const base = getBase();
    chrome.runtime.sendMessage(
      { type: "CLIN_GENERATE_CAMPAIGN_DRAFT", apiBase: base },
      (resp) => {
        if (chrome.runtime.lastError) {
          setStatus(chrome.runtime.lastError.message, "err");
          return;
        }
        if (!resp?.ok) {
          const lines = [resp?.error || "Draft failed."];
          if (resp?.stage) lines.push(`Stage: ${resp.stage}`);
          const model = resp?.llm?.model ?? resp?.ollama?.model;
          if (model)
            lines.push(`Inference model: ${model} (Clin → Settings → Inference)`);
          setStatus(lines.join("\n"), "err");
          return;
        }
        const d = resp.data;
        const text = d?.draft || "";
        if (text) {
          navigator.clipboard.writeText(text).catch(() => {
            window.prompt("Copy draft:", text);
          });
        }
        setStatus(
          text
            ? `Draft copied (${d.campaignName || "campaign"}) — paste into LinkedIn yourself.`
            : "Model returned an empty draft.",
          text ? "ok" : "err",
        );
      },
    );
  });
}

function sendConnectionsSprintStep(tabId, round, postScrollMs) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "CLIN_CONNECTIONS_SPRINT_STEP", tabId, round, postScrollMs },
      (resp) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message,
            stopSprint: true,
          });
          return;
        }
        resolve(
          resp || { ok: false, error: "No response.", stopSprint: true },
        );
      },
    );
  });
}

async function runFullCampaignCaptureFlow() {
  const base = getBase();
  const selectedCampaignId = selectedCampaignIdFromPicker();
  if (!selectedCampaignId) {
    setStatus(
      "Choose a campaign in Import into campaign, then run automated capture again.",
      "err",
    );
    return;
  }
  const campaignCtx = await fetchCampaignContextForCampaign(base, selectedCampaignId);

  const rawR = Number(document.getElementById("pipeline-list-rounds")?.value);
  const listRounds = Math.min(12, Math.max(1, Number.isFinite(rawR) ? rawR : 4));
  const rawE = Number(document.getElementById("pipeline-enrich-steps")?.value);
  const enrichSteps = Math.min(
    20,
    Math.max(0, Number.isFinite(rawE) ? rawE : 0),
  );
  const rawP = Number(document.getElementById("pipeline-pause")?.value);
  const postScrollMs = Math.min(
    12000,
    Math.max(800, Number.isFinite(rawP) ? rawP : 2800),
  );
  const suppressFocus = Boolean(
    document.getElementById("pipeline-background-mode")?.checked,
  );

  let tab;
  try {
    tab = await resolvePipelineLinkedInTab();
  } catch (e) {
    setStatus(String(e), "err");
    return;
  }
  if (!tab?.id) {
    setStatus(
      "Open LinkedIn people search or Connections in a tab, then try again.",
      "err",
    );
    return;
  }
  const canImportListFromTab = Boolean(tab.url && isConnectionsListPageUrl(tab.url));

  if (canImportListFromTab) {
    setLiveStatus({
      phase: "running",
      scope: "pipeline",
      title: "Automated capture",
      detail: `Starting — ${listRounds} list round(s), then campaign profiles…`,
      persist: true,
    });
  } else {
    setLiveStatus({
      phase: "running",
      scope: "pipeline",
      title: "Automated capture",
      detail: "Resuming campaign profile capture (list import skipped)…",
      persist: true,
    });
  }

  const resp = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "CLIN_RUN_PIPELINE",
        tabId: tab.id,
        listRounds: canImportListFromTab ? listRounds : 0,
        enrichSteps,
        postScrollMs,
        fullRun: true,
        suppressFocus,
        selectedCampaignId,
      },
      (r) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (isMessageChannelClosedError(msg)) {
            resolve({
              ok: false,
              transient: true,
              error:
                "Connection to extension worker closed while waiting. If the run started, it may still continue in background.",
            });
            return;
          }
          resolve({ ok: false, error: msg });
          return;
        }
        resolve(r || { ok: false, error: "No response from extension." });
      },
    );
  });

  if (!resp.ok) {
    if (resp.transient) {
      setStatus(resp.error, "");
    } else {
      setStatus(resp.error || "Pipeline failed.", "err");
    }
    void refreshPipelineStatus();
    return;
  }

  const s = resp.summary || {};
  const errLine =
    s.errors?.length > 0 ? `\nNotes: ${s.errors.slice(0, 2).join(" · ")}` : "";
  const modeLine = s.campaignCaptureMode
    ? "\nMode: campaign queue (per-contact captures)."
    : "";
  const focusLine = suppressFocus
    ? "\nFocus: background mode (best effort)."
    : "\nFocus: foreground mode.";
  setStatus(
    `Done (${campaignCtx?.captureTargetCampaignName || "campaign"}). List: ~${s.listImported ?? 0} imported in ${s.listRoundsRun ?? "?"} round(s) · Profiles: ${s.profilesCaptured ?? 0} (${s.profileStepsRun ?? "?"} step(s)) · Threads: ${s.messagingCaptured ?? 0}.${modeLine}${focusLine}${errLine}\nSee Clin → Contacts / Autopilot.`,
    "ok",
  );
  void refreshPipelineStatus();
}

document.getElementById("pipeline-run")?.addEventListener("click", () => {
  void runFullCampaignCaptureFlow();
});

document.getElementById("pipeline-stop")?.addEventListener("click", async () => {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "CLIN_RUN_PIPELINE_STOP" });
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message || "";
      if (isMessageChannelClosedError(msg)) {
        setStatus(
          "Stop requested, but response channel closed. Reopen popup and check status.",
          "",
        );
        return;
      }
      setStatus(msg, "err");
      return;
    }
    setStatus(resp?.ok ? "Automated capture stop requested." : "Stop request failed.", "ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMessageChannelClosedError(msg)) {
      setStatus(
        "Connection closed before stop confirmation. Reopen popup and check status.",
        "",
      );
      return;
    }
    setStatus(msg || "Stop request failed.", "err");
  }
});

document.getElementById("refresh-outreach").addEventListener("click", () => {
  loadReadyOutreach();
  void loadOutreachSendSettings();
});

const pipelineStatusEl = document.getElementById("pipeline-status");

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

function isConnectionsListPageUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().endsWith("linkedin.com")) return false;
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

/** Prefer active LinkedIn list tab; else any open people-search / connections tab. */
async function resolvePipelineLinkedInTab() {
  const activeList = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const active = activeList[0];
  if (
    active?.id &&
    active.url?.includes("linkedin.com") &&
    isConnectionsListPageUrl(active.url)
  ) {
    return active;
  }
  const linkedInTabs = await chrome.tabs.query({
    url: "*://*.linkedin.com/*",
  });
  for (const t of linkedInTabs) {
    if (t.id && t.url && isConnectionsListPageUrl(t.url)) return t;
  }
  if (active?.id && active.url?.includes("linkedin.com")) return active;
  return linkedInTabs.find((t) => t.id) ?? active ?? null;
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

async function refreshPipelineStatus() {
  if (!pipelineStatusEl) return;
  const base = getBase();
  try {
    const res = await clinFetch(`${base}/api/automation/status`);
    const j = await res.json();
    if (!res.ok) {
      pipelineStatusEl.textContent = "";
      return;
    }
    const a = j.automation;
    const need = j.needsProfileCount ?? "?";
    pipelineStatusEl.textContent = a?.enabled
      ? `${need} need full profile · ${j.todayCount ?? "?"}/${a.maxPerDay} opens today (${j.remainingToday ?? "?"} left)`
      : "Background enrich is off — enable in Clin → Settings.";
  } catch {
    pipelineStatusEl.textContent = "";
  }
}

async function postAck(base, contactId, outcome) {
  await fetch(`${base}/api/automation/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, outcome }),
  });
}

document.getElementById("refresh-branding")?.addEventListener("click", () => {
  loadReadyBranding();
});

async function loadReadyBranding() {
  if (!brandingPostsEl) return;
  brandingPostsEl.replaceChildren();
  const hint = document.createElement("p");
  hint.className = "text-muted";
  hint.textContent = "Loading…";
  brandingPostsEl.appendChild(hint);

  const base = getBase();
  try {
    const res = await clinFetch(`${base}/api/branding/posts/ready`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      hint.textContent = data?.error || `HTTP ${res.status}`;
      hint.classList.add("is-err");
      return;
    }
    brandingPostsEl.replaceChildren();
    const items = data.items || [];
    if (items.length === 0) {
      const p = document.createElement("p");
      p.className = "text-muted";
      p.textContent =
        "Nothing ready. In Clin → Content plan, mark posts as ready, then refresh.";
      brandingPostsEl.appendChild(p);
      return;
    }

    const cap = document.createElement("p");
    cap.className = "text-muted";
    cap.textContent = `${data.count} ready post(s).`;
    brandingPostsEl.appendChild(cap);

    for (const it of items.slice(0, 8)) {
      brandingPostsEl.appendChild(renderBrandingPostCard(it, base));
    }
  } catch (e) {
    brandingPostsEl.replaceChildren();
    const p = document.createElement("p");
    p.className = "text-muted is-err";
    p.textContent = String(e);
    brandingPostsEl.appendChild(p);
  }
}

function clinAbsoluteUrl(base, path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const b = base.replace(/\/$/, "");
  return `${b}${path.startsWith("/") ? path : `/${path}`}`;
}

async function copyClinImageToClipboard(base, image) {
  const url = clinAbsoluteUrl(base, image.downloadUrl || image.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bmp, 0, 0);
  const png = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
  });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

function downloadClinImage(base, image) {
  const url = clinAbsoluteUrl(base, image.downloadUrl || image.url);
  const filename = image.filename || `clin-post-${Date.now()}.jpg`;
  if (chrome.downloads?.download) {
    chrome.downloads.download({ url, filename, saveAs: true });
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
}

function renderBrandingPostCard(it, base) {
  const card = document.createElement("div");
  card.className = "card";

  const h3 = document.createElement("h3");
  h3.className = "card-title";
  h3.textContent = it.title || "Post";
  card.appendChild(h3);

  const primary = it.primaryImage || (it.images && it.images[0]) || null;
  if (primary?.url) {
    const imgWrap = document.createElement("div");
    imgWrap.style.marginTop = "8px";
    const img = document.createElement("img");
    img.src = clinAbsoluteUrl(base, primary.url);
    img.alt = primary.alt || "Post image";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "140px";
    img.style.borderRadius = "6px";
    img.style.border = "1px solid var(--border, #e2e8f0)";
    imgWrap.appendChild(img);
    if (primary.style) {
      const cap = document.createElement("p");
      cap.className = "text-muted";
      cap.style.fontSize = "11px";
      cap.style.marginTop = "4px";
      cap.textContent =
        primary.style === "text_card" ? "Text graphic" : "Photo";
      imgWrap.appendChild(cap);
    }
    card.appendChild(imgWrap);
  }

  const ta = document.createElement("textarea");
  ta.className = "card-draft";
  ta.readOnly = true;
  ta.value = it.copyText?.trim() || "(No copy)";
  card.appendChild(ta);

  const row = document.createElement("div");
  row.className = "btn-row";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn btn-secondary";
  copyBtn.textContent = "Copy post";
  copyBtn.addEventListener("click", () => {
    const text = (ta.value && ta.value !== "(No copy)" ? ta.value : it.copyText) || "";
    navigator.clipboard.writeText(text.replace(/\r\n/g, "\n").trim()).catch(() => {
      window.prompt("Copy post:", text);
    });
  });
  row.appendChild(copyBtn);

  if (primary?.url) {
    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.className = "btn btn-secondary";
    dlBtn.textContent = "Download image";
    dlBtn.addEventListener("click", () => {
      try {
        downloadClinImage(base, primary);
        setStatus("Downloading image…", "ok");
      } catch (e) {
        setStatus(String(e), "err");
      }
    });
    row.appendChild(dlBtn);

    const imgCopyBtn = document.createElement("button");
    imgCopyBtn.type = "button";
    imgCopyBtn.className = "btn btn-secondary";
    imgCopyBtn.textContent = "Copy image";
    imgCopyBtn.addEventListener("click", async () => {
      try {
        await copyClinImageToClipboard(base, primary);
        setStatus("Image copied — paste into LinkedIn post composer", "ok");
      } catch (e) {
        setStatus(String(e), "err");
      }
    });
    row.appendChild(imgCopyBtn);
  }

  const pubBtn = document.createElement("button");
  pubBtn.type = "button";
  pubBtn.className = "btn btn-secondary";
  pubBtn.textContent = "Mark published";
  pubBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${base}/api/extension/branding-post-published`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: it.postId }),
      });
      if (res.ok) {
        setStatus(`Marked published: ${it.title}`, "ok");
        loadReadyBranding();
      } else {
        setStatus("Mark published failed.", "err");
      }
    } catch (e) {
      setStatus(String(e), "err");
    }
  });
  row.appendChild(pubBtn);
  card.appendChild(row);

  return card;
}

async function loadReadyOutreach() {
  outreachEl.replaceChildren();
  const hint = document.createElement("p");
  hint.className = "text-muted";
  hint.textContent = "Loading…";
  outreachEl.appendChild(hint);

  const base = getBase();
  try {
    const res = await clinFetch(`${base}/api/outreach/ready`);
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
        "Nothing ready. Either approve in Decisions, or in Clin → Campaigns set a campaign active, generate drafts, mark rows ready, then refresh.";
      outreachEl.appendChild(p);
      return;
    }

    const cap = document.createElement("p");
    cap.className = "text-muted";
    const camp = data.activeCampaignName
      ? ` Active campaign: ${data.activeCampaignName}.`
      : "";
    cap.textContent = `${data.count} ready (showing first ${Math.min(5, items.length)}).${camp}`;
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
  const src =
    it.source === "campaign"
      ? "Campaign"
      : it.source === "decision_queue"
        ? "Decisions"
        : "Ready";
  h3.textContent = `${it.fullName || "Unknown"} · ${src}`;
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
      if (it.source === "campaign" && it.memberId) {
        const r = await fetch(`${base}/api/extension/outreach-queue/ack`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: it.memberId, outcome: "sent" }),
        });
        if (!r.ok) {
          const err = await r.text();
          setStatus(err || `Mark sent failed ${r.status}`, "err");
          sentBtn.disabled = false;
          return;
        }
      } else if (it.queueId) {
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
      } else {
        setStatus("Unknown item type; cannot mark sent.", "err");
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

  if (it.source === "campaign" && it.memberId) {
    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "btn btn-secondary";
    skipBtn.style.marginTop = "8px";
    skipBtn.textContent = "Skip (campaign)";
    skipBtn.addEventListener("click", async () => {
      skipBtn.disabled = true;
      try {
        const r = await fetch(`${base}/api/extension/outreach-queue/ack`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: it.memberId, outcome: "skipped" }),
        });
        if (!r.ok) {
          setStatus(await r.text(), "err");
          skipBtn.disabled = false;
          return;
        }
        setStatus("Skipped.", "ok");
        loadReadyOutreach();
      } catch (e) {
        setStatus(String(e), "err");
        skipBtn.disabled = false;
      }
    });
    card.appendChild(skipBtn);
  }

  return card;
}

const outreachAutoSendEl = document.getElementById("outreach-auto-send");
const outreachSendModeHintEl = document.getElementById("outreach-send-mode-hint");

function syncOutreachSendModeUi(sendMode) {
  const auto = sendMode === "auto";
  if (outreachAutoSendEl) outreachAutoSendEl.checked = auto;
  if (outreachSendModeHintEl) {
    outreachSendModeHintEl.textContent = auto
      ? "Clin will click Send after inserting each draft."
      : "When off, click Send on LinkedIn, then Confirm sent in the bar above.";
  }
}

async function loadOutreachSendSettings() {
  const base = getBase();
  try {
    const res = await clinFetch(`${base}/api/extension/outreach-send-settings`);
    if (!res.ok) return;
    const json = await res.json();
    syncOutreachSendModeUi(json?.outreachSend?.sendMode ?? "auto");
  } catch {
    syncOutreachSendModeUi("auto");
  }
}

async function saveOutreachSendMode(autoSend) {
  const base = getBase();
  const sendMode = autoSend ? "auto" : "manual_confirm";
  syncOutreachSendModeUi(sendMode);
  try {
    const res = await fetch(`${base}/api/extension/outreach-send-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendMode }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setStatus(json?.error || `Save failed (${res.status})`, "err");
      await loadOutreachSendSettings();
      return;
    }
    setStatus(autoSend ? "Auto-send enabled." : "Manual send mode — confirm after you send.", "ok");
  } catch (e) {
    setStatus(String(e), "err");
    await loadOutreachSendSettings();
  }
}

outreachAutoSendEl?.addEventListener("change", () => {
  void saveOutreachSendMode(outreachAutoSendEl.checked);
});

async function loadExtensionBrand() {
  const base = getBase();
  try {
    const res = await clinFetch(`${base}/api/extension/brand`);
    if (!res.ok) return;
    const b = await res.json();
    const tag = document.querySelector(".tagline");
    if (tag && b.tagline) tag.textContent = b.tagline;
  } catch {
    /* ignore */
  }
}

loadExtensionBrand();

document.getElementById("outreach-run-stop")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLIN_OUTREACH_RUN_STOP" });
  setLiveStatus({
    phase: "success",
    scope: "outreach",
    title: "Outreach run stopped",
    detail: "Run stopped.",
    persist: true,
  });
});

document.getElementById("outreach-run-start")?.addEventListener("click", async () => {
  setLiveStatus({
    phase: "running",
    scope: "outreach",
    title: "Outreach run",
    detail: "Starting outreach run…",
    persist: true,
  });
  const res = await chrome.runtime.sendMessage({
    type: "CLIN_OUTREACH_RUN_START",
    maxSteps: 5,
  });
  if (chrome.runtime.lastError) {
    setLiveStatus({
      phase: "error",
      scope: "outreach",
      title: "Outreach run failed",
      detail: chrome.runtime.lastError.message,
      persist: true,
    });
    return;
  }
  if (!res?.ok) {
    setLiveStatus({
      phase: "error",
      scope: "outreach",
      title: "Outreach run failed",
      detail: res?.error || "Run failed.",
      persist: true,
    });
    return;
  }
  if (res.paused && res.item?.memberId) {
    void syncLiveStatusFromStorage();
    return;
  }
  if (res.done) {
    setLiveStatus({
      phase: "success",
      scope: "outreach",
      title: "Outreach run finished",
      detail: res.reason === "queue_empty" ? "Queue empty." : String(res.reason || "Done."),
      persist: true,
    });
    loadReadyOutreach();
    return;
  }
  setLiveStatus({
    phase: "success",
    scope: "outreach",
    title: "Outreach run finished",
    detail: "Run finished.",
    persist: true,
  });
  loadReadyOutreach();
});

async function startCleaningRun(type) {
  const msgType =
    type === "removal" ? "CLIN_REMOVAL_RUN_START" : "CLIN_ENGAGE_RUN_START";
  setLiveStatus({
    phase: "running",
    scope: "cleaning",
    title: type === "removal" ? "Removal run" : "Engage run",
    detail: "Starting…",
    persist: true,
  });
  const res = await chrome.runtime.sendMessage({ type: msgType, maxSteps: 5 });
  if (chrome.runtime.lastError) {
    setLiveStatus({
      phase: "error",
      scope: "cleaning",
      title: "Run failed",
      detail: chrome.runtime.lastError.message,
      persist: true,
    });
    return;
  }
  if (!res?.ok) {
    setLiveStatus({
      phase: "error",
      scope: "cleaning",
      title: "Run failed",
      detail: res?.error || "Run failed.",
      persist: true,
    });
    return;
  }
  if (res.paused) {
    void syncLiveStatusFromStorage();
    return;
  }
  if (res.done) {
    setLiveStatus({
      phase: "success",
      scope: "cleaning",
      title: "Run finished",
      detail:
        res.reason === "queue_empty"
          ? "Queue empty."
          : res.reason === "pace_wait"
            ? `Pace wait — retry in ${Math.ceil((res.waitMs || 0) / 1000)}s.`
            : String(res.reason || "Done."),
      persist: true,
    });
  }
}

document.getElementById("engage-run-stop")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLIN_ENGAGE_RUN_STOP" });
  setLiveStatus({
    phase: "success",
    scope: "cleaning",
    title: "Engage run stopped",
    detail: "Run stopped.",
    persist: true,
  });
});

document.getElementById("removal-run-stop")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLIN_REMOVAL_RUN_STOP" });
  setLiveStatus({
    phase: "success",
    scope: "cleaning",
    title: "Removal run stopped",
    detail: "Run stopped.",
    persist: true,
  });
});

document.getElementById("engage-run-start")?.addEventListener("click", () => {
  void startCleaningRun("engage");
});

document.getElementById("removal-run-start")?.addEventListener("click", () => {
  void startCleaningRun("removal");
});
