import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const cookieName = process.env.SUPABASE_AUTH_COOKIE || 'sb-access-token';
const allowlist = (process.env.OPERATOR_ALLOWLIST_EMAILS || '')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(new URL('/admin/login?error=config', req.url));
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/admin/login?error=missing_code', req.url));
  }

  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session?.access_token) {
    return NextResponse.redirect(new URL('/admin/login?error=invalid_session', req.url));
  }

  const email = data.user?.email?.toLowerCase() || '';
  if (!email || !allowlist.includes(email)) {
    return NextResponse.redirect(new URL('/admin/login?error=not_allowlisted', req.url));
  }

  const response = NextResponse.redirect(new URL('/admin', req.url));
  response.cookies.set(cookieName, data.session.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: data.session.expires_in || 3600,
  });

  return response;
}
