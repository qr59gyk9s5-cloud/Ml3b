/**
 * Uptime/health check for external monitoring (Vercel's own, or any
 * third-party uptime pinger — docs/operations/monitoring.md). Public and
 * unauthenticated on purpose (that's the norm for a health endpoint —
 * nothing here reveals anything an anonymous visitor couldn't already
 * infer from the app being reachable at all), but it must never leak
 * anything beyond "is the database reachable": no counts, no row data,
 * no internal error messages.
 *
 * Checks the one thing that actually matters for "is this app usable":
 * can it reach its database. A slow/unreachable database is the
 * overwhelming majority of "the site is down" incidents for this app —
 * everything else (Vercel itself, DNS, TLS) is Vercel's own status page's
 * job, not this route's.
 */
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
