import type { Metadata } from 'next';
import { MailCheck } from 'lucide-react';

export const metadata: Metadata = { title: 'Check your email' };

export default function CheckEmailPage() {
  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="animate-float pointer-events-none absolute top-0 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full opacity-25 blur-[2px]"
        style={{
          background:
            'radial-gradient(circle at 32% 30%, var(--accent-glow), var(--accent-strong))',
        }}
      />
      <div className="animate-rise-up relative mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center sm:px-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong text-white shadow-accent">
          <MailCheck className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="font-display text-xl font-extrabold tracking-tight text-foreground">
          Check your email
        </h1>
        <p className="text-sm text-muted">
          We sent you a confirmation link. Open it to finish creating your account.
        </p>
      </div>
    </main>
  );
}
