'use client';

/**
 * Mobile bottom tab bar (founder reference: a fixed Home/Explore/
 * Bookings/Account strip, present in both mockups shared for the
 * "make it alive" pass). Hidden at `sm` and up — SiteHeader's own nav
 * already covers desktop, and a fixed bottom bar on a wide viewport
 * reads as a mistake, not a feature.
 *
 * Every destination here is a route that already exists — no
 * placeholder tabs. Client component only because the active-tab
 * highlight needs the current path; actual session state (signed in?
 * unread count?) is fetched server-side in layout.tsx and passed down,
 * same as SiteHeader.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CalendarCheck, Home, Users } from 'lucide-react';

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  match: (path: string) => boolean;
  badge?: number;
};

export function BottomTabBar({
  isSignedIn,
  unreadCount,
}: {
  isSignedIn: boolean;
  unreadCount: number;
}) {
  const pathname = usePathname();

  // Never shown on the venue-staff dashboard or the admin console — both
  // are their own dense, desktop-leaning workspaces where a persistent
  // bottom bar would just eat vertical space for no benefit.
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) return null;

  const tabs: Tab[] = [
    { href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
    { href: '/games', label: 'Open games', icon: Users, match: (p) => p.startsWith('/games') },
    isSignedIn
      ? {
          href: '/bookings',
          label: 'Bookings',
          icon: CalendarCheck,
          match: (p) => p.startsWith('/bookings'),
        }
      : {
          href: '/sign-in?next=%2Fbookings',
          label: 'Bookings',
          icon: CalendarCheck,
          match: () => false,
        },
    isSignedIn
      ? {
          href: '/notifications',
          label: 'Alerts',
          icon: Bell,
          match: (p) => p.startsWith('/notifications'),
          badge: unreadCount,
        }
      : { href: '/sign-in', label: 'Sign in', icon: Bell, match: () => false },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-lg sm:hidden"
    >
      <div className="mx-auto flex max-w-5xl items-stretch justify-around px-2 pt-1.5">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className="focus-visible:outline-accent flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span
                className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ${
                  active ? 'bg-lime text-lime-ink' : 'text-faint'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {tab.badge ? (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                ) : null}
              </span>
              <span
                className={`font-display text-[10px] font-bold ${active ? 'text-foreground' : 'text-faint'}`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
