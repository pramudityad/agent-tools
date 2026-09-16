---
name: orch
description: >-
  MUST USE when the user wants to run a named orch recipe, check what a past run did,
  re-verify a completed run, put a recipe on a schedule, or find out why a scheduled job keeps
  failing — a validated recipe runner over rise-ops, rps-deck, graphify, and hermes. Triggered
  by phrases such as "run the sesi recipe", "run orch <name>", "verify run <id>", "schedule the
  benchmark job", "why did that cron fail", or "what did that run do". NOT for building new
  capabilities directly — orch dispatches to a tool that already exists (`rise-ops`,
  `rps-deck`, `graphify`, `hermes`) rather than doing the work itself, and it currently has no
  worktree, review, or gate machinery (that lane is specified but not built).
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
orch schedule <recipe> <cron> --envelope script|monitor|agent   # register the recipe on a cron
orch doctor                     # probe the harnesses orch depends on; audit scheduled jobs
orch status [--insights]        # what is in flight, what is scheduled, and what it costs
```

`new` is specified but not yet built — do not tell a user it is available.

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
See `CONTRACT.md` for the full code list. The three an agent will see most often:

- `no_verify` — the recipe itself has no declared check. Nothing ran. Fix the recipe.
- `step_failed` — a step failed partway through. Read `~/.config/orch/audit.jsonl` for
  which step and what it returned; relay that, don't guess.
- `envelope_mismatch` — a schedule named `envelope: "agent"` alongside a `script`, or
  `orch doctor` found an existing job that does the same. No job was created for the first,
  and the second still needs converting. Do not "fix" it by moving the script into the
  prompt; that is the defect.

## Scheduling a recipe

```sh
orch schedule combo-benchmark '0 7 * * *' --envelope script --script combo-benchmark.py
```

Pick the envelope by asking where the expensive work runs:

- `script` — it runs **outside** the turn, and only its stdout enters. Use this for anything
  long: a benchmark, an index rebuild, a scan. Needs `--script <name>` under
  `~/.hermes/scripts/`.
- `monitor` — a cheap gate first; unchanged output suppresses the run entirely. Needs
  `--monitor-script <name>`.
- `agent` — a plain turn with no external work.

An `agent` envelope plus a script is refused as `envelope_mismatch`. That combination has
broken the combo-benchmark job every morning since 2026-09-13 while passing by hand, because a
scheduled turn has an idle limit a manual one does not.

The recipe's steps are the other half of the same rule: a scheduled dispatch runs `orch run
<recipe>`, so the steps are the cheap remainder — the part that genuinely needs the turn. Put
the expensive work in the schedule's `script`, never in a step, and name the values a step
needs literally: a scheduled dispatch passes no arguments, so a `{1}` in a scheduled recipe is
refused rather than left to fail every morning.

## Auditing what is already scheduled

```sh
orch doctor
```

Reports two different kinds of trouble, separately, because the fix differs: a harness that
cannot be reached is a broken **layer** (`layer_down`), and a scheduled job whose agent turn
shells out to a script is a broken **recipe** (`envelope_mismatch`). It only reads — it
rewrites no job. Converting a flagged job is a separate piece of work, and only a
**scheduled** dispatch can confirm it worked; a manual run already passed and proves nothing.

## Answering "what is in flight"

```sh
orch status
```

Two groups: open runs from the audit log, then scheduled jobs from `hermes cron`. A run is
**open** until its Verify passes — every step exiting `0` is not done, and `orch verify` is
what closes it. The state column says which of three ways it is open: `unverified` (nothing has
checked it yet, and it may be working or may have died), `failed` (a step exited non-zero), or
`verify failed` (every step passed and the check did not). Never report an unverified run as a
successful one — go and check.

The jobs table is different vocabulary on purpose: its `STATE` and `RESULT` columns are
`hermes cron`'s own values passed through, so `completed` means finished for good and `ok` means
the last run succeeded.

`orch status --insights` adds token burn and cost, passed through from `hermes insights` —
orch computes no metrics of its own. `status` never fails because a source is unavailable: the
section says so and the rest still prints, exit `0`. Read-only in every mode.

## What this tool does not do

It does not create worktrees, run a review pass, or gate a merge — those exist in `orca`,
`pi`, and a Claude review respectively, and are not wired into orch yet. If a user asks for
one of those through orch, say so plainly rather than approximating it with a recipe step.

## User preferences

- Concise and direct. No preamble.
- File-based deliverables, absolute paths.
- A recipe that writes to a real external system (RISE, a live cron job) should be
  exercised against already-settled state first, not against something that will change.
