# 0001 — orch owns no engine

**Status:** accepted · 2026-09-16

## Context

The first design pass for a daily orchestration layer specified worktree isolation, a
three-tier review pipeline, and a task-board state machine, none of which existed yet. Under
grilling, every one of those turned out to already exist elsewhere: `orca` already has
worktree creation and a fleet orchestration primitive with task DAGs and decision gates;
`hermes kanban` already has a durable review state machine with audit-trailed transitions;
`hermes cron` already has the envelope shapes (`script`/`monitor`/`agent`) this tool needs.

Building a second version of any of these to live inside orch would be pure duplication —
the opposite of the KISS constraint this project was scoped under.

## Decision

orch is a contract and a dispatcher, never an engine. Every step of a recipe is a call to a
tool that already works. When a capability genuinely does not exist yet (a validated recipe
runner, a schema that makes the envelope defect unrepresentable), orch builds exactly that
and nothing else.

## Consequences

- Recipes stay to the CLIs of `rise-ops`, `rps-deck`, `graphify`, and `hermes` — orch calls
  them, it does not wrap or reimplement their subcommands.
- Adding a capability to orch requires first checking whether an existing harness already
  has it. Skipping that check is how the pre-grilling design ballooned to twelve agents and
  three review tiers for two chosen use cases that needed neither.
- The corollary is that orch v1 deliberately does not build a worktree manager, a review
  gate, or a task board. Those are specified, not built, and wait for a recipe that actually
  needs them — see the spec's Out of Scope section.
