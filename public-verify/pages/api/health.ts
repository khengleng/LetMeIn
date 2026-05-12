import type { NextApiRequest, NextApiResponse } from "next";

const startedAt = Date.now();

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    status: "ok",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    service: "public-verify",
    runtime: "pages-api",
    timestamp: new Date().toISOString(),
  });
}

