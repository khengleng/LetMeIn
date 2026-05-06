# LetMeIn Deployment Guide

## 1) Supabase Setup

### 1.1 Create project
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Click **New project**.
3. Set region close to Cambodia (e.g., Singapore).
4. Save:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 1.2 Link local project
```bash
npm i -g supabase
cd /Users/mlh/LetMeIn
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

### 1.3 Apply DB migrations
```bash
supabase db push
```

### 1.4 Verify RLS
1. Open **Supabase Dashboard → Table Editor → referrals**.
2. Confirm **RLS enabled**.
3. Open **Authentication → Policies** and confirm tenant-scoped policies exist on:
   - `tenants`
   - `settings`
   - `referrals`
   - `payouts`
   - `referral_anchor_batches`
4. In SQL Editor, verify JWT tenant scoping:
```sql
select public.current_tenant_id();
```

### 1.5 Deploy Edge Functions
```bash
supabase functions deploy log-referral
supabase functions deploy anchor-batch --import-map ./supabase/functions/import_map.json
```

Set function secrets:
```bash
supabase secrets set SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="<ANON_KEY>"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"
supabase secrets set POLYGON_RPC_URL="https://polygon-rpc.com"
supabase secrets set PRIVATE_KEY="<ANCHOR_WALLET_PRIVATE_KEY>"
supabase secrets set ANCHOR_CONTRACT_ADDRESS="0x..."
supabase secrets set TELEGRAM_BOT_TOKEN="<BOT_TOKEN>"
supabase secrets set TELEGRAM_ALERT_CHAT_ID="<CHAT_ID>"
```

## 2) Public Verify Frontend (Vercel)

### 2.1 Deploy
```bash
cd /Users/mlh/LetMeIn/public-verify
npm install
npm run build
```

1. Push repo to GitHub.
2. Go to [https://vercel.com/new](https://vercel.com/new).
3. Import repo and set root directory to `public-verify`.
4. Framework preset: **Next.js**.

### 2.2 Vercel env vars
In **Project Settings → Environment Variables**, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_POLYGON_RPC_URL`
- `NEXT_PUBLIC_POLYGONSCAN_BASE_URL`

Then redeploy.

### 2.3 Performance settings
1. **Project Settings → Functions**:
   - Region: closest to users.
2. Enable caching defaults for static assets.
3. Keep dynamic route lightweight (`/ref/[id]` already read-only and minimal).

## 3) Telegram Bot Deployment + Webhook

### 3.1 Dev (ngrok)
```bash
cd /Users/mlh/LetMeIn/bot
npm install
npm run dev
ngrok http 3001
```

Set:
- `WEBHOOK_BASE_URL=https://<ngrok-id>.ngrok-free.app`
- `NODE_ENV=production`

Then:
```bash
npm run set:webhook
npm run health
```

### 3.2 Prod (Vercel/Render)
1. Deploy bot service with root `bot/`.
2. Set env from `bot/.env.example`.
3. Ensure:
   - `WEBHOOK_BASE_URL=https://<prod-domain>`
   - `WEBHOOK_SECRET_PATH=<random-path>`
   - `WEBHOOK_SECRET_TOKEN=<random-token>`

Run once after deploy:
```bash
npm run set:webhook
npm run health
```

## 4) Polygon Contract Deployment (Amoy -> Mainnet)

### 4.1 Deploy to Amoy
```bash
cd /Users/mlh/LetMeIn/contracts
npm install
cp .env.example .env
npm run compile
npm run test
npm run deploy:amoy
```

### 4.2 Validate on Amoy
1. Use emitted contract address.
2. Run one test anchor tx from backend function in controlled environment.
3. Confirm event in Amoy Polygonscan.

### 4.3 Deploy to Polygon mainnet
```bash
npm run deploy:polygon
```

Update backend secret:
```bash
supabase secrets set ANCHOR_CONTRACT_ADDRESS="0x<MAINNET_CONTRACT>"
```

### 4.4 Wallet funding
- Fund deployer/anchor wallet with at least **5 MATIC**.
- Rotate to dedicated hot wallet only for `anchorBatch`.

## 5) Weekly Cron for Batch Anchoring

### Option A: Supabase Scheduled Function (recommended)
1. Supabase Dashboard → **Edge Functions → Schedules**.
2. Create weekly schedule (Monday, 01:00 Asia/Phnom_Penh).
3. Target function: `anchor-batch`.

### Option B: Vercel Cron
1. Add API route in bot/backend deployment that triggers Supabase function.
2. In Vercel, configure cron expression:
   - `0 18 * * 0` (UTC = Monday 01:00 ICT)

### Option C: cron-job.org
1. Create job with secure URL to invoke your anchor endpoint.
2. Add secret token header.
3. Schedule weekly.

## 6) API/Webhook in Vercel

If deploying bot/webhook via Vercel serverless:
1. Add route to receive Telegram updates at:
   - `/telegraf/<WEBHOOK_SECRET_PATH>`
2. Validate `x-telegram-bot-api-secret-token` matches `WEBHOOK_SECRET_TOKEN`.
3. Return HTTP 200 fast; process logic safely with try/catch.

## 7) Security Checklist

1. Key rotation
- Rotate `SUPABASE_SERVICE_ROLE_KEY` quarterly.
- Rotate `PRIVATE_KEY` wallet when suspected risk.
- Rotate Telegram webhook secret token periodically.

2. RLS testing
- Test cross-tenant read/write denial monthly.
- Verify JWT without `tenant_id` is denied.
- Confirm no client path uses service role key.

3. Rate limiting
- Add per-IP/per-ref-id throttling at edge (WAF or middleware).
- Limit repeated `/start` abuse patterns in bot logic.

4. Backup strategy
- Enable Supabase Point-In-Time Recovery.
- Weekly export of critical tables:
  - `tenants`
  - `referrals`
  - `referral_anchor_batches`
- Store encrypted backup in separate cloud bucket.

5. Monitoring
- Track Edge Function failures and retries.
- Alert on missed weekly anchor.
- Alert on low MATIC wallet balance.

6. Data minimization
- Never store raw PII on-chain.
- Keep only hashed identifiers in anchor payloads.

## 8) Required Production Env Map

### public-verify
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_POLYGON_RPC_URL`
- `NEXT_PUBLIC_POLYGONSCAN_BASE_URL`

### bot
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_LOG_REFERRAL_URL`
- `BOT_SUPABASE_JWT`
- `WEBHOOK_BASE_URL`
- `WEBHOOK_SECRET_PATH`
- `WEBHOOK_SECRET_TOKEN`

### anchor-batch function
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POLYGON_RPC_URL`
- `PRIVATE_KEY`
- `ANCHOR_CONTRACT_ADDRESS`
- `TELEGRAM_BOT_TOKEN` (optional alerts)
- `TELEGRAM_ALERT_CHAT_ID` (optional alerts)
