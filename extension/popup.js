const DEFAULT_BASE = "http://127.0.0.1:3000";

const baseInput = document.getElementById("base");
const statusEl = document.getElementById("status");
const outreachEl = document.getElementById("outreach");
const dashLink = document.getElementById("dash-link");

function getBase() {
  return (baseInput.value.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || "";
}

function syncDashHref() {
  dashLink.href = `${getBase()}/`;
}

chrome.storage.sync.get(["clinApiBase"], (r) => {
  baseInput.value = r.clinApiBase || DEFAULT_BASE;
  syncDashHref();
  loadReadyOutreach();
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
    setStatus(
      `Saved.\nContact: ${resp.data?.contactId || "?"}\n${resp.data?.canonicalUrl || ""}`,
      "ok",
    );
  });
});

document.getElementById("refresh-outreach").addEventListener("click", () => {
  loadReadyOutreach();
});

async function loadReadyOutreach() {
  outreachEl.replaceChildren();
  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = "Loading…";
  outreachEl.appendChild(hint);

  const base = getBase();
  try {
    const res = await fetch(`${base}/api/outreach/ready`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      hint.textContent = data?.error || `HTTP ${res.status}`;
      hint.classList.add("err");
      return;
    }
    outreachEl.replaceChildren();
    const items = data.items || [];
    if (items.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent =
        "No approved outreach. Approve drafts in the dashboard → Decisions → Ready.";
      outreachEl.appendChild(p);
      return;
    }

    const cap = document.createElement("p");
    cap.className = "muted";
    cap.textContent = `${data.count} ready (showing first ${Math.min(5, items.length)})`;
    outreachEl.appendChild(cap);

    for (const it of items.slice(0, 5)) {
      outreachEl.appendChild(renderOutreachCard(it, base));
    }
  } catch (e) {
    outreachEl.replaceChildren();
    const p = document.createElement("p");
    p.className = "err";
    p.textContent = String(e);
    outreachEl.appendChild(p);
  }
}

function renderOutreachCard(it, base) {
  const card = document.createElement("div");
  card.className = "outreach-card";

  const h3 = document.createElement("h3");
  h3.textContent = it.fullName || "Unknown";
  card.appendChild(h3);

  const ta = document.createElement("textarea");
  ta.readOnly = true;
  ta.value = it.draftOutreach?.trim() || "(No draft)";
  card.appendChild(ta);

  const row1 = document.createElement("div");
  row1.className = "row";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "secondary";
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
  openBtn.className = "secondary";
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
  sentBtn.className = "secondary";
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
