import Link from 'next/link';
import { getSessionActor } from '@/lib/auth/session';
import { signOutAction } from '@/app/(auth)/actions';

export async function SiteHeader() {
  const actor = await getSessionActor();

  return (
    <header className="border-line/80 sticky top-0 z-10 border-b bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span aria-hidden className="text-lg">
            🏟️
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-foreground">
            Sports Venue Marketplace
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs font-medium text-faint sm:inline">Cairo, Egypt</span>
          {actor ? (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[10rem] truncate text-xs font-semibold text-foreground sm:inline">
                {actor.profile?.fullName ?? actor.email}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="focus-visible:outline-accent rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/sign-in"
              className="focus-visible:outline-accent rounded-lg px-2 py-1 text-xs font-semibold text-accent transition-colors hover:text-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
