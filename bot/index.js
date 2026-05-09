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
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
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

const bot = new Telegraf(config.botToken, { telegram: { webhookReply: true } });
const payoutState = new Map();

bot.use(async (ctx, next) => {
  ctx.state.supabaseJwt = config.botSupabaseJwt;
  ctx.state.pendingPayout = payoutState.get(String(ctx.from?.id || '')) || null;
  await next();
  if (ctx.state.pendingPayout) payoutState.set(String(ctx.from?.id || ''), ctx.state.pendingPayout);
});

const handlers = createHandlers(config);
bot.start(handlers.onStart);
bot.command('mylink', handlers.onMyLink);
bot.command('status', handlers.onStatus);
bot.command('help', handlers.onHelp);
bot.command('earnings', handlers.onEarnings);
bot.command('discount', handlers.onDiscount);
bot.command('payout', handlers.onPayout);
bot.command('pay', handlers.onPay);
bot.command('staffauth', handlers.onStaffAuth);
bot.command('stamps', handlers.onStamps);
bot.command('issuestamp', handlers.onIssueStamp);
bot.command('badge', handlers.onBadge);
bot.command('verifydonate', handlers.onVerifyDonate);

bot.on('text', async (ctx, next) => {
  const text = (ctx.message?.text || '').trim();
  if (text.startsWith('/')) return next();

  const pending = ctx.state.pendingPayout;
  if (!pending) return next();

  if (!/^\+?[0-9]{8,20}$/.test(text.replace(/\s+/g, ''))) {
    await ctx.reply('Invalid KHQR number format. Send digits only (8-20 chars).');
    return;
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false } });

  const { error } = await sb.from('payout_requests').insert({
    tenant_id: pending.tenantId,
    referral_id: pending.referralId,
    commission_id: pending.commissionId,
    referrer_telegram_id: pending.telegramId,
    khqr_number: text,
    status: 'submitted',
  });

  if (error) {
    console.error('[payout request] error:', error);
    await ctx.reply('Failed to submit payout request. Try again.');
    return;
  }

  payoutState.delete(String(ctx.from?.id || ''));
  await ctx.reply('Payout request submitted. Tenant will send KHQR payment soon.');
  await next();
});

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
    if (!config.webhookBaseUrl) throw new Error('WEBHOOK_BASE_URL is required in production mode');
    if (!config.webhookSecretToken) throw new Error('WEBHOOK_SECRET_TOKEN is required in production mode');

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
