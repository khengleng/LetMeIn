const http = require('http');
const cron = require('node-cron');
const { runBatchAnchor } = require('./anchor');

const PORT = Number(process.env.PORT || 8081);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const ANCHOR_CRON_SCHEDULE = process.env.ANCHOR_CRON_SCHEDULE || '0 18 * * 0';
const TENANT_CHECK_CRON_SCHEDULE = process.env.TENANT_CHECK_CRON_SCHEDULE || '0 1 * * *';
const BADGE_TOKEN_CLEANUP_CRON = process.env.BADGE_TOKEN_CLEANUP_CRON || '*/15 * * * *';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY');
}

const startedAt = Date.now();



async function callRpc(functionName, payload = {}) {
  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${functionName} failed (${res.status}): ${text}`);
  }

  console.log(`[cron] ${functionName} success: ${text}`);
}

async function runAnchorBatch() {
  console.log('[cron] Starting scheduled anchor-batch...');
  try {
    const result = await runBatchAnchor();
    console.log('[cron] anchor-batch success:', JSON.stringify(result));
  } catch (error) {
    console.error('[cron] anchor-batch error:', error.message);
  }
}

async function runTenantDailyCheck() {
  try {
    await callRpc('refresh_tenant_access_status', {});
  } catch (error) {
    console.error('[cron] refresh_tenant_access_status error:', error);
  }
}

async function runBadgeTokenCleanup() {
  try {
    await callRpc('expire_old_badge_tokens', {});
  } catch (error) {
    console.error('[cron] expire_old_badge_tokens error:', error);
  }
}

cron.schedule(ANCHOR_CRON_SCHEDULE, runAnchorBatch, { timezone: 'Asia/Phnom_Penh' });
cron.schedule(TENANT_CHECK_CRON_SCHEDULE, runTenantDailyCheck, { timezone: 'Asia/Phnom_Penh' });
cron.schedule(BADGE_TOKEN_CLEANUP_CRON, runBadgeTokenCleanup, { timezone: 'Asia/Phnom_Penh' });

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        schedules: {
          anchor: ANCHOR_CRON_SCHEDULE,
          tenantDaily: TENANT_CHECK_CRON_SCHEDULE,
          badgeCleanup: BADGE_TOKEN_CLEANUP_CRON,
        },
      }),
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log('================================================================');
  console.log(`[cron] SERVICE STARTING ON PORT ${PORT}`);
  console.log(`[cron] uptime check available at GET /ping`);
  console.log('================================================================');
  console.log(`[cron] anchor schedule: ${ANCHOR_CRON_SCHEDULE}`);
  console.log(`[cron] tenant check schedule: ${TENANT_CHECK_CRON_SCHEDULE}`);
  console.log(`[cron] badge cleanup schedule: ${BADGE_TOKEN_CLEANUP_CRON}`);
});
