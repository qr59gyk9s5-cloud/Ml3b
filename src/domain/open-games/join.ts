/**
 * Joining and leaving an open game's roster. Only once the game has
 * reached FILLING (the venue accepted the provisional hold) or
 * MINIMUM_REACHED (still FILLING in every way that matters, just
 * display-flagged as having cleared the minimum) — never AWAITING_VENUE
 * (see create-open-game.ts: the organizer is the one deliberate
 * exception, joining immediately). See docs/architecture/open-games.md.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { openGamePlayers, openGames, type OpenGamePlayer } from '@/lib/db/schema';
import { isUniqueViolation } from '@/lib/db/errors';
import { DomainError } from '@/domain/errors';
import { isUserSuspended } from '@/domain/admin/suspension';
import {
  authorizePaymentForOpenGamePlayer,
  releaseOpenGamePlayerPayment,
} from '@/domain/payments/service';
import { joinOpenGameSchema, type JoinOpenGameInput } from '@/lib/validation/open-game';
import { finalizeOpenGame } from './finalize';

export interface OpenGamePlayerActor {
  userId: string | null;
}

const JOINABLE_STATUSES = new Set(['FILLING', 'MINIMUM_REACHED']);

export async function countJoinedPlayers(openGameId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: openGamePlayers.id })
    .from(openGamePlayers)
    .where(and(eq(openGamePlayers.openGameId, openGameId), eq(openGamePlayers.status, 'JOINED')));
  return rows.length;
}

export async function joinOpenGame(
  actor: OpenGamePlayerActor,
  openGameId: string,
  rawInput: JoinOpenGameInput,
): Promise<OpenGamePlayer> {
  if (!actor.userId) {
    throw new DomainError('FORBIDDEN', 'Sign in to join a game.');
  }
  if (await isUserSuspended(actor.userId)) {
    throw new DomainError('FORBIDDEN', 'Your account has been suspended.');
  }

  const parsed = joinOpenGameSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid input.');
  }
  const input = parsed.data;

  const db = getDb();
  const [openGame] = await db.select().from(openGames).where(eq(openGames.id, openGameId));
  if (!openGame) {
    throw new DomainError('NOT_FOUND', 'Open game not found.');
  }
  if (!JOINABLE_STATUSES.has(openGame.status)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      openGame.status === 'AWAITING_VENUE'
        ? 'This game is not open for joining yet — the venue has not accepted it.'
        : 'This game is no longer accepting players.',
    );
  }
  if (openGame.joinCutoffAt.getTime() <= Date.now()) {
    throw new DomainError('INVALID_TRANSITION', 'The join window for this game has closed.');
  }

  const joinedCount = await countJoinedPlayers(openGameId);
  if (joinedCount >= openGame.targetPlayers) {
    throw new DomainError('CONFLICT', 'This game is already full.');
  }

  let player: OpenGamePlayer;
  try {
    [player] = await db
      .insert(openGamePlayers)
      .values({
        openGameId,
        userId: actor.userId,
        position: input.position,
        skillLevel: input.skillLevel,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err, 'open_game_players_one_active_join_per_user')) {
      throw new DomainError('CONFLICT', 'You have already joined this game.');
    }
    throw err;
  }

  // Best-effort — never throws, never blocks. See
  // src/domain/payments/service.ts's doc comment.
  await authorizePaymentForOpenGamePlayer(
    player,
    openGame.bookingId,
    openGame.pricePerPlayerMinor,
    openGame.currency,
  );

  // Re-count after the insert (not joinedCount + 1) so a race between
  // two simultaneous joins can never finalize/flip status on a stale
  // count.
  const newCount = await countJoinedPlayers(openGameId);
  if (newCount >= openGame.targetPlayers) {
    // Reaching the target always locks the game in immediately,
    // regardless of auto_confirm_if_min_met — no reason to make a full
    // roster wait.
    await finalizeOpenGame(openGameId);
  } else if (newCount >= openGame.minPlayers) {
    if (openGame.autoConfirmIfMinMet) {
      await finalizeOpenGame(openGameId);
    } else if (openGame.status === 'FILLING') {
      // Display-only status change — "require full roster" games don't
      // finalize here, they either reach target or fail at cutoff.
      await db
        .update(openGames)
        .set({ status: 'MINIMUM_REACHED', updatedAt: new Date() })
        .where(eq(openGames.id, openGameId));
    }
  }

  return player;
}

export interface LeaveOpenGameParams {
  openGamePlayerId: string;
  actor: OpenGamePlayerActor;
}

export async function leaveOpenGame(params: LeaveOpenGameParams): Promise<OpenGamePlayer> {
  if (!params.actor.userId) {
    throw new DomainError('FORBIDDEN', 'Sign in to leave a game.');
  }

  const db = getDb();
  const [player] = await db
    .select()
    .from(openGamePlayers)
    .where(eq(openGamePlayers.id, params.openGamePlayerId));
  if (!player) {
    throw new DomainError('NOT_FOUND', 'You are not on this game’s roster.');
  }
  if (player.userId !== params.actor.userId) {
    throw new DomainError('FORBIDDEN', 'You can only remove yourself from a roster.');
  }
  if (player.status !== 'JOINED') {
    throw new DomainError('INVALID_TRANSITION', 'You have already left this game.');
  }

  const [openGame] = await db.select().from(openGames).where(eq(openGames.id, player.openGameId));
  if (!openGame || !JOINABLE_STATUSES.has(openGame.status)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      'This game has already been finalized or cancelled — contact the organizer.',
    );
  }

  const [updated] = await db
    .update(openGamePlayers)
    .set({ status: 'LEFT', leftAt: new Date(), updatedAt: new Date() })
    .where(eq(openGamePlayers.id, player.id))
    .returning();

  // Best-effort — never throws, never blocks.
  await releaseOpenGamePlayerPayment(player);

  return updated;
}
