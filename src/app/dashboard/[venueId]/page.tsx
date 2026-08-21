import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  LayoutDashboard,
  Plus,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { getVenueByIdForStaff } from '@/domain/venue/staff-queries';
import { resolveVenueAuthzContext } from '@/domain/venue/authz-context';
import { canManageVenueStaff, canRemoveVenueMember } from '@/domain/authz/venue';
import { listActiveFacilities } from '@/domain/venue/queries';
import { listBookingsForVenueWithDetails } from '@/domain/booking/queries';
import { listVenueStaff } from '@/domain/venue/staff';
import { addLocalDays, todayInTimeZone } from '@/domain/availability/time';
import { formatDayChip, formatMonthYear } from '@/lib/booking/slot-picker';
import { DomainError } from '@/domain/errors';
import { VENUE_CANCELLATION_REASON, VENUE_ROLE } from '@/lib/config/constants';
import { VENUE_REASON_LABEL } from '@/lib/format/booking-status';
import { formatPriceMinor } from '@/lib/format/money';
import {
  confirmRequestAction,
  rejectRequestAction,
  addStaffAction,
  removeStaffAction,
} from './actions';

type Props = {
  params: Promise<{ venueId: string }>;
  searchParams: Promise<{
    error?: string;
    confirmed?: string;
    rejected?: string;
    manual?: string;
    staffAdded?: string;
    staffRemoved?: string;
    day?: string;
  }>;
};

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);
}

function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { venueId } = await params;
  const actor = await getSessionActor();
  if (!actor) return { title: 'Venue dashboard' };
  try {
    const venue = await getVenueByIdForStaff(venueId, actor);
    return { title: `${venue.name} — dashboard` };
  } catch {
    return { title: 'Venue dashboard' };
  }
}

export default async function VenueDashboardPage({ params, searchParams }: Props) {
  const { venueId } = await params;
  const sp = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect(`/sign-in?next=/dashboard/${venueId}`);

  let venue;
  try {
    venue = await getVenueByIdForStaff(venueId, actor);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }

  const venueActor = { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin };
  const [ctx, requests, confirmed, venueFacilities, staff] = await Promise.all([
    resolveVenueAuthzContext(venueId, venueActor),
    listBookingsForVenueWithDetails(venueId, venueActor, { status: 'REQUESTED' }),
    listBookingsForVenueWithDetails(venueId, venueActor, { status: 'CONFIRMED' }),
    listActiveFacilities(venueId),
    listVenueStaff(venueId, venueActor),
  ]);

  const today = todayInTimeZone(venue.timezone);
  const selectedDay = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const dayLinks = Array.from({ length: 14 }, (_, i) => addLocalDays(today, i));

  // Bucket confirmed bookings by their local calendar date at the venue,
  // once — the day strip's per-day dot and the agenda list below both
  // read from this instead of re-scanning `confirmed` per render.
  const confirmedByDay = new Map<string, typeof confirmed>();
  for (const booking of confirmed) {
    const day = todayInTimeZone(venue.timezone, booking.startAt);
    const bucket = confirmedByDay.get(day);
    if (bucket) bucket.push(booking);
    else confirmedByDay.set(day, [booking]);
  }
  const dayAgenda = (confirmedByDay.get(selectedDay) ?? []).sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );

  const canAddStaff = canManageVenueStaff(ctx);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> All venues
      </Link>

      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong">
            <LayoutDashboard className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl font-extrabold tracking-tight text-foreground">
              {venue.name}
            </h1>
            <p className="text-xs text-muted">
              {ctx.isPlatformAdmin && !ctx.venueRole ? 'Admin access' : ctx.venueRole}
            </p>
          </div>
        </div>
        {ctx.isPlatformAdmin || ctx.venueRole === 'OWNER' || ctx.venueRole === 'MANAGER' ? (
          <Link
            href={`/dashboard/${venueId}/settings`}
            className="focus-visible:outline-accent rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:border-accent hover:text-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Settings
          </Link>
        ) : null}
      </div>

      {sp.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-danger-wash px-3 py-2.5 text-sm font-medium text-danger"
        >
          {sp.error}
        </p>
      ) : null}
      {sp.confirmed ? (
        <p className="mb-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          Booking approved.
        </p>
      ) : null}
      {sp.rejected ? (
        <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted">
          Request declined.
        </p>
      ) : null}
      {sp.manual ? (
        <p className="mb-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          Walk-in booking added.
        </p>
      ) : null}
      {sp.staffAdded ? (
        <p className="mb-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          Staff member added.
        </p>
      ) : null}
      {sp.staffRemoved ? (
        <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted">
          Staff member removed.
        </p>
      ) : null}

      {/* The one thing this page is for. Everything below this section is
       * secondary — sized and colored down on purpose so this is the only
       * thing that reads as "act now." Big buttons, plain language
       * (Approve/Decline, not Confirm/Reject-the-domain-verb), one card
       * per request instead of a dense row. */}
      <section>
        <h2 className="font-display text-base font-extrabold tracking-tight text-foreground">
          Booking requests{requests.length > 0 ? ` (${requests.length})` : ''}
        </h2>
        {requests.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line px-4 py-10 text-center">
            <CheckCircle2 className="h-6 w-6 text-faint" aria-hidden />
            <p className="text-sm font-bold text-foreground">You&apos;re all caught up</p>
            <p className="text-xs text-muted">New requests will show up here.</p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {requests.map((booking, i) => (
              <li
                key={booking.id}
                style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}
                className="animate-rise-up rounded-2xl border-2 border-accent/30 bg-surface p-4 shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-extrabold text-foreground">
                      {booking.facilityName}
                    </p>
                    <p className="text-sm font-bold text-foreground-soft">
                      {formatDateTime(booking.startAt, venue.timezone)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {booking.customerName ?? 'Marketplace customer'}
                      {booking.customerPhone ? ` · ${booking.customerPhone}` : ''}
                    </p>
                  </div>
                  <div className="flex-none text-right">
                    <p className="font-mono text-[10px] text-faint">{booking.reference}</p>
                    <p className="text-base font-extrabold text-accent-strong">
                      {formatPriceMinor(booking.totalMinor, booking.currency)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <form action={confirmRequestAction} className="flex-1">
                    <input type="hidden" name="venueId" value={venueId} />
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button
                      type="submit"
                      className="btn-sheen focus-visible:outline-accent flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-strong px-4 py-3.5 font-display text-sm font-extrabold text-white shadow-accent transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <CheckCircle2 className="h-5 w-5" aria-hidden /> Approve
                    </button>
                  </form>

                  <details className="group flex-1">
                    <summary className="focus-visible:outline-accent flex list-none items-center justify-center gap-2 rounded-xl border-2 border-line px-4 py-3.5 font-display text-sm font-extrabold text-danger transition-colors [&::-webkit-details-marker]:hidden hover:border-danger hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                      <XCircle className="h-5 w-5" aria-hidden /> Decline
                    </summary>
                    <form
                      action={rejectRequestAction}
                      className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-2"
                    >
                      <input type="hidden" name="venueId" value={venueId} />
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <select
                        name="reason"
                        required
                        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-2 text-xs text-foreground"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Why?
                        </option>
                        {VENUE_CANCELLATION_REASON.map((reason) => (
                          <option key={reason} value={reason}>
                            {VENUE_REASON_LABEL[reason]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="focus-visible:outline-accent flex-none rounded-lg bg-danger px-3 py-2 text-xs font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Confirm decline
                      </button>
                    </form>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Everything past this point is secondary to approving/declining
       * requests above — kept small and quiet on purpose (faint headings,
       * thin borders) so it doesn't compete for attention. */}
      <div className="mt-10 border-t border-line pt-6">
        <p className="mb-4 font-display text-[10px] font-bold tracking-widest text-faint uppercase">
          More
        </p>

        {/* Calendar — a day strip (dot = at least one confirmed booking
         * that day) plus that day's agenda below. Same day-chip language
         * as the customer booking page. */}
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-faint" aria-hidden />
            <h2 className="font-display text-xs font-bold tracking-wide text-faint uppercase">
              Calendar · {formatMonthYear(selectedDay)}
            </h2>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {dayLinks.map((d) => {
              const { weekday, day } = formatDayChip(d);
              const isSelected = d === selectedDay;
              const hasBookings = confirmedByDay.has(d);
              return (
                <Link
                  key={d}
                  href={`/dashboard/${venueId}?day=${d}`}
                  className={`relative flex-none rounded-2xl border px-3.5 py-2 text-center transition-all duration-200 ${
                    isSelected
                      ? 'border-transparent bg-gradient-to-br from-accent to-accent-strong text-white shadow-accent'
                      : 'border-line bg-surface text-foreground-soft hover:border-accent hover:text-accent-strong'
                  }`}
                >
                  {hasBookings ? (
                    <span
                      aria-hidden
                      className={`absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${
                        isSelected ? 'bg-white' : 'bg-accent'
                      }`}
                    />
                  ) : null}
                  <span
                    className={`block font-display text-[10px] font-bold tracking-wide uppercase ${isSelected ? 'text-white/80' : 'text-faint'}`}
                  >
                    {weekday}
                  </span>
                  <span className="mt-0.5 block font-display text-sm font-extrabold">{day}</span>
                </Link>
              );
            })}
          </div>

          {dayAgenda.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              Nothing confirmed for this day.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {dayAgenda.map((booking) => (
                <li
                  key={booking.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {booking.facilityName}
                    </p>
                    <p className="text-xs text-muted">
                      {formatTime(booking.startAt, venue.timezone)}–
                      {formatTime(booking.endAt, venue.timezone)} ·{' '}
                      {booking.customerName ?? 'Marketplace customer'}
                    </p>
                  </div>
                  <span
                    className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      booking.source === 'MANUAL'
                        ? 'bg-surface-2 text-faint'
                        : 'bg-accent-wash text-accent-strong'
                    }`}
                  >
                    {booking.source === 'MANUAL' ? 'Walk-in' : 'Online'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-xs font-bold tracking-wide text-faint uppercase">
            Add a walk-in booking
          </h2>
          {venueFacilities.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              No active facilities yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {venueFacilities.map((facility) => (
                <li key={facility.id}>
                  <Link
                    href={`/dashboard/${venueId}/manual/${facility.id}`}
                    className="focus-visible:outline-accent flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="text-sm font-bold text-foreground">{facility.name}</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-accent-strong">
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add booking
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <div className="mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-faint" aria-hidden />
            <h2 className="font-display text-xs font-bold tracking-wide text-faint uppercase">
              Staff{staff.length > 0 ? ` (${staff.length})` : ''}
            </h2>
          </div>

          <ul className="flex flex-col gap-2">
            {staff.map((member) => {
              const canRemove = !member.isSelf && canRemoveVenueMember(ctx, member.role);
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {member.fullName || member.email}
                      {member.isSelf ? <span className="text-faint"> (you)</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted">{member.email}</p>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-faint">
                      {member.role}
                    </span>
                    {canRemove ? (
                      <form action={removeStaffAction}>
                        <input type="hidden" name="venueId" value={venueId} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          title="Remove"
                          aria-label={`Remove ${member.fullName || member.email}`}
                          className="focus-visible:outline-accent flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-danger-wash hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {canAddStaff ? (
            <form
              action={addStaffAction}
              className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line px-3.5 py-3"
            >
              <input type="hidden" name="venueId" value={venueId} />
              <UserPlus className="h-3.5 w-3.5 flex-none text-faint" aria-hidden />
              <input
                name="email"
                type="email"
                required
                placeholder="Staff member's email"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
              <select
                name="role"
                required
                defaultValue="RECEPTIONIST"
                className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-bold text-foreground"
              >
                {VENUE_ROLE.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="focus-visible:outline-accent rounded-lg bg-gradient-to-br from-accent to-accent-strong px-3 py-1.5 text-xs font-bold text-white shadow-accent transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Add
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}
