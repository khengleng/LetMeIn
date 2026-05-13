import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const apiKey = req.headers.get('x-letmein-api-key');
  if (!apiKey || apiKey !== process.env.TENANT_INTEGRATION_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const code = String(body?.code || '').trim().toUpperCase();
  const tenantId = String(body?.tenant_id || '');

  if (!/^[A-Z0-9]{8,12}$/.test(code) || !tenantId) {
    return NextResponse.json({ valid: false, reason: 'invalid_format' }, { status: 400 });
  }

  const { data: discount } = await db
    .from('discounts')
    .select('id,type,value,used,expires_at,tenant_id')
    .eq('code', code)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!discount) return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 404 });
  if (discount.used) return NextResponse.json({ valid: false, reason: 'used' }, { status: 409 });
  if (new Date(discount.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ valid: false, reason: 'expired' }, { status: 409 });
  }

  await db.from('discounts').update({ used: true, used_at: new Date().toISOString() }).eq('id', discount.id);

  return NextResponse.json({ valid: true, value: Number(discount.value), type: discount.type });
}
