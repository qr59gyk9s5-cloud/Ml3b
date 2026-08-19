import Link from 'next/link';
import type { Metadata } from 'next';
import { UserPlus } from 'lucide-react';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { isSupabaseConfigured } from '@/lib/auth/server';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="animate-float pointer-events-none absolute -top-10 left-[-30px] h-48 w-48 rounded-full opacity-30 blur-[2px]"
        style={{
          background:
            'radial-gradient(circle at 32% 30%, var(--floodlight), var(--floodlight-strong))',
        }}
      />
      <div
        aria-hidden
        className="animate-float pointer-events-none absolute bottom-[-40px] right-[-20px] h-40 w-40 rounded-full opacity-25 blur-[2px]"
        style={{
          background:
            'radial-gradient(circle at 32% 30%, var(--accent-glow), var(--accent-strong))',
          animationDelay: '1s',
          animationDuration: '8s',
        }}
      />

      <div className="animate-rise-up relative mx-auto flex max-w-sm flex-col gap-6 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong text-white shadow-accent">
            <UserPlus className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="text-sm text-muted">
            Request bookings, track confirmations, get your QR code.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-md">
          {!configured ? (
            <p className="rounded-xl border border-dashed border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
              Sign-up isn&apos;t connected to a real project yet — this environment has no Supabase
              project configured (see <code>docs/operations/deployment.md</code>).
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <OAuthButtons />
              <div className="flex items-center gap-3 text-xs font-bold tracking-wide text-faint uppercase">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>
              <SignUpForm />
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-bold text-accent-strong hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
