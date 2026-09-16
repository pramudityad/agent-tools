# Spec: orch v1 — a validated recipe runner

Status: ready-for-agent

## Problem Statement

I run five agent harnesses — claude, command-code, pi, orca, hermes — and each works well alone.
Nothing connects them. When I want a piece of work done I plan it in one tool, retype it into
another, remember myself which worktree or cron job it belongs to, and have no record afterwards of
what was run or whether it worked.

The concrete cost is not missing capability. It is that **nothing records what "done" means**. A
scheduled job has been failing silently every morning since 2026-09-13 while passing whenever I run
it by hand, and I only found out by looking. A recipe I run twice by hand can differ both times and
nothing notices.

## Solution

One command, `orch`, that runs a named **recipe** — an ordered list of steps over tools I already
have — and refuses to run any recipe that does not declare how it will be checked.

Every step's exit code is appended to an audit log, so after the fact I can see what ran and what it
returned. Scheduling goes through the same contract, so the envelope mistake that breaks my cron job
becomes impossible to express rather than something I have to remember.

v1 deliberately covers only the work that does not involve changing code: teaching operations and
harness upkeep. The code-implementation lane is specified but not built.

## User Stories

1. As the owner, I want to run a named recipe with one command, so that a multi-step routine happens the same way every time.
2. As the owner, I want `orch` to refuse a recipe with no declared check, so that I cannot create work whose completion is unverifiable.
3. As the owner, I want each step's exit code appended to a log, so that I can see afterwards what ran and what it returned.
4. As the owner, I want a run to stop at the first failing step, so that later steps never act on a broken precondition.
5. As the owner, I want the failing step recorded before the run stops, so that the log tells me where it died.
6. As the owner, I want to schedule a recipe on a cron expression, so that routine work happens without me.
7. As the owner, I want `orch` to reject a schedule that puts long-running work inside an agent turn, so that I cannot recreate the defect that has broken my benchmark job since 2026-09-13.
8. As the owner, I want `orch doctor` to find that same defect in cron jobs that already exist, so that jobs predating this tool get audited too.
9. As the owner, I want `orch doctor` to tell me when a harness it depends on is unreachable, so that I can tell a broken layer from a broken recipe.
10. As the owner, I want `orch status` to show open runs alongside my scheduled jobs, so that one command answers "what is in flight".
11. As the owner, I want `orch status --insights` to show token burn and cost, so that I can see the layer's operating cost without running a second tool.
12. As the owner, I want the benchmark job converted to the envelope that already works elsewhere, so that it starts succeeding on its schedule.
13. As the owner, I want confirmation that the fix works on a *scheduled* dispatch specifically, so that I am not reassured by a manual run that already passed.
14. As the owner, I want a recipe that runs a whole teaching session end to end, so that attendance, the berita acara and session close happen in one command.
15. As the owner, I want the session recipe to rely on the tool's own preconditions, so that publishing cannot happen against an unapproved naskah.
16. As the owner, I want a recipe that builds a session deck, so that scan, naskah and render run in sequence.
17. As the owner, I want to exercise a teaching recipe against an already-closed session, so that I can test it without writing anything new to the portal.
18. As the owner, I want my knowledge graph rebuilt incrementally on a schedule, so that it stays current without me remembering.
19. As the owner, I want the graph's first build measured before I schedule it, so that the schedule reflects real duration rather than a guess.
20. As the owner, I want every agent's model and granted capabilities declared in config, so that nothing is hidden in code.
21. As the owner, I want configuration to be JSON, so that the tool stays dependency-free like its siblings.
22. As the owner, I want machine-local settings separated from versioned ones, so that the repo holds behaviour and the machine holds paths.
23. As the owner, I want a CLI flag to override the config for one run, so that I can deviate without editing a file.
24. As the owner, I want errors to carry a machine-readable code on stderr, so that a caller can branch on the failure.
25. As the owner, I want the installer to refuse to install when tests fail, so that a broken build never reaches my PATH.
26. As the owner, I want `orch` registered as a skill in each harness present on the machine, so that any of my agents can drive it.
27. As the owner, I want the tool's vocabulary written down, so that an agent working on it later uses my terms and not its own.
28. As the owner, I want decisions recorded as ADRs, so that a future session does not relitigate settled questions.
29. As the owner, I want the deferred code-implementation lane written down, so that the reasoning survives even though it is unbuilt.

## Implementation Decisions

**Shape.** A single zero-dependency `orch.mjs`, matching every sibling tool in this repo. No
`node_modules`, no build step. Installed by a copy of `rise-ops/install.sh` (`HERMES_CATEGORY=ops`),
which symlinks the CLI into `~/.local/bin` and copies `stubs/SKILL.md` into each harness present.

**orch owns no engine.** Every step delegates to a tool that already works — `rise-ops`, `rps-deck`,
`graphify`, `hermes cron`, `hermes insights`. Their CLIs are called, never wrapped or
re-implemented. ADR 0001.

**Commands.** `new`, `run`, `verify`, `status [--insights]`, `schedule`, `doctor`.

**A recipe is linear.** Steps run in declared order with no dependency machinery, because each tool
guards its own preconditions — `rise-ops` already refuses an unapproved naskah and refuses to write
attendance with no roll source. The guard belongs next to the thing it protects.

**No Verify, no Run.** A recipe without a declared check is rejected at load time with
`no_verify`. A run has no opinion about whether work is done, only about what the check returned.
ADR 0002.

**The envelope rule is a schema constraint.** A schedule declaring `envelope: "agent"` while also
naming a `script` is rejected as `envelope_mismatch`. Three envelopes exist: `script` (expensive
work runs outside the agent turn, its stdout injected), `monitor` (byte-stable gate; unchanged
output suppresses the run entirely), `agent` (a plain turn). ADR 0004.

**The ledger is a JSONL file, not a task board.** `~/.config/orch/audit.jsonl`, appended one line
per step, matching `rise-ops`' `audit.jsonl`. A task board was considered and rejected for v1: its
value is a review state machine, and v1 has no review states. ADR 0003.

**Configuration is JSON.** No YAML parser exists anywhere in this repo and adding one would break
the zero-dependency rule; the existing frontmatter parser handles flat `key: value` only and cannot
express nested steps. Four files: `agents.json` (the roster) and `recipes/*.json` are versioned with
the tool; `~/.config/orch/config.json` and `audit.jsonl` are machine-local. Precedence, most
specific wins: CLI flag → recipe step → `agents.json` → `config.json`.

**Only one agent in v1 is model-backed.** `claude-planner` drives recipes and authors naskah, so
only it carries granted capabilities. Every other entry is a deterministic CLI with no model, and
therefore nothing to grant and no context to control.

**Error contract.** Exit 0 on success with human-readable stdout. On failure, exit 1 and one compact
JSON object on stderr carrying a `code`, matching `rise-ops/CONTRACT.md`. Codes: `no_verify`,
`bad_input`, `envelope_mismatch`, `verify_failed`, `step_failed`, `layer_down`, `io_error`.

**Documentation.** `CONTEXT.md` (glossary with binding `_Avoid_` lists), `CONTRACT.md`, and
`docs/adr/`, registered in the root `CONTEXT-MAP.md`.

## Testing Decisions

**What makes a good test here.** It asserts on external behaviour — a returned value, a thrown
code, an argv array — never on how the function reached it. The suite is **hermetic**: no network,
no filesystem, no dependencies beyond Node's built-ins, matching the contract stated at the top of
`rise-ops/test.mjs`.

**Prior art.** `rise-ops/test.mjs` is the model: it imports 14 pure exported functions from
`ops.mjs` and asserts on them directly, and leaves the impure HTTP layer untested.

**Seams — six pure, one impure.** Confirmed with the owner:

- `loadRecipe(obj)` — validated recipe, or throws with a code. Where both contract rules live.
- `resolveConfig(flag, step, agents, config)` — the four-level precedence.
- `planSteps(recipe, args)` — the ordered command list.
- `cronArgs(recipe)` — the `hermes cron create` argv, asserted without invoking hermes.
- `envelopeFindings(jobs)` — doctor's findings, taking parsed cron jobs as data.
- `auditLine(runId, step, result)` — one JSON line.
- `exec` — the single impure boundary, **injected**. Tests pass a fake.

**One deliberate departure from precedent.** `rise-ops` leaves its impure layer untested because
HTTP is not its logic. For orch, sequencing *is* the logic, so `runRecipe({ exec })` is tested with
a fake to prove it runs in order, stops at the first non-zero exit, and records the failing step
before stopping.

**Negative tests are mandatory.** A suite proving only the happy path proves nothing. Required:
a missing Verify throws `no_verify`; `agent` + `script` throws `envelope_mismatch`; a failing step
halts the run and appears in the log; `envelopeFindings` flags the known-bad benchmark job.

## Out of Scope

- **The code-implementation lane** and with it orca, command-code and pi: worktree isolation,
  `cc-implementer` on `zai-org/glm-5.3` with `ponytail` granted and a turn cap, `pi-reviewer` as a
  first-pass critic, a two-axis owner gate, and a task board for review states. Target is Flip
  ticket work. Specified in the plan and in ADR form; not built.
- **Cleaning the router's dead legs.** Seven of nine model combos still name a first hop whose
  provider has no connection, so every call pays a health-skip. Real, but a separate job; v1 simply
  does not depend on those legs.
- **Grading or academic records.** `rise-ops` deliberately never touches SIAKAD and orch inherits
  that boundary.
- **Quality scoring of output.** "Evaluate" in v1 means operational cost and throughput via
  `hermes insights`, not a per-run quality score.
- **Committing this repo.** Most of it is currently untracked; that is the owner's call.

## Further Notes

**v1 touches two of five harnesses** — claude and hermes. orca, command-code and pi have nothing to
do until the implementation lane lands. This is an accepted deviation from the original five-harness
framing and is the honest cost of keeping v1 small. If teaching and harness work turn out not to be
where the leverage is, the correct response is to pull the deferred lane forward, not to extend v1.

**graphify is unmeasured on this vault.** It has never been run here — there is no output directory —
and the vault carries a 42 MB adjacent semantic index. Cost and duration are unknown, so the first
build is a measurement and the schedule is set from it. Do not schedule it first.

**One check needs real elapsed time.** The benchmark fix can only be confirmed by a scheduled
dispatch, not a manual one, because the manual path already passes today and proves nothing.
