import Link from 'next/link';
import type { Metadata } from 'next';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { isSupabaseConfigured } from '@/lib/auth/server';

export const metadata: Metadata = { title: 'Create account — Sports Venue Marketplace' };

export default function SignUpPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="text-sm text-muted">
          Request bookings, track confirmations, get your QR code.
        </p>
      </div>

      {!configured ? (
        <p className="rounded-xl border border-dashed border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
          Sign-up isn&apos;t connected to a real project yet — this environment has no Supabase
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
          <SignUpForm />
        </>
      )}

      <p className="text-center text-xs text-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
