# LetMeIn on Railway (Testing Deployment)

This guide deploys LetMeIn for testing using Railway + Supabase.

## Services to Create

Create 2 Railway services from the same GitHub repo:

1. `letmein-bot` (root directory: `bot`)
2. `letmein-public-verify` (root directory: `public-verify`)

Keep `anchor-batch` running on Supabase Edge Functions + Supabase Scheduler.

## 1) Deploy `letmein-bot`

### 1.1 Service settings
- Source: GitHub repo `khengleng/LetMeIn`
- Root Directory: `bot`
- Build Command: `npm install`
- Start Command: `npm start`

### 1.2 Environment variables
Set these in Railway service variables:

- `NODE_ENV=production`
- `TELEGRAM_BOT_TOKEN=<your_bot_token>`
- `TELEGRAM_BOT_USERNAME=<your_bot_username_without_@>`
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<supabase_anon_key>`
- `SUPABASE_LOG_REFERRAL_URL=https://<project-ref>.supabase.co/functions/v1/log-referral`
- `BOT_SUPABASE_JWT=<tenant-aware-jwt-for-testing>`
- `WEBHOOK_SECRET_TOKEN=<long-random-secret>`
- `WEBHOOK_SECRET_PATH=webhook`
- `REQUEST_TIMEOUT_MS=8000`
- `DEFAULT_REFERRAL_STATUS=pending`
- `DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000000`

After first successful deploy, copy the Railway public URL, then set:

- `WEBHOOK_BASE_URL=https://<your-bot-service>.up.railway.app`

Redeploy.

### 1.3 Register Telegram webhook
In Railway service shell (or local shell with same env):

```bash
cd /app
npm run set:webhook
npm run health
```

Expected: webhook URL points to
`https://<your-bot-service>.up.railway.app/<WEBHOOK_SECRET_PATH>`

## 2) Deploy `letmein-public-verify`

### 2.1 Service settings
- Source: GitHub repo `khengleng/LetMeIn`
- Root Directory: `public-verify`
- Build Command: `npm run build`
- Start Command: `npm run start`

### 2.2 Environment variables
- `NODE_ENV=production`
- `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>`
- `NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com`
- `NEXT_PUBLIC_POLYGONSCAN_BASE_URL=https://polygonscan.com/tx/`

Deploy and open the Railway public URL.

## 3) Supabase Prerequisites

Run once locally:

```bash
cd /Users/mlh/LetMeIn
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy log-referral
supabase functions deploy anchor-batch
```

Set function secrets:

```bash
supabase secrets set SUPABASE_URL="https://<project-ref>.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="<anon>"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service_role>"
supabase secrets set POLYGON_RPC_URL="https://polygon-rpc.com"
supabase secrets set PRIVATE_KEY="<anchor_wallet_private_key>"
supabase secrets set ANCHOR_CONTRACT_ADDRESS="0x..."
supabase secrets set TELEGRAM_BOT_TOKEN="<bot_token>"
supabase secrets set TELEGRAM_ALERT_CHAT_ID="<ops_chat_id>"
```

## 4) Scheduler (Weekly Anchor)

In Supabase dashboard:

1. Go to **Edge Functions -> Schedules**
2. Create schedule for function `anchor-batch`
3. Cron (ICT Monday 01:00): `0 18 * * 0` UTC

## 5) Go-Live Test Sequence

1. Telegram bot:
- Send `/start ref_TENANT_123`
- Send `/mylink`

2. DB verify:
- Confirm new row in `public.referrals`

3. Public verify:
- Open `https://<public-verify-url>/ref/<referral_id>?lang=en`
- Confirm details render

4. Chain verify:
- Manually trigger `anchor-batch`
- Confirm `referral_anchor_batches` row + `tx_hash`
- Refresh `/ref/<id>` and confirm `Verified on Polygon`

## 6) Common Railway Issues

1. Bot deploys but no Telegram updates:
- `WEBHOOK_BASE_URL` missing or wrong
- Webhook not registered (`npm run set:webhook`)
- Secret mismatch (`WEBHOOK_SECRET_TOKEN`)

2. Bot returns referral logging error:
- `BOT_SUPABASE_JWT` missing tenant claim
- `SUPABASE_LOG_REFERRAL_URL` incorrect
- Supabase function not deployed

3. Verify page returns not found:
- Referral ID is wrong
- RLS blocks anon read for that row/policy path

4. Chain badge not showing:
- `anchor-batch` has not run yet
- `anchor_tx_hash` missing in referral metadata
- Polygon RPC connectivity issue
