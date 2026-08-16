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
2. **Supabase Row Level Security** as defense-in-depth once the schema
   exists (Phase 2+) — every non-trivial policy documented inline in its
   migration file, no broad "allow all" development shortcuts.
3. **UI hides what a user can't do** — a courtesy, never the enforcement
   mechanism.

## Admin override, specifically

Admins may transition a booking outside the normal state machine only in
exceptional situations, and only with a mandatory reason, written to both
`booking_events` (with `actor_type=ADMIN`) and `audit_logs`. No silent or
reason-less admin edits.
