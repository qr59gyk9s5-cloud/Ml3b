import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertTriangle, Archive, CheckCircle2, PauseCircle, PlayCircle } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { listVenuesForAdmin } from '@/domain/admin/queries';
import { VENUE_CANCELLATION_REASON } from '@/lib/config/constants';
import type { Venue } from '@/lib/db/schema';
import {
  approveVenueAction,
  archiveVenueAction,
  reactivateVenueAction,
  suspendVenueAction,
} from './actions';

export const metadata: Metadata = { title: 'Admin — Venues — Sports Venue Marketplace' };

type Props = { searchParams: Promise<{ error?: string; done?: string }> };

const STATUS_LABEL: Record<Venue['status'], string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending review',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

const STATUS_BADGE_CLASS: Record<Venue['status'], string> = {
  DRAFT: 'bg-surface-2 text-muted',
  PENDING_REVIEW: 'bg-floodlight-wash text-floodlight',
  ACTIVE: 'bg-accent-wash text-accent-strong',
  SUSPENDED: 'bg-danger-wash text-danger',
  ARCHIVED: 'bg-surface-2 text-faint',
};

export default async function AdminVenuesPage({ searchParams }: Props) {
  const { error, done } = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/venues');
  if (!actor.isPlatformAdmin) redirect('/');

  const venues = await listVenuesForAdmin({ userId: actor.userId, isPlatformAdmin: true });
  const pending = venues.filter((v) => v.status === 'PENDING_REVIEW');
  const rest = venues.filter((v) => v.status !== 'PENDING_REVIEW');

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="rounded-xl bg-accent-wash px-3 py-2 text-xs font-semibold text-accent-strong">
          Done.
        </p>
      ) : null}

      {pending.length > 0 ? (
        <section>
          <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-foreground">
            <AlertTriangle className="h-4 w-4 text-floodlight" aria-hidden />
            Approval queue ({pending.length})
          </h2>
          <ul className="flex flex-col gap-2.5">
            {pending.map((venue) => (
              <li
                key={venue.id}
                className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">{venue.name}</p>
                    <p className="text-xs text-muted">
                      {venue.city}
                      {venue.district ? `, ${venue.district}` : ''}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${STATUS_BADGE_CLASS[venue.status]}`}
                  >
                    {STATUS_LABEL[venue.status]}
                  </span>
                </div>
                <form action={approveVenueAction} className="mt-3">
                  <input type="hidden" name="venueId" value={venue.id} />
                  <button
                    type="submit"
                    className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Approve
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2.5 text-sm font-bold text-foreground">All venues</h2>
        {rest.length === 0 && pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
            No venues yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {rest.map((venue) => (
              <li
                key={venue.id}
                className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">{venue.name}</p>
                    <p className="text-xs text-muted">
                      {venue.city}
                      {venue.district ? `, ${venue.district}` : ''}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${STATUS_BADGE_CLASS[venue.status]}`}
                  >
                    {STATUS_LABEL[venue.status]}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {venue.status === 'ACTIVE' ? (
                    <form action={suspendVenueAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="venueId" value={venue.id} />
                      <select
                        name="reason"
                        required
                        defaultValue=""
                        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-medium text-foreground"
                      >
                        <option value="" disabled>
                          Reason…
                        </option>
                        {VENUE_CANCELLATION_REASON.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                        Suspend
                      </button>
                    </form>
                  ) : null}

                  {venue.status === 'SUSPENDED' ? (
                    <form action={reactivateVenueAction}>
                      <input type="hidden" name="venueId" value={venue.id} />
                      <button
                        type="submit"
                        className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                        Reactivate
                      </button>
                    </form>
                  ) : null}

                  {venue.status === 'SUSPENDED' || venue.status === 'DRAFT' ? (
                    <form action={archiveVenueAction}>
                      <input type="hidden" name="venueId" value={venue.id} />
                      <button
                        type="submit"
                        className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden />
                        Archive
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
