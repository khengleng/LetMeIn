import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false },
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await db
    .from('tenants')
    .select('id,commission_type,commission_value,discount_type,discount_value')
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(data);
}
