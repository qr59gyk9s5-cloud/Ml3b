import Link from 'next/link';
import { Bell, CalendarCheck, ShieldCheck, Users } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { countUnreadNotifications } from '@/domain/notifications/queries';
import { signOutAction } from '@/app/(auth)/actions';

export async function SiteHeader() {
  const actor = await getSessionActor();
  const unreadCount = actor ? await countUnreadNotifications(actor.userId) : 0;

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

          <Link
            href="/games"
            className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Open games</span>
          </Link>

          {actor ? (
            <>
              {actor.isPlatformAdmin ? (
                <Link
                  href="/admin"
                  className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              ) : null}
              <Link
                href="/notifications"
                className="focus-visible:outline-accent relative flex items-center rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={
                  unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
                }
              >
                <Bell className="h-4 w-4" aria-hidden />
                {unreadCount > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </Link>
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
