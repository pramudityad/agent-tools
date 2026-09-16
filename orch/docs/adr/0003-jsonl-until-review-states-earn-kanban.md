# 0003 — JSONL until review states earn a task board

**Status:** accepted · 2026-09-16

## Context

The first design pass put every Run on a `hermes kanban` card, justified entirely by
kanban's review state machine — `request-review` → `request-changes` / `promote`, with an
audit trail on every transition. Under grilling, the code-implementation lane that needed
those review states was deferred out of v1 entirely: the two chosen use cases (harness
maintenance, teaching operations) are linear tool sequences with no diff to review and no
merge to gate.

Without review states, a kanban card's lifecycle collapses to created → running → done, which
is a log wearing a task board's clothing. Meanwhile the board itself had zero tasks on it —
adopting it now would be infrastructure with no feature depending on it.

## Decision

v1's ledger is `~/.config/orch/audit.jsonl`, appended one line per step, in exactly the shape
`rise-ops` already uses for its own audit log. `hermes kanban` is adopted when the
implementation lane lands and review states exist to actually use — new work at that point,
so there is nothing to migrate.

## Consequences

- The ledger is trivially greppable and requires no new infrastructure — `readAuditEntries`
  and `findRunRecipe` are the entire read-side, both pure functions over parsed JSON lines.
- There is exactly one source of truth for what happened. A "belt and braces" option — write
  JSONL and mirror to kanban — was considered and rejected: two ledgers for the same fact is
  precisely what this project's KISS constraint exists to prevent.
- When the implementation lane is built, this ADR should be revisited alongside it rather
  than treated as a permanent rejection of kanban — the rejection is scoped to "v1 has no
  review states to record", not to kanban itself.
