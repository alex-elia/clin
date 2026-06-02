-- Clin opt-in telemetry (run in Supabase SQL editor)
-- Stores aggregate feature + LLM signals. No draft text, contact names, or message content.

create table if not exists public.clin_telemetry_events (
  id uuid primary key,
  instance_id text not null,
  at timestamptz not null,
  source text not null check (source in ('app', 'llm')),
  kind text,
  action text,
  feature text,
  ok boolean not null default true,
  duration_ms integer,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_eur numeric(12, 6),
  error text,
  meta jsonb,
  inserted_at timestamptz not null default now()
);

create index if not exists clin_telemetry_events_at_idx
  on public.clin_telemetry_events (at desc);

create index if not exists clin_telemetry_events_instance_idx
  on public.clin_telemetry_events (instance_id, at desc);

create index if not exists clin_telemetry_events_feature_idx
  on public.clin_telemetry_events (feature, at desc)
  where feature is not null;

alter table public.clin_telemetry_events enable row level security;

-- No anon/authenticated policies: inserts use service_role from your local Clin .env only.

-- Example queries (Supabase SQL editor):
--
-- Feature usage last 7 days:
--   select action, count(*) as n, avg(duration_ms)::int as avg_ms
--   from clin_telemetry_events
--   where source = 'app' and at > now() - interval '7 days'
--   group by action order by n desc;
--
-- LLM latency by feature + model:
--   select feature, model, count(*) as n,
--          percentile_cont(0.95) within group (order by duration_ms) as p95_ms
--   from clin_telemetry_events
--   where source = 'llm' and at > now() - interval '30 days'
--   group by feature, model order by n desc;
