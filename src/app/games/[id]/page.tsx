import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft, MapPin, Users } from 'lucide-react';
import { getOpenGameById } from '@/domain/open-games/queries';
import { getSessionActor } from '@/lib/auth/session';
import { now } from '@/lib/time/now';
import { formatPriceMinor } from '@/lib/format/money';
import { OPEN_GAME_STATUS_LABEL } from '@/lib/format/open-game-status';
import { VENUE_REASON_LABEL } from '@/lib/format/booking-status';
import { SportIcon } from '@/components/sport-icon';
import {
  CANCELLATION_CUTOFF_HOURS,
  OPEN_GAME_TERMINAL_STATUS,
  SKILL_LEVEL,
  VENUE_CANCELLATION_REASON,
} from '@/lib/config/constants';
import { joinOpenGameAction, leaveOpenGameAction, organizerCancelOpenGameAction } from '../actions';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    created?: string;
    joined?: string;
    left?: string;
    outcome?: string;
    cancelled?: string;
    refunded?: string;
  }>;
};

const JOINABLE_STATUSES = new Set(['FILLING', 'MINIMUM_REACHED']);
// INSUFFICIENT_PLAYERS is the automatic system reason — not something an
// organizer picks by hand. See VENUE_REASON_LABEL / VENUE_CANCELLATION_REASON.
const ORGANIZER_REASONS = VENUE_CANCELLATION_REASON.filter((r) => r !== 'INSUFFICIENT_PLAYERS');

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const game = await getOpenGameById(id);
  return { title: game ? `${game.facilityName} — Open game` : 'Open game not found' };
}

export default async function OpenGameDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const game = await getOpenGameById(id);
  if (!game) notFound();

  const actor = await getSessionActor();
  const isOrganizer = Boolean(actor && game.organizerId === actor.userId);
  const myPlayer = actor ? game.players.find((p) => p.userId === actor.userId) : undefined;
  const cutoffPassed = game.joinCutoffAt.getTime() <= now();
  const isJoinable = JOINABLE_STATUSES.has(game.status) && !cutoffPassed;
  // Founder-specified policy: a CONFIRMED game can still be left/cancelled
  // up until CANCELLATION_CUTOFF_HOURS before kickoff — same window
  // regular booking cancellation uses. See src/domain/open-games/join.ts's
  // leaveConfirmedOpenGame.
  const confirmedCancelCutoffPassed =
    game.startAt.getTime() - now() <= CANCELLATION_CUTOFF_HOURS * 60 * 60_000;
  const canCancelConfirmed = game.status === 'CONFIRMED' && !confirmedCancelCutoffPassed;

  const canJoin = Boolean(actor && !myPlayer && !isOrganizer && isJoinable);
  const canLeave = Boolean(
    myPlayer && !isOrganizer && (JOINABLE_STATUSES.has(game.status) || canCancelConfirmed),
  );
  const canOrganizerCancel =
    isOrganizer &&
    !OPEN_GAME_TERMINAL_STATUS.has(game.status) &&
    (game.status !== 'CONFIRMED' || canCancelConfirmed);
  const fillPct = Math.min(100, Math.round((game.joinedCount / game.targetPlayers) * 100));
  const isFilling = game.status === 'FILLING' || game.status === 'MINIMUM_REACHED';

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link
        href="/games"
        className="mb-4 inline-flex items-center gap-1 font-display text-xs font-bold text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Open games
      </Link>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-accent-strong to-[var(--ink)] p-6">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.12) 0, rgb(255 255 255 / 0.12) 1px, transparent 1px, transparent 11px)',
          }}
        />
        <span
          aria-hidden
          className="animate-float pointer-events-none absolute -top-10 right-[-20px] h-40 w-40 rounded-full bg-white/20 blur-2xl"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur">
              <SportIcon code={game.sportCode} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-extrabold tracking-tight text-white">
                {game.facilityName}
              </h1>
              <Link
                href={`/venues/${game.venueSlug}`}
                className="flex items-center gap-1 text-xs text-white/75 hover:text-white"
              >
                <MapPin className="h-3 w-3 flex-none" aria-hidden />
                {game.venueName}
              </Link>
            </div>
          </div>
          <span
            className={`flex flex-none items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-display text-[11px] font-bold text-white backdrop-blur`}
          >
            {isFilling ? (
              <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
            ) : null}
            {OPEN_GAME_STATUS_LABEL[game.status]}
          </span>
        </div>
        <p className="relative mt-1.5 text-xs text-white/75">{formatDateTime(game.startAt)}</p>
      </div>

      {sp.error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-danger-wash px-3 py-2.5 text-sm font-medium text-danger"
        >
          {sp.error}
        </p>
      ) : null}
      {sp.created ? (
        <p className="mt-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          Game created — waiting for the venue to accept the slot.
        </p>
      ) : null}
      {sp.joined ? (
        <p className="mt-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          You&apos;re in — your share is authorized, not charged yet.
        </p>
      ) : null}
      {sp.left ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted">
          {sp.outcome === 'refunded'
            ? 'You left this game — your payment was refunded.'
            : sp.outcome === 'forfeited'
              ? `You left this game — too close to kickoff (within ${CANCELLATION_CUTOFF_HOURS}h) for a refund.`
              : sp.outcome === 'game_cancelled'
                ? 'You left, and it dropped the roster below the minimum — the game was cancelled and everyone was refunded.'
                : 'You left this game — your hold was released.'}
        </p>
      ) : null}
      {sp.cancelled ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted">
          {sp.refunded
            ? 'Game cancelled — every captured payment was refunded.'
            : 'Game cancelled — every held payment was released.'}
        </p>
      ) : null}

      <div className="-mt-4 mx-1 rounded-2xl border border-line bg-surface p-4 shadow-md">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="font-display text-lg font-extrabold text-accent-strong">
              {game.joinedCount}/{game.targetPlayers}
            </p>
            <p className="text-[10px] font-bold tracking-wide text-faint uppercase">Players</p>
          </div>
          <div>
            <p className="font-display text-lg font-extrabold text-foreground">
              {formatPriceMinor(game.pricePerPlayerMinor, game.currency)}
            </p>
            <p className="text-[10px] font-bold tracking-wide text-faint uppercase">Each</p>
          </div>
          <div>
            <p className="font-display text-lg font-extrabold text-foreground">
              {formatDateTime(game.joinCutoffAt)}
            </p>
            <p className="text-[10px] font-bold tracking-wide text-faint uppercase">Join by</p>
          </div>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-accent to-accent-glow shadow-[0_0_12px_1px_var(--accent-glow)] transition-all duration-500"
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-faint">
            {game.targetPlayers - game.joinedCount > 0
              ? `${game.targetPlayers - game.joinedCount} more player${game.targetPlayers - game.joinedCount === 1 ? '' : 's'} locks this game in`
              : 'Full roster — locked in'}{' '}
            — released &amp; refunded automatically if it doesn&apos;t fill by the cutoff.
          </p>
        </div>
      </div>

      {game.status === 'VENUE_CANCELLED' ||
      game.status === 'FAILED_TO_FILL' ||
      game.status === 'CANCELLED_AFTER_CONFIRMED' ? (
        game.cancelledReason ? (
          <p className="mt-3 text-xs text-danger">
            Reason: {VENUE_REASON_LABEL[game.cancelledReason]}
          </p>
        ) : null
      ) : null}

      <p className="mt-6 font-display text-xs font-bold tracking-wide text-faint uppercase">
        Roster — organized by {game.organizerName}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {game.players.map((player) => (
          <li
            key={player.id}
            className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-accent-glow to-accent-strong font-display text-[10px] font-bold text-white">
                {player.fullName
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
              {player.fullName}
              {player.userId === game.organizerId ? (
                <span className="rounded-full bg-accent-wash px-1.5 py-0.5 font-display text-[10px] font-bold text-accent-strong">
                  Organizer
                </span>
              ) : null}
            </span>
            <span className="text-xs text-muted">
              {[
                player.position,
                player.skillLevel
                  ? player.skillLevel.charAt(0) + player.skillLevel.slice(1).toLowerCase()
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || <Users className="h-3.5 w-3.5 text-faint" aria-hidden />}
            </span>
          </li>
        ))}
      </ul>

      {canJoin ? (
        <form
          action={joinOpenGameAction}
          className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-sm"
        >
          <input type="hidden" name="openGameId" value={game.id} />
          <p className="mb-3 font-display text-sm font-bold text-foreground">Join this game</p>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              name="position"
              placeholder="Position (optional)"
              maxLength={60}
              className="focus-visible:outline-accent flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <select
              name="skillLevel"
              defaultValue=""
              className="focus-visible:outline-accent rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <option value="">Skill level (optional)</option>
              {SKILL_LEVEL.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0) + level.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="btn-sheen focus-visible:outline-accent mt-3 w-full rounded-xl bg-gradient-to-br from-accent to-accent-strong px-4 py-3 font-display text-sm font-bold text-white shadow-accent transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Join and authorize {formatPriceMinor(game.pricePerPlayerMinor, game.currency)}
          </button>
          <p className="mt-2 text-[11px] text-faint">
            Held, not charged — you&apos;re only charged if the game reaches its minimum roster.
          </p>
        </form>
      ) : !actor && isJoinable ? (
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/games/${game.id}`)}`}
          className="btn-sheen focus-visible:outline-accent mt-6 block w-full rounded-xl bg-gradient-to-br from-accent to-accent-strong px-4 py-3 text-center font-display text-sm font-bold text-white shadow-accent transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Sign in to join this game
        </Link>
      ) : null}

      {canLeave ? (
        <form action={leaveOpenGameAction} className="mt-3">
          <input type="hidden" name="openGamePlayerId" value={myPlayer!.id} />
          <input type="hidden" name="openGameId" value={game.id} />
          <button
            type="submit"
            className="focus-visible:outline-accent rounded-lg border border-line px-3 py-1.5 font-display text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Leave this game
          </button>
          {game.status === 'CONFIRMED' ? (
            <p className="mt-1.5 text-[11px] text-faint">
              Refunded if it&apos;s more than {CANCELLATION_CUTOFF_HOURS}h before kickoff and the
              roster still meets the minimum without you — otherwise everyone gets refunded if you
              leaving drops it below minimum, or you forfeit if it&apos;s too close to start.
            </p>
          ) : null}
        </form>
      ) : null}

      {canOrganizerCancel ? (
        <form
          action={organizerCancelOpenGameAction}
          className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-sm"
        >
          <input type="hidden" name="openGameId" value={game.id} />
          <p className="mb-3 font-display text-sm font-bold text-foreground">Cancel this game</p>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <select
              name="reason"
              required
              defaultValue=""
              className="focus-visible:outline-accent flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <option value="" disabled>
                Reason
              </option>
              {ORGANIZER_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {VENUE_REASON_LABEL[reason]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="focus-visible:outline-accent rounded-xl border border-danger px-4 py-2 font-display text-sm font-bold text-danger transition-colors hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Cancel game
            </button>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            {game.status === 'CONFIRMED'
              ? "Every player's captured payment (including yours) is refunded."
              : "Every player's held payment (including yours) is released — nobody is charged."}
          </p>
        </form>
      ) : null}
    </main>
  );
}
