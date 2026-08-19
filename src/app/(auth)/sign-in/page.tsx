import Link from 'next/link';
import type { Metadata } from 'next';
import { LogIn } from 'lucide-react';
import { SignInForm } from '@/components/auth/sign-in-form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { isSupabaseConfigured } from '@/lib/auth/server';

export const metadata: Metadata = { title: 'Sign in' };

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="animate-float pointer-events-none absolute -top-10 right-[-30px] h-48 w-48 rounded-full opacity-30 blur-[2px]"
        style={{
          background:
            'radial-gradient(circle at 32% 30%, var(--accent-glow), var(--accent-strong))',
        }}
      />
      <div
        aria-hidden
        className="animate-float pointer-events-none absolute bottom-[-40px] left-[-20px] h-40 w-40 rounded-full opacity-25 blur-[2px]"
        style={{
          background: 'radial-gradient(circle at 32% 30%, var(--lime), var(--lime-strong))',
          animationDelay: '1s',
          animationDuration: '8s',
        }}
      />

      <div className="animate-rise-up relative mx-auto flex max-w-sm flex-col gap-6 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong text-white shadow-accent">
            <LogIn className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="text-sm text-muted">Book courts and pitches across Cairo.</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-md">
          {!configured ? (
            <p className="rounded-xl border border-dashed border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
              Sign-in isn&apos;t connected to a real project yet — this environment has no Supabase
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
              <SignInForm next={next} />
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted">
          New here?{' '}
          <Link href="/sign-up" className="font-bold text-accent-strong hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
