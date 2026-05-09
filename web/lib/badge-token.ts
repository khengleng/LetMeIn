import crypto from 'crypto';
import QRCode from 'qrcode';

export function generateRawBadgeToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function hashBadgeToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function buildBadgeQrDataUrl(payloadUrl: string): Promise<string> {
  return QRCode.toDataURL(payloadUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
  });
}
