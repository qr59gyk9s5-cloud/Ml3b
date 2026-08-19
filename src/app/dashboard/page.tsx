import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, Lock, LayoutDashboard } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { listStaffVenuesForUser } from '@/domain/venue/staff-queries';

export const metadata: Metadata = { title: 'Venue dashboard' };

export default async function DashboardPage() {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/dashboard');

  const staffVenues = await listStaffVenuesForUser(actor.userId);

  if (staffVenues.length === 1) {
    redirect(`/dashboard/${staffVenues[0].venue.id}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong">
          <LayoutDashboard className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="font-display text-xl font-extrabold tracking-tight text-foreground">
          Venue dashboard
        </h1>
      </div>

      {staffVenues.length === 0 ? (
        <div className="animate-rise-up flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-faint">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-foreground">You&apos;re not staff at any venue</p>
          <p className="max-w-sm text-xs text-muted">
            A venue owner adds you as staff before this page has anything to show.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {staffVenues.map(({ venue, role }) => (
            <li key={venue.id}>
              <Link
                href={`/dashboard/${venue.id}`}
                className="focus-visible:outline-accent group flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <div>
                  <p className="text-sm font-bold text-foreground group-hover:text-accent-strong">
                    {venue.name}
                  </p>
                  <p className="text-xs text-muted">{role}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
