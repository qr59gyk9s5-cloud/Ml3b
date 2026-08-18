import Link from 'next/link';
import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { listOpenGames } from '@/domain/open-games/queries';
import { formatPriceMinor } from '@/lib/format/money';
import { OPEN_GAME_STATUS_LABEL, OPEN_GAME_STATUS_TONE } from '@/lib/format/open-game-status';
import { SportIcon } from '@/components/sport-icon';

export const metadata: Metadata = { title: 'Open games — Sports Venue Marketplace' };

const TONE_CLASS: Record<string, string> = {
  pending: 'bg-floodlight-wash text-floodlight',
  positive: 'bg-accent-wash text-accent-strong',
  negative: 'bg-danger-wash text-danger',
  neutral: 'bg-surface-2 text-faint',
};

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

export default async function OpenGamesPage() {
  const games = await listOpenGames();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-5 w-5 text-accent-strong" aria-hidden />
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Open games</h1>
      </div>
      <p className="mb-6 text-xs text-muted">
        Need players? Join a game or open a facility&apos;s booking page to organize your own — you
        join as player #1 and pay your own share, same as everyone else.
      </p>

      {games.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <span aria-hidden className="text-2xl">
            ⚽
          </span>
          <p className="text-sm font-medium text-foreground">No open games right now</p>
          <p className="max-w-sm text-xs text-muted">
            Browse venues and start one from a facility&apos;s booking page.
          </p>
          <Link
            href="/"
            className="focus-visible:outline-accent mt-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Browse venues
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {games.map((game) => (
            <li key={game.id}>
              <Link
                href={`/games/${game.id}`}
                className="focus-visible:outline-accent group flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong">
                  <SportIcon code={game.sportCode} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-bold text-foreground group-hover:text-accent-strong">
                      {game.facilityName} · {game.venueName}
                    </p>
                    <span
                      className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_CLASS[OPEN_GAME_STATUS_TONE[game.status]]}`}
                    >
                      {OPEN_GAME_STATUS_LABEL[game.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{formatDateTime(game.startAt)}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-accent-strong">
                      {game.joinedCount}/{game.targetPlayers} players
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {formatPriceMinor(game.pricePerPlayerMinor, game.currency)}/player
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
