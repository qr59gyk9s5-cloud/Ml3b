import { signInWithOAuthAction } from '@/app/(auth)/actions';

/**
 * Google sign-in only for now — Apple's button is pulled until Sign in
 * with Apple is actually configured (needs a paid Apple Developer
 * Program membership + a Services ID, still pending). The server action
 * still accepts 'apple' as a provider (src/app/(auth)/actions.ts), so
 * re-adding the button later is the only step needed — no backend work.
 *
 * Plain <form action> bound to the provider — no client-side state
 * needed, so this stays a Server Component (ADR-005).
 */
export function OAuthButtons() {
  return (
    <form action={signInWithOAuthAction.bind(null, 'google')}>
      <button
        type="submit"
        className="focus-visible:outline-accent flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-faint hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="flex-none">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
          />
        </svg>
        Continue with Google
      </button>
    </form>
  );
}
