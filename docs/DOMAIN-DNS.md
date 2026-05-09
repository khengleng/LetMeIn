# Custom Domain DNS for letmein.cambodia.com

Use one of the two supported record strategies below.

## Option A (Recommended): CNAME

Type: `CNAME`  
Name/Host: `letmein`  
Value/Target: `web-production-<railway-project-id>.up.railway.app`  
TTL: `300`

## Option B: A Record

Type: `A`  
Name/Host: `letmein`  
Value/Target: `<RAILWAY_EDGE_IP_FROM_DASHBOARD>`  
TTL: `300`

## Railway UI Domain Binding Steps

1. Railway -> Project -> select `web` service.
2. Open `Settings` -> `Networking` -> `Custom Domains`.
3. Click `Add Domain`.
4. Enter `letmein.cambodia.com`.
5. Railway shows DNS target values. Apply matching DNS record at registrar.
6. Wait for status `Verified`.
7. SSL is auto-issued by Railway (Let's Encrypt). No manual certificate upload.

## Routing Expectations

- `https://letmein.cambodia.com` -> web service
- `https://letmein.cambodia.com/api/health` -> web health endpoint
- `https://letmein.cambodia.com/webhook?secret=...` -> rewritten to bot service
- `https://letmein.cambodia.com/bot/health` -> rewritten to bot health endpoint
- `https://letmein.cambodia.com/cron/ping` -> rewritten to cron ping endpoint
