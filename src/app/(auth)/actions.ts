'use server';

/**
 * Auth Server Actions — the only place src/lib/auth's action-context
 * Supabase client (the one allowed to write cookies) is invoked for
 * sign-in/up/out. Structural validation (Zod) happens here; Supabase Auth
 * itself is the source of truth for credential correctness — we never
 * duplicate password rules or email-format checks it already enforces.
 */
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createActionSupabaseClient, isSupabaseConfigured } from '@/lib/auth/server';
import { env } from '@/lib/config/env';

export interface AuthActionState {
  error?: string;
}

const NOT_CONFIGURED_ERROR =
  'Sign-in is not set up yet — this environment has no Supabase project connected.';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const signUpSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(1, 'Enter your name.').max(120),
});

/** Only ever redirect somewhere inside this app — an unvalidated
 * `?next=` would otherwise be an open-redirect vector (e.g. `//evil.com`,
 * parsed by browsers as protocol-relative). */
function safeNextPath(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export async function signInWithPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED_ERROR };

  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email and password.' };
  }

  const supabase = await createActionSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect(safeNextPath(formData.get('next')));
}

export async function signUpWithPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED_ERROR };

  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details and try again.' };
  }

  const supabase = await createActionSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the handle_new_user trigger (0001_identity_auth_and_rls.sql)
      // that creates the matching `profiles` row — never insert into
      // profiles directly from application code.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: error.message };

  redirect('/sign-up/check-email');
}

export async function signInWithOAuthAction(provider: 'google' | 'apple') {
  if (!isSupabaseConfigured()) redirect('/sign-in?error=not_configured');

  const supabase = await createActionSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  if (error || !data.url) redirect('/sign-in?error=oauth');

  redirect(data.url);
}

export async function signOutAction() {
  if (!isSupabaseConfigured()) redirect('/');

  const supabase = await createActionSupabaseClient();
  await supabase.auth.signOut();
  redirect('/');
}
