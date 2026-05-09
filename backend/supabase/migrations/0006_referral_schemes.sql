-- Phase 10: tenant-managed referral schemes with audit + RLS + rate limiting

create table if not exists public.referral_schemes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  commission_type text not null check (commission_type in ('percent','fixed')),
  commission_value numeric(10,2) not null,
  discount_type text not null check (discount_type in ('percent','fixed','free_shipping')),
  discount_value numeric(10,2) not null,
  conversion_event text not null check (conversion_event in ('signup','first_purchase','deposit')),
  min_purchase_amount numeric(10,2) not null default 0 check (min_purchase_amount >= 0),
  max_commissions_per_month int not null default 50 check (max_commissions_per_month between 1 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_schemes_commission_range check (
    (commission_type = 'percent' and commission_value between 0 and 100)
    or
    (commission_type = 'fixed' and commission_value between 0 and 1000)
  ),
  constraint referral_schemes_discount_range check (
    (discount_type = 'percent' and discount_value between 0 and 100)
    or
    (discount_type = 'fixed' and discount_value between 0 and 500)
    or
    (discount_type = 'free_shipping' and discount_value = 0)
  )
);

create table if not exists public.scheme_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_email text not null,
  action text not null check (action in ('create','update','override_disable')),
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists referral_schemes_active_idx on public.referral_schemes (is_active, updated_at desc);
create index if not exists scheme_audit_logs_tenant_created_idx on public.scheme_audit_logs (tenant_id, created_at desc);

create or replace trigger referral_schemes_set_updated_at
before update on public.referral_schemes
for each row execute function public.set_updated_at();

alter table public.referral_schemes enable row level security;
alter table public.referral_schemes force row level security;
alter table public.scheme_audit_logs enable row level security;
alter table public.scheme_audit_logs force row level security;

create policy "tenant_can_select_own_referral_scheme"
  on public.referral_schemes
  for select
  using (tenant_id = public.current_tenant_id());

create policy "tenant_can_insert_own_referral_scheme"
  on public.referral_schemes
  for insert
  with check (tenant_id = public.current_tenant_id());

create policy "tenant_can_update_own_referral_scheme"
  on public.referral_schemes
  for update
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "tenant_can_select_own_scheme_audits"
  on public.scheme_audit_logs
  for select
  using (tenant_id = public.current_tenant_id());

-- server-side helper for operator + tenant update guard
create or replace function public.can_update_scheme_now(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select (
    select count(*)
    from public.scheme_audit_logs s
    where s.tenant_id = p_tenant_id
      and s.created_at >= now() - interval '1 hour'
      and s.action in ('create','update')
  ) < 3;
$$;

revoke all on function public.can_update_scheme_now(uuid) from public;
grant execute on function public.can_update_scheme_now(uuid) to service_role;

create or replace function public.insert_scheme_audit(
  p_tenant_id uuid,
  p_actor_email text,
  p_action text,
  p_old_values jsonb,
  p_new_values jsonb,
  p_reason text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.scheme_audit_logs (tenant_id, actor_email, action, old_values, new_values, reason)
  values (p_tenant_id, p_actor_email, p_action, coalesce(p_old_values, '{}'::jsonb), coalesce(p_new_values, '{}'::jsonb), p_reason);
$$;

revoke all on function public.insert_scheme_audit(uuid,text,text,jsonb,jsonb,text) from public;
grant execute on function public.insert_scheme_audit(uuid,text,text,jsonb,jsonb,text) to service_role;
