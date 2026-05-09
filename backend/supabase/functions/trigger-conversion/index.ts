import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Payload = {
  tenant_id: string;
  referral_id: string;
  event_type: 'signup' | 'first_purchase' | 'deposit';
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function genCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function telegramSend(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: 'missing_env' });

  const body = (await req.json().catch(() => null)) as Payload | null;
  if (!body?.tenant_id || !body?.referral_id || !body?.event_type) return json(400, { error: 'invalid_payload' });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .select('id,commission_type,commission_value,discount_type,discount_value')
    .eq('id', body.tenant_id)
    .single();

  if (tenantError || !tenant) return json(404, { error: 'tenant_not_found' });

  const { data: referral, error: referralError } = await db
    .from('referrals')
    .select('id,tenant_id,referrer_code,referrer_telegram_id,referee_telegram_id,occurred_at')
    .eq('id', body.referral_id)
    .eq('tenant_id', body.tenant_id)
    .single();

  if (referralError || !referral) return json(404, { error: 'referral_not_found' });

  if (referral.referrer_telegram_id && referral.referrer_telegram_id === referral.referee_telegram_id) {
    return json(409, { error: 'self_referral_blocked' });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentCommissions } = await db
    .from('commissions')
    .select('id,created_at,referral_id')
    .eq('tenant_id', body.tenant_id)
    .gte('created_at', thirtyDaysAgo);

  if ((recentCommissions || []).some((c) => c.referral_id === referral.id)) {
    return json(409, { error: 'commission_rate_limited' });
  }

  const baseAmount = body.event_type === 'first_purchase' ? 100 : 50;
  const commissionAmount = tenant.commission_type === 'percent'
    ? Number((baseAmount * Number(tenant.commission_value) / 100).toFixed(2))
    : Number(Number(tenant.commission_value).toFixed(2));

  const code = genCode();

  const { data: discount, error: discountError } = await db.from('discounts').insert({
    tenant_id: body.tenant_id,
    referral_id: referral.id,
    code,
    type: tenant.discount_type,
    value: Number(tenant.discount_value),
    used: false,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).select('id,code,type,value').single();

  if (discountError) return json(500, { error: 'discount_insert_failed', details: discountError.message });

  const { data: commission, error: commissionError } = await db.from('commissions').insert({
    tenant_id: body.tenant_id,
    referral_id: referral.id,
    amount: commissionAmount,
    currency: 'USD',
    status: 'pending',
  }).select('id,amount,status').single();

  if (commissionError) return json(500, { error: 'commission_insert_failed', details: commissionError.message });

  await db.from('referrals').update({ converted_at: new Date().toISOString() }).eq('id', referral.id);

  if (referral.referrer_telegram_id) {
    await telegramSend(
      referral.referrer_telegram_id,
      `🎉 Your friend converted! You earned $${Number(commission.amount).toFixed(2)}. Type /payout to claim.`,
    );
  }

  if (referral.referee_telegram_id) {
    const discountLabel = discount.type === 'fixed' ? `$${Number(discount.value).toFixed(2)} off` : `${Number(discount.value).toFixed(2)}% off`;
    await telegramSend(
      referral.referee_telegram_id,
      `🎁 Welcome! Use code ${discount.code} for ${discountLabel} your first order.`,
    );
  }

  return json(200, {
    ok: true,
    commission,
    discount,
  });
});
