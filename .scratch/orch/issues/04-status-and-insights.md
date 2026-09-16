# 04 — One command answers "what is in flight, and what is it costing"

**What to build:** the owner runs one command and sees open runs alongside scheduled jobs, instead
of checking two tools. Adding a flag also shows what the layer is costing to operate.

Operating cost is read from the existing insights facility rather than computed here.

**Blocked by:** 01 — scaffold and runner.

**Status:** done

- [x] `orch status` lists open runs from the audit log
- [x] `orch status` lists scheduled jobs beside them
- [x] `orch status --insights` shows token burn and cost
- [x] Insights come from the existing facility; orch does not compute its own metrics
- [x] `orch status` is read-only and mutates nothing
- [x] A failing or slow underlying tool degrades the output gracefully rather than failing the command
- [x] Numeric columns align — digits are tabular

## Comments

**2026-09-16** — Implemented in `orch.mjs`. A Run is **open** until a passing Verify line
closes it, which is the honest answer to "what is in flight" (ADR 0002: every step exiting
zero is a different claim). `openRuns(entries)` groups the parsed audit log by run and states
each one `unverified` / `failed` / `verify failed`. `jobRows(jobs)` rows the scheduler's jobs
soonest-first. `renderTable` right-aligns numeric columns, so `STEPS` and `EXIT` share a
straight edge whatever the digit count. `renderStatus` builds the whole report from data *and
errors* handed in, which is what makes the degradation requirement testable without a broken
machine. `cmdStatus` reads its three sources behind their own guards, so one being missing,
corrupt, or slow costs its own section and never the command — the `hermes insights` call is
the only one bounded by a timeout (15s), because a status that hangs on a third tool is useless
exactly when it is needed. Cost is `hermes insights`' output passed through; orch computes no
metrics of its own.

`/code-review` (Standards + Spec, two parallel agents) ran against the diff before commit and
found four real problems, all fixed rather than filed:

- **Jobs table mislabelled a finished job as `paused`.** hermes writes `enabled: false` for a
  terminal job as well as for a paused one, and its own `effective_job_state` refuses to
  conflate them (the 2026-07-30 "list looked frozen" outage). `jobRows` now reports hermes's
  `state` verbatim and keeps `completed`/`error` as they are — the fix that also removes the
  invented `never run`/`ok` state strings. Fixtures were carrying no `state` field at all,
  which is why the bug shipped green; they now do.
- **A recipe step could close a run it never checked.** `orch verify` writes its line under the
  id `verify`, and that line is the only thing that closes a run — so a step with that id was
  free to write one. `loadRecipe` now refuses the id as `bad_input`.
- **A failed check was indistinguishable from a failed step.** Both read `failed`; the exit
  column holds the check's code either way. A third state, `verify failed`, separates them.
- **The skill stub contradicted the glossary** — it claimed the *exit* column separates a
  running run from a dead one, which it cannot (both exit `0`); the state column does.

Also from the review: `realExec`/`realExecBounded` were near-duplicates, merged into one
`realExec(command, {timeout})`; both sorts now compare instants rather than strings, so two
offsets in one store cannot make lexical order disagree with the clock; and two tests that
passed vacuously (one asserting two unconditional headers, one whose name overclaimed) were
replaced with assertions that fail if the behaviour goes.

`node test.mjs`: 160 passed (40 new). Verified live: `orch status` lists the 5 real runs and
all 8 jobs, exit `0`; `--insights` shows hermes's own report verbatim; with `hermes` removed
from `PATH` the cost section reads `✗ unavailable — … ENOENT` and the command still exits `0`;
an unknown flag is `bad_input`; and hashes plus mtimes of `audit.jsonl` and `jobs.json` are
unchanged after running both modes, which is the read-only claim.

One wart left alone as out of scope: `orch status | head` over a large report dies on an
unhandled `EPIPE` with exit 1 instead of the JSON contract. It is consumer-driven and affects
every command (`say` writes without guarding stdout), so it belongs in its own ticket rather
than in this one.
