'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { sendSchemeTelegramAlert } from '@/lib/schemes/alerts';
import { requireOperator } from '@/app/admin/lib/auth-guard';

const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function overrideScheme(formData: FormData) {
  const operator = await requireOperator();
  const tenantId = String(formData.get('tenant_id') || '');
  const reason = String(formData.get('reason') || '').trim() || 'Operator safety override';

  if (!tenantId) throw new Error('Missing tenant_id');

  const { data: existing } = await db.from('referral_schemes').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (!existing) throw new Error('Scheme not found');

  const { error } = await db
    .from('referral_schemes')
    .update({ is_active: false })
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message);

  const newValues = { ...existing, is_active: false };

  await db.rpc('insert_scheme_audit', {
    p_tenant_id: tenantId,
    p_actor_email: operator.email,
    p_action: 'override_disable',
    p_old_values: existing,
    p_new_values: newValues,
    p_reason: reason,
  });

  const { data: tenant } = await db.from('tenants').select('name').eq('id', tenantId).single();
  await sendSchemeTelegramAlert({
    tenantName: tenant?.name || tenantId,
    message: `Scheme was disabled by operator (${operator.email}). Reason: ${reason}`,
  });

  revalidatePath('/admin/schemes');
}
