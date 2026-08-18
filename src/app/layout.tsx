import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { SuspendedBanner } from '@/components/suspended-banner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'PlayCairo', template: '%s — PlayCairo' },
  description: 'Find and book sports facilities in Cairo — pitches, courts, and open games.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeader />
        <SuspendedBanner />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        {/* No-ops off Vercel (local dev, this sandbox) — real telemetry
         * only once actually deployed there. See docs/operations/monitoring.md. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
