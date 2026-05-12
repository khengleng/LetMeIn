import { NextResponse } from 'next/server';

const boot = Date.now();

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - boot) / 1000),
    service: 'public-verify',
    timestamp: new Date().toISOString(),
  });
}
