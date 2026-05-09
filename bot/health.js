require('dotenv').config();

const http = require('http');
const { Telegraf } = require('telegraf');
const { createHandlers } = require('./handlers');

const PORT = Number(process.env.PORT || 8080);
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const BOT_WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET_TOKEN;
const WEBHOOK_SECRET_PATH = process.env.WEBHOOK_SECRET_PATH || 'webhook';
const WEBHOOK_QUERY_SECRET = process.env.BOT_WEBHOOK_QUERY_SECRET || BOT_WEBHOOK_SECRET;
const MAX_WEBHOOK_REQ_PER_MIN = Number(process.env.MAX_WEBHOOK_REQ_PER_MIN || 90);

if (!BOT_TOKEN || !BOT_WEBHOOK_SECRET) {
  throw new Error('Missing BOT_TOKEN/TELEGRAM_BOT_TOKEN or BOT_WEBHOOK_SECRET/WEBHOOK_SECRET_TOKEN');
}

const config = {
  botToken: BOT_TOKEN,
  botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  logReferralUrl: process.env.SUPABASE_LOG_REFERRAL_URL,
  botSupabaseJwt: process.env.BOT_SUPABASE_JWT || '',
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 8000),
  defaultReferralStatus: process.env.DEFAULT_REFERRAL_STATUS || 'pending',
  defaultTenantId: process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000',
};

if (!config.supabaseUrl || !config.supabaseAnonKey || !config.logReferralUrl) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_LOG_REFERRAL_URL');
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(async (ctx, next) => {
  ctx.state.supabaseJwt = config.botSupabaseJwt;
  await next();
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

const startedAt = Date.now();
const rateMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const current = rateMap.get(ip);
  if (!current || current.resetAt <= now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  rateMap.set(ip, current);
  return current.count > MAX_WEBHOOK_REQ_PER_MIN;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: Math.floor((Date.now() - startedAt) / 1000) }));
      return;
    }

    if (req.method === 'POST' && url.pathname === `/${WEBHOOK_SECRET_PATH}`) {
      const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
      if (checkRateLimit(ip)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        return;
      }

      const incomingHeaderSecret = req.headers['x-telegram-bot-api-secret-token'];
      if (BOT_WEBHOOK_SECRET && incomingHeaderSecret !== BOT_WEBHOOK_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid webhook header token' }));
        return;
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');

      const update = JSON.parse(body);
      await bot.handleUpdate(update);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error('[bot] webhook server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`[bot] listening on :${PORT}`);
});
