/**
 * Runs before any integration test file's modules are evaluated (Vitest
 * `setupFiles`). Domain services import `getDb()` from
 * src/lib/db/client.ts, which reads env.DATABASE_URL — not
 * TEST_DATABASE_URL. Without this, domain-service integration tests would
 * silently write to the real dev database instead of the disposable test
 * one that src/testing/db.ts resets on every run.
 *
 * Must happen here (a setupFile), not at the top of src/testing/db.ts —
 * env.ts snapshots process.env.DATABASE_URL the moment it's first
 * imported, and that could happen before src/testing/db.ts runs depending
 * on a given test file's import order. Vitest guarantees setupFiles run
 * before any test file's imports are evaluated, so this is the only place
 * that's order-independent.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
