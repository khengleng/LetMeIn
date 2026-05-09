import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const allowlistRaw = process.env.OPERATOR_ALLOWLIST_EMAILS || '';
const authCookieName = process.env.SUPABASE_AUTH_COOKIE || 'sb-access-token';

if (!supabaseUrl || !anonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}

const allowlist = allowlistRaw
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

export async function requireOperator() {
  const accessToken = cookies().get(authCookieName)?.value;

  if (!accessToken) {
    redirect('/admin/login');
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.email) {
    redirect('/admin/login');
  }

  const email = data.user.email.toLowerCase();
  if (!allowlist.includes(email)) {
    redirect('/admin/login');
  }

  return { email, userId: data.user.id };
}
