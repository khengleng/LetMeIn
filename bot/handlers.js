const { createClient } = require('@supabase/supabase-js');

const HELP_TEXT = [
  'LetMeIn Bot Help',
  '',
  'EN:',
  '/start [ref_payload] - Join and optionally log a referral',
  '/mylink - Get your personal referral link',
  '/status - View your referral count and reward status',
  '/help - Show this message',
  '',
  'KH:',
  '/start [ref_payload] - ចូលប្រើ និងកត់ត្រាការណែនាំ (ប្រសិនបើមាន)',
  '/mylink - ទទួលបានតំណណែនាំផ្ទាល់ខ្លួន',
  '/status - មើលចំនួន referral និងស្ថានភាពរង្វាន់',
  '/help - បង្ហាញសារជំនួយនេះ',
].join('\n');

function createHandlers(config) {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
  });

  function buildDeepLink(tenantId, referrerCode) {
    return `https://t.me/${config.botUsername}?start=ref_${tenantId}_${referrerCode}`;
  }

  function parseStartPayload(text) {
    const parts = text.trim().split(/\s+/);
    const payload = parts[1] || '';

    if (!payload) {
      return { hasPayload: false };
    }

    const match = /^ref_([A-Za-z0-9-]{3,64})_([A-Za-z0-9_-]{2,64})$/.exec(payload);
    if (!match) {
      return { hasPayload: true, valid: false };
    }

    return {
      hasPayload: true,
      valid: true,
      tenantId: match[1],
      referrerCode: match[2],
    };
  }

  async function withTimeout(promise, timeoutMs) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async function logReferralViaEdge({ tenantId, referrerCode, refereeTelegramId, jwt }) {
    const nowIso = new Date().toISOString();
    const pseudoPhone = `tg:${refereeTelegramId}`;

    const res = await withTimeout(
      fetch(config.logReferralUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          referrer_code: referrerCode,
          referee_phone: pseudoPhone,
          timestamp: nowIso,
          source: 'telegram',
          metadata: { referee_telegram_id: String(refereeTelegramId) },
        }),
      }),
      config.requestTimeoutMs,
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = typeof data.error === 'string' ? data.error : 'Failed to log referral';
      throw new Error(message);
    }

    return data;
  }

  async function getUserStatus(telegramId) {
    const telegramSource = `telegram:${telegramId}`;
    const { count, error } = await withTimeout(
      supabase
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'telegram')
        .contains('metadata', { referee_telegram_id: String(telegramId) }),
      config.requestTimeoutMs,
    );

    if (error) {
      throw error;
    }

    return {
      referralCount: count || 0,
      rewardStatus: config.defaultReferralStatus,
      trace: telegramSource,
    };
  }

  async function onStart(ctx) {
    try {
      const messageText = ctx.message?.text || '/start';
      const parsed = parseStartPayload(messageText);
      const telegramId = ctx.from?.id;

      if (!telegramId) {
        await ctx.reply('Unable to identify your Telegram account. Please try again.');
        return;
      }

      if (!parsed.hasPayload) {
        await ctx.reply('Welcome to LetMeIn. Use /help to see available commands.');
        return;
      }

      if (!parsed.valid) {
        await ctx.reply('Invalid referral link format. Please use a valid referral link.');
        return;
      }

      const jwt = ctx.state?.supabaseJwt;
      if (!jwt) {
        await ctx.reply('Session is missing authorization context. Please retry shortly.');
        return;
      }

      await logReferralViaEdge({
        tenantId: parsed.tenantId,
        referrerCode: parsed.referrerCode,
        refereeTelegramId: telegramId,
        jwt,
      });

      await ctx.reply('Referral recorded successfully. Thank you.');
    } catch (error) {
      console.error('[start] error:', error);
      await ctx.reply('We could not record your referral right now. Please try again later.');
    }
  }

  async function onMyLink(ctx) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) {
        await ctx.reply('Unable to identify your Telegram account.');
        return;
      }

      const tenantId = config.defaultTenantId;
      const referrerCode = `u${telegramId}`;
      const link = buildDeepLink(tenantId, referrerCode);
      await ctx.reply(`Your referral link:\n${link}`);
    } catch (error) {
      console.error('[mylink] error:', error);
      await ctx.reply('Failed to generate your link. Please try again later.');
    }
  }

  async function onStatus(ctx) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) {
        await ctx.reply('Unable to identify your Telegram account.');
        return;
      }

      const status = await getUserStatus(telegramId);
      await ctx.reply(
        [
          'Your Status',
          `Referrals: ${status.referralCount}`,
          `Reward: ${status.rewardStatus}`,
        ].join('\n'),
      );
    } catch (error) {
      console.error('[status] error:', error);
      await ctx.reply('Could not fetch your status at the moment. Please try again later.');
    }
  }

  async function onHelp(ctx) {
    await ctx.reply(HELP_TEXT);
  }

  return {
    onStart,
    onMyLink,
    onStatus,
    onHelp,
  };
}

module.exports = {
  createHandlers,
};
