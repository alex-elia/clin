# Clin Chrome extension (MV3)

Companion to the local Clin web app: capture visible LinkedIn data, manage campaign context, run **cleaning engage/removal** todos, and run **optional paced automation** (list sprint, hygiene, outreach) when enabled in Clin **Settings**.

**Current version:** see `manifest.json` (e.g. **0.2.60** — normalized connection degree on profile capture, shared parse with list import).

## Load unpacked

1. Run the web app from the repo root: `npm install && npm run dev` (fixed port **3100**; use `npm run dev:stop` in `web/` if a stale server is still running).
2. Chrome → **Extensions** → enable **Developer mode** → **Load unpacked** → select this `extension/` folder.
3. Open LinkedIn, open the Clin popup, and connect to your local API.

## Settings

- **Clin API base** — defaults to `http://127.0.0.1:3100`. Save after editing. Use **Ping** in Settings tab to verify `/api/health` (`db: true`, same `dbPath` as dashboard). Capture refuses to run if health fails.

## Tabs

| Tab | Purpose |
|-----|---------|
| **Data** | Capture, list sprint, hygiene batch, automated capture pipeline (step-based, alarm-driven) |
| **Outreach** | Ready campaigns, paced outreach run |
| **Cleaning** | Engage comment and removal disconnect todo lists (from `/cleaning` accepts and campaign engage queue) |
| **Branding** | Ready content posts: copy text, download or copy image, mark published |

Use the **gear** in the header for **Settings** (API base URL and health check).

## Capture

Click **Capture LinkedIn tab** on a profile (or use **list sprint** / automated pipeline when allowed in Settings) to send visible fields to `POST /api/ingest/capture` or the connections ingest endpoint.

**Posts capture** records activity cards with optional **`postKind`** (`original`, `reshare`, `news_share`), user comments on reshares, and shared titles. Posts older than one year are skipped for engage targeting.

**Automated pipeline** (0.2.57+): multi-step profile/posts chain uses `chrome.alarms`, pins the automation tab, and survives background tab throttling. Popup returns immediately and polls pipeline status.

## Pacing

The background script calls `GET /api/settings` and applies the same pacing as the server: **list imports** (shallow rows, faster gaps) and **profile captures** (full visits, separate hourly budget). Tune both in **Settings → Pacing**.

## Outreach handoff

Approve drafts in the dashboard (**Campaigns → Exec** → **Ready for extension**). The popup loads ready items via `/api/outreach/ready` and campaign APIs. You can **copy drafts**, **open profiles**, **mark sent**, or start a **paced outreach run** when configured.

Campaign members may also be on the **engage** path (public comment) while a DM draft is prepared in parallel — see dashboard Cleaning exec queue.

## Cleaning exec handoff

From **Cleaning** or **Campaigns** (Queue engage):

- **Engage** — AI-suggested comment, post preview, copy/open/mark commented/skip (`GET /api/extension/cleaning-engage/ready`, ack via engage-queue API).
- **Removal** — disconnect workflow (`GET /api/extension/cleaning-removal/ready`).

Enable engage/removal runners and pace in Clin → **Settings** (cleaning exec section).

## Branding handoff

In Clin → **Content plan**, add a **photo** or **text graphic** (section 3), save, then **Mark ready**. The extension **Branding** tab loads `/api/branding/posts/ready` with post copy and image URLs. Use **Copy post**, **Download image**, or **Copy image** (paste into LinkedIn’s composer), then **Mark published** when live.

## Optional automation (Settings)

| Feature | Summary |
|---------|---------|
| **List sprint** | Scroll/load a connections list and import visible rows (keep the popup open). |
| **Hygiene runner** | Open profiles from your local queue on a timer, with a daily cap. |
| **Outreach run** | Paced campaign outreach steps with confirm/skip. |
| **Cleaning engage / removal** | Paced exec from `cleaning_exec_queue` with daily caps. |

Enable each feature in Clin → **Settings**. Start with default caps; increase only if you accept platform and account risk.

## Platform use

Clin is a user-operated tool. You are responsible for complying with LinkedIn (and any other site’s) terms. See the [root README](../README.md#responsible-use-and-third-party-platforms).

If LinkedIn changes the DOM, extraction may return partial fields — check **Captures** in the dashboard and update selectors in `background.js` as needed.
