# Deploying Centralized Telemetry

## Prerequisites

- Supabase account (free tier is fine)
- Supabase CLI installed: `npm install -g supabase`

## Setup steps

### 1. Create Supabase project

1. Go to https://supabase.com/dashboard
2. Click "New project"
3. Choose a name (e.g., "clin-telemetry")
4. Set a database password (save it)
5. Choose a region close to most users
6. Click "Create project" (takes ~2 minutes)

### 2. Create the database table

1. In your project dashboard, go to "SQL Editor"
2. Click "New query"
3. Paste the contents of `docs/telemetry/supabase-setup.sql`
4. Click "Run"

You should see: "Success. No rows returned"

### 3. Deploy the Edge Function

From your terminal:

```bash
# Login to Supabase (opens browser)
supabase login

# Link to your project
cd clin/supabase/functions
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy clin-telemetry-ingest
```

Your project ref is in the URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`

### 4. Set the ingest secret

```bash
# Generate a strong secret (32 bytes hex)
openssl rand -hex 32

# Set it in Supabase (copy the output from above)
supabase secrets set CLIN_TELEMETRY_INGEST_SECRET=paste-your-secret-here
```

### 5. Update Clin code

Edit `web/src/lib/telemetry/cloudConfig.ts`:

```typescript
const CENTRAL_INGEST_URL =
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/clin-telemetry-ingest";
const CENTRAL_INGEST_SECRET = "paste-your-secret-here";
```

Replace `YOUR_PROJECT_REF` with your actual project ref.

### 6. Test it

Build and run Clin:

```bash
cd web
npm run build
npm run dev
```

On first launch, you'll see the consent dialog. Click "Share anonymously."

Do some actions (capture a profile, run autopilot). Then check Supabase:

```sql
select count(*) from clin_telemetry_events;
```

You should see rows appearing within a few seconds.

### 7. Commit and release

```bash
git add web/src/lib/telemetry/cloudConfig.ts
git commit -m "feat: enable centralized telemetry"
git tag v0.2.0
git push origin main --tags
```

## Monitoring

### Dashboard queries

```sql
-- Events in last 24 hours
select count(*) from clin_telemetry_events
where at > now() - interval '24 hours';

-- Unique users (instances)
select count(distinct instance_id) from clin_telemetry_events;

-- Top features
select action, count(*) as n
from clin_telemetry_events
where source = 'app' and at > now() - interval '7 days'
group by action order by n desc limit 10;
```

### Set up alerts

In Supabase dashboard → Database → Webhooks, create a webhook that fires when:

```sql
-- Daily event count exceeds free tier buffer
select count(*) > 1500000 from clin_telemetry_events
where at > now() - interval '24 hours';
```

Send to Slack/email so you know if you're approaching the free tier limit (2M requests/month).

## Maintenance

### Rotate ingest secret

If the secret leaks (rare, but good practice every 6 months):

```bash
openssl rand -hex 32
supabase secrets set CLIN_TELEMETRY_INGEST_SECRET=new-secret
```

Update `cloudConfig.ts` and release a new version. Old Clin versions will gracefully stop sending (no errors, just silent).

### Handle abuse

If you see spam:

```sql
-- Find suspicious instances
select instance_id, count(*) as n
from clin_telemetry_events
where at > now() - interval '1 hour'
group by instance_id having count(*) > 1000
order by n desc;
```

Ban them in the Edge Function by adding to a blocklist:

```typescript
// In supabase/functions/clin-telemetry-ingest/index.ts
const BLOCKED_INSTANCES = new Set([
  "spam-instance-id-1",
  "spam-instance-id-2",
]);

// Add this check after validating the payload
if (BLOCKED_INSTANCES.has(row.instance_id as string)) {
  return new Response(JSON.stringify({ error: "Blocked" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
```

Redeploy: `supabase functions deploy clin-telemetry-ingest`

### Scale if needed

Free tier limits:

- 2M Edge Function requests/month
- 500MB Postgres storage
- 1GB database egress/month

If you exceed these, upgrade to Pro ($25/month) or:

1. Sample events (e.g., send 1 in 10)
2. Add a daily cap per instance
3. Prune old data:

```sql
-- Keep only last 90 days
delete from clin_telemetry_events
where at < now() - interval '90 days';
```

Set up a weekly cron job (Supabase → Database → Cron):

```sql
select cron.schedule(
  'prune-old-telemetry',
  '0 2 * * 0',
  $$delete from clin_telemetry_events where at < now() - interval '90 days'$$
);
```

## Privacy compliance

Add to your README or website:

> **Telemetry:** Clin collects anonymous usage data (feature counts, AI latency) to improve the app. No personal data or contact information is collected. You can opt out in Settings or by setting `CLIN_TELEMETRY_ENABLED=false`. See `docs/telemetry/README.md` for details.

For GDPR "right to be forgotten," users can request deletion:

```sql
delete from clin_telemetry_events
where instance_id = 'user-provided-instance-id';
```

Instance IDs are shown in Settings → Usage telemetry.

## Troubleshooting

### "Unauthorized" error

Check that `CLIN_TELEMETRY_INGEST_SECRET` in `cloudConfig.ts` matches the secret in Supabase:

```bash
supabase secrets list
```

### Events not appearing

1. Check user consented: Settings → Usage telemetry should show "Sharing anonymously"
2. Check logs: Set `CLIN_TELEMETRY_DEBUG=1` in `.env.local` and restart
3. Check Edge Function logs: Supabase dashboard → Edge Functions → clin-telemetry-ingest → Logs

### Rate limit hit

Legitimate user hitting 100 events/min? Raise `MAX_EVENTS_PER_MINUTE` in `index.ts` and redeploy.

## Next steps

- Add a public dashboard (e.g., Metabase + read-only Postgres user)
- Create views for common queries
- Set up weekly email reports with Supabase cron
- Build a Grafana dashboard for real-time monitoring
