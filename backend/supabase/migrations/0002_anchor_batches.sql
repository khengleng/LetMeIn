-- LetMeIn Phase 3: anchor batch metadata + helper RPC

create table if not exists public.referral_anchor_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tenant_hash text not null check (tenant_hash ~ '^0x[a-f0-9]{64}$'),
  merkle_root text not null check (merkle_root ~ '^0x[a-f0-9]{64}$'),
  referral_count integer not null check (referral_count > 0),
  tx_hash text not null check (tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
  block_number bigint not null check (block_number > 0),
  chain_id bigint not null,
  anchored_at timestamptz not null,
  status text not null default 'anchored' check (status in ('anchored', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists referral_anchor_batches_tenant_created_idx
  on public.referral_anchor_batches (tenant_id, created_at desc);

alter table public.referral_anchor_batches enable row level security;
alter table public.referral_anchor_batches force row level security;

create policy "tenant_can_select_own_anchor_batches"
  on public.referral_anchor_batches
  for select
  using (tenant_id = public.current_tenant_id());

create or replace function public.mark_referrals_anchored(
  p_referral_ids uuid[],
  p_anchor_batch_id uuid,
  p_tx_hash text,
  p_block_number bigint,
  p_merkle_root text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.referrals r
  set metadata =
    coalesce(r.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'anchor_batch_id', p_anchor_batch_id,
        'anchor_tx_hash', p_tx_hash,
        'anchor_block_number', p_block_number,
        'anchor_merkle_root', p_merkle_root,
        'anchored_at', now()
      )
  where r.id = any(p_referral_ids);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_referrals_anchored(uuid[], uuid, text, bigint, text) from public;
grant execute on function public.mark_referrals_anchored(uuid[], uuid, text, bigint, text) to service_role;
