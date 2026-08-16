# Security Model

## Trust boundaries

- **Browser → server:** anything received from the client is untrusted,
  even if the UI never lets a user select an invalid option. A malicious
  actor can call the API directly. Every mutation re-validates ownership
  and permissions server-side.
- **Admin → system:** admins are powerful but not infallible. Sensitive
  actions require a reason and are audited (see
  `docs/architecture/authorization.md#admin-override-specifically`).
- **AI agent → system (future):** the agent is never a trusted actor by
  default — see `docs/architecture/ai-agent.md`.

## Threats and mitigations

| Threat                                  | Mitigation                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| IDOR                                    | server-side ownership check on every read/write + RLS                                         |
| Broken authorization                    | single `src/domain/authz` module; full matrix test coverage                                   |
| SQL injection                           | Drizzle parameterized queries only; no string-built SQL                                       |
| XSS                                     | React auto-escaping; sanitize any rich text; CSP headers                                      |
| CSRF                                    | Supabase httpOnly session cookies, same-site; Next.js server action protections               |
| Mass assignment                         | Zod allow-lists on every mutation input, never spreading raw request bodies into DB writes    |
| Rate-limit bypass                       | rate limiting on login/signup/booking-creation/support endpoints                              |
| Credential/secret leakage               | service-role key server-only; `.env.example` only in the repo; CI secret scanning             |
| Session theft                           | httpOnly, secure, same-site cookies via Supabase Auth                                         |
| Webhook spoofing (future payments)      | signature verification, idempotent processing, never trust a frontend-reported payment status |
| Prompt injection (future AI)            | external text always treated as data; tool authorization enforced in code                     |
| File upload abuse (future venue photos) | authenticated uploader + ownership check, MIME/size/type validation, no executable uploads    |

## Never expose to the browser

Supabase service-role key, database credentials, payment provider secret
keys, SMTP/notification provider credentials, any `SUPABASE_SERVICE_ROLE_KEY`-
style variable. See `docs/security/secrets.md`.

## Response discipline

User-facing errors stay understandable and never leak internals (no raw
Postgres error codes, no stack traces). Internal logs may carry more detail
— see the error-code list forming as domain services are built
(`BOOKING_NOT_FOUND`, `BOOKING_CONFLICT`, `INVALID_BOOKING_TRANSITION`,
`UNAUTHORIZED`, `FORBIDDEN`, etc.).
