import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Check your email — Sports Venue Marketplace' };

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center sm:px-6">
      <span aria-hidden className="text-2xl">
        📬
      </span>
      <h1 className="text-lg font-extrabold tracking-tight text-foreground">Check your email</h1>
      <p className="text-sm text-muted">
        We sent you a confirmation link. Open it to finish creating your account.
      </p>
    </main>
  );
}
