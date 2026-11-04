-- WEDNESDAY Business Hub cloud-ready schema.
-- Run this migration in the Supabase SQL Editor after the base supabase-schema.sql.
-- The current Business Hub UI stores records in browser localStorage; this schema
-- prepares owner-scoped cloud tables for a later sync implementation.

create table if not exists public.business_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  contact_name text,
  service text not null,
  market text not null default 'India',
  estimated_value numeric(12,2) not null default 0,
  stage text not null default 'New',
  follow_up_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('income','expense')),
  payment_state text not null check (payment_state in ('paid','pending')),
  amount numeric(12,2) not null check (amount >= 0),
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.outreach_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  service text not null,
  channel text not null,
  message text not null,
  status text not null default 'Awaiting your approval',
  approved_at timestamptz,
  contacted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.business_opportunities enable row level security;
alter table public.business_transactions enable row level security;
alter table public.outreach_approvals enable row level security;

drop policy if exists "business opportunities own rows" on public.business_opportunities;
create policy "business opportunities own rows" on public.business_opportunities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "business transactions own rows" on public.business_transactions;
create policy "business transactions own rows" on public.business_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "outreach approvals own rows" on public.outreach_approvals;
create policy "outreach approvals own rows" on public.outreach_approvals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists business_opportunities_user_stage_idx
  on public.business_opportunities(user_id, stage);
create index if not exists business_transactions_user_date_idx
  on public.business_transactions(user_id, transaction_date desc);
create index if not exists outreach_approvals_user_created_idx
  on public.outreach_approvals(user_id, created_at desc);
