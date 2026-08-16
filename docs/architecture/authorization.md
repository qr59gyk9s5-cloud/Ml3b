# Authorization

Authentication answers "who are you?" (Supabase Auth). Authorization
answers "are you allowed to do this?" — enforced **server-side**, on every
request, never by hiding a UI element. A malicious user can always call the
API directly; the server must independently verify access regardless of
what the client sent.

All authorization logic lives in `src/domain/authz` — one place, imported
everywhere a permission check is needed. Do not scatter role comparisons
across route handlers or components.

## Matrix

| Action                                | Customer | Receptionist | Manager  | Owner |        Admin        | System |         AI Agent         |
| ------------------------------------- | :------: | :----------: | :------: | :---: | :-----------------: | :----: | :----------------------: |
| Browse public venues                  |    ✅    |      ✅      |    ✅    |  ✅   |         ✅          |   –    |            –             |
| Create booking request                |  ✅ own  |      –       |    –     |   –   |      ✅ assist      |   –    |            –             |
| View own booking                      |    ✅    |      –       |    –     |   –   |         ✅          |   –    |            –             |
| View another customer's booking       |    ❌    |      ❌      |    ❌    |  ❌   |     ✅ audited      |   –    |            ❌            |
| Cancel own booking                    |    ✅    |      –       |    –     |   –   |         ✅          |   –    |            ❌            |
| Confirm/reject request (own venue)    |    –     |      ✅      |    ✅    |  ✅   |         ✅          |   –    |            ❌            |
| Enter manual booking                  |    –     |      ✅      |    ✅    |  ✅   |         ✅          |   –    |            ❌            |
| Block facility time                   |    –     |      ✅      |    ✅    |  ✅   |         ✅          |   –    |            ❌            |
| Edit facility/pricing                 |    –     |      ❌      |    ✅    |  ✅   |         ✅          |   –    |            ❌            |
| Manage venue staff                    |    –     |      ❌      | partial* |  ✅   |         ✅          |   –    |            ❌            |
| Transfer venue ownership              |    –     |      ❌      |    ❌    |  ✅   |         ✅          |   –    |            ❌            |
| Access another venue's data           |    ❌    |      ❌      |    ❌    |  ❌   |     ✅ audited      |   –    |            ❌            |
| View venue analytics                  |    –     |      ❌      |    ✅    |  ✅   |         ✅          |   –    |   read-only tools only   |
| Approve/moderate/suspend venue        |    –     |      ❌      |    ❌    |  ❌   |         ✅          |   –    |            ❌            |
| Suspend user                          |    –     |      ❌      |    ❌    |  ❌   |         ✅          |   –    |            ❌            |
| View audit logs                       |    ❌    |      ❌      |    ❌    |  ❌   |         ✅          |   –    |            ❌            |
| Override booking state                |    ❌    |      ❌      |    ❌    |  ❌   | ✅ reason + audited |   –    |            ❌            |
| Expire stale requests                 |    –     |      –       |    –     |   –   |          –          |   ✅   |            –             |
| Read approved metrics/report          |    –     |      –       |    –     |   –   |         ✅          |   ✅   |       ✅ via tool        |
| Send standardized reminder            |    –     |      –       |    –     |   –   |         ✅          |   ✅   | ✅ post-approval, staged |
| Refund / change commission / ban user |    ❌    |      ❌      |    ❌    |  ❌   |      ✅ manual      |   ❌   |       ❌ **never**       |

\* Manager can invite/remove `RECEPTIONIST` staff, not other `MANAGER`s or
the `OWNER`.

## Enforcement layers

1. **Server-side checks in `src/domain/authz`** — the actual source of
   truth, exercised by every route handler and background job.
2. **Supabase Row Level Security** as defense-in-depth (live since Phase 2
   — see `supabase/migrations/0001_identity_auth_and_rls.sql`) — every
   non-trivial policy documented inline in its migration file, no broad
   "allow all" development shortcuts.
3. **UI hides what a user can't do** — a courtesy, never the enforcement
   mechanism.

### RLS gotcha: self-referencing policies need a `SECURITY DEFINER` helper

A policy on `platform_admins` that queries `platform_admins` (or on
`venue_members` that queries `venue_members`) to check "is the requester
an admin/teammate" is self-referencing — Postgres has to re-evaluate the
same policy to evaluate itself, and raises "infinite recursion detected in
policy." This is exactly the kind of bug an RLS integration test catches
and a code review doesn't (see ADR-010) — it surfaced in Phase 2's own
test run. The fix, used throughout `0001_identity_auth_and_rls.sql`: put
the lookup in a `SECURITY DEFINER` SQL function
(`is_platform_admin`, `has_venue_role`, `is_venue_teammate`) that bypasses
RLS for just that one lookup, and call the function from every policy
instead of inlining the subquery. Reuse those three functions — don't
re-invent the inline version when Phase 3+ adds policies to `facilities`,
`bookings`, etc.

## Admin override, specifically

Admins may transition a booking outside the normal state machine only in
exceptional situations, and only with a mandatory reason, written to both
`booking_events` (with `actor_type=ADMIN`) and `audit_logs`. No silent or
reason-less admin edits.
