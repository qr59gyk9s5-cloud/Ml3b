import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, MailWarning, SendHorizontal } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { getSystemHealthSummary } from '@/domain/admin/queries';

export const metadata: Metadata = { title: 'Admin — Overview' };

export default async function AdminOverviewPage() {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin');
  if (!actor.isPlatformAdmin) redirect('/');

  const health = await getSystemHealthSummary({ userId: actor.userId, isPlatformAdmin: true });
  const allClear = health.failedOutboxEvents === 0 && health.failedNotifications === 0;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2.5 text-sm font-bold text-foreground">System health</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Link
            href="/admin/venues"
            className="focus-visible:outline-accent rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <AlertTriangle className="h-3.5 w-3.5 text-floodlight" aria-hidden />
              Pending approvals
            </div>
            <p className="mt-1.5 text-2xl font-extrabold text-foreground">
              {health.pendingVenueApprovals}
            </p>
          </Link>

          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <SendHorizontal className="h-3.5 w-3.5 text-danger" aria-hidden />
              Failed background jobs
            </div>
            <p
              className={`mt-1.5 text-2xl font-extrabold ${health.failedOutboxEvents > 0 ? 'text-danger' : 'text-foreground'}`}
            >
              {health.failedOutboxEvents}
            </p>
            <p className="mt-0.5 text-[10px] text-faint">outbox_events, status = FAILED</p>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <MailWarning className="h-3.5 w-3.5 text-danger" aria-hidden />
              Failed notifications
            </div>
            <p
              className={`mt-1.5 text-2xl font-extrabold ${health.failedNotifications > 0 ? 'text-danger' : 'text-foreground'}`}
            >
              {health.failedNotifications}
            </p>
            <p className="mt-0.5 text-[10px] text-faint">notifications, status = FAILED</p>
          </div>
        </div>

        {allClear ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent-strong" aria-hidden />
            No failed jobs or notifications right now.
          </p>
        ) : (
          <p className="mt-3 text-xs text-danger">
            Something needs a look — see{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5">outbox_events</code> /{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5">notifications</code> directly for the
            actual rows (no drill-down UI yet — see docs/operations/monitoring.md).
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2.5 text-sm font-bold text-foreground">Quick links</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Link
            href="/admin/venues"
            className="focus-visible:outline-accent rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Venues
          </Link>
          <Link
            href="/admin/bookings"
            className="focus-visible:outline-accent rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Bookings
          </Link>
          <Link
            href="/admin/users"
            className="focus-visible:outline-accent rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Users
          </Link>
          <Link
            href="/admin/audit-log"
            className="focus-visible:outline-accent rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Audit log
          </Link>
        </div>
      </section>
    </div>
  );
}
