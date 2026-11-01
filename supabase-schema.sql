-- WEDNESDAY foundation schema. Run only after creating a Supabase project.
-- RLS ensures each signed-in user can access only their own records.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text not null default 'English',
  correction_style text not null default 'immediate',
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact text,
  service text,
  status text not null default 'new',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'personal',
  due_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  description text,
  approval_required boolean not null default true,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  automation_paused boolean not null default true,
  allow_read_analysis boolean not null default true,
  allow_draft_generation boolean not null default true,
  allow_send_without_approval boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_logs enable row level security;
alter table public.permissions enable row level security;

create policy "profiles own row" on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "clients own rows" on public.clients for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks own rows" on public.tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activity own rows" on public.activity_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "permissions own row" on public.permissions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- IMPORTANT:
-- Keep AI provider keys, WhatsApp access tokens, Gmail client secrets and
-- Supabase service-role keys in server-side environment variables only.
-- Do not add them to config.js or browser JavaScript.