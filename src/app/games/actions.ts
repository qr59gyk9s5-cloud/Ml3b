'use server';

/**
 * Server actions for the open-games UI. Same discipline as
 * src/app/bookings/actions.ts and src/app/venues/[slug]/book/[facilityId]/actions.ts:
 * the actor is always re-derived from the session server-side, never
 * trusted from the form (CLAUDE.md — never trust the client). All real
 * validation lives in src/domain/open-games — these are just the
 * HTTP-shaped wrappers around it.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionActor } from '@/lib/auth/session';
import { createOpenGame } from '@/domain/open-games/create-open-game';
import { joinOpenGame, leaveOpenGame } from '@/domain/open-games/join';
import { organizerCancelOpenGame } from '@/domain/open-games/organizer-actions';
import { DomainError } from '@/domain/errors';
import type { SkillLevel, VenueCancellationReason } from '@/lib/config/constants';

function errorMessage(err: unknown): string {
  return err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
}

export async function createOpenGameAction(formData: FormData) {
  const actor = await getSessionActor();
  const venueSlug = String(formData.get('venueSlug') ?? '');
  const facilityId = String(formData.get('facilityId') ?? '');
  const createPath = `/venues/${venueSlug}/book/${facilityId}/open-game`;

  if (!actor) {
    redirect(`/sign-in?next=${encodeURIComponent(createPath)}`);
  }

  const startAt = new Date(String(formData.get('startAt') ?? ''));
  const durationMinutes = Number(formData.get('durationMinutes'));
  const targetPlayers = Number(formData.get('targetPlayers'));
  const minPlayers = Number(formData.get('minPlayers'));
  // Collected from the organizer as whole EGP; the domain layer only
  // ever deals in minor units (CLAUDE.md — money is integer minor units).
  const pricePerPlayerEgp = Number(formData.get('pricePerPlayerEgp'));
  const cutoffHoursBeforeStart = Number(formData.get('cutoffHoursBeforeStart'));
  const autoConfirmIfMinMet = formData.get('autoConfirmIfMinMet') === 'on';

  const joinCutoffAt = new Date(startAt.getTime() - cutoffHoursBeforeStart * 60 * 60_000);

  let openGameId: string;
  try {
    const openGame = await createOpenGame(
      { userId: actor.userId },
      {
        facilityId,
        startAt,
        durationMinutes,
        targetPlayers,
        minPlayers,
        pricePerPlayerMinor: Math.round(pricePerPlayerEgp * 100),
        joinCutoffAt,
        autoConfirmIfMinMet,
      },
    );
    openGameId = openGame.id;
  } catch (err) {
    redirect(`${createPath}?error=${encodeURIComponent(errorMessage(err))}`);
  }

  revalidatePath('/games');
  redirect(`/games/${openGameId}?created=1`);
}

export async function joinOpenGameAction(formData: FormData) {
  const actor = await getSessionActor();
  const openGameId = String(formData.get('openGameId') ?? '');
  const gamePath = `/games/${openGameId}`;

  if (!actor) {
    redirect(`/sign-in?next=${encodeURIComponent(gamePath)}`);
  }

  const positionRaw = String(formData.get('position') ?? '').trim();
  const skillLevelRaw = String(formData.get('skillLevel') ?? '');

  try {
    await joinOpenGame({ userId: actor.userId }, openGameId, {
      position: positionRaw.length > 0 ? positionRaw : undefined,
      skillLevel: skillLevelRaw.length > 0 ? (skillLevelRaw as SkillLevel) : undefined,
    });
  } catch (err) {
    redirect(`${gamePath}?error=${encodeURIComponent(errorMessage(err))}`);
  }

  revalidatePath(gamePath);
  revalidatePath('/games');
  redirect(`${gamePath}?joined=1`);
}

export async function leaveOpenGameAction(formData: FormData) {
  const actor = await getSessionActor();
  const openGamePlayerId = String(formData.get('openGamePlayerId') ?? '');
  const openGameId = String(formData.get('openGameId') ?? '');
  const gamePath = `/games/${openGameId}`;

  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(gamePath)}`);

  let outcome: string;
  try {
    const result = await leaveOpenGame({ openGamePlayerId, actor: { userId: actor.userId } });
    outcome = result.outcome;
  } catch (err) {
    redirect(`${gamePath}?error=${encodeURIComponent(errorMessage(err))}`);
  }

  revalidatePath(gamePath);
  revalidatePath('/games');
  // outcome tells the page which of four different messages to show —
  // "released" (pre-confirm hold) reads very differently from
  // "forfeited" (captured payment, past the cancellation cutoff) or
  // "game_cancelled" (this departure dropped the roster below minimum,
  // so everyone — not just this player — got refunded).
  redirect(`${gamePath}?left=1&outcome=${outcome}`);
}

export async function organizerCancelOpenGameAction(formData: FormData) {
  const actor = await getSessionActor();
  const openGameId = String(formData.get('openGameId') ?? '');
  const gamePath = `/games/${openGameId}`;

  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(gamePath)}`);

  const reason = String(formData.get('reason') ?? '');

  let refunded = false;
  try {
    const updated = await organizerCancelOpenGame(
      { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin },
      openGameId,
      { reason: reason as VenueCancellationReason },
    );
    // A CONFIRMED game's payments were CAPTURED, not just held — everyone
    // gets refunded, not just released. See finalize.ts's
    // cancelConfirmedOpenGame vs cancelOpenGame.
    refunded = updated.status === 'CANCELLED_AFTER_CONFIRMED';
  } catch (err) {
    redirect(`${gamePath}?error=${encodeURIComponent(errorMessage(err))}`);
  }

  revalidatePath(gamePath);
  revalidatePath('/games');
  redirect(`${gamePath}?cancelled=1${refunded ? '&refunded=1' : ''}`);
}
