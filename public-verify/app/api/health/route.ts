import { NextResponse } from "next/server";

const bootAt = Date.now();

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "public-verify",
    runtime: "app-router",
    uptime: Math.floor((Date.now() - bootAt) / 1000),
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT ||
      "unknown",
    timestamp: new Date().toISOString(),
  });
}

