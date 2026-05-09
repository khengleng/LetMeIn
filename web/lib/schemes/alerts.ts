import 'server-only';

export async function sendSchemeTelegramAlert(params: {
  tenantName: string;
  message: string;
}) {
  const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const adminIds = (process.env.ADMIN_TELEGRAM_ID || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!botToken || adminIds.length === 0) return;

  const text = `⚠️ Scheme Alert - ${params.tenantName}\n${params.message}`;
  await Promise.all(
    adminIds.map((chatId) =>
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      }).catch(() => null),
    ),
  );
}
