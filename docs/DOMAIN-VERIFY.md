# Domain Verification Checklist

## 1) HTTPS and Web Root

```bash
curl -I https://letmein.cambodia.com
```

Expected:
- `HTTP/2 200`
- Valid TLS cert chain (Let's Encrypt)

## 2) Web Health Endpoint

```bash
curl -sS https://letmein.cambodia.com/api/health
```

Expected JSON:
```json
{"status":"ok","uptime":123}
```

## 3) Bot Health Through Domain Rewrite

```bash
curl -sS https://letmein.cambodia.com/bot/health
```

Expected JSON includes `status: ok`.

## 4) Cron Ping Through Domain Rewrite

```bash
curl -sS https://letmein.cambodia.com/cron/ping
```

Expected JSON includes `status: ok` and schedule values.

## 5) Telegram Webhook Registration

```bash
cd /Users/mlh/LetMeIn/bot
node set-webhook-domain.js
```

Expected:
- `mode: primary`
- `getWebhookInfo.url` uses `https://letmein.cambodia.com/webhook?secret=...`

## 6) Telegram Runtime Check

1. In Telegram, send `/start ref_TENANT_123` to your bot.
2. Check bot service logs in Railway for webhook receive success.
3. Validate referral insertion in Supabase.

## 7) Admin Route Origin Check

```bash
curl -I https://letmein.cambodia.com/admin
```

Expected:
- `200` or redirect to `/admin/login`
- Browser access only from `https://letmein.cambodia.com` origin

## 8) Fallback if Domain Fails

If DNS/SSL has not propagated, set temporary webhook base:

```bash
export BOT_FALLBACK_WEBHOOK_BASE="https://<bot-service>.up.railway.app"
node /Users/mlh/LetMeIn/bot/set-webhook-domain.js
```

This script auto-falls back if primary domain registration fails.
