-- WEDNESDAY Exotel calling foundation
-- Private per-user lead records and immutable call-attempt audit trail.
create extension if not exists pgcrypto;

create table if not exists public.sales_agent_leads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  phone text not null,
  service text not null default '',
  reason text not null default '',
  consent_verified boolean not null default false,
  consent_purpose text,
  consent_source text,
  consent_date date,
  consent_evidence_ref text,
  consent_register_reference text,
  preference_scrubbed boolean not null default false,
  preference_scrubbed_at timestamptz,
  dlt_scrub_reference text,
  opted_out boolean not null default false,
  status text not null default 'Research',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_agent_leads_phone_length check (length(phone) between 8 and 20),
  constraint sales_agent_leads_business_length check (length(business_name) between 1 and 160)
);

create index if not exists sales_agent_leads_user_idx on public.sales_agent_leads(user_id);
create index if not exists sales_agent_leads_phone_idx on public.sales_agent_leads(user_id, phone);

alter table public.sales_agent_leads enable row level security;
drop policy if exists "Users manage their own sales leads" on public.sales_agent_leads;
create policy "Users manage their own sales leads"
  on public.sales_agent_leads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.sales_agent_call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.sales_agent_leads(id) on delete restrict,
  provider text not null default 'Exotel',
  provider_call_sid text unique,
  status text not null default 'requesting',
  recipient_phone text not null,
  caller_id text not null,
  script text not null,
  approval_at timestamptz not null default now(),
  provider_status text,
  duration_seconds integer,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_agent_call_logs_user_idx on public.sales_agent_call_logs(user_id, created_at desc);
alter table public.sales_agent_call_logs enable row level security;
drop policy if exists "Users can read their own call logs" on public.sales_agent_call_logs;
create policy "Users can read their own call logs"
  on public.sales_agent_call_logs for select
  using (auth.uid() = user_id);
-- No browser insert/update/delete policies: only the Edge Functions service role writes call logs.

create or replace function public.set_sales_agent_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_agent_leads_updated_at on public.sales_agent_leads;
create trigger sales_agent_leads_updated_at before update on public.sales_agent_leads
for each row execute function public.set_sales_agent_updated_at();

drop trigger if exists sales_agent_call_logs_updated_at on public.sales_agent_call_logs;
create trigger sales_agent_call_logs_updated_at before update on public.sales_agent_call_logs
for each row execute function public.set_sales_agent_updated_at();

grant select, insert, update, delete on public.sales_agent_leads to authenticated;
grant select on public.sales_agent_call_logs to authenticated;
grant all on public.sales_agent_leads to service_role;
grant all on public.sales_agent_call_logs to service_role;
