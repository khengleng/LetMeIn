-- Phase 9: commissions + discounts revenue engine

alter table public.tenants
  add column if not exists commission_type text not null default 'percent' check (commission_type in ('percent','fixed')),
  add column if not exists commission_value numeric(10,2) not null default 10.00 check (commission_value >= 0),
  add column if not exists discount_type text not null default 'percent' check (discount_type in ('percent','fixed')),
  add column if not exists discount_value numeric(10,2) not null default 5.00 check (discount_value >= 0),
  add column if not exists commission_pool_balance numeric(12,2) not null default 0 check (commission_pool_balance >= 0);

alter table public.referrals
  add column if not exists referrer_telegram_id text,
  add column if not exists referee_telegram_id text,
  add column if not exists converted_at timestamptz;

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  referral_id uuid not null references public.referrals(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  khqr_reference text,
  khqr_number text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, referral_id)
);

create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  referral_id uuid not null references public.referrals(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8,12}$'),
  type text not null check (type in ('percent', 'fixed')),
  value numeric(10,2) not null check (value >= 0),
  used boolean not null default false,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.commission_pools (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  deposited_amount numeric(12,2) not null default 0 check (deposited_amount >= 0),
  withdrawn_amount numeric(12,2) not null default 0 check (withdrawn_amount >= 0),
  last_updated timestamptz not null default now()
);

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  referral_id uuid not null references public.referrals(id) on delete cascade,
  commission_id uuid references public.commissions(id) on delete set null,
  referrer_telegram_id text not null,
  khqr_number text not null,
  status text not null default 'submitted' check (status in ('submitted','notified','completed','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists commissions_tenant_status_idx on public.commissions(tenant_id, status, created_at desc);
create index if not exists discounts_tenant_used_idx on public.discounts(tenant_id, used, expires_at);
create index if not exists payout_requests_tenant_status_idx on public.payout_requests(tenant_id, status, created_at desc);

alter table public.commissions enable row level security;
alter table public.commissions force row level security;
alter table public.discounts enable row level security;
alter table public.discounts force row level security;
alter table public.commission_pools enable row level security;
alter table public.commission_pools force row level security;
alter table public.payout_requests enable row level security;
alter table public.payout_requests force row level security;

create policy "tenant_can_select_own_commissions"
  on public.commissions for select using (tenant_id = public.current_tenant_id());
create policy "tenant_can_select_own_discounts"
  on public.discounts for select using (tenant_id = public.current_tenant_id());
create policy "tenant_can_select_own_commission_pools"
  on public.commission_pools for select using (tenant_id = public.current_tenant_id());
create policy "tenant_can_select_own_payout_requests"
  on public.payout_requests for select using (tenant_id = public.current_tenant_id());

create or replace function public.touch_commission_pool(p_tenant_id uuid, p_delta numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.commission_pools (tenant_id, deposited_amount, withdrawn_amount, last_updated)
  values (p_tenant_id, greatest(p_delta,0), greatest(-p_delta,0), now())
  on conflict (tenant_id)
  do update set
    deposited_amount = public.commission_pools.deposited_amount + greatest(p_delta,0),
    withdrawn_amount = public.commission_pools.withdrawn_amount + greatest(-p_delta,0),
    last_updated = now();
end;
$$;

revoke all on function public.touch_commission_pool(uuid,numeric) from public;
grant execute on function public.touch_commission_pool(uuid,numeric) to service_role;
