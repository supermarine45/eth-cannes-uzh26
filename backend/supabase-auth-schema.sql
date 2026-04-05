-- Supabase auth support tables for email/google + MetaMask challenge auth.

create extension if not exists pgcrypto;

create table if not exists public.wallet_users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.auth_wallet_challenges (
  id bigint generated always as identity primary key,
  wallet_address text not null,
  nonce text not null unique,
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_wallet_challenges_lookup
  on public.auth_wallet_challenges (wallet_address, nonce);

create index if not exists idx_auth_wallet_challenges_expiry
  on public.auth_wallet_challenges (expires_at)
  where used_at is null;

create table if not exists public.auth_user_profiles (
  id uuid primary key default gen_random_uuid(),
  principal_id text not null unique,
  auth_provider text not null,
  full_name text,
  date_of_birth date,
  account_type text,
  company_name text,
  business_address text,
  email text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auth_user_profiles
  add column if not exists date_of_birth date;

alter table public.auth_user_profiles
  add column if not exists account_type text;

alter table public.auth_user_profiles
  add column if not exists company_name text;

alter table public.auth_user_profiles
  add column if not exists business_address text;

create table if not exists public.auth_user_wallet_addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.auth_user_profiles(id) on delete cascade,
  wallet_address text not null unique,
  label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, wallet_address)
);

create index if not exists idx_auth_user_wallet_addresses_profile_id
  on public.auth_user_wallet_addresses (profile_id);

alter table public.wallet_users enable row level security;
alter table public.auth_wallet_challenges enable row level security;
alter table public.auth_user_profiles enable row level security;
alter table public.auth_user_wallet_addresses enable row level security;

-- Service role only by default for backend-managed auth operations.
drop policy if exists "wallet_users service role only" on public.wallet_users;
create policy "wallet_users service role only"
  on public.wallet_users
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "wallet_challenges service role only" on public.auth_wallet_challenges;
create policy "wallet_challenges service role only"
  on public.auth_wallet_challenges
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "auth_user_profiles service role only" on public.auth_user_profiles;
create policy "auth_user_profiles service role only"
  on public.auth_user_profiles
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "auth_user_wallet_addresses service role only" on public.auth_user_wallet_addresses;
create policy "auth_user_wallet_addresses service role only"
  on public.auth_user_wallet_addresses
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.merchant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null unique,
  merchant_wallet text not null,
  subscriber_wallet text not null,
  description text not null default '',
  amount_usd numeric(18,2) not null check (amount_usd > 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date,
  next_execution_at timestamptz,
  last_executed_at timestamptz,
  last_payment_id text,
  last_gateway_url text,
  execution_attempts integer not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'active', 'paused', 'completed', 'failed', 'cancelled')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_merchant_subscriptions_due
  on public.merchant_subscriptions (next_execution_at, status)
  where status in ('scheduled', 'active');

create index if not exists idx_merchant_subscriptions_merchant
  on public.merchant_subscriptions (merchant_wallet);

create index if not exists idx_merchant_subscriptions_subscriber
  on public.merchant_subscriptions (subscriber_wallet);

drop trigger if exists merchant_subscriptions_set_updated_at on public.merchant_subscriptions;
create trigger merchant_subscriptions_set_updated_at
  before update on public.merchant_subscriptions
  for each row execute function public.set_updated_at();

create table if not exists public.merchant_subscription_executions (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.merchant_subscriptions(id) on delete cascade,
  run_number integer not null,
  scheduled_for timestamptz not null,
  executed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'executed', 'failed', 'skipped')),
  payment_id text,
  gateway_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_id, run_number)
);

create index if not exists idx_merchant_subscription_executions_subscription
  on public.merchant_subscription_executions (subscription_id, run_number desc);

create index if not exists idx_merchant_subscription_executions_scheduled_for
  on public.merchant_subscription_executions (scheduled_for);

drop trigger if exists merchant_subscription_executions_set_updated_at on public.merchant_subscription_executions;
create trigger merchant_subscription_executions_set_updated_at
  before update on public.merchant_subscription_executions
  for each row execute function public.set_updated_at();

alter table public.merchant_subscriptions enable row level security;
alter table public.merchant_subscription_executions enable row level security;

drop policy if exists "merchant_subscriptions service role only" on public.merchant_subscriptions;
create policy "merchant_subscriptions service role only"
  on public.merchant_subscriptions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "merchant_subscription_executions service role only" on public.merchant_subscription_executions;
create policy "merchant_subscription_executions service role only"
  on public.merchant_subscription_executions
  for all
  to service_role
  using (true)
  with check (true);
