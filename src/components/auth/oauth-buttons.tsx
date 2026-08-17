import { signInWithOAuthAction } from '@/app/(auth)/actions';

/** Plain <form action> bound to a specific provider — no client-side
 * state needed, so this stays a Server Component (ADR-005: Google +
 * Apple OAuth alongside email/password). */
export function OAuthButtons() {
  return (
    <div className="flex flex-col gap-2">
      <form action={signInWithOAuthAction.bind(null, 'google')}>
        <button
          type="submit"
          className="focus-visible:outline-accent flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden>🔵</span> Continue with Google
        </button>
      </form>
      <form action={signInWithOAuthAction.bind(null, 'apple')}>
        <button
          type="submit"
          className="focus-visible:outline-accent flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden></span> Continue with Apple
        </button>
      </form>
    </div>
  );
}
