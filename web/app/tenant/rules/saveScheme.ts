'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type SchemeInput = {
  commission_type: 'percent' | 'fixed';
  commission_value: number;
  discount_type: 'percent' | 'fixed' | 'free_shipping';
  discount_value: number;
  conversion_event: 'signup' | 'first_purchase' | 'deposit';
  min_purchase_amount: number;
  max_commissions_per_month: number;
  is_active: boolean;
};

function validate(input: SchemeInput) {
  if (!['percent', 'fixed'].includes(input.commission_type)) throw new Error('Invalid commission type');
  if (!['percent', 'fixed', 'free_shipping'].includes(input.discount_type)) throw new Error('Invalid discount type');
  if (!['signup', 'first_purchase', 'deposit'].includes(input.conversion_event)) throw new Error('Invalid conversion event');
  if (input.commission_type === 'percent' && (input.commission_value < 0 || input.commission_value > 100)) throw new Error('Commission percent must be 0..100');
  if (input.commission_type === 'fixed' && (input.commission_value < 0 || input.commission_value > 1000)) throw new Error('Commission fixed must be 0..1000');
  if (input.discount_type === 'percent' && (input.discount_value < 0 || input.discount_value > 100)) throw new Error('Discount percent must be 0..100');
  if (input.discount_type === 'fixed' && (input.discount_value < 0 || input.discount_value > 500)) throw new Error('Discount fixed must be 0..500');
  if (input.discount_type === 'free_shipping' && input.discount_value !== 0) throw new Error('Free shipping discount value must be 0');
  if (input.min_purchase_amount < 0) throw new Error('Min purchase must be >= 0');
  if (input.max_commissions_per_month < 1 || input.max_commissions_per_month > 500) throw new Error('Monthly cap must be 1..500');
}

async function getTenantContext() {
  const authHeader = process.env.TENANT_SERVER_AUTH_JWT || '';
  if (!authHeader) throw new Error('Missing TENANT_SERVER_AUTH_JWT');

  const anon = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${authHeader}` } },
  });

  const { data, error } = await anon.auth.getUser();
  if (error || !data.user?.id || !data.user.email) throw new Error('Tenant authentication required');

  const { data: tenant } = await db.from('tenants').select('id,name').eq('id', data.user.id).single();
  if (!tenant) throw new Error('Tenant context not found');

  return { tenantId: tenant.id as string, actorEmail: data.user.email.toLowerCase(), tenantName: tenant.name as string };
}

export async function saveScheme(formData: FormData) {
  const { tenantId, actorEmail } = await getTenantContext();

  const input: SchemeInput = {
    commission_type: String(formData.get('commission_type') || 'percent') as SchemeInput['commission_type'],
    commission_value: Number(formData.get('commission_value') || 0),
    discount_type: String(formData.get('discount_type') || 'percent') as SchemeInput['discount_type'],
    discount_value: Number(formData.get('discount_value') || 0),
    conversion_event: String(formData.get('conversion_event') || 'first_purchase') as SchemeInput['conversion_event'],
    min_purchase_amount: Number(formData.get('min_purchase_amount') || 0),
    max_commissions_per_month: Number(formData.get('max_commissions_per_month') || 50),
    is_active: String(formData.get('is_active') || 'true') === 'true',
  };

  validate(input);

  const { data: allowed, error: allowedError } = await db.rpc('can_update_scheme_now', { p_tenant_id: tenantId });
  if (allowedError) throw new Error(allowedError.message);
  if (!allowed) throw new Error('Rate limit exceeded: max 3 changes per hour');

  const { data: existing } = await db.from('referral_schemes').select('*').eq('tenant_id', tenantId).maybeSingle();

  const payload = {
    tenant_id: tenantId,
    ...input,
    commission_value: input.commission_value.toFixed(2),
    discount_value: input.discount_value.toFixed(2),
    min_purchase_amount: input.min_purchase_amount.toFixed(2),
  };

  const { error } = await db.from('referral_schemes').upsert(payload, { onConflict: 'tenant_id' });
  if (error) throw new Error(error.message);

  await db.rpc('insert_scheme_audit', {
    p_tenant_id: tenantId,
    p_actor_email: actorEmail,
    p_action: existing ? 'update' : 'create',
    p_old_values: existing || {},
    p_new_values: payload,
    p_reason: null,
  });

  revalidatePath('/tenant/rules');
  return { ok: true };
}
