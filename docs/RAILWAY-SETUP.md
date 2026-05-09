# Railway Setup (Web + Bot + Cron)

## 1) Create Railway Project

1. Open Railway dashboard.
2. Click `New Project` -> `Deploy from GitHub Repo`.
3. Select `khengleng/LetMeIn`.
4. Set production branch to `main`.

## 2) Create Services from Monorepo

Create three services in the same Railway project.

## Service A: `web`
1. Add service -> `GitHub Repo` -> select same repo.
2. Service settings:
   - Root Directory: `web`
   - Config Path: `/web/railway.service.json`
3. Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `POLYGON_RPC_URL`
   - `CONTRACT_ADDRESS`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `OPERATOR_EMAIL`
   - `BOT_WEBHOOK_SECRET`
   - `OPERATOR_ALLOWLIST_EMAILS`
   - `SUPABASE_AUTH_COOKIE`
4. Networking:
   - Public networking ON.
5. Healthcheck (auto from config): `/api/health`

## Service B: `bot`
1. Add service -> `GitHub Repo` -> select same repo.
2. Service settings:
   - Root Directory: `bot`
   - Config Path: `/bot/railway.service.json`
3. Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `POLYGON_RPC_URL`
   - `CONTRACT_ADDRESS`
   - `BOT_TOKEN`
   - `BOT_WEBHOOK_SECRET`
   - `ADMIN_TELEGRAM_ID`
   - `TELEGRAM_BOT_USERNAME`
   - `SUPABASE_LOG_REFERRAL_URL`
   - `BOT_SUPABASE_JWT`
   - `DEFAULT_TENANT_ID`
   - `DEFAULT_REFERRAL_STATUS`
4. Networking:
   - Public networking ON.
5. Telegram webhook target:
   - `https://<bot-service-domain>/webhook`
   - Secret header: same value as `BOT_WEBHOOK_SECRET`

## Service C: `cron`
1. Add service -> `GitHub Repo` -> select same repo.
2. Service settings:
   - Root Directory: `cron`
   - Config Path: `/cron/railway.service.json`
3. Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `POLYGON_RPC_URL`
   - `ANCHOR_CONTRACT_ADDRESS`
   - `PRIVATE_KEY` (anchoring wallet)
   - `ANCHOR_CRON_SCHEDULE` (default: 0 18 * * 0)
   - `TENANT_CHECK_CRON_SCHEDULE` (default: 0 1 * * *)
   - `BADGE_TOKEN_CLEANUP_CRON` (default: */15 * * * *)
4. Networking:
   - Public networking ON (for `/ping` uptime checks).

## 3) Deploy Behavior

1. In project settings, enable `Auto Deploy` on `main`.
2. Keep PR preview deploys enabled only for `web`.
3. Disable PR previews for `bot` and `cron` (service settings).
4. In each service, keep last 5 deployments for rollback.

## 4) Health Checks

- Web: `GET /api/health` -> `200 { status: "ok", uptime }`
- Bot: `GET /health` -> `200 { status: "ok", uptime }`
- Bot webhook: `POST /webhook` with `X-Telegram-Bot-Api-Secret-Token`
- Cron: `GET /ping` -> `200 { status: "ok", uptime, schedules }`

## 5) Security Checklist in Railway UI

1. Never add secrets to repo files.
2. Store all secrets in Railway Variables only.
3. Rotate:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PRIVATE_KEY`
   - `BOT_WEBHOOK_SECRET`
4. Restrict admin access with `OPERATOR_ALLOWLIST_EMAILS`.
5. Ensure bot rejects invalid webhook secret header.

## 6) Post-Deploy Verification

1. Open `https://<web-domain>/api/health` and confirm status JSON.
2. Open `https://<bot-domain>/health` and confirm status JSON.
3. Open `https://<cron-domain>/ping` and confirm status JSON.
4. Send Telegram `/start ref_TENANT_123` and verify referral row is inserted.
5. Trigger `anchor-batch` once and verify chain tx metadata in Supabase.
