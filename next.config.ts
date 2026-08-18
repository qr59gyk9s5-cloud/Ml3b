import type { NextConfig } from 'next';

/**
 * Baseline security headers (Phase 12 — docs/operations/deployment.md).
 * The Content-Security-Policy itself is NOT set here — see src/proxy.ts
 * for why and the full CSP reasoning (script-src needs a per-request
 * nonce, which a static header can't carry).
 *
 * Two real bugs the original static CSP had, both verified with a real
 * Playwright-driven Chromium session against a production build (not
 * just reasoned from source) and fixed:
 *
 * 1. `script-src 'self'` alone blocked Next's own required inline
 *    bootstrap script (the RSC/hydration payload) — CSP has no notion
 *    of "same origin covers Next's own injected script"; inline script
 *    always needs an explicit 'unsafe-inline' / nonce / hash allowance
 *    regardless of origin. This was a real hydration failure
 *    ("Invariant: Expected a request ID to be defined... via
 *    self.__next_r"), not just a console warning — client components
 *    (this app's location provider among them) never mounted, in both
 *    dev and a production build/start. The experimental.sri config
 *    (Next's documented alternative to nonces) was tried first and did
 *    NOT fix it in this Next version — moved to the nonce approach in
 *    src/proxy.ts instead, which did, verified the same way.
 * 2. `Permissions-Policy: geolocation=()` disabled the Geolocation API
 *    outright, breaking src/components/location-provider.tsx's
 *    auto-detect entirely — `()` is an empty allowlist, not a no-op
 *    default. Fixed to `geolocation=(self)` below.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
