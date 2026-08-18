import type { NextConfig } from 'next';

/**
 * Baseline security headers (Phase 12 — docs/operations/deployment.md).
 *
 * The CSP is reasoned from what this app actually does, not copy-pasted:
 * - No browser-side Supabase client exists anywhere in src/ (grep for
 *   createBrowserClient finds nothing) — every Auth call goes through a
 *   Server Action (src/lib/auth/server.ts), so connect-src needs no
 *   Supabase exception. OAuth/magic-link flows are full-page navigations
 *   to Supabase's own domain, which CSP's navigate-to doesn't govern.
 * - next/font (Geist) self-hosts at build time — no external font-src.
 * - QR codes (src/lib/format/qr-code.ts) render as data: URIs — img-src
 *   needs data: for that, nothing else does.
 * - @vercel/analytics / @vercel/speed-insights post to same-origin paths
 *   when actually deployed on Vercel (self covers it); the extra
 *   *.vercel-insights.com allowance is defensive, not load-bearing.
 * - Tailwind compiles to a static stylesheet; style-src still allows
 *   'unsafe-inline' as a safety margin for anything React/Next itself
 *   injects inline, which is lower-risk than script-src 'unsafe-inline'
 *   would be.
 *
 * Still verify with the browser console for CSP violations after the
 * first real deploy (Preview or production) — this was reasoned from
 * the source, not confirmed against a live browser session, since this
 * sandbox can't run one. See docs/operations/deployment.md's launch
 * checklist.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
