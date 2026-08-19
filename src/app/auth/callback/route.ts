/**
 * The PKCE callback both OAuth sign-in (ADR-005) and email-confirmation
 * links redirect back to. Exchanges the one-time `code` for a real
 * session — this is a Route Handler, so it's allowed to write the
 * session cookie (see src/lib/auth/server.ts's doc comment on why
 * Server Components can't).
 */
import { NextResponse } from 'next/server';
import { createActionSupabaseClient, isSupabaseConfigured } from '@/lib/auth/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code && isSupabaseConfigured()) {
    const supabase = await createActionSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Logged, not swallowed — this was previously silent, making every
    // OAuth failure a black box (no way to tell "PKCE verifier missing"
    // from "code already used" from anything else without this). Never
    // logs the code/verifier itself, just Supabase's own error shape.
    console.error('[auth/callback] exchangeCodeForSession failed:', {
      name: error.name,
      status: error.status,
      code: error.code,
      message: error.message,
    });
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`);
}
