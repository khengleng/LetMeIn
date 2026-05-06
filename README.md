# LetMeIn

Multi-tenant referral tracking SaaS for Cambodian SMEs.

LetMeIn uses Telegram for user interaction, Supabase for tenant-isolated data, and Polygon PoS for weekly Merkle-root anchoring. End-users do not need wallets or crypto knowledge.

## Core Features

- Multi-tenant isolation with Supabase RLS (`tenant_id` scoped access)
- Telegram bot commands:
  - `/start [ref_code]`
  - `/mylink`
  - `/status`
  - `/help`
- Referral logging via Supabase Edge Function (`log-referral`)
- Weekly batch anchoring (`anchor-batch`) to Polygon with one tx per tenant batch
- Public verification page (`/ref/[id]`) with Polygon verification badge
- Manual KHQR billing support + trial expiry status logic

## Repository Structure

```txt
LetMeIn/
├── backend/          # Supabase migrations, edge functions, types
├── bot/              # Telegram bot (Node.js + Telegraf)
├── contracts/        # Solidity + Hardhat deployment/tests
├── docs/             # Deployment and testing guides
├── public-verify/    # Next.js 14 public verification frontend
└── .env.example      # Shared environment template
```

## Architecture

1. User opens Telegram deep link: `https://t.me/<bot>?start=ref_<tenant>_<code>`
2. Bot parses payload and calls `log-referral` edge function.
3. Referral is stored in Supabase under tenant RLS.
4. Weekly cron triggers `anchor-batch`:
   - groups unanchored referrals by tenant
   - computes tenant Merkle root
   - submits `anchorBatch(tenantHash, merkleRoot)` on Polygon
   - stores tx hash + block metadata in Supabase
5. Public verify page loads referral by ID and shows chain verification status.

## Quick Start

## 1) Supabase

- Create Supabase project
- Apply migrations:

```bash
cd /Users/mlh/LetMeIn
supabase db push
```

- Deploy edge functions:

```bash
supabase functions deploy log-referral
supabase functions deploy anchor-batch
```

- Set required secrets (see `.env.example` and `docs/DEPLOYMENT.md`).

## 2) Telegram Bot

```bash
cd /Users/mlh/LetMeIn/bot
npm install
cp .env.example .env
npm run dev
```

Production webhook:

```bash
npm run set:webhook
npm run health
```

## 3) Smart Contract

```bash
cd /Users/mlh/LetMeIn/contracts
npm install
cp .env.example .env
npm run compile
npm run test
npm run deploy:amoy
# or
npm run deploy:polygon
```

## 4) Public Verify App

```bash
cd /Users/mlh/LetMeIn/public-verify
npm install
cp .env.production .env.local
npm run dev
```

## Railway Deployment (Recommended for App Services)

Deploy as separate services:

- `bot` (root: `bot/`)
- `public-verify` (root: `public-verify/`)

Keep `anchor-batch` scheduled on Supabase Cron.

Bot required production env includes:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_LOG_REFERRAL_URL`
- `BOT_SUPABASE_JWT`
- `WEBHOOK_BASE_URL`
- `WEBHOOK_SECRET_PATH`
- `WEBHOOK_SECRET_TOKEN`

Public verify env includes:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_POLYGON_RPC_URL`
- `NEXT_PUBLIC_POLYGONSCAN_BASE_URL`

## Security Notes

- Never expose private keys in client or bot frontend code.
- Only hashed data goes on-chain.
- Service role key is backend-only.
- RLS must stay enabled and enforced on all tenant tables.

## Testing

Use:

- [Deployment Guide](/Users/mlh/LetMeIn/docs/DEPLOYMENT.md)
- [Testing Checklist](/Users/mlh/LetMeIn/docs/TESTING.md)

`docs/TESTING.md` includes:

- RLS isolation validation
- bot command flow checks
- verify page checks
- manual cron trigger checks
- billing + trial expiry validation

## License

Proprietary (update as needed).
