'use server';

import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getMerchantContext() {
  const authJwt = process.env.MERCHANT_SERVER_AUTH_JWT || '';
  if (!authJwt) throw new Error('Missing MERCHANT_SERVER_AUTH_JWT');

  const anon = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${authJwt}` } },
  });

  const { data, error } = await anon.auth.getUser();
  if (error || !data.user?.id) throw new Error('Merchant session required');

  return {
    merchantId: data.user.id,
    merchantEmail: data.user.email?.toLowerCase() || 'merchant@unknown',
  };
}

export async function verifyBadgeToken(formData: FormData) {
  const { merchantId } = await getMerchantContext();
  const rawToken = String(formData.get('token') || '').trim();
  const staffTelegramId = String(formData.get('staff_telegram_id') || '').trim() || null;
  const discountAmountUsd = Number(formData.get('discount_amount_usd') || 0);

  if (!/^[a-f0-9]{32}$/i.test(rawToken)) {
    return { success: false, reason: 'invalid', message: 'Invalid token format' };
  }

  if (!Number.isFinite(discountAmountUsd) || discountAmountUsd < 0) {
    return { success: false, reason: 'invalid', message: 'Invalid discount amount' };
  }

  const { data, error } = await db.rpc('verify_badge_token', {
    p_merchant_id: merchantId,
    p_raw_token: rawToken.toLowerCase(),
    p_staff_telegram_id: staffTelegramId,
    p_discount_amount_usd: discountAmountUsd,
  });

  if (error) {
    console.error('[verifyBadgeToken] rpc error:', error);
    return { success: false, reason: 'error', message: 'Verification failed' };
  }

  return {
    success: !!data?.success,
    reason: data?.reason || null,
    discount: data?.discount || null,
    message: data?.message || (data?.success ? '✅ Applied' : 'Verification failed'),
  };
}
