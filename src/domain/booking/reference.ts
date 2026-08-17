/**
 * Human-readable booking reference ('BK-7F2K91') — the UUID id remains
 * canonical; this is only what's shown to people. Excludes visually
 * ambiguous characters (0/O, 1/I/L). Not cryptographically unique by
 * construction — the DB's UNIQUE constraint on bookings.reference is the
 * actual guarantee; createBookingRequest retries on collision (astronomically
 * unlikely at this alphabet/length, but never assumed).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

export function generateBookingReference(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `BK-${code}`;
}
