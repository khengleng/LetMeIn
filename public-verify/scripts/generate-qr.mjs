import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';

async function main() {
  const tenantId = process.argv[2];
  const referrerCode = process.argv[3];
  const botUsername = process.argv[4];
  const out = process.argv[5] || `qr_${tenantId}_${referrerCode}.png`;

  if (!tenantId || !referrerCode || !botUsername) {
    console.error('Usage: npm run qr:generate -- <tenant_id> <referrer_code> <bot_username> [output.png]');
    process.exit(1);
  }

  const payload = `https://t.me/${botUsername}?start=ref_${tenantId}_${referrerCode}`;
  const outputFile = path.resolve(process.cwd(), out);

  const png = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 720,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  await fs.writeFile(outputFile, png);
  console.log(`QR generated: ${outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
