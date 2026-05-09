import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALLOWED_ORIGIN = 'https://letmein.cambodia.com';
const WINDOW_MS = 60_000;
const MAX_API_REQ_PER_WINDOW = 120;
const MAX_WEBHOOK_REQ_PER_WINDOW = 90;

type RateState = { count: number; resetAt: number };
const store: Map<string, RateState> = (globalThis as unknown as { __rateStore?: Map<string, RateState> }).__rateStore || new Map();
(globalThis as unknown as { __rateStore?: Map<string, RateState> }).__rateStore = store;

function tooManyRequests(key: string, limit: number): boolean {
  const now = Date.now();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  store.set(key, current);
  return current.count > limit;
}

function reject(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get('origin');
  const host = req.headers.get('host') || '';
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';

  if (host !== 'letmein.cambodia.com' && host !== 'localhost:3000') {
    return reject(403, 'Invalid host');
  }

  if (pathname.startsWith('/admin')) {
    if (origin && origin !== ALLOWED_ORIGIN) {
      return reject(403, 'Invalid origin for admin route');
    }
    const res = NextResponse.next();
    res.headers.set('x-frame-options', 'DENY');
    res.headers.set('x-content-type-options', 'nosniff');
    return res;
  }

  if (pathname.startsWith('/api/')) {
    if (tooManyRequests(`api:${ip}`, MAX_API_REQ_PER_WINDOW)) {
      return reject(429, 'Rate limit exceeded');
    }

    if (origin && origin !== ALLOWED_ORIGIN && origin !== 'http://localhost:3000') {
      return reject(403, 'Invalid origin for API route');
    }

    const res = NextResponse.next();
    res.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token');
    res.headers.set('Vary', 'Origin');
    return res;
  }

  if (pathname === '/webhook') {
    if (tooManyRequests(`webhook:${ip}`, MAX_WEBHOOK_REQ_PER_WINDOW)) {
      return reject(429, 'Rate limit exceeded');
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*', '/webhook'],
};
