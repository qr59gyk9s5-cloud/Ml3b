import Link from 'next/link';
import type { Metadata } from 'next';
import { SignInForm } from '@/components/auth/sign-in-form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { isSupabaseConfigured } from '@/lib/auth/server';

export const metadata: Metadata = { title: 'Sign in — Sports Venue Marketplace' };

export default function SignInPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Sign in</h1>
        <p className="text-sm text-muted">Book courts and pitches across Cairo.</p>
      </div>

      {!configured ? (
        <p className="rounded-xl border border-dashed border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
          Sign-in isn&apos;t connected to a real project yet — this environment has no Supabase
          project configured (see <code>docs/operations/deployment.md</code>).
        </p>
      ) : (
        <>
          <OAuthButtons />
          <div className="flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <SignInForm />
        </>
      )}

      <p className="text-center text-xs text-muted">
        New here?{' '}
        <Link href="/sign-up" className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
