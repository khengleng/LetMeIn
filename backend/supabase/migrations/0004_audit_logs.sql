-- LetMeIn Phase 6: operator audit logs

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  operator_email text not null,
  action_type text not null,
  target_type text not null,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_operator_email_idx on public.audit_logs (operator_email);
create index if not exists audit_logs_action_type_idx on public.audit_logs (action_type);

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- Restrict reads to operator-authenticated context where email is in allowlist.
create policy "operator_can_select_audit_logs"
  on public.audit_logs
  for select
  using (false);

-- service_role writes from server actions only.
