/**
 * Session refresh + per-request CSP nonce — runs on (almost) every
 * request, before rendering. Named proxy.ts, not middleware.ts: Next.js
 * 16 renamed the convention (middleware.js is deprecated) — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 *
 * Session refresh is purely about keeping the Supabase session cookie
 * fresh so Server Components (which can only *read* cookies, never
 * write them — see src/lib/auth/server.ts) see an up-to-date session.
 * It does not enforce authorization — that's src/domain/authz's job,
 * checked server-side on every mutation regardless of what a session
 * cookie says.
 *
 * Adapted from @supabase/ssr's own Next.js guidance. Do not "simplify"
 * this by removing the getUser() call, reordering it, or skipping the
 * response reconstruction — all three are load-bearing:
 *   - getUser() (not getSession()) is what actually triggers a token
 *     refresh when the access token is near expiry.
 *   - the response must be re-created after cookies.set() so the new
 *     Set-Cookie headers actually go out with it.
 *
 * The CSP nonce is generated here, not in next.config.ts's static
 * headers(), because it must be different on every request — see
 * next.config.ts's doc comment for why a static script-src 'self' alone
 * broke hydration, and node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md for this exact pattern (Next automatically
 * applies the nonce to its own injected scripts once it parses this
 * header shape from the request — no per-script wiring needed on our
 * side beyond generating it here).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/config/env';

function cspHeaderValue(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = cspHeaderValue(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response; // Supabase not configured yet — nothing to refresh.
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          response.headers.set('Content-Security-Policy', csp);
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
