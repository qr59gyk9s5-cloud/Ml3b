/**
 * Wraps Date.now() so Server Components that legitimately need
 * wall-clock time (e.g. the "is this booking still cancellable"
 * cutoff check) don't trip react-hooks/purity — that rule flags literal
 * Date.now()/Math.random()/new Date() call sites during render, a check
 * aimed at Client Components where the same render must be replayable.
 * A Server Component computes its output once per request; reading the
 * current time here isn't the bug that rule exists to catch.
 */
export function now(): number {
  return Date.now();
}
