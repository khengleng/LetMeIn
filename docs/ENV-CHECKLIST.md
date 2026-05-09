# LetMeIn Environment Checklist

Use this file as a copy-paste checklist before deployment.

## 1) Supabase Edge Functions Secrets

```bash
supabase secrets set SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="<SUPABASE_ANON_KEY>"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<SUPABASE_SERVICE_ROLE_KEY>"
supabase secrets set POLYGON_RPC_URL="https://polygon-rpc.com"
supabase secrets set PRIVATE_KEY="<ANCHOR_WALLET_PRIVATE_KEY>"
supabase secrets set ANCHOR_CONTRACT_ADDRESS="0x<REFERRAL_ANCHOR_CONTRACT>"
supabase secrets set TELEGRAM_BOT_TOKEN="<TELEGRAM_BOT_TOKEN>"
supabase secrets set TELEGRAM_ALERT_CHAT_ID="<TELEGRAM_ALERT_CHAT_ID>"
```

## 2) Railway: `letmein-bot` Variables

- `TELEGRAM_BOT_TOKEN` or `BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_LOG_REFERRAL_URL`
- `WEBHOOK_SECRET_TOKEN` or `BOT_WEBHOOK_SECRET`
- `WEBHOOK_BASE_URL` (e.g. https://letmein.cambodia.com or your bot.up.railway.app)
- `WEBHOOK_SECRET_PATH` (default: webhook)
- `BOT_SUPABASE_JWT` (tenant-aware JWT)
- `ADMIN_TELEGRAM_ID` (comma-separated)
- `STAFF_TELEGRAM_IDS` (comma-separated)
- `STAFF_PIN_HASH` (sha256 of staff PIN)
- `DEFAULT_TENANT_ID`
- `DEFAULT_REFERRAL_STATUS` (pending)
- `REQUEST_TIMEOUT_MS` (8000)

## 3) Railway: `letmein-public-verify` Variables

```env
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
NEXT_PUBLIC_POLYGONSCAN_BASE_URL=https://polygonscan.com/tx/
```

## 4) Railway: `letmein-cron` Variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POLYGON_RPC_URL`
- `ANCHOR_CONTRACT_ADDRESS`
- `PRIVATE_KEY` (anchoring wallet)
- `ANCHOR_CRON_SCHEDULE`
- `TENANT_CHECK_CRON_SCHEDULE`
- `BADGE_TOKEN_CLEANUP_CRON`

## 5) Optional Local `.env` Root Values

```env
SUPABASE_PROJECT_REF=<PROJECT_REF>
SUPABASE_DB_URL=postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres
POLYGON_CHAIN_ID=137
ANCHOR_BATCH_CRON=0 1 * * 1
ANCHOR_BATCH_SIZE=5000
DEFAULT_TRIAL_DAYS=14
```

## 5) Quick Verify

1. `supabase db push`
2. `supabase functions deploy log-referral`
3. `supabase functions deploy anchor-batch`
4. Railway deploy bot + public-verify
5. Bot webhook registration:
   - `npm run set:webhook`
   - `npm run health`
6. Run smoke test script:
   - `bash scripts/smoke-test.sh`
