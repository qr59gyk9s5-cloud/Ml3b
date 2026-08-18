import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft, MapPin, Users } from 'lucide-react';
import { getOpenGameById } from '@/domain/open-games/queries';
import { getSessionActor } from '@/lib/auth/session';
import { now } from '@/lib/time/now';
import { formatPriceMinor } from '@/lib/format/money';
import { OPEN_GAME_STATUS_LABEL, OPEN_GAME_STATUS_TONE } from '@/lib/format/open-game-status';
import { VENUE_REASON_LABEL } from '@/lib/format/booking-status';
import { SportIcon } from '@/components/sport-icon';
import { OPEN_GAME_TERMINAL_STATUS, SKILL_LEVEL, VENUE_CANCELLATION_REASON } from '@/lib/config/constants';
import { joinOpenGameAction, leaveOpenGameAction, organizerCancelOpenGameAction } from '../actions';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; created?: string; joined?: string; left?: string; cancelled?: string }>;
};

const TONE_CLASS: Record<string, string> = {
  pending: 'bg-floodlight-wash text-floodlight',
  positive: 'bg-accent-wash text-accent-strong',
  negative: 'bg-danger-wash text-danger',
  neutral: 'bg-surface-2 text-faint',
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

  const canJoin = Boolean(actor && !myPlayer && !isOrganizer && isJoinable);
  const canLeave = Boolean(myPlayer && !isOrganizer && JOINABLE_STATUSES.has(game.status));
  const canOrganizerCancel = isOrganizer && !OPEN_GAME_TERMINAL_STATUS.has(game.status);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link
        href="/games"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Open games
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong">
            <SportIcon code={game.sportCode} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              {game.facilityName}
            </h1>
            <Link
              href={`/venues/${game.venueSlug}`}
              className="flex items-center gap-1 text-xs text-muted hover:text-accent-strong"
            >
              <MapPin className="h-3 w-3 flex-none" aria-hidden />
              {game.venueName}
            </Link>
          </div>
        </div>
        <span
          className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${TONE_CLASS[OPEN_GAME_STATUS_TONE[game.status]]}`}
        >
          {OPEN_GAME_STATUS_LABEL[game.status]}
        </span>
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
          You left this game — your hold was released.
        </p>
      ) : null}
      {sp.cancelled ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted">
          Game cancelled — every held payment was released.
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="When" value={formatDateTime(game.startAt)} />
        <Stat
          label="Players"
          value={`${game.joinedCount}/${game.targetPlayers}`}
          hint={`min ${game.minPlayers}`}
        />
        <Stat
          label="Per player"
          value={formatPriceMinor(game.pricePerPlayerMinor, game.currency)}
        />
        <Stat label="Join by" value={formatDateTime(game.joinCutoffAt)} />
      </div>

      {game.status === 'VENUE_CANCELLED' || game.status === 'FAILED_TO_FILL' ? (
        game.cancelledReason ? (
          <p className="mt-3 text-xs text-danger">
            Reason: {VENUE_REASON_LABEL[game.cancelledReason]}
          </p>
        ) : null
      ) : null}

      <p className="mt-6 text-xs font-bold tracking-wide text-faint uppercase">
        Roster — organized by {game.organizerName}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {game.players.map((player) => (
          <li
            key={player.id}
            className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Users className="h-3.5 w-3.5 flex-none text-faint" aria-hidden />
              {player.fullName}
              {player.userId === game.organizerId ? (
                <span className="rounded-full bg-accent-wash px-1.5 py-0.5 text-[10px] font-bold text-accent-strong">
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
                .join(' · ') || '—'}
            </span>
          </li>
        ))}
      </ul>

      {canJoin ? (
        <form action={joinOpenGameAction} className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <input type="hidden" name="openGameId" value={game.id} />
          <p className="mb-3 text-sm font-bold text-foreground">Join this game</p>
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
            className="focus-visible:outline-accent mt-3 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
          className="focus-visible:outline-accent mt-6 block w-full rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
            className="focus-visible:outline-accent rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Leave this game
          </button>
        </form>
      ) : null}

      {canOrganizerCancel ? (
        <form
          action={organizerCancelOpenGameAction}
          className="mt-6 rounded-2xl border border-line bg-surface p-4"
        >
          <input type="hidden" name="openGameId" value={game.id} />
          <p className="mb-3 text-sm font-bold text-foreground">Cancel this game</p>
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
              className="focus-visible:outline-accent rounded-xl border border-danger px-4 py-2 text-sm font-bold text-danger transition-colors hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Cancel game
            </button>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Every player&apos;s held payment (including yours) is released — nobody is charged.
          </p>
        </form>
      ) : null}
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-2.5">
      <p className="text-[10px] font-bold tracking-wide text-faint uppercase">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
      {hint ? <p className="text-[10px] text-faint">{hint}</p> : null}
    </div>
  );
}
