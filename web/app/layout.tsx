import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LetMeIn Web',
  description: 'Operator portal and public verification',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
