require('dotenv').config();

const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_BOT_TOKEN;
const baseUrl = process.env.WEBHOOK_BASE_URL;
const secretPath = process.env.WEBHOOK_SECRET_PATH || 'telegram-webhook';
const secretToken = process.env.WEBHOOK_SECRET_TOKEN || '';

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN');
}

const bot = new Telegraf(token);

async function setWebhook() {
  if (!baseUrl) {
    throw new Error('Missing WEBHOOK_BASE_URL');
  }
  if (!secretToken) {
    throw new Error('Missing WEBHOOK_SECRET_TOKEN');
  }

  const url = `${baseUrl}/telegraf/${secretPath}`;
  const result = await bot.telegram.setWebhook(url, {
    secret_token: secretToken,
    allowed_updates: ['message'],
  });

  console.log(JSON.stringify({ action: 'setWebhook', ok: result, url }, null, 2));
}

async function deleteWebhook() {
  const result = await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  console.log(JSON.stringify({ action: 'deleteWebhook', ok: result }, null, 2));
}

async function health() {
  const [me, webhookInfo] = await Promise.all([
    bot.telegram.getMe(),
    bot.telegram.getWebhookInfo(),
  ]);

  console.log(
    JSON.stringify(
      {
        action: 'health',
        bot: { id: me.id, username: me.username, can_join_groups: me.can_join_groups },
        webhook: webhookInfo,
      },
      null,
      2,
    ),
  );
}

const cmd = process.argv[2];

(async () => {
  if (cmd === 'set') {
    await setWebhook();
    return;
  }

  if (cmd === 'delete') {
    await deleteWebhook();
    return;
  }

  if (cmd === 'health') {
    await health();
    return;
  }

  console.log('Usage: node webhook.js [set|delete|health]');
})().catch((err) => {
  console.error('[webhook] error:', err);
  process.exit(1);
});
