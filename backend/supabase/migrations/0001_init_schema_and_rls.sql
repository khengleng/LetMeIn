-- LetMeIn Phase 1: core schema + strict tenant RLS

create extension if not exists pgcrypto;

-- Tenants
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  status text not null default 'trial' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  trial_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-tenant settings
create table if not exists public.settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  timezone text not null default 'Asia/Phnom_Penh',
  bot_display_name text,
  khqr_account_name text,
  khqr_payload text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Referrals tracked by bot/edge function (no raw PII on-chain, only hashes)
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  referrer_code text not null check (length(referrer_code) between 3 and 64),
  referee_phone_hash text not null check (referee_phone_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null,
  referral_hash text not null unique check (referral_hash ~ '^[a-f0-9]{64}$'),
  source text not null default 'telegram',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists referrals_tenant_id_idx on public.referrals(tenant_id);
create index if not exists referrals_tenant_occurred_idx on public.referrals(tenant_id, occurred_at desc);

-- Weekly payout/accounting records per tenant
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  referral_count integer not null default 0 check (referral_count >= 0),
  amount_usd numeric(12,2) not null default 0 check (amount_usd >= 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_week_check check (week_end >= week_start),
  constraint payouts_tenant_week_unique unique (tenant_id, week_start, week_end)
);

create index if not exists payouts_tenant_id_idx on public.payouts(tenant_id);

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

create or replace trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

create or replace trigger payouts_set_updated_at
before update on public.payouts
for each row execute function public.set_updated_at();

-- JWT tenant claim helper.
-- Expected JWT claim: tenant_id (uuid string)
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;

-- Trial guard (reuse in queries/functions as needed)
create or replace function public.is_tenant_in_trial_or_active()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenants t
    where t.id = public.current_tenant_id()
      and (
        t.status = 'active'
        or (t.status = 'trial' and now() <= t.trial_ends_at)
      )
  );
$$;

-- Enable + force RLS for strict isolation
alter table public.tenants enable row level security;
alter table public.settings enable row level security;
alter table public.referrals enable row level security;
alter table public.payouts enable row level security;

alter table public.tenants force row level security;
alter table public.settings force row level security;
alter table public.referrals force row level security;
alter table public.payouts force row level security;

-- TENANTS policies
create policy "tenant_can_select_own_tenant"
  on public.tenants
  for select
  using (id = public.current_tenant_id());

create policy "tenant_can_update_own_tenant"
  on public.tenants
  for update
  using (id = public.current_tenant_id())
  with check (id = public.current_tenant_id());

-- SETTINGS policies
create policy "tenant_can_select_own_settings"
  on public.settings
  for select
  using (tenant_id = public.current_tenant_id());

create policy "tenant_can_insert_own_settings"
  on public.settings
  for insert
  with check (tenant_id = public.current_tenant_id());

create policy "tenant_can_update_own_settings"
  on public.settings
  for update
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- REFERRALS policies
create policy "tenant_can_select_own_referrals"
  on public.referrals
  for select
  using (tenant_id = public.current_tenant_id());

create policy "tenant_can_insert_own_referrals"
  on public.referrals
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_tenant_in_trial_or_active()
  );

-- PAYOUTS policies
create policy "tenant_can_select_own_payouts"
  on public.payouts
  for select
  using (tenant_id = public.current_tenant_id());

-- Only platform-side jobs should mutate payouts.
-- No tenant INSERT/UPDATE/DELETE policy on payouts by design.
