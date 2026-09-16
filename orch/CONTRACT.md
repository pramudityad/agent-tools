# orch — output contract

Exit `0` on success, human-readable output on stdout. On failure, exit `1` and one compact
JSON object on **stderr**:

```json
{"error": "recipe \"bad-recipe\" declares no Verify — refusing to run unverifiable work", "code": "no_verify"}
```

## Codes

| Code | Meaning | Fix |
| :--- | :--- | :--- |
| `no_verify` | the recipe declares no check | add a `verify.command` before running it |
| `bad_input` | malformed recipe, schedule, agents.json, or config.json; an unknown command, run id, agent id, or schedule field; a step id reserved for the declared check; a malformed `--set` or `schedule` flag; a `{...}` placeholder with no matching arg or resolved setting; a scheduled recipe that uses a positional `{n}`; a schedule `hermes cron` itself refused; a job name already registered | read the message; nothing was run, and for `schedule` no job was created |
| `envelope_mismatch` | a schedule names `envelope: "agent"` together with a `script` (or a `monitorScript`); a scheduled recipe has a step that runs a hermes script, putting the same work back inside the turn; or `orch doctor` found an existing job whose agent turn shells out to a hermes script — the combo-benchmark defect | pick the envelope the work actually needs; `script` runs it outside the turn. Reasoning: `docs/adr/0004-envelope-mismatch-unrepresentable.md` |
| `verify_failed` | the declared check exited non-zero | read the message; the run itself may have succeeded — only the check failed |
| `step_failed` | a step exited non-zero and the run stopped | see the audit log for which step, and its exit code |
| `layer_down` | a harness orch depends on is unreachable — a missing binary from `doctor`, or `hermes` that could not be run from `schedule` | check that harness directly before touching orch or a recipe |
| `io_error` | anything unclassified, or the scheduler's job store could not be read | a bug, or `~/.hermes/cron/jobs.json` is damaged; the stack is not swallowed |

## Write semantics

- **Append-only.** Every step of every run appends one line to
  `~/.config/orch/audit.jsonl`: `{ts, run, recipe, step, cmd, exit}`. Nothing is ever
  rewritten or deleted.
- **Stop at the first failure.** A run's steps execute in declared order; the first
  non-zero exit stops the run. The failing step's line is written before the run stops, so
  the log always shows exactly where it died — never a run that looks like it never started.
- **Verify is separate from steps.** `orch verify <run-id>` re-runs the declared check for a
  run that has already happened, independent of whether that run's steps are re-executed.
  It looks up which recipe a run id used from the audit log itself — there is no second
  registry to fall out of sync with it.
- **Configuration resolves most-specific-first.** A `--set key=value` flag on `orch run`
  beats what the recipe step declares, which beats the named agent's `agents.json` entry,
  which beats `~/.config/orch/config.json`. The result feeds any `{name}` placeholder in
  that step's command (see `CONTEXT.md`), so the override changes what actually runs, not
  only what gets logged. `agents.json` and `config.json` are read — and therefore validated
  — whenever a recipe has at least one agent-backed step, regardless of whether the run
  passes `--set`.
- **Registration is ordered, and orch never writes the scheduler's store.** `orch schedule`
  validates the schedule, then asks `hermes cron` to create the job, and only then records
  the schedule in `recipes/<recipe>.json`. A rejected or failed registration leaves both the
  recipe and the scheduler untouched, so the recipe can never claim a schedule that does not
  exist. `orch doctor` only reads that store — it never rewrites a job it flagged.
- **A delivery target is machine-local and is not stored in the recipe.** `--deliver` wins,
  then `~/.config/orch/config.json`'s `delivery`; the result goes into the registered job's
  argv and nowhere else. A destination belongs to a machine, so a recipe that named one would
  carry it to another machine. `workdir` is the opposite case — which directory a job
  operates on is part of what the recipe does — and *is* declared in the recipe.

## Commands

| Command | Writes | Notes |
| :--- | :--- | :--- |
| `run <recipe> [args...] [--set key=value ...]` | `audit.jsonl` | runs every step in declared order; stops at the first failure; `--set` overrides an agent-backed step's resolved settings for this run only |
| `verify <run-id>` | `audit.jsonl` | re-runs the declared check for a completed run, independent of its steps |
| `schedule <recipe> <cron> --envelope script\|monitor\|agent [--script <name>] [--monitor-script <name>] [--deliver <target>] [--workdir <path>]` | `recipes/<recipe>.json`, the scheduler's job store (via `hermes cron create`) | validates the schedule first, so an `envelope_mismatch` never reaches the scheduler; creates the job via `hermes cron create`; records the schedule in the recipe only after the scheduler accepts it; refuses a job name that is already registered; `--deliver` is applied to the job, never stored |
| `doctor` | nothing | read-only over the scheduler's job store and PATH; reports layers and jobs as separate groups; prints the report on stdout and then exits non-zero, so the findings and the code are both available |
| `status [--insights]` | nothing | read-only: open runs from the audit log beside scheduled jobs from the scheduler, plus the operating cost from `hermes insights` under `--insights`. Exits `0` even when a source is unavailable — each one degrades to a note in its own section — and `1` with `bad_input` only for an unknown flag |

`new` lands in a later ticket and is not yet implemented.

`status` reads its three sources independently, so one being slow, missing or unreadable costs
its own section and never the command: a status that refuses to answer because a third tool is
down would be useless exactly when it is needed. It writes no file, creates no directory, and
does not touch the scheduler. Its cost figure is `hermes insights`' own output, passed through —
orch computes no metrics of its own. Its jobs table likewise reports hermes's own `state` and
last-run outcome verbatim rather than re-deriving them, so a finished one-shot stays
`completed` and is never mislabelled `paused`. Run states are orch's own vocabulary and are
defined in `CONTEXT.md` under **Open run**.

`doctor` exit codes are `layer_down` when a harness is unreachable, `envelope_mismatch` when
only jobs are flagged, and `0` when neither. A layer wins, because a recipe failure read while
a layer is down is a misdiagnosis.

## Stdout stability

`run` prints `✓ <recipe> — run <id> — <n> step(s)` on success. `verify` prints
`✓ verify passed — run <id> — recipe "<name>"`. `schedule` prints
`✓ scheduled <recipe> — job "orch-<recipe>" — <cron> — envelope <envelope>`. `doctor` prints a
header, a `layers` group, a `scheduled jobs` group, a `<n> finding(s) — <n> layer, <n> recipe`
line, and `✓ no findings` when clean. `status` prints a header with both counts, an
`OPEN RUNS` group, a `SCHEDULED JOBS` group, and a `COST` group under `--insights`; times keep
the zone their source recorded (`Z` for the audit log, an offset for hermes). Nothing else in
the output is contractual; parse the audit log and the scheduler's job store, not the prose.
