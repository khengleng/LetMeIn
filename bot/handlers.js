const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const HELP_TEXT = [
  'LetMeIn Bot Commands',
  '/start [ref_payload]',
  '/mylink',
  '/status',
  '/earnings',
  '/discount',
  '/payout',
  '/pay <referral_id> <khqr_ref> (admin)',
  '/staffauth <pin>',
  '/stamps',
  '/badge',
  '/issuestamp <user_telegram_id> [1-3]',
  '/verifydonate <donor_telegram_id> <amount_usd>',
  '/help',
].join('\n');

function createHandlers(config) {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const adminTelegramIds = (process.env.ADMIN_TELEGRAM_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
  const staffTelegramIds = (process.env.STAFF_TELEGRAM_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const staffPinHash = process.env.STAFF_PIN_HASH || '';
  const tenantId = process.env.DEFAULT_TENANT_ID || config.defaultTenantId;
  const staffSessions = new Map();

  function buildDeepLink(tid, referrerCode) {
    return `https://t.me/${config.botUsername}?start=ref_${tid}_${referrerCode}`;
  }

  function parseArgs(ctx) {
    const text = (ctx.message?.text || '').trim();
    return text.split(/\s+/).slice(1);
  }

  function sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  function hasStaffSession(telegramId) {
    const session = staffSessions.get(telegramId);
    return !!session && session.expiresAt > Date.now();
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

  function parseStartPayload(text) {
    const parts = text.trim().split(/\s+/);
    const payload = parts[1] || '';
    if (!payload) return { hasPayload: false };
    const match = /^ref_([A-Za-z0-9-]{3,64})_([A-Za-z0-9_-]{2,64})$/.exec(payload);
    if (!match) return { hasPayload: true, valid: false };
    return { hasPayload: true, valid: true, tenantId: match[1], referrerCode: match[2] };
  }

  async function logReferralViaEdge({ tenantId, referrerCode, refereeTelegramId, jwt }) {
    const nowIso = new Date().toISOString();
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
          referee_phone: `tg:${refereeTelegramId}`,
          referee_telegram_id: String(refereeTelegramId),
          timestamp: nowIso,
          source: 'telegram',
          metadata: { referee_telegram_id: String(refereeTelegramId) },
        }),
      }),
      config.requestTimeoutMs,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to log referral');
    return data;
  }

  async function onStart(ctx) {
    try {
      const messageText = ctx.message?.text || '/start';
      const parsed = parseStartPayload(messageText);
      const telegramId = ctx.from?.id;
      if (!telegramId) return ctx.reply('Unable to identify your Telegram account.');
      if (!parsed.hasPayload) return ctx.reply('Welcome to LetMeIn. Use /help to see commands.');
      if (!parsed.valid) return ctx.reply('Invalid referral link format.');

      const jwt = ctx.state?.supabaseJwt;
      if (!jwt) return ctx.reply('Referral logging unavailable.');

      await logReferralViaEdge({
        tenantId: parsed.tenantId,
        referrerCode: parsed.referrerCode,
        refereeTelegramId: telegramId,
        jwt,
      });

      await ctx.reply('Referral recorded successfully.');
    } catch (error) {
      console.error('[start] error:', error);
      await ctx.reply('Could not record referral right now.');
    }
  }

  async function onMyLink(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.reply('Unable to identify your Telegram account.');
    const referrerCode = `u${telegramId}`;
    await ctx.reply(`Your referral link:\n${buildDeepLink(tenantId, referrerCode)}`);
  }

  async function onStatus(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return ctx.reply('Unable to identify your Telegram account.');

    const { count } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .contains('metadata', { referee_telegram_id: String(telegramId) });

    await ctx.reply(['Your Status', `Referrals: ${count || 0}`, `Reward: ${config.defaultReferralStatus}`].join('\n'));
  }

  async function onEarnings(ctx) {
    const telegramId = String(ctx.from?.id || '');
    if (!telegramId) return ctx.reply('Unable to identify your Telegram account.');

    const { data: refs } = await supabase.from('referrals').select('id').eq('referrer_telegram_id', telegramId).limit(1000);
    const referralIds = (refs || []).map((r) => r.id);
    if (!referralIds.length) return ctx.reply('No commission records yet.');

    const { data: commissions } = await supabase.from('commissions').select('amount,status').in('referral_id', referralIds);
    const pending = (commissions || []).filter((c) => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);
    const paid = (commissions || []).filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0);
    await ctx.reply([`Pending: $${pending.toFixed(2)}`, `Paid: $${paid.toFixed(2)}`, `Total: $${(pending + paid).toFixed(2)}`].join('\n'));
  }

  async function onDiscount(ctx) {
    const telegramId = String(ctx.from?.id || '');
    if (!telegramId) return ctx.reply('Unable to identify your Telegram account.');

    const { data: refs } = await supabase.from('referrals').select('id').eq('referee_telegram_id', telegramId).limit(100);
    const ids = (refs || []).map((r) => r.id);
    if (!ids.length) return ctx.reply('No active discount found.');

    const { data: discount } = await supabase
      .from('discounts')
      .select('code,type,value,expires_at')
      .in('referral_id', ids)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!discount) return ctx.reply('No active discount found.');
    const label = discount.type === 'fixed' ? `$${Number(discount.value).toFixed(2)} off` : `${Number(discount.value).toFixed(2)}% off`;
    await ctx.reply(`Discount: ${discount.code}\n${label}\nExpires: ${new Date(discount.expires_at).toLocaleString()}`);
  }

  async function onPayout(ctx) {
    const telegramId = String(ctx.from?.id || '');
    if (!telegramId) return ctx.reply('Unable to identify your Telegram account.');
    await ctx.reply('Send your KHQR number to receive pending commission.');
    ctx.state.awaitingKhqr = true;
  }

  async function onPay(ctx) {
    const telegramId = String(ctx.from?.id || '');
    if (!adminTelegramIds.includes(telegramId)) return ctx.reply('Unauthorized.');

    const [referralId, khqrRef] = parseArgs(ctx);
    if (!referralId || !khqrRef) return ctx.reply('Usage: /pay <referral_id> <khqr_reference>');

    const { data: comm } = await supabase
      .from('commissions')
      .update({ status: 'paid', khqr_reference: khqrRef, paid_at: new Date().toISOString() })
      .eq('referral_id', referralId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (!comm) return ctx.reply('Unable to mark as paid.');
    await ctx.reply('Commission marked as paid.');
  }

  async function onStaffAuth(ctx) {
    const telegramId = String(ctx.from?.id || '');
    if (!staffTelegramIds.includes(telegramId)) return ctx.reply('You are not allowlisted staff.');

    const [pin] = parseArgs(ctx);
    if (!pin) return ctx.reply('Usage: /staffauth <pin>');
    if (!staffPinHash) return ctx.reply('Staff PIN auth is not configured.');

    if (sha256(pin) !== staffPinHash) return ctx.reply('Invalid PIN.');

    staffSessions.set(telegramId, { expiresAt: Date.now() + 30 * 60 * 1000 });
    await ctx.reply('Staff session active for 30 minutes.');
  }

  async function onStamps(ctx) {
    const telegramId = String(ctx.from?.id || '');
    if (!telegramId) return ctx.reply('Unable to identify your Telegram account.');

    const { data: card } = await supabase
      .from('loyalty_cards')
      .select('id,current_stamps,max_stamps,reward_description,claimed_count')
      .eq('tenant_id', tenantId)
      .eq('user_telegram_id', telegramId)
      .maybeSingle();

    if (!card) return ctx.reply('No active stamp card yet.');

    const progress = `${card.current_stamps}/${card.max_stamps}`;
    await ctx.reply([
      'Digital Stamp Card',
      `Progress: ${progress}`,
      `Reward: ${card.reward_description}`,
      `Claims: ${card.claimed_count}`,
    ].join('\n'));
  }

  async function onIssueStamp(ctx) {
    const staffId = String(ctx.from?.id || '');
    if (!staffTelegramIds.includes(staffId)) return ctx.reply('Staff access required.');
    if (!hasStaffSession(staffId)) return ctx.reply('Staff session expired. Run /staffauth <pin>.');

    const [userTelegramIdArg, stampsArg] = parseArgs(ctx);
    const userTelegramId = String(userTelegramIdArg || '').trim();
    const stampsAdded = Number(stampsArg || 1);

    if (!/^\d+$/.test(userTelegramId)) return ctx.reply('Usage: /issuestamp <user_telegram_id> [1-3]');
    if (!Number.isInteger(stampsAdded) || stampsAdded < 1 || stampsAdded > 3) return ctx.reply('stamps must be 1..3');

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('loyalty_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_telegram_id', userTelegramId)
      .eq('action', 'issue')
      .gte('created_at', dayStart.toISOString());

    if ((count || 0) >= 5) return ctx.reply('Daily stamp limit reached for this user (5/day).');

    const { data: existing } = await supabase
      .from('loyalty_cards')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_telegram_id', userTelegramId)
      .maybeSingle();

    const maxStamps = existing?.max_stamps || 10;
    const rewardDescription = existing?.reward_description || 'Reward available';
    let currentStamps = existing?.current_stamps || 0;
    let claimedCount = existing?.claimed_count || 0;

    currentStamps += stampsAdded;

    if (!existing) {
      const { data: created } = await supabase.from('loyalty_cards').insert({
        tenant_id: tenantId,
        user_telegram_id: userTelegramId,
        max_stamps: 10,
        current_stamps: 0,
        reward_description: rewardDescription,
      }).select('*').single();
      existing && created;
    }

    const completed = currentStamps >= maxStamps;

    if (completed) {
      claimedCount += 1;
      await supabase.from('loyalty_cards').update({
        current_stamps: 0,
        claimed_count: claimedCount,
        last_claimed_at: new Date().toISOString(),
      }).eq('tenant_id', tenantId).eq('user_telegram_id', userTelegramId);

      await supabase.from('loyalty_transactions').insert({
        card_id: existing?.id,
        tenant_id: tenantId,
        user_telegram_id: userTelegramId,
        staff_telegram_id: staffId,
        action: 'claim',
        stamps_added: 1,
        note: 'Auto claim on completion',
      });

      await ctx.telegram.sendMessage(userTelegramId, `🎉 Stamp card complete! Reward unlocked: ${rewardDescription}`);
      await ctx.reply('Stamp issued and reward claim triggered.');
    } else {
      await supabase.from('loyalty_cards').update({ current_stamps: currentStamps }).eq('tenant_id', tenantId).eq('user_telegram_id', userTelegramId);
      await ctx.reply(`Stamp issued. Progress: ${currentStamps}/${maxStamps}`);
    }

    await supabase.from('loyalty_transactions').insert({
      card_id: existing?.id,
      tenant_id: tenantId,
      user_telegram_id: userTelegramId,
      staff_telegram_id: staffId,
      action: 'issue',
      stamps_added: stampsAdded,
      note: 'Issued via /issuestamp',
    });
  }

  async function onBadge(ctx) {
    const donorId = String(ctx.from?.id || '');
    if (!donorId) return ctx.reply('Unable to identify your Telegram account.');

    const { data: badge } = await supabase
      .from('donor_badges')
      .select('id,total_verified_value,badge_link,current_tier_id')
      .eq('tenant_id', tenantId)
      .eq('donor_telegram_id', donorId)
      .maybeSingle();

    if (!badge) return ctx.reply('No badge profile yet.');

    let tierName = 'Explorer';
    if (badge.current_tier_id) {
      const { data: tier } = await supabase.from('badge_tiers').select('tier_name').eq('id', badge.current_tier_id).maybeSingle();
      tierName = tier?.tier_name || tierName;
    }

    const { data: nextTier } = await supabase
      .from('badge_tiers')
      .select('tier_name,min_verified_value')
      .eq('tenant_id', tenantId)
      .gt('min_verified_value', badge.total_verified_value)
      .order('min_verified_value', { ascending: true })
      .limit(1)
      .maybeSingle();

    const nextMsg = nextTier ? `${nextTier.tier_name} at $${Number(nextTier.min_verified_value).toFixed(2)}` : 'You are at top tier';

    await ctx.reply([
      `Tier: ${tierName}`,
      `Total verified: $${Number(badge.total_verified_value).toFixed(2)}`,
      `Badge link: ${badge.badge_link || 'N/A'}`,
      `Next: ${nextMsg}`,
      'Badges are recognition tokens, not tax receipts or financial instruments.',
    ].join('\n'));
  }

  async function onVerifyDonate(ctx) {
    const staffId = String(ctx.from?.id || '');
    if (!staffTelegramIds.includes(staffId)) return ctx.reply('Staff access required.');
    if (!hasStaffSession(staffId)) return ctx.reply('Staff session expired. Run /staffauth <pin>.');

    const [donorId, amountArg] = parseArgs(ctx);
    const amount = Number(amountArg);

    if (!/^\d+$/.test(String(donorId || '')) || !Number.isFinite(amount) || amount <= 0) {
      return ctx.reply('Usage: /verifydonate <donor_telegram_id> <amount_usd>');
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: staffHourlyCount } = await supabase
      .from('donation_verifications')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('staff_telegram_id', staffId)
      .gte('created_at', hourAgo);

    if ((staffHourlyCount || 0) >= 20) return ctx.reply('Rate limit exceeded: 20 donation verifications/hour/staff.');

    await supabase.from('donation_verifications').insert({
      tenant_id: tenantId,
      donor_telegram_id: donorId,
      staff_telegram_id: staffId,
      amount_usd: amount.toFixed(2),
      note: 'Verified via /verifydonate',
    });

    const { data: existing } = await supabase
      .from('donor_badges')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('donor_telegram_id', donorId)
      .maybeSingle();

    const total = Number(existing?.total_verified_value || 0) + amount;

    const { data: targetTier } = await supabase
      .from('badge_tiers')
      .select('id,tier_name,min_verified_value,badge_image_url')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .lte('min_verified_value', total)
      .order('min_verified_value', { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      tenant_id: tenantId,
      donor_telegram_id: donorId,
      total_verified_value: total.toFixed(2),
      current_tier_id: targetTier?.id || null,
      badge_link: targetTier?.badge_image_url || existing?.badge_link || null,
    };

    await supabase.from('donor_badges').upsert(payload, { onConflict: 'tenant_id,donor_telegram_id' });

    if (!existing || existing.current_tier_id !== payload.current_tier_id) {
      await supabase.from('badge_audit_logs').insert({
        tenant_id: tenantId,
        donor_badge_id: existing?.id || null,
        donor_telegram_id: donorId,
        old_tier_id: existing?.current_tier_id || null,
        new_tier_id: payload.current_tier_id,
        old_total_verified_value: existing?.total_verified_value || 0,
        new_total_verified_value: total,
        actor_telegram_id: staffId,
        action: 'tier_upgrade',
        reason: 'Auto tier check on donation verification',
      });

      if (targetTier) {
        await ctx.telegram.sendMessage(String(donorId), `🎉 You unlocked ${targetTier.tier_name}! Badge: ${targetTier.badge_image_url || 'N/A'}`);
      }
    }

    await ctx.reply(`Donation verified: $${amount.toFixed(2)}. Donor total: $${total.toFixed(2)}`);
  }

  async function onHelp(ctx) {
    await ctx.reply(HELP_TEXT);
  }

  return {
    onStart,
    onMyLink,
    onStatus,
    onHelp,
    onEarnings,
    onDiscount,
    onPayout,
    onPay,
    onStaffAuth,
    onStamps,
    onIssueStamp,
    onBadge,
    onVerifyDonate,
  };
}

module.exports = { createHandlers };
