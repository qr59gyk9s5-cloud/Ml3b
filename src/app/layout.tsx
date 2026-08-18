import type { Metadata } from 'next';
import { Geist_Mono, Manrope, Plus_Jakarta_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { SuspendedBanner } from '@/components/suspended-banner';
import { LocationProvider } from '@/components/location-provider';
import './globals.css';

// PlayCairo's type pairing (design canvas): Manrope for display/headline
// weight, Plus Jakarta Sans for body/UI text — replaces the earlier
// Geist pairing as part of the founder-approved rebrand.
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
});

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
    <html
      lang="en"
      className={`${manrope.variable} ${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <LocationProvider>
          <SiteHeader />
          <SuspendedBanner />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </LocationProvider>
        {/* No-ops off Vercel (local dev, this sandbox) — real telemetry
         * only once actually deployed there. See docs/operations/monitoring.md. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
