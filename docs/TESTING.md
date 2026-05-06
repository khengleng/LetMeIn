# LetMeIn Validation Checklist

## 1) Test RLS Isolation

### Seed two tenants
```sql
insert into public.tenants (id, slug, name, status, trial_ends_at)
values
  ('11111111-1111-1111-1111-111111111111', 'tenant-a', 'Tenant A', 'active', now() + interval '30 days'),
  ('22222222-2222-2222-2222-222222222222', 'tenant-b', 'Tenant B', 'active', now() + interval '30 days')
on conflict (id) do nothing;

insert into public.referrals (tenant_id, referrer_code, referee_phone_hash, occurred_at, referral_hash, source, metadata)
values
  ('11111111-1111-1111-1111-111111111111', 'A001', repeat('a',64), now(), encode(digest('seed-a','sha256'),'hex'), 'telegram', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'B001', repeat('b',64), now(), encode(digest('seed-b','sha256'),'hex'), 'telegram', '{}')
on conflict (referral_hash) do nothing;
```

### Run tenant-scoped query simulation
```sql
-- Tenant A JWT context
select set_config('request.jwt.claims', '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select tenant_id, referrer_code from public.referrals;
-- Expect: only tenant A rows

-- Tenant B JWT context
select set_config('request.jwt.claims', '{"tenant_id":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select tenant_id, referrer_code from public.referrals;
-- Expect: only tenant B rows
```

## 2) Test Bot `/start` + `/mylink`

### Prerequisites
- `BOT_SUPABASE_JWT` must include tenant claim used by RLS.
- `SUPABASE_LOG_REFERRAL_URL` must point to deployed `log-referral` function.

### Run
```bash
cd /Users/mlh/LetMeIn/bot
npm install
npm run dev
```

In Telegram:
1. Send `/start ref_TENANT_123`
2. Expect reply: `Referral recorded successfully. Thank you.`
3. Send `/mylink`
4. Expect deep link response containing `https://t.me/<BOT_USERNAME>?start=ref_...`

### Verify write
```sql
select id, tenant_id, referrer_code, occurred_at
from public.referrals
order by created_at desc
limit 5;
```

## 3) Test Verify Flow (`/ref/[id]`)

### Start app
```bash
cd /Users/mlh/LetMeIn/public-verify
npm install
cp .env.production .env.local
npm run dev
```

### Test URL
1. Take one referral UUID from DB.
2. Open `http://localhost:3000/ref/<REFERRAL_ID>?lang=en`.
3. Expect field rendering + badge.
4. If anchored tx exists and is mined, badge should show `✅ Verified on Polygon` with a Polygonscan link.

## 4) Test Cron / Anchor Batch

### Manual trigger
```bash
curl -i -X POST \
  "https://<PROJECT_REF>.supabase.co/functions/v1/anchor-batch" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"
```

### Verify results
```sql
select id, tenant_id, tx_hash, block_number, merkle_root, created_at
from public.referral_anchor_batches
order by created_at desc
limit 10;

select id, metadata->>'anchor_tx_hash' as anchor_tx_hash
from public.referrals
where metadata->>'anchor_tx_hash' is not null
order by created_at desc
limit 10;
```

Expected:
- One tx per tenant batch in this run.
- Referrals updated with `anchor_tx_hash` metadata.

## 5) Security Hardening

### Rotate keys
1. Rotate in Supabase project settings:
   - `anon`
   - `service_role`
2. Rotate Polygon deployer wallet private key.
3. Rotate Telegram webhook secret.

### Enable Supabase audit logs
1. Dashboard -> **Project Settings** -> **Logs / Audit**.
2. Enable audit logging for SQL and auth events.
3. Set retention per policy.

### Disable broad public schema access
Apply migration:
```bash
cd /Users/mlh/LetMeIn
supabase db push
```
This includes `0003_security_billing_trial.sql` revokes and RLS-only access posture.

## 6) Billing + Trial Expiry Logic

### Insert sample KHQR payment
```sql
insert into public.billing_payments (
  tenant_id, billing_month, amount_usd, method, status, paid_at, reference_code
)
values (
  '11111111-1111-1111-1111-111111111111',
  date_trunc('month', now())::date,
  29.00,
  'khqr',
  'confirmed',
  now(),
  'KHQR-TEST-001'
)
on conflict (tenant_id, billing_month)
do update set status='confirmed', paid_at=excluded.paid_at, reference_code=excluded.reference_code;
```

### Refresh tenant access statuses
```sql
select public.refresh_tenant_access_status();
```

### Validate outcome
```sql
select id, name, status, trial_ends_at
from public.tenants
order by created_at desc;
```

Expected:
- Current-month paid tenant => `active`
- Expired unpaid trial tenant => `suspended`
