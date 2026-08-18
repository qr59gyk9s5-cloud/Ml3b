import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft, MapPin } from 'lucide-react';
import { getActiveFacilityById, getPublicVenueBySlug } from '@/domain/venue/queries';
import { getAvailableSlots } from '@/domain/availability/queries';
import { addLocalDays, todayInTimeZone } from '@/domain/availability/time';
import { getSessionActor } from '@/lib/auth/session';
import { SportIcon } from '@/components/sport-icon';
import {
  computeDurationOptions,
  computeValidStartIndexes,
  formatDateLabel,
  formatSlotTime,
} from '@/lib/booking/slot-picker';
import { OPEN_GAME_MAX_HOLD_HOURS, OPEN_GAME_MIN_LEAD_TIME_HOURS } from '@/lib/config/constants';
import { createOpenGameAction } from '@/app/games/actions';

type Props = {
  params: Promise<{ slug: string; facilityId: string }>;
  searchParams: Promise<{ date?: string; duration?: string; startAt?: string; error?: string }>;
};

const CUTOFF_OPTIONS_HOURS = [1, 2, 4, 6, 12, 24, 48] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, facilityId } = await params;
  const venue = await getPublicVenueBySlug(slug);
  if (!venue) return { title: 'Venue not found' };
  const facility = await getActiveFacilityById(facilityId, venue.id);
  return {
    title: facility ? `Organize a game — ${facility.name}, ${venue.name}` : 'Facility not found',
  };
}

export default async function OrganizeOpenGamePage({ params, searchParams }: Props) {
  const { slug, facilityId } = await params;
  const sp = await searchParams;

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();
  const facility = await getActiveFacilityById(facilityId, venue.id);
  if (!facility) notFound();

  const today = todayInTimeZone(venue.timezone);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const durationOptions = computeDurationOptions(facility);
  const requestedDuration = sp.duration ? Number(sp.duration) : durationOptions[0];
  const duration = durationOptions.includes(requestedDuration)
    ? requestedDuration
    : durationOptions[0];
  const slotsNeeded = duration / facility.slotDurationMinutes;

  const slots = await getAvailableSlots(facility.id, date);
  const validStartIndexes = computeValidStartIndexes(slots, slotsNeeded);

  const actor = await getSessionActor();
  const dayLinks = Array.from({ length: 7 }, (_, i) => addLocalDays(today, i));

  const selectedStart = sp.startAt ? new Date(sp.startAt) : null;
  const selectedIsValid =
    selectedStart &&
    validStartIndexes.some((i) => slots[i].startAt.getTime() === selectedStart.getTime());

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link
        href={`/venues/${slug}/book/${facilityId}`}
        className="mb-4 inline-flex items-center gap-1 font-display text-xs font-bold text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Back to booking
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong">
          <SportIcon code={facility.sportCode} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-foreground">
            Organize an open game
          </h1>
          <p className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="h-3 w-3 flex-none" aria-hidden />
            {facility.name}, {venue.name}
          </p>
        </div>
      </div>

      <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
        You&apos;ll join as player #1 and authorize your own share right away. Other players can join
        once the venue accepts the slot; if the roster doesn&apos;t reach the minimum by your join
        cutoff, everyone (including you) is released and nobody is charged.
      </p>

      {sp.error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-danger-wash px-3 py-2.5 text-sm font-medium text-danger"
        >
          {sp.error}
        </p>
      ) : null}

      {durationOptions.length > 1 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wide text-faint uppercase">Duration</span>
          {durationOptions.map((d) => (
            <Link
              key={d}
              href={`?date=${date}&duration=${d}`}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                d === duration
                  ? 'border-transparent bg-gradient-to-br from-accent to-accent-strong text-white shadow-accent'
                  : 'border-line text-muted hover:border-accent hover:text-accent-strong'
              }`}
            >
              {d} min
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
        {dayLinks.map((d) => (
          <Link
            key={d}
            href={`?date=${d}&duration=${duration}`}
            className={`flex-none rounded-xl border px-3 py-1.5 font-display text-xs font-bold transition-colors ${
              d === date
                ? 'border-transparent bg-gradient-to-br from-accent to-accent-strong text-white shadow-accent'
                : 'border-line text-muted hover:border-accent hover:text-accent-strong'
            }`}
          >
            {formatDateLabel(d)}
          </Link>
        ))}
      </div>

      <p className="mt-5 text-xs font-bold tracking-wide text-faint uppercase">
        Pick a start time · {duration}-minute game
      </p>

      {slots.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Closed on this day.
        </p>
      ) : validStartIndexes.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          No {duration}-minute openings on this day. Try another date or duration.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {validStartIndexes.map((i) => {
            const start = slots[i].startAt;
            const end = slots[i + slotsNeeded - 1].endAt;
            const isSelected = selectedStart && start.getTime() === selectedStart.getTime();
            return (
              <Link
                key={start.toISOString()}
                href={`?date=${date}&duration=${duration}&startAt=${encodeURIComponent(start.toISOString())}`}
                className={`focus-visible:outline-accent flex w-full flex-col items-center rounded-xl border px-2 py-2.5 text-center transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  isSelected
                    ? 'border-transparent bg-gradient-to-br from-accent to-accent-strong text-white shadow-accent'
                    : 'border-line bg-surface hover:-translate-y-0.5 hover:border-accent hover:bg-accent-wash'
                }`}
              >
                <span className="font-display text-xs font-bold">{formatSlotTime(start, venue.timezone)}</span>
                <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-faint'}`}>
                  – {formatSlotTime(end, venue.timezone)}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {selectedStart && selectedIsValid ? (
        <form
          action={createOpenGameAction}
          className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
        >
          <input type="hidden" name="venueSlug" value={slug} />
          <input type="hidden" name="facilityId" value={facility.id} />
          <input type="hidden" name="startAt" value={selectedStart.toISOString()} />
          <input type="hidden" name="durationMinutes" value={duration} />

          <p className="text-sm font-bold text-foreground">
            {formatSlotTime(selectedStart, venue.timezone)} on {formatDateLabel(date)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-faint uppercase">
              Target players
              <input
                type="number"
                name="targetPlayers"
                min={2}
                max={50}
                defaultValue={10}
                required
                className="focus-visible:outline-accent rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-faint uppercase">
              Minimum to proceed
              <input
                type="number"
                name="minPlayers"
                min={2}
                max={50}
                defaultValue={8}
                required
                className="focus-visible:outline-accent rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-faint uppercase">
              Price per player ({facility.currency})
              <input
                type="number"
                name="pricePerPlayerEgp"
                min={1}
                step={1}
                defaultValue={Math.max(1, Math.round(facility.basePriceMinor / 100 / 10))}
                required
                className="focus-visible:outline-accent rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-faint uppercase">
              Join cutoff
              <select
                name="cutoffHoursBeforeStart"
                defaultValue={2}
                className="focus-visible:outline-accent rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {CUTOFF_OPTIONS_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}h before kickoff
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <input type="checkbox" name="autoConfirmIfMinMet" className="h-4 w-4 rounded" />
            Auto-confirm as soon as the minimum is reached (otherwise the game only confirms if it
            hits the target, or is resolved at the cutoff)
          </label>

          <p className="text-[11px] text-faint">
            Games can only be created at least {OPEN_GAME_MIN_LEAD_TIME_HOURS}h before kickoff, and
            the join cutoff can be at most {OPEN_GAME_MAX_HOLD_HOURS}h from now — a venue can&apos;t
            hold a slot indefinitely.
          </p>

          <button
            type="submit"
            title={actor ? 'Create this open game' : 'Sign in to create this open game'}
            className="btn-sheen focus-visible:outline-accent mt-1 rounded-xl bg-gradient-to-br from-accent to-accent-strong px-4 py-3 font-display text-sm font-bold text-white shadow-accent transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Create open game
          </button>
        </form>
      ) : null}
    </main>
  );
}
