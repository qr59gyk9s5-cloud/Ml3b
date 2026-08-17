import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Bell, CheckCheck } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { listNotificationsForUser } from '@/domain/notifications/queries';
import { NOTIFICATION_EVENT_LABEL } from '@/lib/format/notification-label';
import type { NotificationEventType } from '@/lib/config/constants';
import { markAllNotificationsReadAction, markNotificationReadAction } from './actions';

export const metadata: Metadata = { title: 'Notifications — Sports Venue Marketplace' };

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export default async function NotificationsPage() {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/notifications');

  const items = await listNotificationsForUser(actor.userId);
  const hasUnread = items.some((n) => n.readAt === null);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-accent-strong" aria-hidden />
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Notifications</h1>
        </div>
        {hasUnread ? (
          <form action={markAllNotificationsReadAction}>
            <button
              type="submit"
              className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
            </button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <span aria-hidden className="text-2xl">
            🔔
          </span>
          <p className="text-sm font-medium text-foreground">Nothing yet</p>
          <p className="max-w-sm text-xs text-muted">
            Booking updates — confirmations, requests, cancellations — show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((notification) => {
            const unread = notification.readAt === null;
            const label =
              NOTIFICATION_EVENT_LABEL[notification.type as NotificationEventType] ??
              notification.type;
            return (
              <li
                key={notification.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                  unread ? 'border-accent/30 bg-accent-wash' : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {unread ? (
                    <span className="h-2 w-2 flex-none rounded-full bg-accent" aria-hidden />
                  ) : null}
                  <div className="min-w-0">
                    <Link
                      href="/bookings"
                      className="truncate text-sm font-bold text-foreground hover:text-accent-strong"
                    >
                      {label}
                    </Link>
                    <p className="text-xs text-faint">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                </div>
                {unread ? (
                  <form action={markNotificationReadAction} className="flex-none">
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button
                      type="submit"
                      className="focus-visible:outline-accent rounded-lg px-2 py-1 text-[11px] font-bold text-accent-strong transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      Mark read
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
