'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Sign in with your operator email. We will send a secure magic link.');
  const [error, setError] = useState('');

  const supabase = useMemo(() => {
    if (!supabaseUrl || !anonKey) return null;
    return createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!supabase) {
      setError('Auth client is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${appUrl}/admin/auth/callback`,
      },
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    setMessage('Magic link sent. Open your email and continue sign-in in this browser.');
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Operator Sign In</h2>
      <p className="mt-1 text-sm text-slate-600">{message}</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="operator@email.com"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Sending...' : 'Send Magic Link'}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
