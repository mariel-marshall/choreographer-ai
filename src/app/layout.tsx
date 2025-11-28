import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Missed Connections',
  description: 'A Toronto Missed Connection poet.',
  openGraph: {
    title: 'Missed Connections',
    description: 'A Toronto Missed Connection poet.',
    url: 'https://missed-connections-ai.vercel.app',
    siteName: 'Missed Connections',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Missed Connections',
    description: 'A Toronto Missed Connection poet.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}