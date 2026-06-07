/**
 * After `next dev` starts, Turbopack may return 404 until each route compiles once.
 * Extension + dashboard hit many endpoints in parallel — warm them before you browse.
 */
import { fetchClinHealth } from "./lib/dev-runtime.mjs";

const GET_ROUTES = [
  "/",
  "/campaigns",
  "/contacts",
  "/api/health",
  "/api/automation/status",
  "/api/extension/brand",
  "/api/extension/campaign-context",
  "/api/extension/outreach-campaigns",
  "/api/extension/outreach-send-settings",
  "/api/extension/pending-self-capture",
  "/api/outreach/ready",
  "/api/branding/posts/ready",
  "/api/tasks/summary",
  "/api/telemetry/needs-consent",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function warmOnce(base, route, timeoutMs = 120_000) {
  const res = await fetch(`${base}${route}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.status;
}

async function warmRoute(base, route, opts = {}) {
  const retries = opts.retries ?? 12;
  const retryMs = opts.retryMs ?? 500;
  for (let i = 0; i < retries; i++) {
    try {
      const status = await warmOnce(base, route, opts.timeoutMs);
      if (status !== 404) return status < 500;
    } catch {
      /* retry */
    }
    await sleep(retryMs);
  }
  return false;
}

async function warmCampaignDetails(base, opts) {
  try {
    const status = await warmOnce(base, "/api/extension/outreach-campaigns", 60_000);
    if (status === 404) return 0;
    const res = await fetch(`${base}/api/extension/outreach-campaigns`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    let ok = 0;
    for (const c of data.campaigns ?? []) {
      if (!c?.id) continue;
      if (await warmRoute(base, `/campaigns/${c.id}`, opts)) ok += 1;
    }
    return ok;
  } catch {
    return 0;
  }
}

/**
 * @param {number} port
 * @param {{ maxWaitMs?: number }} [opts]
 */
export async function warmClinDevServer(port, opts = {}) {
  if (process.env.CLIN_DEV_SKIP_WARMUP === "1") return;

  const base = `http://127.0.0.1:${port}`;
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const health = await fetchClinHealth(port, 4000);
    if (health.ok && health.body?.db) break;
    await sleep(400);
  }

  const health = await fetchClinHealth(port, 4000);
  if (!health.ok) {
    console.warn("[clin] Dev warmup skipped — Clin health check did not succeed.");
    return;
  }

  console.log("[clin] Warming dev routes (first compile can take ~30s on Windows)…");

  let ok = 0;
  for (const route of GET_ROUTES) {
    if (await warmRoute(base, route, opts)) ok += 1;
  }

  try {
    const tick = await fetch(`${base}/api/branding/jobs/tick`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    });
    if (tick.status !== 404) ok += 1;
  } catch {
    /* ignore */
  }

  const campaignPages = await warmCampaignDetails(base, opts);
  ok += campaignPages;

  const expected = GET_ROUTES.length + 1;
  console.log(
    `[clin] Dev warmup done — ${ok}/${expected}+ route(s) compiled (${campaignPages} campaign detail page(s)).`,
  );
  if (ok < expected) {
    console.warn(
      "[clin] Some routes were still 404 — wait a few seconds and refresh, or run: npm run dev:clean",
    );
  }
}
