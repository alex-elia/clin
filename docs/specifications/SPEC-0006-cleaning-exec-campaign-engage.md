# SPEC-0006: Cleaning exec queues & campaign engage (as-built)

**Status:** current as of extension **0.2.58+** / active development branch.  
**Scope:** Cleaning accept flows, extension-paced exec, campaign ICP engage branch, post signals.  
**Related:** [SPEC-0001](./SPEC-0001-clin-system-specification.md), [SPEC-0005](./SPEC-0005-unified-contact-analysis.md), [ADR-0011](../adr/0011-campaign-engage-shared-exec-queue.md).

---

## 1. Purpose

Document **release-ready** behavior for:

- **Cleaning exec queues** — removal disconnect and engage comment, with dashboard todo lists and extension runners.
- **Campaign engage decision** — ICP recommends `engage_comment` → shared engage queue; DM draft path remains available in parallel.
- **Post capture intelligence** — recency window, post origin (`original` / `reshare` / `news_share`), interest signals in LLM prompts.
- **Resilient automated capture** — step-based extension pipeline that survives tab switches and background throttling.

---

## 2. Cleaning exec queue

### 2.1 Data model

Table **`cleaning_exec_queue`** (`web/src/db/schema.ts`):

| Column | Role |
|--------|------|
| `contact_id` | FK → contacts |
| `kind` | `engage` \| `removal` |
| `status` | `pending` \| `in_progress` \| `done` \| `skipped` \| `failed` |
| `payload_json` | Kind-specific: suggested comment, hooks, rationale; campaign items include `campaignId`, `memberId`, `source: "campaign"` |
| `outcome` | e.g. `commented`, `disconnected`, `skipped`, `failed` |
| `completed_at` | Pacing gap anchor |

Deduping: one **pending** row per `(contact_id, kind)`; re-enqueue updates payload.

### 2.2 Cleaning board → exec

| Bucket accept | Effect |
|---------------|--------|
| `review_remove` | `approveRemovalForContact` → removal exec queue; dismiss from board |
| `engage_comment` | `enqueueEngageForContact` (AI comment via `cleaning_engage_comment`) → engage exec queue; dismiss from board |
| Other actionable | `action_queue` review row (legacy path) |

### 2.3 Dashboard UI

- **`/cleaning`** — board buckets + **`CleaningExecQueuePanel`**: edit engage comments, regenerate, skip; lists pending engage and removal items.
- **Settings** — `cleaning.engage_enabled`, `cleaning.engage_exec_mode` (`auto` \| `manual_confirm`), daily caps and pace gaps (`cleaningExecSettings.ts`).

### 2.4 Extension

Popup **engage** and **removal** todo cards (post preview, AI comment, copy/open/mark done/skip). Paced runs use alarms and `cleaning-exec-settings` API.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/cleaning/exec-queue` | Dashboard list (engage + removal) |
| `PATCH` | `/api/cleaning/exec-queue/[id]` | Update comment, skip, regenerate |
| `GET` | `/api/extension/cleaning-engage/ready` | Extension engage handoff list |
| `GET` | `/api/extension/cleaning-removal/ready` | Extension removal handoff list |
| `GET` | `/api/extension/cleaning-exec-settings` | Pace, caps, exec mode |
| `POST` | `/api/extension/engage-queue/ack` | Outcome `commented` \| `skipped` \| `failed` |
| `POST` | `/api/extension/removal-queue/ack` | Removal outcomes |

---

## 3. Campaign engage path

### 3.1 ICP recommended actions

`campaign_icp_check` returns `recommended_action` including:

| Action | Meaning |
|--------|---------|
| `keep_and_draft` | Strong fit — generate DM draft |
| `keep` | Keep in campaign; nurture / wait |
| **`engage_comment`** | Comment on recent post first; not ready for cold DM |
| `review_remove` | Poor fit — consider removing |
| `skip` | Skip outreach for this campaign |

### 3.2 Member status lifecycle

```
draft → ready → sent
      ↘ engage (engage queued; DM prep still allowed)
      ↘ skipped | closed
```

- **`engage`**: set when campaign engage is enqueued. User may still **save draft**, **Regenerate (LLM)**, and **Ready for extension**.
- **`ready` + pending engage exec**: status shows `ready for extension` plus **engage pending** badge.
- After extension marks engage **commented**: if member status is still `engage`, reset to **`draft`**; if already **`ready`**, leave unchanged.

### 3.3 Orchestration

**Orchestrate campaign now** (`orchestrateCampaignWorkflowAction`):

- Runs ICP + branches: **draft** vs **engage queue** vs skip.
- Auto-engage requires **recent post** in latest posts capture (`contactHasRecentPostForEngage`).
- Does not re-queue engage if exec item already pending.
- Reports counts: `drafted`, `engaged`, `skipped`, `failed`.

**Manual:** per-member **Queue engage** on campaign Exec tab (`queueCampaignMemberEngageAction`).

### 3.4 Campaign UI filters

| Filter | Meaning |
|--------|---------|
| `engage_queued` | `status = engage` **or** pending engage exec row for member |
| `review_draft` / `extension_ready` | Unchanged DM workflow filters |

Engage notice links to **`/cleaning`** exec queues.

---

## 4. Post capture intelligence

### 4.1 Recency

- Posts older than **365 days** omitted from prompts and engage targeting (`profilePostRecency.ts`).
- Extension auto-comment skips stale activity cards.

### 4.2 Post origin

`profilePosts[]` entries may include:

| Field | Values |
|-------|--------|
| `postKind` | `original` \| `reshare` \| `news_share` |
| `userComment` | User's comment on a reshare |
| `sharedTitle` | Headline for news/reshare cards |

LLM rules (`POST_ORIGIN_LLM_RULE`, `POST_RECENCY_LLM_RULE`): reshares/news are **interest/community signals**, not personal claims; prefer **original** posts within the recency window for comment hooks.

### 4.3 Analysis outputs

`contact_analyze` / playbook may include:

- `posts_signals.interest_signals` — themes from reshares
- `posts_signals.post_notes` — per-post kind + summary
- `cleaning_plan.bucket` including `engage_comment`

---

## 5. Automated capture resilience (extension)

Extension **0.2.57+** pipeline (`background.js`):

- **Step-based** capture chain via `chrome.alarms` (`runPipelineTick`) — survives service worker sleep and tab backgrounding.
- **Tab pinning** (`autoDiscardable: false`) for automation tab.
- Popup returns immediately; polls `CLIN_PIPELINE_STATUS` for progress.
- Hourly pace may **pause** (~3 min) instead of hard-stopping mid-queue.

Ingest still sends `captureChainComplete`; server runs `postCaptureAnalysis` / campaign workflow when chain completes.

---

## 6. Campaign member workflow (status reference)

| Status | DM pipeline | Engage exec | Extension outreach |
|--------|-------------|-------------|-------------------|
| `draft` | Open | Optional | No |
| `ready` | Approved for send | Optional pending | Yes |
| `engage` | Open (parallel) | Typically pending | No (until `ready`) |
| `sent` | Done | N/A | Acked |
| `skipped` | Closed | N/A | No |
| `closed` | Campaign ended | N/A | No |

**Skip** / **Remove from campaign** in UI update Clin DB only — LinkedIn manual disconnect is **not** synced automatically.

---

## 7. Test checklist (release)

- [ ] Cleaning: accept `engage_comment` → appears in exec queue + extension engage todo.
- [ ] Cleaning: accept `review_remove` → removal exec queue.
- [ ] Campaign: ICP `engage_comment` + posts capture → orchestrate → engage queued, no surprise DM-only block.
- [ ] Campaign: after Queue engage, draft DM + **Ready for extension** still works.
- [ ] Extension: mark engage commented → member `engage` → `draft`; member `ready` stays `ready`.
- [ ] Posts capture: `postKind` populated on activity cards; stale posts excluded from prompts.
- [ ] Automated capture: switch tabs during pipeline; run completes or resumes via alarms.
