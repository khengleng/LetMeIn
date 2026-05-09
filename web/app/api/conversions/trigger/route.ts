import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-letmein-api-key');
  if (!apiKey || apiKey !== process.env.TENANT_INTEGRATION_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.tenant_id || !body?.referral_id || !body?.event_type) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const endpoint = `${process.env.SUPABASE_URL}/functions/v1/trigger-conversion`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
