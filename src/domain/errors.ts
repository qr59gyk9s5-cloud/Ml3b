/**
 * Shared domain error type. Every domain service throws one of these
 * instead of a bare Error, so route handlers can map error.code to the
 * right HTTP status and a safe, user-facing message — never a raw stack
 * trace or Postgres error leaking to the client. See founder spec §48.
 */

export const DOMAIN_ERROR_CODE = [
  'NOT_FOUND',
  'FORBIDDEN',
  'INVALID_TRANSITION',
  'VALIDATION_FAILED',
  'CONFLICT',
] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODE)[number];

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
