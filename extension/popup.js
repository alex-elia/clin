const DEFAULT_BASE = "http://127.0.0.1:3000";

const baseInput = document.getElementById("base");
const statusEl = document.getElementById("status");

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || "";
}

chrome.storage.sync.get(["clinApiBase"], (r) => {
  baseInput.value = r.clinApiBase || DEFAULT_BASE;
});

document.getElementById("save").addEventListener("click", () => {
  const v = baseInput.value.trim() || DEFAULT_BASE;
  chrome.storage.sync.set({ clinApiBase: v }, () => {
    setStatus("Saved API base.", "ok");
  });
});

document.getElementById("ping").addEventListener("click", async () => {
  const base = (baseInput.value.trim() || DEFAULT_BASE).replace(/\/$/, "");
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
    setStatus(`Saved.\nContact: ${resp.data?.contactId || "?"}\n${resp.data?.canonicalUrl || ""}`, "ok");
  });
});
