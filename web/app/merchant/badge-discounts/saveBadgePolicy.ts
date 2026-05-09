'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type TierDiscountMap = Record<string, number>;

function validateTierDiscounts(input: TierDiscountMap) {
  const keys = Object.keys(input);
  if (keys.length === 0) throw new Error('At least one tier discount is required');

  for (const key of keys) {
    if (!/^[0-9a-f-]{36}$/i.test(key)) throw new Error('Invalid tier id in discount map');
    const val = Number(input[key]);
    if (!Number.isFinite(val) || val < 5 || val > 50) {
      throw new Error('Each tier discount must be between 5 and 50 percent');
    }
  }
}

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

export async function saveBadgePolicy(formData: FormData) {
  const { merchantId, merchantEmail } = await getMerchantContext();

  const isActive = String(formData.get('is_active') || 'true') === 'true';
  const dailyLimitPerDonor = Number(formData.get('daily_limit_per_donor') || 1);
  const monthlyBudgetUsd = Number(formData.get('monthly_budget_usd') || 0);
  const charityWhitelistRaw = String(formData.get('charity_whitelist') || '').trim();
  const tierDiscountsRaw = String(formData.get('tier_discounts') || '{}').trim();

  if (!Number.isInteger(dailyLimitPerDonor) || dailyLimitPerDonor < 1 || dailyLimitPerDonor > 3) {
    throw new Error('Daily limit must be between 1 and 3');
  }

  if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 0) {
    throw new Error('Monthly budget must be >= 0');
  }

  let tierDiscounts: TierDiscountMap;
  try {
    tierDiscounts = JSON.parse(tierDiscountsRaw);
  } catch {
    throw new Error('tier_discounts must be valid JSON');
  }
  validateTierDiscounts(tierDiscounts);

  const charityWhitelist = charityWhitelistRaw
    ? charityWhitelistRaw.split(',').map((v) => v.trim()).filter((v) => /^[0-9a-f-]{36}$/i.test(v))
    : [];

  const { data: existing } = await db
    .from('merchant_badge_policies')
    .select('*')
    .eq('merchant_id', merchantId)
    .maybeSingle();

  const payload = {
    merchant_id: merchantId,
    is_active: isActive,
    tier_discounts: tierDiscounts,
    daily_limit_per_donor: dailyLimitPerDonor,
    monthly_budget_usd: monthlyBudgetUsd.toFixed(2),
    charity_whitelist: charityWhitelist,
  };

  const { error } = await db.from('merchant_badge_policies').upsert(payload, { onConflict: 'merchant_id' });
  if (error) throw new Error(error.message);

  await db.from('badge_policy_audit_logs').insert({
    merchant_id: merchantId,
    actor_email: merchantEmail,
    action: existing ? 'update' : 'create',
    old_values: existing || {},
    new_values: payload,
  });

  revalidatePath('/merchant/badge-discounts');
  return { ok: true };
}
