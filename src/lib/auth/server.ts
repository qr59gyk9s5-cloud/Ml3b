/**
 * The server-side Supabase client — Server Components, Server Actions, and
 * Route Handlers only. Never import this from a Client Component.
 *
 * Two constructors, matching what Next.js actually allows where cookies
 * can be written:
 *
 * - createServerSupabaseClient(): read-only. Safe from a Server Component
 *   render, where Next forbids setting cookies — setAll() is a
 *   deliberate no-op here. Session *refresh* happens once per request in
 *   src/proxy.ts, which runs before rendering and can write cookies.
 * - createActionSupabaseClient(): read/write. For Server Actions and
 *   Route Handlers (sign-in, sign-up, sign-out, the OAuth callback) —
 *   the only places Next allows a cookie `Set-Cookie` to actually go out.
 *
 * Using the wrong one for the job either throws (writing from a Server
 * Component) or silently fails to persist a session (reading with the
 * no-op writer during a Server Action) — see @supabase/ssr's own Next.js
 * guidance, which this mirrors.
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/config/env';

export function isSupabaseConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function requireSupabaseConfig() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase is not configured yet — NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are unset in .env.local. See docs/operations/deployment.md.',
    );
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

export async function createServerSupabaseClient() {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        // No-op by design — see the module doc comment above.
      },
    },
  });
}

export async function createActionSupabaseClient() {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
