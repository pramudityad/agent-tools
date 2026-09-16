# 0002 — No Verify, no Run

**Status:** accepted · 2026-09-16

## Context

The concrete failure that motivated this tool was not a missing capability — it was that
nothing recorded what "done" meant. A scheduled benchmark job had been failing silently every
morning since 2026-09-13 while passing whenever run by hand, and the only way to notice was
to go and look. Separately, a recipe run twice by hand could differ both times with nothing
noticing.

A tool that runs steps but does not require a way to check the result just moves the same
blind spot one layer up.

## Decision

A recipe with no declared Verify is refused at load time, before any step executes. The
refusal is `no_verify` and happens in `loadRecipe`, the earliest possible point — a malformed
or unverifiable recipe never reaches `orch run` at all.

Verify is deliberately not "all the steps succeeded". It is a separate, explicit check,
runnable on its own via `orch verify <run-id>` independent of whether the steps that produced
that run are re-executed. Steps succeeding and the declared check passing are different
claims.

## Consequences

- Every recipe author has to answer "how will I know this worked" before the recipe can run
  at all, not after something has already gone wrong on a schedule.
- `orch verify` recovers which recipe a run used from the audit log itself (see
  `docs/adr/0003-jsonl-until-review-states-earn-kanban.md`), so there is no second place that
  mapping can drift from what actually happened.
- This is deliberately a low bar — a Verify can be as blunt as `test -f <output>`. The
  point is that *something* is declared, not that it is sophisticated. A richer, tiered
  review is specified for the deferred implementation lane, once there is code-shaped work to
  review.
