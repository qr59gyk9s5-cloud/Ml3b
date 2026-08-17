import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { signOutAction } from '@/app/(auth)/actions';

export async function SiteHeader() {
  const actor = await getSessionActor();

  return (
    <header className="border-line/80 sticky top-0 z-10 border-b bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex flex-none items-baseline gap-2">
          <span aria-hidden className="text-lg">
            🏟️
          </span>
          <span className="text-[15px] font-extrabold tracking-tight whitespace-nowrap text-foreground">
            <span className="sm:hidden">SVM</span>
            <span className="hidden sm:inline">Sports Venue Marketplace</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <span className="hidden text-xs font-medium text-faint md:inline">Cairo, Egypt</span>

          {actor ? (
            <>
              <Link
                href="/bookings"
                className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">My bookings</span>
              </Link>
              <span className="hidden max-w-[9rem] truncate text-xs font-semibold text-foreground md:inline">
                {actor.profile?.fullName ?? actor.email}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="focus-visible:outline-accent rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="focus-visible:outline-accent rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="focus-visible:outline-accent rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
