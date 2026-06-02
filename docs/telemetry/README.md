# Clin telemetry

Anonymous usage signals to help improve features, AI orchestrations, and model choices.

## How it works

1. **First launch:** Clin shows a consent dialog. Choose "Share anonymously" or "No thanks."
2. **Local logging:** All events are written to `web/data/*.jsonl` first (always).
3. **Cloud push:** If you consented, sanitized events are sent to a central Supabase project.
4. **Privacy:** No contact names, drafts, message content, or PII. Just counts and timings.

## What is collected

| Data | Example | Why |
|------|---------|-----|
| Feature usage | `capture_ingest: 42 events` | Understand which flows are used vs ignored |
| Orchestration latency | `campaign_autopilot: avg 8s` | Tune batch sizes and find bottlenecks |
| LLM performance | `contact_analyze: p95 12s, Ollama vs cloud` | Compare model speed/errors for recommendations |
| Error rates | `editorial_tick: 3 failed / 50` | Detect bugs users don't report |

**Never collected:** contact IDs, LinkedIn URLs, draft text, message threads, `responsePreview`, full names.

**Instance ID:** Each install gets a random UUID. No IP, no telemetry SDK tracking, no cross-device identity.

## Opt out

**Before first launch:**
```env
# web/.env.local
CLIN_TELEMETRY_ENABLED=false
```

**After consenting:**  
Delete `web/data/telemetry-settings.json` and restart, or set `CLIN_TELEMETRY_ENABLED=false` in `.env.local`.

## For maintainers

### Deploy the Edge Function

1. Create a Supabase project (free tier is fine).
2. Run `docs/telemetry/supabase-setup.sql` in the SQL editor.
3. Deploy the Edge Function:

```bash
cd supabase/functions
supabase functions deploy clin-telemetry-ingest
```

4. Set the ingest secret:

```bash
openssl rand -hex 32  # generate
supabase secrets set CLIN_TELEMETRY_INGEST_SECRET=your-secret-here
```

5. Update `web/src/lib/telemetry/cloudConfig.ts`:

```typescript
const CENTRAL_INGEST_URL =
  "https://YOUR_PROJECT.supabase.co/functions/v1/clin-telemetry-ingest";
const CENTRAL_INGEST_SECRET = "your-secret-here";
```

6. Commit and release. Users who consent will now send to your endpoint.

### Rotate the ingest secret

If the secret leaks:

```bash
openssl rand -hex 32
supabase secrets set CLIN_TELEMETRY_INGEST_SECRET=new-secret
```

Update `cloudConfig.ts` and release a patch. Old versions stop sending (graceful degradation).

### Query patterns

```sql
-- Top features (7 days)
select action, count(*) as n
from clin_telemetry_events
where source = 'app' and at > now() - interval '7 days'
group by action order by n desc limit 10;

-- Slowest LLM flows
select feature, model,
       percentile_cont(0.95) within group (order by duration_ms) as p95_ms
from clin_telemetry_events
where source = 'llm' and at > now() - interval '30 days'
group by feature, model order by p95_ms desc;

-- Error rates by orchestration
select action,
       count(*) filter (where ok = false) as failures,
       count(*) as total,
       round(100.0 * count(*) filter (where ok = false) / count(*), 1) as pct
from clin_telemetry_events
where source = 'app' and at > now() - interval '7 days'
group by action having count(*) filter (where ok = false) > 0
order by pct desc;
```

### Abuse protection (Edge Function)

| Defense | How |
|---------|-----|
| Schema validation | Enums for action/feature, max lengths, sane durations |
| Rate limiting | 100 events/min per instance, 50k/day global |
| Duplicate rejection | Same `id` twice returns 200 (idempotent) |
| Timestamp check | Reject events >7 days old or in the future |
| Secret rotation | No Clin release needed; just update Supabase secrets |

The Edge Function is your **only** security boundary. Ingest secret being in the repo is fine—it prevents casual spam but serious attackers can reverse-engineer it anyway. Rate limits + validation are the real defense.

## Privacy statement (for users)

**Add to Settings → Telemetry:**

> Clin collects anonymous usage data to improve features and AI orchestrations.
>
> **Collected:** feature counts (captures, autopilot), LLM latency/errors, orchestration durations. Each install has a random ID.
>
> **Never collected:** contact names, LinkedIn URLs, drafts, message content, or anything personally identifiable.
>
> **Opt out:** Decline the consent prompt, or set `CLIN_TELEMETRY_ENABLED=false` in `.env.local` and restart.
>
> **Delete your data:** Email [your-email] with your instance ID (shown below).

## Alternatives to Supabase

If you prefer not to self-host the Edge Function:

| Service | Pros | Cons |
|---------|------|------|
| **PostHog** | Managed, funnels, session replay | Heavier SDK, overkill for AI metrics |
| **Mixpanel** | Good for product analytics | Not optimized for latency/orchestration data |
| **Axiom** | Log-style ingest, fast search | Less SQL-friendly than Supabase |
| **Plausible** (self-hosted) | Privacy-first page analytics | No custom events for LLM calls |

For Clin's use case (AI orchestration + feature usage), Supabase Edge Function + Postgres is the best fit:

- SQL is perfect for percentile queries
- Free tier covers millions of events
- You own the schema and can add views/dashboards
- No vendor lock-in (it's just Postgres)
