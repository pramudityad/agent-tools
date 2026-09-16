---
name: orch
description: >-
  MUST USE when the user wants to run a named orch recipe, check what a past run did, or
  re-verify a completed run — a validated recipe runner over rise-ops, rps-deck, graphify,
  and hermes. Triggered by phrases such as "run the sesi recipe", "run orch <name>", "verify
  run <id>", or "what did that run do". NOT for building new capabilities directly — orch
  dispatches to a tool that already exists (`rise-ops`, `rps-deck`, `graphify`, `hermes`)
  rather than doing the work itself, and it currently has no worktree, review, or gate
  machinery (that lane is specified but not built).
---

# orch — a validated recipe runner

`orch` runs a named **recipe** — a linear list of steps, each a call to a tool you already
have — and refuses to run one that does not declare a **Verify**: a command that checks
whether the work actually worked.

Read `~/.agent-tools/orch/CONTEXT.md` before the first command of a session — the terms
Recipe, Verify, Envelope, and Run are load-bearing, and each has a binding `_Avoid_` list.

## Commands

```sh
orch run <recipe> [args...]     # run every step in order; stops at the first failure
orch verify <run-id>            # re-run a completed run's declared check, on its own
```

`new`, `status`, `schedule`, and `doctor` are specified but not yet built — do not tell a
user they are available.

## Running a recipe

```sh
orch run sesi-run BI 3
```

Steps run in the order the recipe declares. There is no dependency graph inside orch —
if a step's precondition is missing, the underlying tool refuses it (for example,
`rise-ops acara` refusing an unapproved naskah), and the run stops there. Read that tool's
own error message; do not retry blindly.

On success, orch prints the run id. Keep it — it is how `orch verify` finds this run again.

## Verifying a run

```sh
orch verify c74b3b38-90fc-49de-9549-35a1267e693d
```

This re-runs the recipe's declared check, not the recipe's steps. A run whose steps all
exited `0` can still fail verify — that is a real finding, not a bug, and should be relayed
to the user rather than re-run silently.

## On failure

Every failure exits `1` with one JSON object on stderr: `{"error": "...", "code": "..."}`.
See `CONTRACT.md` for the full code list. The two an agent will see most often:

- `no_verify` — the recipe itself has no declared check. Nothing ran. Fix the recipe.
- `step_failed` — a step failed partway through. Read `~/.config/orch/audit.jsonl` for
  which step and what it returned; relay that, don't guess.

## What this tool does not do

It does not create worktrees, run a review pass, or gate a merge — those exist in `orca`,
`pi`, and a Claude review respectively, and are not wired into orch yet. If a user asks for
one of those through orch, say so plainly rather than approximating it with a recipe step.

## User preferences

- Concise and direct. No preamble.
- File-based deliverables, absolute paths.
- A recipe that writes to a real external system (RISE, a live cron job) should be
  exercised against already-settled state first, not against something that will change.
