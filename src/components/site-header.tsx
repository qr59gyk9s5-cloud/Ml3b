import Link from 'next/link';
import { Bell, CalendarCheck, ShieldCheck, Users } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { countUnreadNotifications } from '@/domain/notifications/queries';
import { signOutAction } from '@/app/(auth)/actions';
import { Logo } from '@/components/logo';
import { LocationPill } from '@/components/location-pill';

export async function SiteHeader() {
  const actor = await getSessionActor();
  const unreadCount = actor ? await countUnreadNotifications(actor.userId) : 0;

  // Dark navy "chrome" — a fixed brand band, not theme-switched (see the
  // --ink token's doc comment in globals.css) — so it stays put whether
  // the visitor's OS is light or dark mode. Text/icons here use
  // on-ink/on-ink-muted, never the regular foreground/muted tokens,
  // which are tuned for light surfaces.
  const navLinkClass =
    'focus-visible:outline-accent-bright flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-display text-xs font-bold text-on-ink-muted transition-colors hover:bg-white/10 hover:text-on-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-ink/95 backdrop-blur-lg">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="focus-visible:outline-accent-bright flex-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Logo onDark />
        </Link>

        <LocationPill className="hidden md:flex" onDark />

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/games" className={navLinkClass}>
            <Users className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Open games</span>
          </Link>

          {actor ? (
            <>
              {actor.isPlatformAdmin ? (
                <Link href="/admin" className={navLinkClass}>
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              ) : null}
              <Link
                href="/notifications"
                className="focus-visible:outline-accent-bright relative flex items-center rounded-lg p-1.5 text-on-ink-muted transition-colors hover:bg-white/10 hover:text-on-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
              <Link href="/bookings" className={navLinkClass}>
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">My bookings</span>
              </Link>
              <span className="hidden max-w-[9rem] truncate font-display text-xs font-bold text-on-ink md:inline">
                {actor.profile?.fullName ?? actor.email}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="focus-visible:outline-accent-bright rounded-lg px-2.5 py-1.5 font-display text-xs font-bold text-on-ink-muted transition-colors hover:bg-white/10 hover:text-on-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="focus-visible:outline-accent-bright rounded-lg px-2.5 py-1.5 font-display text-xs font-bold text-on-ink-muted transition-colors hover:bg-white/10 hover:text-on-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="btn-sheen focus-visible:outline-accent-bright rounded-lg bg-gradient-to-br from-accent to-accent-strong px-3.5 py-1.5 font-display text-xs font-bold text-white shadow-accent transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
