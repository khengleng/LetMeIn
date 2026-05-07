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

```env
NODE_ENV=production
TELEGRAM_BOT_TOKEN=<TELEGRAM_BOT_TOKEN>
TELEGRAM_BOT_USERNAME=<TELEGRAM_BOT_USERNAME>
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
SUPABASE_LOG_REFERRAL_URL=https://<PROJECT_REF>.supabase.co/functions/v1/log-referral
BOT_SUPABASE_JWT=<TENANT_AWARE_JWT_FOR_TESTING>
WEBHOOK_BASE_URL=https://<YOUR_BOT_SERVICE>.up.railway.app
WEBHOOK_SECRET_PATH=<LONG_RANDOM_PATH>
WEBHOOK_SECRET_TOKEN=<LONG_RANDOM_SECRET>
REQUEST_TIMEOUT_MS=8000
DEFAULT_REFERRAL_STATUS=pending
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000000
```

## 3) Railway: `letmein-public-verify` Variables

```env
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
NEXT_PUBLIC_POLYGONSCAN_BASE_URL=https://polygonscan.com/tx/
```

## 4) Optional Local `.env` Root Values

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
