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
| `bad_input` | malformed recipe, agents.json, or config.json; unknown command; unknown run id; unknown agent id; a malformed `--set`; or a `{...}` placeholder with no matching arg or resolved setting | read the message; nothing was run |
| `envelope_mismatch` | a schedule names `envelope: "agent"` together with a `script` — the combo-benchmark defect | pick one envelope; the reasoning is recorded in the ADR that ships with the `schedule`/`doctor` commands |
| `verify_failed` | the declared check exited non-zero | read the message; the run itself may have succeeded — only the check failed |
| `step_failed` | a step exited non-zero and the run stopped | see the audit log for which step, and its exit code |
| `layer_down` | a harness `orch doctor` depends on is unreachable | check that harness directly before touching orch |
| `io_error` | anything unclassified | a bug; the stack is not swallowed |

`envelope_mismatch` and `layer_down` are produced starting with the `schedule`/`doctor`
commands (a later ticket); this file documents the whole contract up front so no later
addition changes an already-shipped code's meaning.

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

## Commands

| Command | Writes | Notes |
| :--- | :--- | :--- |
| `run <recipe> [args...] [--set key=value ...]` | `audit.jsonl` | runs every step in declared order; stops at the first failure; `--set` overrides an agent-backed step's resolved settings for this run only |
| `verify <run-id>` | `audit.jsonl` | re-runs the declared check for a completed run, independent of its steps |

`new`, `status`, `schedule`, `doctor` land in later tickets and are not yet implemented.

## Stdout stability

`run` prints `✓ <recipe> — run <id> — <n> step(s)` on success. `verify` prints
`✓ verify passed — run <id> — recipe "<name>"`. Nothing else in the output is contractual;
parse the audit log, not the prose.
