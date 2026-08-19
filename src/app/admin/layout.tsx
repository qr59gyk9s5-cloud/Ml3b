import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Building2,
  CalendarSearch,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/venues', label: 'Venues', icon: Building2 },
  { href: '/admin/bookings', label: 'Bookings', icon: CalendarSearch },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/audit-log', label: 'Audit log', icon: ScrollText },
  { href: '/admin/admins', label: 'Admins', icon: ShieldCheck },
] as const;

/**
 * Server-side gate for every /admin/* route — CLAUDE.md: authorization
 * is server-side, always, never just a hidden nav link. Each page's
 * domain-layer calls (findVenuesForAdmin, suspendUser, ...) re-check
 * isPlatformAdmin themselves too; this layout is the first line, not the
 * only one.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin');
  if (!actor.isPlatformAdmin) redirect('/');

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-strong text-white shadow-accent">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-foreground">
            Admin console
          </h1>
        </div>
        <span className="rounded-full bg-accent-wash px-2.5 py-1 text-[10px] font-bold tracking-wide text-accent-strong uppercase">
          Platform admin
        </span>
      </div>

      <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-line pb-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-accent-wash hover:text-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <div className="animate-rise-up">{children}</div>
    </main>
  );
}
