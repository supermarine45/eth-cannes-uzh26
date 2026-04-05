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
  ens_name text unique,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auth_user_profiles
  add column if not exists date_of_birth date;

alter table public.auth_user_profiles
  add column if not exists account_type text;

alter table public.auth_user_profiles
  add column if not exists ens_name text unique;

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