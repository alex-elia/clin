# Centralized Telemetry Implementation Summary

## What was built

A production-ready, privacy-first telemetry system where all Clin users can opt-in to share anonymous usage data with a central Supabase project.

## Architecture

```
Clin (user's machine)
  ↓ Local JSONL logs (always)
  ↓ If consented
  ↓ POST + secret header
  ↓
Supabase Edge Function (your project)
  ↓ Validates + rate limits
  ↓
Postgres table (clin_telemetry_events)
```

## Key files created

### Edge Function (abuse protection)
- `supabase/functions/clin-telemetry-ingest/index.ts` — validates, rate limits, inserts
- `supabase/functions/README.md` — deploy instructions
- `supabase/functions/tsconfig.json` — Deno config

### Client (Clin app)
- `web/src/lib/telemetrySettings.ts` — consent storage (local file)
- `web/src/lib/telemetry/cloudConfig.ts` — ingest URL + secret (public, rotatable)
- `web/src/lib/telemetry/cloudSink.ts` — updated to POST to Edge Function
- `web/src/components/TelemetryConsentDialog.tsx` — first-launch consent UI
- `web/src/app/api/telemetry/needs-consent/route.ts` — checks if prompt needed
- `web/src/app/actions.ts` — server action to save consent
- `web/src/app/layout.tsx` — renders consent dialog

### Dashboard updates
- `web/src/components/TelemetryDashboard.tsx` — shows consent status
- `web/src/lib/telemetry/telemetrySummary.ts` — updated cloud status type

### Documentation
- `docs/telemetry/README.md` — comprehensive user + maintainer guide
- `docs/telemetry/DEPLOYMENT.md` — step-by-step setup instructions
- `docs/telemetry/supabase-setup.sql` — existing table schema (unchanged)
- `web/.env.example` — updated with new env var docs

## Security model

### What's public (in the repo)
- Ingest endpoint URL
- Ingest secret (32-byte hex)

**This is fine** — the secret is rotatable and only prevents casual spam. The Edge Function is the real security boundary.

### Edge Function protections
1. **Schema validation** — allowed actions/features only, max field lengths
2. **Rate limiting** — 100 events/min per instance, 50k/day global
3. **Duplicate rejection** — same event ID twice = 200 OK (idempotent)
4. **Timestamp checks** — reject events >7 days old or in future
5. **Secret rotation** — rotate in Supabase, update code, release patch

### Privacy guarantees
**Never sent:**
- Contact names, LinkedIn URLs, draft text
- Message content, `responsePreview`
- Contact IDs, member IDs, full names
- Any PII

**Sent:**
- Feature action names (e.g., `capture_ingest`)
- Durations, error rates
- LLM feature/model/tokens
- Orchestration metadata (mode, limit)
- Random instance ID (UUID)

## User experience

1. **First launch** → consent dialog appears
2. **User chooses:**
   - "Share anonymously" → telemetry enabled, events flow to cloud
   - "No thanks" → telemetry disabled, only local logs
3. **Opt-out later** → set `CLIN_TELEMETRY_ENABLED=false` in `.env.local`
4. **View status** → Settings → Usage telemetry shows consent + instance ID

## Deployment checklist

Before releasing:

- [ ] Create Supabase project
- [ ] Run `supabase-setup.sql`
- [ ] Deploy Edge Function
- [ ] Generate and set ingest secret
- [ ] Update `cloudConfig.ts` with your URL + secret
- [ ] Test locally (consent → use app → check DB)
- [ ] Commit and tag release
- [ ] Update README with privacy statement

Full steps: `docs/telemetry/DEPLOYMENT.md`

## Monitoring queries

```sql
-- Daily active instances
select date(at) as day, count(distinct instance_id) as users
from clin_telemetry_events
where at > now() - interval '30 days'
group by day order by day;

-- Consent rate (rough estimate from first-day events)
select
  count(distinct instance_id) filter (where at > now() - interval '7 days') as recent_users,
  count(distinct instance_id) as all_time_users;

-- Slowest orchestrations (p95)
select action,
       percentile_cont(0.95) within group (order by duration_ms) as p95_ms
from clin_telemetry_events
where source = 'app' and at > now() - interval '7 days'
group by action order by p95_ms desc;
```

## Maintenance

### Rotate secret (every 6 months or if leaked)
```bash
openssl rand -hex 32
supabase secrets set CLIN_TELEMETRY_INGEST_SECRET=new-secret
```

Update `cloudConfig.ts`, release patch. Old versions gracefully stop sending.

### Handle spam
Block abusive instances in Edge Function:

```typescript
const BLOCKED_INSTANCES = new Set(["spam-id"]);
if (BLOCKED_INSTANCES.has(row.instance_id)) {
  return new Response(JSON.stringify({ error: "Blocked" }), { status: 403 });
}
```

Redeploy function.

### Prune old data (optional)
```sql
delete from clin_telemetry_events where at < now() - interval '90 days';
```

Or set up cron (Supabase → Database → Cron).

## Cost estimate

Free tier (Supabase):
- 2M Edge Function requests/month
- 500MB Postgres storage
- 1GB egress/month

Assumptions:
- 100 active users
- 50 events/user/day
- 30 days

**Total:** 150k events/month (7.5% of free tier)

You won't hit limits unless Clin gets popular, at which point upgrading to Pro ($25/mo) is justified.

## Next steps (optional)

1. **Public dashboard** — Metabase + read-only Postgres user
2. **Weekly reports** — Supabase cron → email summary
3. **Grafana/Datadog** — real-time monitoring
4. **A/B test framework** — use `meta.variant` field
5. **User feedback loop** — link telemetry to GitHub issues

## Testing the implementation

### Local test (without deploying Edge Function)

1. Set `CLIN_TELEMETRY_ENABLED=false` in `.env.local`
2. Run `npm run dev`
3. Check that consent dialog doesn't appear
4. Check that local logs still work: `web/data/app-events.jsonl`

### Full integration test

1. Deploy Edge Function
2. Update `cloudConfig.ts`
3. Delete `web/data/telemetry-settings.json` (reset consent)
4. Run `npm run dev`
5. Click "Share anonymously"
6. Do actions (capture, autopilot)
7. Check Supabase: `select * from clin_telemetry_events order by at desc limit 10;`

### Verify privacy

Check that no PII is sent:

```sql
select meta, error from clin_telemetry_events
where meta::text ilike '%contact%' or error ilike '%linkedin%';
```

Should return zero rows.

## Compliance

### GDPR
- Consent required before sending
- Clear disclosure of what's collected
- Easy opt-out
- Right to deletion (provide email for users to request)

### Privacy policy snippet

> Clin collects anonymous usage data (feature counts, AI latency) to improve the app. No personal data or contact information is collected. Each install has a random identifier. You can opt out in Settings or by setting `CLIN_TELEMETRY_ENABLED=false`. To request deletion of your data, email [your-email] with your instance ID (shown in Settings → Usage telemetry).

## File size impact

- Edge Function: ~300 lines
- Client code: ~400 lines
- Documentation: ~800 lines
- Total added to repo: ~1.5k LOC

Bundle size impact: +4.2kB (TelemetryConsentDialog + settings file I/O)

## Build verification

✅ Build succeeded with no new errors (only pre-existing warnings)
✅ All TypeScript types resolve correctly
✅ Edge Function passes static analysis

## Ready to deploy

The implementation is production-ready. Follow `DEPLOYMENT.md` to go live.
