import Link from 'next/link';
import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { listOpenGames } from '@/domain/open-games/queries';
import { formatPriceMinor } from '@/lib/format/money';
import { OPEN_GAME_STATUS_LABEL, OPEN_GAME_STATUS_TONE } from '@/lib/format/open-game-status';
import { SportIcon } from '@/components/sport-icon';

export const metadata: Metadata = { title: 'Open games' };

const TONE_CLASS: Record<string, string> = {
  pending: 'bg-floodlight-wash text-floodlight-strong',
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
    <main>
      {/* Same dark-ink hero family as the home page and header — a
       * compact band instead of the flagship home hero, still fading
       * into the light page below via the same bottom gradient. */}
      <section className="relative overflow-hidden bg-ink">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 500px 320px at 15% -10%, color-mix(in oklch, var(--accent) 55%, transparent), transparent 65%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--background))' }}
        />
        <div className="animate-rise-up relative mx-auto max-w-2xl px-4 pt-8 pb-10 sm:px-6 sm:pt-10 sm:pb-12">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent text-white">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="font-display text-xl font-extrabold tracking-tight text-on-ink sm:text-2xl">
              Open games
            </h1>
          </div>
          <p className="max-w-md text-xs text-on-ink-muted sm:text-sm">
            Need players? Join a game or open a facility&apos;s booking page to organize your own —
            you join as player #1 and pay your own share, same as everyone else.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {games.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <span aria-hidden className="text-2xl">
              ⚽
            </span>
            <p className="font-display text-sm font-bold text-foreground">
              No open games right now
            </p>
            <p className="max-w-sm text-xs text-muted">
              Browse venues and start one from a facility&apos;s booking page.
            </p>
            <Link
              href="/"
              className="btn-sheen focus-visible:outline-accent mt-2 rounded-xl bg-gradient-to-br from-accent to-accent-strong px-4 py-2 font-display text-xs font-bold text-white shadow-accent transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Browse venues
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {games.map((game, i) => {
              const fillPct = Math.min(
                100,
                Math.round((game.joinedCount / game.targetPlayers) * 100),
              );
              const isFilling = game.status === 'FILLING' || game.status === 'MINIMUM_REACHED';
              return (
                <li
                  key={game.id}
                  className="animate-rise-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <Link
                    href={`/games/${game.id}`}
                    className="focus-visible:outline-accent group block rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong">
                        <SportIcon code={game.sportCode} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate font-display text-sm font-bold text-foreground group-hover:text-accent-strong">
                            {game.facilityName} · {game.venueName}
                          </p>
                          <span
                            className={`flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[10px] font-bold ${TONE_CLASS[OPEN_GAME_STATUS_TONE[game.status]]}`}
                          >
                            {isFilling ? (
                              <span
                                className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-current"
                                aria-hidden
                              />
                            ) : null}
                            {OPEN_GAME_STATUS_LABEL[game.status]}
                          </span>
                        </div>
                        <p className="text-xs text-muted">{formatDateTime(game.startAt)}</p>
                      </div>
                    </div>

                    <div className="mt-3.5">
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="font-display text-xs font-extrabold text-foreground">
                          {game.joinedCount}
                          <span className="font-semibold text-faint">
                            /{game.targetPlayers} players
                          </span>
                        </span>
                        <span className="font-display text-xs font-extrabold text-accent-strong">
                          {formatPriceMinor(game.pricePerPlayerMinor, game.currency)}
                          <span className="text-[10px] font-semibold text-faint"> /player</span>
                        </span>
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="relative h-full rounded-full bg-gradient-to-r from-accent to-accent-glow shadow-[0_0_10px_1px_var(--accent-glow)]"
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
