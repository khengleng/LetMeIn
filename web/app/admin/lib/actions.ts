'use server';

import { revalidatePath } from 'next/cache';
import { getAdminSupabase } from './admin-supabase';
import { requireOperator } from './auth-guard';

async function insertAuditLog(params: {
  operatorEmail: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown>;
}) {
  const adminSupabase = getAdminSupabase();
  await adminSupabase.from('audit_logs').insert({
    operator_email: params.operatorEmail,
    action_type: params.actionType,
    target_type: params.targetType,
    target_id: params.targetId,
    payload: params.payload,
  });
}

export async function updateTenantStatus(formData: FormData) {
  const adminSupabase = getAdminSupabase();
  const { email } = await requireOperator();
  const tenantId = String(formData.get('tenant_id') || '');
  const status = String(formData.get('status') || '');

  if (!tenantId || !['trial', 'active', 'suspended', 'cancelled'].includes(status)) {
    throw new Error('Invalid tenant status update payload');
  }

  const { error } = await adminSupabase.from('tenants').update({ status }).eq('id', tenantId);
  if (error) throw new Error(error.message);

  await insertAuditLog({ operatorEmail: email, actionType: 'tenant_status_updated', targetType: 'tenant', targetId: tenantId, payload: { status } });

  revalidatePath('/admin');
  revalidatePath('/admin/tenants');
  revalidatePath('/admin/billing');
}

export async function updateCommissionRules(formData: FormData) {
  const adminSupabase = getAdminSupabase();
  const { email } = await requireOperator();
  const tenantId = String(formData.get('tenant_id') || '');
  const commissionType = String(formData.get('commission_type') || 'percent');
  const commissionValue = Number(formData.get('commission_value') || 0);
  const discountType = String(formData.get('discount_type') || 'percent');
  const discountValue = Number(formData.get('discount_value') || 0);

  if (!tenantId || !['percent', 'fixed'].includes(commissionType) || !['percent', 'fixed'].includes(discountType)) {
    throw new Error('Invalid rules payload');
  }
  if (!Number.isFinite(commissionValue) || !Number.isFinite(discountValue) || commissionValue < 0 || discountValue < 0) {
    throw new Error('Invalid numeric values');
  }

  const { error } = await adminSupabase.from('tenants').update({
    commission_type: commissionType,
    commission_value: commissionValue.toFixed(2),
    discount_type: discountType,
    discount_value: discountValue.toFixed(2),
  }).eq('id', tenantId);

  if (error) throw new Error(error.message);

  await insertAuditLog({
    operatorEmail: email,
    actionType: 'commission_rules_updated',
    targetType: 'tenant',
    targetId: tenantId,
    payload: { commissionType, commissionValue, discountType, discountValue },
  });

  revalidatePath('/admin/rules');
}

export async function markCommissionPaid(formData: FormData) {
  const adminSupabase = getAdminSupabase();
  const { email } = await requireOperator();
  const commissionId = String(formData.get('commission_id') || '');
  const khqrReference = String(formData.get('khqr_reference') || '').trim();

  if (!commissionId || !khqrReference) throw new Error('Missing commission_id or khqr_reference');

  const { data: commission, error } = await adminSupabase
    .from('commissions')
    .update({ status: 'paid', khqr_reference: khqrReference, paid_at: new Date().toISOString() })
    .eq('id', commissionId)
    .eq('status', 'pending')
    .select('id,tenant_id,amount')
    .maybeSingle();

  if (error || !commission) throw new Error('Unable to update commission');

  await adminSupabase.rpc('touch_commission_pool', { p_tenant_id: commission.tenant_id, p_delta: -Number(commission.amount) });

  await insertAuditLog({
    operatorEmail: email,
    actionType: 'commission_marked_paid',
    targetType: 'commission',
    targetId: commission.id,
    payload: { khqrReference, amount: commission.amount },
  });

  revalidatePath('/admin/payout-queue');
  revalidatePath('/admin');
}

export async function recordManualPayment(formData: FormData) {
  const adminSupabase = getAdminSupabase();
  const { email } = await requireOperator();
  const tenantId = String(formData.get('tenant_id') || '');
  const amountUsd = Number(formData.get('amount_usd'));
  const billingMonth = String(formData.get('billing_month') || '');
  const method = String(formData.get('method') || 'khqr');
  const referenceCode = String(formData.get('reference_code') || '').trim() || null;
  const notes = String(formData.get('notes') || '').trim() || null;

  if (!tenantId || !billingMonth || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error('Invalid payment payload');
  }

  const { error } = await adminSupabase.from('billing_payments').upsert(
    {
      tenant_id: tenantId,
      billing_month: billingMonth,
      amount_usd: amountUsd.toFixed(2),
      currency: 'USD',
      method,
      status: 'confirmed',
      paid_at: new Date().toISOString(),
      reference_code: referenceCode,
      notes,
    },
    { onConflict: 'tenant_id,billing_month' },
  );
  if (error) throw new Error(error.message);

  await adminSupabase.rpc('refresh_tenant_access_status', { p_tenant_id: tenantId });
  await adminSupabase.rpc('touch_commission_pool', { p_tenant_id: tenantId, p_delta: amountUsd });

  await insertAuditLog({
    operatorEmail: email,
    actionType: 'manual_payment_recorded',
    targetType: 'tenant',
    targetId: tenantId,
    payload: { amount_usd: amountUsd, billing_month: billingMonth, method },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/tenants');
  revalidatePath('/admin/billing');
}

export async function exportBillingCsv() {
  const adminSupabase = getAdminSupabase();
  await requireOperator();
  const { data, error } = await adminSupabase
    .from('billing_payments')
    .select('tenant_id,billing_month,amount_usd,currency,method,status,paid_at,reference_code,notes,created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const header = ['tenant_id', 'billing_month', 'amount_usd', 'currency', 'method', 'status', 'paid_at', 'reference_code', 'notes', 'created_at'];
  const rows = (data || []).map((r) =>
    [
      r.tenant_id,
      r.billing_month,
      r.amount_usd,
      r.currency,
      r.method,
      r.status,
      r.paid_at || '',
      r.reference_code || '',
      (r.notes || '').replaceAll(',', ' '),
      r.created_at,
    ].join(','),
  );

  return [header.join(','), ...rows].join('\n');
}
