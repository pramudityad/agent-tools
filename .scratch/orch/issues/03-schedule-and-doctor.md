# 03 — Make the scheduling defect impossible to express, and find it where it already exists

**What to build:** the owner can put a recipe on a schedule, and cannot create the mistake that has
broken the benchmark job every morning since 2026-09-13 — expensive work placed inside an agent
turn, where an idle limit kills it. Attempting it is refused. A separate check audits jobs that
already exist, including ones predating this tool.

Three envelopes: `script` runs the expensive work outside the agent turn and injects its stdout;
`monitor` gates on byte-stable output so an unchanged result suppresses the run entirely; `agent` is
a plain turn. The healthy `vault-health` and `vault-consolidate` jobs are the reference shapes.

**Blocked by:** 02 — config model.

**Status:** done

- [x] `orch schedule <recipe> <cron> --envelope script|monitor|agent` registers a scheduled job
- [x] `cronArgs(recipe)` returns the argv for the scheduler; asserted in tests without invoking it
- [x] Each envelope maps to the correct scheduler flags
- [x] `envelope: "agent"` together with a `script` field is refused as `envelope_mismatch`
- [x] The refusal happens at validation time, before any job is created
- [x] `envelopeFindings(jobs)` takes parsed scheduler jobs as data and returns findings
- [x] `orch doctor` reports the known-bad benchmark job as a finding
- [x] `orch doctor` probes each harness v1 depends on and reports an unreachable one as `layer_down`
- [x] `orch doctor` distinguishes a broken layer from a broken recipe in its output
- [x] ADR 0004 records that the envelope mismatch is unrepresentable by construction

## Comments

**2026-09-16** — Implemented in `orch.mjs`. A schedule is now part of the versioned recipe —
`{cron, envelope, script|monitorScript, workdir?}` — and `loadSchedule` is the single point a
schedule comes into existence, so the `envelope_mismatch` refusal happens at load time, before
`hermes cron` is touched. The schema is deliberately closed: an unknown field is `bad_input`
rather than accepted and ignored. `cronArgs(recipe)` derives the `hermes cron create` argv from
the recipe (asserted in ten tests, hermes never invoked) with each envelope mapping to its own
flag: `--script`, `--monitor-script`, or neither. `cmdSchedule` validates, creates the job, and
only then records the schedule in the recipe, so a rejected registration leaves nothing behind.

`cmdDoctor` reads `~/.hermes/cron/jobs.json` as data and keeps the two kinds of brokenness
apart in its output: a `layers` group (harnesses probed on PATH) and a `scheduled jobs` group
(`envelopeFindings` over the jobs), with `layer_down` winning the exit code. Its pure half takes
reachability and jobs as parameters, so the suite stays hermetic.

`/code-review` (Standards + Spec, two parallel agents) ran against the diff before commit and
both independently found the same real hole in the first pass: the ticket's headline claim did
not hold. The guard inspected the schedule's `script` field, but a scheduled job's prompt runs
`orch run <recipe>`, so the expensive work could be placed in the recipe's *steps* instead — the
benchmark defect reproduced through `orch schedule` itself, and invisible to `doctor`, since an
orch-written prompt never names a script. Fixed with `assertSchedulable`: a scheduled recipe
whose step shells out to a hermes script is refused as `envelope_mismatch` at load time for
every envelope, and a scheduled recipe using a positional `{n}` placeholder is refused as
`bad_input` (a scheduled dispatch passes no args, so the job would have failed on every run).
Both fixes are covered by tests the original suite could not have caught.

Two further fixes from the same review: `deliver` is no longer a schedule field at all — a
destination is a machine fact, so it is supplied at registration from `--deliver` or
`config.json` and never written into the versioned recipe, which also makes ticket 02's
`config.delivery` load-bearing rather than decorative; and three tests that passed vacuously
were repaired. `CONTEXT.md` gained a **Layer** entry (the vocabulary `layer_down` names) and
`CONTRACT.md`, `docs/adr/0004`, the skill stub and the root `CONTEXT-MAP.md` were updated.

`node test.mjs`: 120 passed (53 new). Verified live: `orch doctor` flags
`combo-benchmark-daily-08wib` as its one finding and exits `envelope_mismatch` (1 of 8 jobs,
the other 7 clean); a real registration created `orch-smoke-test` with `Deliver: local` taken
from `config.json` and `workdir` from the recipe; both refusals were confirmed to create no
job; the smoke-test job and recipe were removed afterwards, leaving `hermes cron doctor`
reporting no issues.

Frontier unblocked: tickets 05 (combo-benchmark) and 06 (graphify-update) can now start. 05
still needs one real overnight scheduled dispatch to close — a manual run already passes and
proves nothing.

**2026-09-16 (second pass)** — Before committing, a separate `/code-review` pass (Standards +
Spec, two parallel agents, run from a different session than the one above) independently
re-verified this diff and found one more real hole in `assertSchedulable`: `stepScripts` (then
still named `embeddedScripts` and shared with `envelopeFindings`) only matched a hermes script
preceded by an interpreter word (`python3`, `bash`, …). A hermes script is shebang'd and
directly executable, so a step naming one as its own `command[0]` — no interpreter in front —
slipped through undetected, live-reproducing the exact combo-benchmark defect this ticket
exists to make unrepresentable. Confirmed live before the fix:
`loadRecipe({..., steps: [{command: ['/path/.hermes/scripts/combo-benchmark.py']}], schedule: {envelope: 'agent', ...}})`
loaded without error.

Fixed by splitting the shared matcher in two: `stepScripts` now checks a step's `command`
tokens directly, with no interpreter required — argv is never prose, so there is nothing to be
cautious of, unlike a hermes job's free-text `prompt`, which keeps the original
interpreter-prefixed `embeddedScripts`/`SCRIPT_INVOCATION` match. `docs/adr/0004` gained a note
recording why the two matchers now differ. Also fixed from the same pass: a phantom `spec:`
comment citation with no corresponding file in the repo, a banner housing an unrelated
function, and an imprecise fix message. `node test.mjs`: 162 passed (2 more, both regression
tests for the bare-invocation bypass).
