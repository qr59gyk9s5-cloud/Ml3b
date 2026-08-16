# ADR-006: AI Agent Operates Only Through Authorized Tools

**Date:** 2026-08-16
**Status:** Accepted (architecture defined now; implementation deferred to Phase 13+)

## Context

The product plan includes a future AI Operations Agent. The founder spec is
explicit and non-negotiable: AI must never become the source of truth for
booking, permission, or financial facts, and must never get unrestricted
database, shell, or production GitHub access.

## Decision

```
LLM → tool registry → authorization check → domain service → domain validation → database
```

Every agent capability is a typed tool with input/output schemas,
authorization enforcement, audit logging, and an explicit risk tier
(`READ_ONLY | LOW_RISK | MEDIUM_RISK | HIGH_RISK`). `HIGH_RISK` actions
(refunds, bans, commission/price changes, deletions, permission changes)
are structurally incapable of unattended execution — enforced by requiring
an `agent_approvals` record, not by prompting the model to ask first.

## Alternatives considered

- **Direct database access for the agent, with prompt-level restrictions**
  — explicitly rejected. Prompt instructions are not a security boundary;
  a model can be manipulated by injected text (customer messages, reviews,
  support tickets) into ignoring them.

## Advantages

The booking engine's correctness guarantees (state machine, exclusion
constraint, authorization matrix) apply to AI-initiated actions exactly as
they apply to human-initiated ones — no separate, weaker code path.

## Disadvantages

More upfront engineering per agent capability (typed tool + authz + audit
per action) than giving the model a SQL client. Accepted deliberately.

## Consequences

Staged rollout (`docs/architecture/ai-agent.md`) — read-only reports first,
then human-approved proposals, then limited automation — never a jump
straight to autonomous `HIGH_RISK` actions.
