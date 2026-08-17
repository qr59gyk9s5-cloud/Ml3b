/**
 * The one scheduled entry point for both booking-maintenance jobs
 * (docs/architecture/background-jobs.md): expiring stale REQUESTED
 * bookings and completing past CONFIRMED ones. Combined into a single
 * route on one cadence (every few minutes, see vercel.json) rather than
 * the doc's separate "hourly" for completion — running it more often
 * than the minimum is strictly safe, and it's one less cron entry/secret
 * check to keep in sync.
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

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const [expired, completed] = await Promise.all([
    expireOverdueBookingRequests(),
    completePastBookings(),
  ]);

  return NextResponse.json({
    expiredCount: expired.expiredCount,
    completedCount: completed.completedCount,
  });
}
