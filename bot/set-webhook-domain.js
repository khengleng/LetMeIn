require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const BOT_WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET_TOKEN;
const BOT_WEBHOOK_QUERY_SECRET = process.env.BOT_WEBHOOK_QUERY_SECRET || BOT_WEBHOOK_SECRET;
const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_APP_URL || 'https://letmein.cambodia.com';
const FALLBACK_WEBHOOK_BASE = process.env.BOT_FALLBACK_WEBHOOK_BASE || '';

if (!BOT_TOKEN || !BOT_WEBHOOK_SECRET || !BOT_WEBHOOK_QUERY_SECRET) {
  throw new Error('Missing BOT token or webhook secrets');
}

function webhookUrl(base) {
  return `${base.replace(/\/$/, '')}/webhook?secret=${encodeURIComponent(BOT_WEBHOOK_QUERY_SECRET)}`;
}

async function setWebhook(url) {
  const endpoint = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
  const payload = {
    url,
    secret_token: BOT_WEBHOOK_SECRET,
    drop_pending_updates: false,
    allowed_updates: ['message'],
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    const reason = json.description || `HTTP ${res.status}`;
    throw new Error(`setWebhook failed: ${reason}`);
  }

  return json;
}

async function getWebhookInfo() {
  const endpoint = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;
  const res = await fetch(endpoint);
  const json = await res.json();
  if (!res.ok || !json.ok) {
    const reason = json.description || `HTTP ${res.status}`;
    throw new Error(`getWebhookInfo failed: ${reason}`);
  }
  return json.result;
}

(async () => {
  const primaryWebhook = webhookUrl(PRIMARY_DOMAIN);

  try {
    const setResult = await setWebhook(primaryWebhook);
    const info = await getWebhookInfo();
    console.log(JSON.stringify({ mode: 'primary', setResult, info }, null, 2));
  } catch (primaryError) {
    console.error('[webhook] primary domain failed:', primaryError.message);

    if (!FALLBACK_WEBHOOK_BASE) {
      process.exit(1);
    }

    const fallbackWebhook = webhookUrl(FALLBACK_WEBHOOK_BASE);
    const setResult = await setWebhook(fallbackWebhook);
    const info = await getWebhookInfo();
    console.log(JSON.stringify({ mode: 'fallback', setResult, info }, null, 2));
  }
})();
