import type { NextConfig } from 'next';

/**
 * Baseline security headers (Phase 12 — docs/operations/deployment.md).
 * Deliberately conservative: a strict Content-Security-Policy is NOT
 * included here — getting connect-src/script-src exactly right for
 * Supabase Auth + Vercel Analytics/Speed Insights needs testing against
 * the real deployed origin, and a wrong CSP fails silently (broken
 * sign-in, no console error a user would report) in a way that's worse
 * than not having one yet. Flagged as a real follow-up, not shipped
 * half-verified — see docs/operations/deployment.md.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
