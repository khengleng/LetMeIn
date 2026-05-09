import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-letmein-api-key');
  if (!apiKey || apiKey !== process.env.TENANT_INTEGRATION_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const referralId = String(body?.referral_id || '');
  const khqr = String(body?.khqr_number || '').trim();

  if (!referralId || !/^\+?[0-9]{8,20}$/.test(khqr)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const { data: commission } = await db
    .from('commissions')
    .select('id,tenant_id,referral_id,status')
    .eq('referral_id', referralId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!commission) return NextResponse.json({ error: 'commission_not_found' }, { status: 404 });

  const { data: referral } = await db
    .from('referrals')
    .select('referrer_telegram_id')
    .eq('id', referralId)
    .single();

  await db.from('payout_requests').insert({
    tenant_id: commission.tenant_id,
    referral_id: commission.referral_id,
    commission_id: commission.id,
    referrer_telegram_id: referral?.referrer_telegram_id || 'unknown',
    khqr_number: khqr,
    status: 'submitted',
  });

  return NextResponse.json({ ok: true });
}
