# 0004 — The envelope mismatch is unrepresentable by construction

**Status:** accepted · 2026-09-16

## Context

The daily combo-benchmark job has failed on its schedule every morning since 2026-09-13 while
passing every time it is run by hand. The job's prompt tells an agent to run
`python3 ~/.hermes/scripts/combo-benchmark.py` — a long benchmark that live-tests every routing
hop — which means the expensive work happens *inside* an agent turn. A scheduled turn has an
idle limit; a manual one does not. The job is not misconfigured in a way a warning would fix.
It is a shape that should never have been expressible.

The owner's other jobs already show the shapes that do work: `vault-health` runs a script
before the turn and injects its stdout (`--script`), `vault-consolidate` gates the turn on
byte-stable output (`--monitor-script`), and several are plain turns with no external work at
all. Those three are the envelopes.

## Decision

A schedule declares an `envelope`, and the envelope decides which script slot the schedule may
fill. `script` requires a `script`; `monitor` requires a `monitorScript`; `agent` declares
neither, and has no slot to declare one in. So the failing pairing — "a plain agent turn plus a
script the agent is expected to shell out to" — is refused as `envelope_mismatch` in
`loadSchedule`, the single point where a schedule comes into existence, at validation time and
before any job is handed to the scheduler.

The schedule's shape is only half of it: the flagged pairing describes *where the work sits*,
and a scheduled job's prompt runs `orch run <recipe>`, so the recipe's steps are where the work
actually lands. The same refusal therefore covers a scheduled recipe with a step that shells
out to a hermes script — a hermes script is precisely the mechanism for work that must run
outside the turn, so finding one inside a step means the work is in the turn after all.
`assertSchedulable` refuses that at load time, for every envelope, including the `script` one
where the step would quietly run the hoisted work a second time.

The refusal is not a warning, and it is not enforced by discipline. It is the only way a valid
schedule can be constructed: a schedule that names both is not a schedule this tool has a
representation for.

## Consequences

- `orch schedule` cannot create the defect, and neither can a hand-edited recipe: recipes carry
  their schedule through the same `loadSchedule` and `assertSchedulable` on the way in, so a
  malformed one is refused when the recipe is read rather than when a job is dispatched.
- Registering a recipe is a two-step write, in this order: the scheduler accepts the job, and
  only then is the schedule recorded in the recipe. A recipe never claims a schedule that does
  not exist.
- `cronArgs(recipe)` derives the argv from the recipe's own fields — cron, envelope and script
  — so those cannot drift from what was registered. The delivery target is the deliberate
  exception: it is a machine fact, so it is supplied at registration from `--deliver` or
  `config.json` and is never written into the recipe.
- The construction covers schedules orch creates. It cannot cover a job created by another
  tool or by hand — `hermes cron create` will accept an agent job whose prompt quietly shells
  out to a script, which is exactly how the benchmark job came to exist. That is why
  `envelopeFindings(jobs)` exists as a second, weaker guard: it infers the envelope from the
  scheduler's own fields and flags a job whose turn invokes a hermes script, so jobs predating
  this tool get audited too.
- The inference is deliberately a shape rule, not a cost estimate. It matches an interpreter
  invocation of a `~/.hermes/scripts/` path, never a bare mention of one, and it says nothing
  about how expensive a turn is — only about where its work was placed. That interpreter
  requirement is specific to `envelopeFindings`' inference over free-text `job.prompt`, where a
  prompt can discuss a path without running it. `assertSchedulable`'s check over a step's
  `command` has no such requirement — argv has no prose to be cautious of, and a hermes script
  is shebang'd and directly executable, so a step naming one with no interpreter in front of it
  is the same defect. An earlier revision of this guard reused the interpreter-prefixed match
  for both, which reopened exactly that bypass: a step whose `command` named the script
  directly reproduced the original defect, undetected.
- A finding is a report, not a migration. `orch doctor` does not rewrite an existing job, and
  does not touch the scheduler's store at all; converting a flagged job is a separate act with
  its own verification, since only a *scheduled* dispatch can confirm the fix.
