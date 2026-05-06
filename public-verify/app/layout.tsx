import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LetMeIn Verify',
  description: 'Public referral verification on Polygon',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
