/**
 * Recognizing specific Postgres errors from underneath Drizzle's wrapper
 * (DrizzleQueryError, whose `.cause` is the real postgres.js error — see
 * ADR-004 / the venue-members uniqueness test that first ran into this).
 * Never leak these codes or raw messages to a user — domain services
 * catch them and translate to a clean DomainError.
 */

function extractPgError(err: unknown): { code?: string; constraint_name?: string } | undefined {
  if (!err || typeof err !== 'object') return undefined;
  if ('cause' in err && err.cause && typeof err.cause === 'object') {
    return err.cause as { code?: string; constraint_name?: string };
  }
  if ('code' in err) {
    return err as { code?: string; constraint_name?: string };
  }
  return undefined;
}

export function getPostgresErrorCode(err: unknown): string | undefined {
  return extractPgError(err)?.code;
}

/** 23P01 — exclusion_violation. This is how the double-booking guarantee
 * (the GiST exclusion constraint, ADR-004) actually announces a conflict. */
export function isExclusionViolation(err: unknown): boolean {
  return getPostgresErrorCode(err) === '23P01';
}

/** 40P01 — deadlock_detected. Two genuinely simultaneous writes racing
 * to CONFIRM overlapping bookings can deadlock while Postgres checks the
 * exclusion constraint (each waits on a lock the other holds), rather
 * than one cleanly losing with 23P01 — confirmed by
 * transition.integration.test.ts's concurrent-confirmation test
 * reproducing it under real contention. Both outcomes mean the same
 * thing to a caller: "someone else won this race, your write didn't
 * happen" — never data corruption, since Postgres aborts one whole
 * transaction rather than applying a partial write. Treated the same as
 * an exclusion violation wherever transition.ts checks for one. */
export function isDeadlockDetected(err: unknown): boolean {
  return getPostgresErrorCode(err) === '40P01';
}

/** 23505 — unique_violation, optionally scoped to a specific constraint. */
export function isUniqueViolation(err: unknown, constraintName?: string): boolean {
  const pgError = extractPgError(err);
  if (pgError?.code !== '23505') return false;
  if (!constraintName) return true;
  return pgError.constraint_name === constraintName;
}
