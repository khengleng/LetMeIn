/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    const botServiceUrl = process.env.BOT_SERVICE_URL || 'http://127.0.0.1:8080';
    const cronServiceUrl = process.env.CRON_SERVICE_URL || 'http://127.0.0.1:8081';

    return [
      {
        source: '/webhook',
        destination: `${botServiceUrl}/webhook`,
      },
      {
        source: '/bot/health',
        destination: `${botServiceUrl}/health`,
      },
      {
        source: '/cron/ping',
        destination: `${cronServiceUrl}/ping`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Service-Name',
            value: 'letmein-web',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
