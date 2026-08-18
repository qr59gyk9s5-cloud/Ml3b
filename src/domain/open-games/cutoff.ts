/**
 * Resolves every open game whose join cutoff has passed — the safety
 * net, not the primary confirmation path (see
 * docs/architecture/open-games.md's "known gaps": a real per-game
 * exact-timestamp trigger needs a real infra decision — a paid Vercel
 * cron tier or a third-party at-time scheduler — not picked silently
 * here. Until that exists, this only runs as often as
 * src/app/api/cron/booking-maintenance/route.ts's own cadence, so a
 * game's cutoff may be resolved up to that long *after* it actually
 * passed — a real, flagged timeliness gap, not a correctness one:
 * nobody is ever charged for a game that didn't fill, the charge just
 * might not get released as promptly as the founder's spec wants).
 *
 * By the time a game reaches its cutoff still FILLING/MINIMUM_REACHED,
 * join.ts's own immediate-finalize-on-threshold should already have
 * resolved it one way or another — the target-reached and
 * auto-confirm-at-minimum branches below are a defensive fallback, not
 * the expected path.
 */
import { and, eq, inArray, lte } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { openGames } from '@/lib/db/schema';
import { countJoinedPlayers } from './join';
import { cancelOpenGame, finalizeOpenGame } from './finalize';

export interface ResolveOpenGamesResult {
  finalizedCount: number;
  failedCount: number;
}

export async function resolveOpenGamesPastCutoff(
  now: Date = new Date(),
): Promise<ResolveOpenGamesResult> {
  const db = getDb();
  const due = await db
    .select({ id: openGames.id })
    .from(openGames)
    .where(
      and(inArray(openGames.status, ['FILLING', 'MINIMUM_REACHED']), lte(openGames.joinCutoffAt, now)),
    );

  let finalizedCount = 0;
  let failedCount = 0;
  for (const { id } of due) {
    try {
      const [openGame] = await db.select().from(openGames).where(eq(openGames.id, id));
      // Another actor (a join that crossed target, an organizer
      // cancelling) may have already resolved this exact game between
      // the select above and here — re-check, don't assume.
      if (!openGame || (openGame.status !== 'FILLING' && openGame.status !== 'MINIMUM_REACHED')) {
        continue;
      }

      const joinedCount = await countJoinedPlayers(id);
      if (
        joinedCount >= openGame.targetPlayers ||
        (joinedCount >= openGame.minPlayers && openGame.autoConfirmIfMinMet)
      ) {
        await finalizeOpenGame(id);
        finalizedCount++;
      } else {
        await cancelOpenGame(id, 'FAILED_TO_FILL', 'INSUFFICIENT_PLAYERS');
        failedCount++;
      }
    } catch (err) {
      console.error(`[open-games] failed to resolve cutoff for open game ${id}:`, err);
    }
  }

  return { finalizedCount, failedCount };
}
