# ADR-008: English + Arabic (RTL) From the First Release

**Date:** 2026-08-16
**Status:** Accepted

## Context

The founder spec's default suggestion was to ship English-only and design
for localization later. The founder explicitly requested both languages,
RTL-ready, for the first release rather than as a follow-up.

## Decision

UI copy is never embedded as inline strings deep in components. Every
customer- and venue-facing string goes through an i18n layer
(library choice made in Phase 6 when real UI is built — e.g.
`next-intl`), with English and Arabic message catalogs maintained
together from the start. Layout uses logical CSS properties
(`margin-inline-start` over `margin-left`, etc.) so RTL is a data
attribute switch, not a redesign.

## Alternatives considered

- **English-only MVP, retrofit i18n later** — the spec's original
  suggestion, rejected per the founder's explicit answer. Retrofitting
  i18n after components are built with hardcoded strings and
  physical-direction CSS is significantly more expensive than building it
  in from the start.

## Advantages

No expensive retrofit later; RTL support is validated continuously as
screens are built rather than as a separate late-stage project.

## Disadvantages

Every new screen from Phase 6 onward needs both an English and Arabic
string reviewed before merge — a small ongoing cost accepted in exchange
for avoiding the retrofit.

## Consequences

Component and copy review checklists (once UI phases start) include "does
this render correctly in Arabic/RTL," not just English. Locale is a
first-class concept in `src/lib/config/constants.ts`
(`SUPPORTED_LOCALES`, `RTL_LOCALES`) from Phase 1 onward.
