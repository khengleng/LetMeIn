import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

interface LogReferralRequest {
  referrer_code: string;
  referee_phone: string;
  timestamp?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function normalizePhone(input: string): string {
  // Keep only digits and '+' to normalize Telegram/user input before hashing.
  const trimmed = input.trim().replace(/[^+\d]/g, '');
  if (trimmed.length < 8 || trimmed.length > 20) {
    throw new Error('Invalid referee_phone format');
  }
  return trimmed;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid authorization token');
  }
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const payload = atob(padded);
  return JSON.parse(payload);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse(500, { error: 'Missing Supabase function environment variables' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Missing bearer token' });
  }

  const jwt = authHeader.slice('Bearer '.length).trim();

  let payload: Record<string, unknown>;
  try {
    payload = decodeJwtPayload(jwt);
  } catch (err) {
    return jsonResponse(401, { error: (err as Error).message });
  }

  const tenantId = payload.tenant_id;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    return jsonResponse(403, { error: 'JWT missing tenant_id claim' });
  }

  let body: LogReferralRequest;
  try {
    body = (await req.json()) as LogReferralRequest;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  if (!body?.referrer_code || typeof body.referrer_code !== 'string') {
    return jsonResponse(400, { error: 'referrer_code is required' });
  }
  if (!body?.referee_phone || typeof body.referee_phone !== 'string') {
    return jsonResponse(400, { error: 'referee_phone is required' });
  }

  const referrerCode = body.referrer_code.trim();
  if (referrerCode.length < 3 || referrerCode.length > 64) {
    return jsonResponse(400, { error: 'referrer_code length must be 3..64' });
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizePhone(body.referee_phone);
  } catch (err) {
    return jsonResponse(400, { error: (err as Error).message });
  }

  const occurredAt = body.timestamp ? new Date(body.timestamp) : new Date();
  if (Number.isNaN(occurredAt.valueOf())) {
    return jsonResponse(400, { error: 'timestamp must be a valid ISO datetime' });
  }

  const occurredAtIso = occurredAt.toISOString();
  const refereePhoneHash = await sha256Hex(normalizedPhone);
  const referralHash = await sha256Hex(
    `${tenantId}:${referrerCode}:${normalizedPhone}:${occurredAtIso}`,
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data, error } = await supabase
    .from('referrals')
    .insert({
      tenant_id: tenantId,
      referrer_code: referrerCode,
      referee_phone_hash: refereePhoneHash,
      occurred_at: occurredAtIso,
      referral_hash: referralHash,
      source: body.source?.trim() || 'telegram',
      metadata: body.metadata ?? {},
    })
    .select('id, tenant_id, referral_hash, occurred_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return jsonResponse(409, { error: 'Duplicate referral detected' });
    }
    return jsonResponse(400, {
      error: 'Failed to persist referral',
      details: error.message,
    });
  }

  return jsonResponse(201, {
    success: true,
    referral: data,
  });
});
