# Monitoring

**Chosen approach: Vercel's built-in monitoring** — Vercel Analytics +
Speed Insights + Vercel's own request/function Logs. No separate
error-tracking account (e.g. Sentry) for now; revisit if/when
production traffic and incident volume justify a dedicated tool with
alerting and stack-trace grouping — that's a real tradeoff (less
granular error detail, no automatic alerting rules) accepted
deliberately for now, not an oversight.

**Implementation status (Phase 12): the app-side half is real.**
`@vercel/analytics` and `@vercel/speed-insights` are wired into
`src/app/layout.tsx` (`<Analytics />`, `<SpeedInsights />`) and
`src/app/api/health/route.ts` exists. Both packages no-op automatically
off Vercel (local dev, this sandbox) — nothing to configure for that.
**The account-side half is the founder's job** (Vercel dashboard
toggles, no code) — see the checklist below and
`docs/operations/deployment.md`'s production launch checklist.

## What to enable, once, in the Vercel dashboard

1. **Analytics** (project → Analytics tab → Enable) — page views,
   top pages, referrers. Confirms real traffic is flowing.
2. **Speed Insights** (project → Speed Insights tab → Enable) — Core Web
   Vitals from real visitors, not just synthetic Lighthouse runs.
3. **Logs** (project → Logs tab, or `vercel logs` CLI) — every server
   error (an uncaught exception in a Server Component, Server Action, or
   Route Handler) shows up here with a stack trace. This is the primary
   place to look first when something's reported broken. No setup
   needed — it's automatic — but it's easy to forget to actually look at
   it, which is the real risk, not the tooling.
4. **A external uptime pinger** against `GET /api/health` (e.g.
   UptimeRobot, Better Uptime, or Vercel's own "Checks" if available on
   your plan) — 200 `{"status":"ok"}` means the app can reach its
   database; anything else (including no response) should page someone.
   This is the one piece of monitoring that needs a _third-party_
   account, however small a free-tier one — Vercel logs only tell you
   about traffic that already happened, not "nobody is visiting because
   it's down."

## What must be visible before real production traffic

Restating the original Phase 8/9/12 requirement list, with where each
one actually surfaces today:

| Signal                  | Where it's visible today                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Server errors           | Vercel Logs (automatic)                                                                                         |
| Database reachability   | `GET /api/health` + an uptime pinger (above)                                                                    |
| Failed background jobs  | `/admin` overview panel + `outbox_events` rows directly (`status='FAILED'`)                                     |
| Failed notifications    | `/admin` overview panel + `notifications` rows directly (`status='FAILED'`)                                     |
| Booking conflicts       | Every `CONFLICT` `DomainError` from `transitionBooking()` — logged via Vercel Logs today, not yet counted/rated |
| Authentication failures | Supabase's own Auth logs (Supabase dashboard → Authentication → Logs)                                           |
| AI agent errors         | N/A — no AI agent exists yet (`docs/architecture/ai-agent.md`)                                                  |

`/admin` (`src/app/admin/page.tsx`) is the console's landing page —
`getSystemHealthSummary()` (`src/domain/admin/queries.ts`) counts
`FAILED` rows in both tables plus pending venue approvals. It's a
counter, not a drill-down — still a direct database query to see the
actual stuck rows and reconcile them, same as before. Extending it into
a real drill-down (which rows, when, why) is the next honest
increment, deferred until real traffic makes the counts non-zero often
enough to need it.

## Booking-correctness and payment incidents

Get logged with extra care per `docs/security/threat-model.md` and
`docs/operations/incident-response.md` — a `CONFLICT` on `CONFIRMED`
(the double-booking exclusion constraint actually firing) is the single
signal worth treating as a real page, not a shrug, even though the
system handled it correctly (that's the whole point of the exclusion
constraint) — a spike means something upstream (availability data, UI)
is routinely offering slots it shouldn't.
