require('dotenv').config();

const { Telegraf } = require('telegraf');
const { createHandlers } = require('./handlers');

const required = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_LOG_REFERRAL_URL',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  botUsername: process.env.TELEGRAM_BOT_USERNAME,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  logReferralUrl: process.env.SUPABASE_LOG_REFERRAL_URL,
  botSupabaseJwt: process.env.BOT_SUPABASE_JWT || '',
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL || '',
  webhookSecretPath: process.env.WEBHOOK_SECRET_PATH || 'telegram-webhook',
  webhookSecretToken: process.env.WEBHOOK_SECRET_TOKEN || '',
  port: Number(process.env.PORT || 3001),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 8000),
  defaultReferralStatus: process.env.DEFAULT_REFERRAL_STATUS || 'pending',
  defaultTenantId: process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000',
};

const bot = new Telegraf(config.botToken, {
  telegram: { webhookReply: true },
});

bot.use(async (ctx, next) => {
  // Edge writes require JWT context compatible with backend RLS checks.
  ctx.state.supabaseJwt = config.botSupabaseJwt;
  await next();
});

const handlers = createHandlers(config);

bot.start(handlers.onStart);
bot.command('mylink', handlers.onMyLink);
bot.command('status', handlers.onStatus);
bot.command('help', handlers.onHelp);

bot.catch(async (err, ctx) => {
  console.error('[bot.catch] error:', err);
  try {
    await ctx.reply('Something went wrong. Please try again shortly.');
  } catch (replyErr) {
    console.error('[bot.catch] reply error:', replyErr);
  }
});

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!config.webhookBaseUrl) {
      throw new Error('WEBHOOK_BASE_URL is required in production mode');
    }
    if (!config.webhookSecretToken) {
      throw new Error('WEBHOOK_SECRET_TOKEN is required in production mode');
    }

    const domain = config.webhookBaseUrl;
    const hookPath = `/telegraf/${config.webhookSecretPath}`;

    await bot.telegram.setWebhook(`${domain}${hookPath}`, {
      secret_token: config.webhookSecretToken,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    });

    bot.startWebhook(hookPath, null, config.port, config.webhookSecretToken);
    console.log(`[bot] webhook listening on port ${config.port}, path ${hookPath}`);
    return;
  }

  await bot.launch({ dropPendingUpdates: false });
  console.log('[bot] polling mode enabled for development');
}

bootstrap().catch((err) => {
  console.error('[bootstrap] fatal error:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
