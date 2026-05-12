import type { NextApiRequest, NextApiResponse } from "next";

const startedAt = Date.now();

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    status: "ok",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    service: "public-verify",
    runtime: "pages-api",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT ||
      "unknown",
    timestamp: new Date().toISOString(),
  });
}
