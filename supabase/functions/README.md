# Deploy the Clin telemetry Edge Function

## Prerequisites

1. Install Supabase CLI: https://supabase.com/docs/guides/cli/getting-started
2. Login: `supabase login`
3. Link to your project: `supabase link --project-ref YOUR_PROJECT_ID`

## Deploy

```bash
cd supabase/functions
supabase functions deploy clin-telemetry-ingest
```

## Set secrets

```bash
supabase secrets set CLIN_TELEMETRY_INGEST_SECRET=your-long-random-string
```

Generate a strong secret:
```bash
openssl rand -hex 32
```

## Test locally

```bash
supabase functions serve clin-telemetry-ingest
```

Then in another terminal:
```bash
curl -X POST http://localhost:54321/functions/v1/clin-telemetry-ingest \
  -H "X-Clin-Telemetry-Secret: your-test-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "instance_id": "test-instance",
    "at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "source": "app",
    "kind": "feature",
    "action": "capture_ingest",
    "ok": true,
    "duration_ms": 123,
    "provider": null,
    "model": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_eur": null,
    "error": null,
    "meta": {"pageType": "profile"}
  }'
```

## Rotate secret

If the ingest secret is compromised:

1. Generate new secret: `openssl rand -hex 32`
2. Update in Supabase: `supabase secrets set CLIN_TELEMETRY_INGEST_SECRET=new-secret`
3. Update `web/src/lib/telemetry/cloudConfig.ts` constant
4. Release new Clin version

Old versions will stop sending telemetry but the app will continue working (telemetry is best-effort).
