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

  const navLinkClass =
    'focus-visible:outline-accent flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Admin console</h1>
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-accent-strong uppercase">
          Platform admin
        </span>
      </div>

      <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-line pb-3">
        <Link href="/admin" className={navLinkClass}>
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
          Overview
        </Link>
        <Link href="/admin/venues" className={navLinkClass}>
          <Building2 className="h-3.5 w-3.5" aria-hidden />
          Venues
        </Link>
        <Link href="/admin/bookings" className={navLinkClass}>
          <CalendarSearch className="h-3.5 w-3.5" aria-hidden />
          Bookings
        </Link>
        <Link href="/admin/users" className={navLinkClass}>
          <Users className="h-3.5 w-3.5" aria-hidden />
          Users
        </Link>
        <Link href="/admin/audit-log" className={navLinkClass}>
          <ScrollText className="h-3.5 w-3.5" aria-hidden />
          Audit log
        </Link>
        <Link href="/admin/admins" className={navLinkClass}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Admins
        </Link>
      </nav>

      {children}
    </main>
  );
}
