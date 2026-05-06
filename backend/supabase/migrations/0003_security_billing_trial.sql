-- LetMeIn Phase 5: security hardening + manual KHQR billing + trial expiry logic

-- 1) Security hardening: limit default public access
revoke create on schema public from public;
revoke usage on schema public from anon;
revoke usage on schema public from authenticated;
grant usage on schema public to anon;
grant usage on schema public to authenticated;

do
$$
declare
  r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('revoke all on table %I.%I from public', r.schemaname, r.tablename);
    execute format('revoke all on table %I.%I from anon', r.schemaname, r.tablename);
    execute format('revoke all on table %I.%I from authenticated', r.schemaname, r.tablename);
  end loop;
end;
$$ language plpgsql;

-- Keep table access controlled exclusively via RLS policies.

-- 2) Billing table for manual KHQR payment tracking
create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  billing_month date not null,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  currency text not null default 'USD',
  method text not null default 'khqr' check (method in ('khqr', 'cash', 'bank_transfer')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  paid_at timestamptz,
  reference_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payments_month_unique unique (tenant_id, billing_month)
);

create index if not exists billing_payments_tenant_idx
  on public.billing_payments (tenant_id, billing_month desc);

create or replace trigger billing_payments_set_updated_at
before update on public.billing_payments
for each row execute function public.set_updated_at();

alter table public.billing_payments enable row level security;
alter table public.billing_payments force row level security;

create policy "tenant_can_select_own_billing_payments"
  on public.billing_payments
  for select
  using (tenant_id = public.current_tenant_id());

-- Platform-side finance ops only for writes.

-- 3) Trial expiry + payment-aware status function
create or replace function public.refresh_tenant_access_status(p_tenant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  with candidates as (
    select t.id,
           t.status,
           t.trial_ends_at,
           exists (
             select 1
             from public.billing_payments bp
             where bp.tenant_id = t.id
               and bp.status = 'confirmed'
               and bp.paid_at is not null
               and bp.paid_at >= date_trunc('month', now())
           ) as has_current_payment
    from public.tenants t
    where p_tenant_id is null or t.id = p_tenant_id
  ), updates as (
    update public.tenants t
    set status = case
      when c.has_current_payment then 'active'
      when t.status = 'trial' and now() <= t.trial_ends_at then 'trial'
      when t.status = 'trial' and now() > t.trial_ends_at then 'suspended'
      else t.status
    end,
    updated_at = now()
    from candidates c
    where t.id = c.id
      and t.status in ('trial', 'active', 'suspended')
    returning 1
  )
  select count(*) into v_rows from updates;

  return coalesce(v_rows, 0);
end;
$$;

revoke all on function public.refresh_tenant_access_status(uuid) from public;
grant execute on function public.refresh_tenant_access_status(uuid) to service_role;

-- 4) Optional read helper view (RLS-protected by base table)
create or replace view public.tenant_billing_summary as
select
  t.id as tenant_id,
  t.name,
  t.status,
  t.trial_ends_at,
  max(bp.paid_at) filter (where bp.status = 'confirmed') as last_confirmed_payment_at,
  sum(bp.amount_usd) filter (where bp.status = 'confirmed') as total_confirmed_paid_usd
from public.tenants t
left join public.billing_payments bp on bp.tenant_id = t.id
group by t.id, t.name, t.status, t.trial_ends_at;

grant select on public.tenant_billing_summary to authenticated;
