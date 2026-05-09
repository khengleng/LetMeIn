-- Phase 12: charity badge -> merchant discount verification

create table if not exists public.platform_flags (
  id int primary key default 1,
  badge_verification_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint platform_flags_singleton check (id = 1)
);

insert into public.platform_flags (id, badge_verification_paused)
values (1, false)
on conflict (id) do nothing;

create or replace function public.jsonb_discounts_valid(v jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when jsonb_typeof(v) <> 'object' then false
    else not exists (
      select 1
      from jsonb_each_text(v) e
      where (e.value !~ '^\\d+(\\.\\d+)?$')
         or ((e.value)::numeric < 5)
         or ((e.value)::numeric > 50)
    )
  end;
$$;

create table if not exists public.merchant_badge_policies (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.tenants(id) on delete cascade,
  is_active boolean not null default true,
  tier_discounts jsonb not null default '{}'::jsonb,
  daily_limit_per_donor int not null default 1 check (daily_limit_per_donor between 1 and 3),
  monthly_budget_usd numeric(12,2) not null default 0 check (monthly_budget_usd >= 0),
  charity_whitelist uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id),
  constraint merchant_badge_policies_discount_range check (public.jsonb_discounts_valid(tier_discounts))
);

create table if not exists public.badge_tokens (
  id uuid primary key default gen_random_uuid(),
  donor_badge_id uuid not null references public.donor_badges(id) on delete cascade,
  donor_telegram_id text not null,
  charity_tenant_id uuid not null references public.tenants(id) on delete cascade,
  tier_id uuid references public.badge_tiers(id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','used','expired','revoked')),
  expires_at timestamptz not null,
  used_by_merchant_id uuid references public.tenants(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.badge_redemptions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.tenants(id) on delete cascade,
  donor_badge_id uuid not null references public.donor_badges(id) on delete cascade,
  donor_telegram_id text not null,
  charity_tenant_id uuid not null references public.tenants(id) on delete cascade,
  tier_id uuid references public.badge_tiers(id) on delete set null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  discount_percent numeric(5,2) not null check (discount_percent between 5 and 50),
  discount_amount_usd numeric(12,2) not null default 0 check (discount_amount_usd >= 0),
  status text not null default 'applied' check (status in ('applied','rejected')),
  reason text,
  verified_by_staff_telegram_id text,
  created_at timestamptz not null default now(),
  unique (token_hash, merchant_id)
);

create table if not exists public.badge_policy_audit_logs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.tenants(id) on delete cascade,
  actor_email text not null,
  action text not null check (action in ('create','update','pause','resume')),
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists badge_tokens_expires_status_idx
  on public.badge_tokens (status, expires_at);
create index if not exists badge_redemptions_merchant_created_idx
  on public.badge_redemptions (merchant_id, created_at desc);
create index if not exists badge_redemptions_donor_created_idx
  on public.badge_redemptions (donor_telegram_id, created_at desc);

create or replace trigger merchant_badge_policies_set_updated_at
before update on public.merchant_badge_policies
for each row execute function public.set_updated_at();

alter table public.merchant_badge_policies enable row level security;
alter table public.merchant_badge_policies force row level security;
alter table public.badge_tokens enable row level security;
alter table public.badge_tokens force row level security;
alter table public.badge_redemptions enable row level security;
alter table public.badge_redemptions force row level security;
alter table public.badge_policy_audit_logs enable row level security;
alter table public.badge_policy_audit_logs force row level security;

create policy "merchant_can_select_own_badge_policy"
  on public.merchant_badge_policies for select
  using (merchant_id = public.current_tenant_id());

create policy "merchant_can_select_own_badge_redemptions"
  on public.badge_redemptions for select
  using (merchant_id = public.current_tenant_id());

create policy "donor_can_select_own_badge_redemptions"
  on public.badge_redemptions for select
  using (donor_telegram_id = public.current_telegram_id());

create policy "donor_can_select_own_badge_tokens"
  on public.badge_tokens for select
  using (donor_telegram_id = public.current_telegram_id());

create policy "merchant_can_select_own_badge_policy_audit"
  on public.badge_policy_audit_logs for select
  using (merchant_id = public.current_tenant_id());

create or replace function public.verify_badge_token(
  p_merchant_id uuid,
  p_raw_token text,
  p_staff_telegram_id text default null,
  p_discount_amount_usd numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_token public.badge_tokens%rowtype;
  v_policy public.merchant_badge_policies%rowtype;
  v_tier_discount numeric;
  v_daily_count int;
  v_hourly_count int;
  v_monthly_spent numeric;
  v_charity_allowed boolean;
begin
  if (select badge_verification_paused from public.platform_flags where id = 1) then
    return jsonb_build_object('success', false, 'reason', 'paused');
  end if;

  if p_raw_token is null or length(p_raw_token) <> 32 then
    return jsonb_build_object('success', false, 'reason', 'invalid');
  end if;

  v_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  select *
  into v_token
  from public.badge_tokens t
  where t.token_hash = v_hash
    and t.status = 'pending'
    and t.expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'expired');
  end if;

  select * into v_policy
  from public.merchant_badge_policies p
  where p.merchant_id = p_merchant_id
    and p.is_active = true;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'inactive');
  end if;

  if coalesce(array_length(v_policy.charity_whitelist, 1), 0) = 0 then
    v_charity_allowed := true;
  else
    v_charity_allowed := v_token.charity_tenant_id = any(v_policy.charity_whitelist);
  end if;

  if not v_charity_allowed then
    return jsonb_build_object('success', false, 'reason', 'charity_not_allowed');
  end if;

  v_tier_discount := nullif(v_policy.tier_discounts ->> coalesce(v_token.tier_id::text, ''), '')::numeric;
  if v_tier_discount is null then
    return jsonb_build_object('success', false, 'reason', 'tier_not_configured');
  end if;

  select count(*) into v_hourly_count
  from public.badge_redemptions br
  where br.merchant_id = p_merchant_id
    and br.created_at >= now() - interval '1 hour';

  if v_hourly_count >= 30 then
    return jsonb_build_object('success', false, 'reason', 'merchant_rate_limit');
  end if;

  select count(*) into v_daily_count
  from public.badge_redemptions br
  where br.merchant_id = p_merchant_id
    and br.donor_telegram_id = v_token.donor_telegram_id
    and br.created_at >= date_trunc('day', now());

  if v_daily_count >= v_policy.daily_limit_per_donor then
    return jsonb_build_object('success', false, 'reason', 'limit');
  end if;

  select coalesce(sum(br.discount_amount_usd), 0)
  into v_monthly_spent
  from public.badge_redemptions br
  where br.merchant_id = p_merchant_id
    and br.created_at >= date_trunc('month', now())
    and br.status = 'applied';

  if (v_monthly_spent + coalesce(p_discount_amount_usd,0)) > v_policy.monthly_budget_usd then
    return jsonb_build_object('success', false, 'reason', 'budget');
  end if;

  update public.badge_tokens
  set status = 'used',
      used_by_merchant_id = p_merchant_id,
      used_at = now()
  where id = v_token.id;

  insert into public.badge_redemptions (
    merchant_id,
    donor_badge_id,
    donor_telegram_id,
    charity_tenant_id,
    tier_id,
    token_hash,
    discount_percent,
    discount_amount_usd,
    status,
    verified_by_staff_telegram_id
  )
  values (
    p_merchant_id,
    v_token.donor_badge_id,
    v_token.donor_telegram_id,
    v_token.charity_tenant_id,
    v_token.tier_id,
    v_hash,
    v_tier_discount,
    coalesce(p_discount_amount_usd,0),
    'applied',
    p_staff_telegram_id
  );

  return jsonb_build_object(
    'success', true,
    'discount', v_tier_discount,
    'message', '✅ Applied'
  );
end;
$$;

revoke all on function public.verify_badge_token(uuid,text,text,numeric) from public;
grant execute on function public.verify_badge_token(uuid,text,text,numeric) to service_role;

create or replace function public.expire_old_badge_tokens()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.badge_tokens
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_old_badge_tokens() from public;
grant execute on function public.expire_old_badge_tokens() to service_role;
