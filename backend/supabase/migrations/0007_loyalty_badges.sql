-- Phase 11: loyalty stamps + charity badge system

create table if not exists public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_telegram_id text not null,
  max_stamps int not null default 10 check (max_stamps between 1 and 20),
  current_stamps int not null default 0 check (current_stamps >= 0),
  reward_description text not null default 'Reward available on completion',
  auto_reset_on_claim boolean not null default true,
  is_active boolean not null default true,
  claimed_count int not null default 0 check (claimed_count >= 0),
  last_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_telegram_id)
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.loyalty_cards(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_telegram_id text not null,
  staff_telegram_id text,
  action text not null check (action in ('issue','claim','adjust')),
  stamps_added int not null default 1 check (stamps_added between 1 and 3),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.badge_tiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tier_name text not null,
  rank int not null check (rank between 1 and 10),
  min_verified_value numeric(12,2) not null check (min_verified_value > 0),
  badge_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, rank)
);

create table if not exists public.donor_badges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  donor_telegram_id text not null,
  current_tier_id uuid references public.badge_tiers(id) on delete set null,
  total_verified_value numeric(12,2) not null default 0 check (total_verified_value >= 0),
  badge_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, donor_telegram_id)
);

create table if not exists public.badge_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  donor_badge_id uuid references public.donor_badges(id) on delete cascade,
  donor_telegram_id text not null,
  old_tier_id uuid,
  new_tier_id uuid,
  old_total_verified_value numeric(12,2),
  new_total_verified_value numeric(12,2),
  actor_telegram_id text,
  action text not null check (action in ('verify_donation','tier_upgrade','manual_adjust')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_telegram_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, staff_telegram_id)
);

create table if not exists public.donation_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  donor_telegram_id text not null,
  staff_telegram_id text not null,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_tx_tenant_user_created_idx on public.loyalty_transactions(tenant_id, user_telegram_id, created_at desc);
create index if not exists donation_verifications_staff_created_idx on public.donation_verifications(tenant_id, staff_telegram_id, created_at desc);
create index if not exists donor_badges_tenant_donor_idx on public.donor_badges(tenant_id, donor_telegram_id);

create or replace trigger loyalty_cards_set_updated_at
before update on public.loyalty_cards
for each row execute function public.set_updated_at();

create or replace trigger donor_badges_set_updated_at
before update on public.donor_badges
for each row execute function public.set_updated_at();

create or replace function public.current_telegram_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'telegram_id', '');
$$;

alter table public.loyalty_cards enable row level security;
alter table public.loyalty_cards force row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.loyalty_transactions force row level security;
alter table public.badge_tiers enable row level security;
alter table public.badge_tiers force row level security;
alter table public.donor_badges enable row level security;
alter table public.donor_badges force row level security;
alter table public.badge_audit_logs enable row level security;
alter table public.badge_audit_logs force row level security;
alter table public.staff_auth_sessions enable row level security;
alter table public.staff_auth_sessions force row level security;
alter table public.donation_verifications enable row level security;
alter table public.donation_verifications force row level security;

create policy "tenant_can_select_own_loyalty_cards"
  on public.loyalty_cards for select using (tenant_id = public.current_tenant_id());
create policy "user_can_select_own_loyalty_card"
  on public.loyalty_cards for select using (user_telegram_id = public.current_telegram_id());

create policy "tenant_can_select_own_loyalty_transactions"
  on public.loyalty_transactions for select using (tenant_id = public.current_tenant_id());
create policy "user_can_select_own_loyalty_transactions"
  on public.loyalty_transactions for select using (user_telegram_id = public.current_telegram_id());

create policy "tenant_can_select_own_badge_tiers"
  on public.badge_tiers for select using (tenant_id = public.current_tenant_id());

create policy "tenant_can_select_own_donor_badges"
  on public.donor_badges for select using (tenant_id = public.current_tenant_id());
create policy "donor_can_select_own_badge"
  on public.donor_badges for select using (donor_telegram_id = public.current_telegram_id());

create policy "tenant_can_select_own_badge_audits"
  on public.badge_audit_logs for select using (tenant_id = public.current_tenant_id());
create policy "tenant_can_select_own_staff_sessions"
  on public.staff_auth_sessions for select using (tenant_id = public.current_tenant_id());
create policy "tenant_can_select_own_donation_verifications"
  on public.donation_verifications for select using (tenant_id = public.current_tenant_id());
