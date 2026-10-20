create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  age int not null check (age between 18 and 100),
  sex text not null check (sex in ('male', 'female', 'unspecified')),
  height_cm numeric not null check (height_cm between 120 and 230),
  weight_kg numeric not null check (weight_kg between 35 and 300),
  activity_level text not null check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text not null check (goal in ('lose', 'maintain', 'gain')),
  daily_kcal_target int not null,
  protein_target_g int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none',
  trial_end timestamptz,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('photo', 'text')),
  turns jsonb not null default '[]'::jsonb,
  questions_asked int not null default 0,
  status text not null default 'open' check (status in ('open', 'final', 'skipped', 'failed')),
  latest_estimate jsonb,
  model text,
  total_latency_ms int not null default 0,
  retries int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.scan_sessions (id) on delete set null,
  name text not null,
  eaten_at timestamptz not null default now(),
  kcal_low int not null check (kcal_low >= 0),
  kcal_high int not null check (kcal_high >= kcal_low),
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  items jsonb not null default '[]'::jsonb,
  confidence text,
  created_at timestamptz not null default now()
);

create table public.stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create index meals_user_eaten_idx on public.meals (user_id, eaten_at desc);
create index scan_sessions_user_idx on public.scan_sessions (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.scan_sessions enable row level security;
alter table public.meals enable row level security;
alter table public.stripe_events enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "own profile insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own profile update" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own subscription read" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

create policy "own sessions read" on public.scan_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own sessions insert" on public.scan_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own sessions update" on public.scan_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own meals read" on public.meals for select to authenticated using ((select auth.uid()) = user_id);
create policy "own meals insert" on public.meals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own meals delete" on public.meals for delete to authenticated using ((select auth.uid()) = user_id);
