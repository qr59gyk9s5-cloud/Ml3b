/**
 * The one scheduled entry point for booking maintenance
 * (docs/architecture/background-jobs.md): expiring stale REQUESTED
 * bookings, completing past CONFIRMED ones, resolving open games past
 * their join cutoff (ADR-011 — the reconciliation path, not the primary
 * one; see docs/architecture/open-games.md's known gaps), and
 * dispatching whatever notifications those (and every other) transition
 * enqueued. Combined into a single route on one cadence rather than the
 * docs' separate per-job cadences — running any of them more often than
 * their stated minimum is strictly safe, and it's one less cron entry/
 * secret check to keep in sync. Dispatch runs *after* the others so this
 * same invocation also delivers whatever they just enqueued, not next run.
 *
 * Never a public route: Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>` automatically when CRON_SECRET is set on the project
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
 * — anything else, including CRON_SECRET being unset entirely, is
 * rejected. Fails closed, never open.
 */
import { NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { expireOverdueBookingRequests } from '@/domain/booking/expire';
import { completePastBookings } from '@/domain/booking/complete';
import { resolveOpenGamesPastCutoff } from '@/domain/open-games/cutoff';
import { dispatchOutboxEvents } from '@/domain/notifications/dispatch';

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const [expired, completed, openGamesResolved] = await Promise.all([
    expireOverdueBookingRequests(),
    completePastBookings(),
    resolveOpenGamesPastCutoff(),
  ]);
  const dispatched = await dispatchOutboxEvents();

  return NextResponse.json({
    expiredCount: expired.expiredCount,
    completedCount: completed.completedCount,
    openGamesFinalized: openGamesResolved.finalizedCount,
    openGamesFailedToFill: openGamesResolved.failedCount,
    notificationsProcessed: dispatched.processed,
    notificationsFailed: dispatched.failed,
  });
}
