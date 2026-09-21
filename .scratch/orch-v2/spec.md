# Spec: orch v2 — the code-implementation lane

Status: draft — 3 open decisions left, none blocking the tracer-bullet run

## Problem Statement

v1 (`~/.agent-tools/orch/`) covers harness maintenance and teaching operations — linear CLI
sequences with no diff to review and no merge to gate. It deliberately deferred the
code-implementation lane: worktree isolation, tiered review, and a merge gate are code-shaped
work that v1 had no chosen phase for. See `~/.claude/plans/can-u-check-who-starry-sutherland.md`
("Deferred to v2") and `orch/docs/adr/0003-jsonl-until-review-states-earn-kanban.md`.

The gap this fills: turning a Flip `DP-xxxx` ticket into a reviewed, gated code change without
retyping the plan into a second tool, losing track of which worktree it lives in, or trusting a
single un-reviewed agent pass.

## Solution

A task is planned by Claude, isolated in a worktree, implemented by `command-code`, reviewed
tier-1 by `pi`'s `reviewer` subagent, gated tier-2 by Claude on Standards + Spec, and only then
promoted. Target: Flip's `DP-xxxx` tickets in `gogogo-service` / `biller-service`.

```
Claude       plans the task
  ↓
orca worktree isolates the change
  ↓
command-code implements (model zai-org/glm-5.3, --no-skills + --tools-enable grants,
             ponytail skill granted, --max-turns 40)
  ↓
pi reviewer  tier-1 review, read-only, $0
  ↓
Claude gate  tier-2, Standards + Spec (the /code-review pattern)
  ↓
promote      glab mr create (GitLab MR, human merges)
```

## Why command-code implements, not pi

Measured and reproducible, verified again for this spec (2026-09-16):

- `pi`'s only clean-context switch is `-ne`/`--no-extensions`, and it is all-or-nothing —
  confirmed via `pi --help`. `pi-subagents` (the package the `reviewer` subagent ships from) is
  installed as an extension — confirmed via `pi list`:
  `npm:pi-subagents → ~/.pi/agent/npm/node_modules/pi-subagents`. `-ne` would disable it along
  with everything else. You cannot get a clean `pi` implementer and a working `pi` reviewer from
  the same `pi` installation in the same breath.
- `command-code` grants are per-flag, not all-or-nothing — confirmed via `command-code --help`:
  `--no-skills` and `--tools-enable <names>` (repeatable, comma-separated) are independent flags.
  It can be run clean-by-construction (skills off, only named tools enabled) without touching
  any other package.

This is why `pi` is downgraded to reviewer-only and `command-code` is the implementer, per the
plan file's "Deferred to v2" section.

## Decided (do not re-litigate without new evidence)

1. **Implementer:** `command-code`, model `zai-org/glm-5.3` ("Go plan" per the plan file),
   `ponytail` granted via `--skill`, `--max-turns 40`.
2. **Tier-1 review:** `pi`'s `reviewer` subagent, read-only, tolerates its own ambient context
   bleed because it never writes.
3. **Tier-2 gate:** Claude, two axes — Standards + Spec — the same `/code-review` pattern used
   to close every v1 ticket (100% hit rate finding a real bug, per the v1 commit history).
4. **Ledger:** `hermes kanban` replaces v1's `audit.jsonl` at this point — ADR 0003 explicitly
   scoped the JSONL choice to "v1 has no review states to record" and said kanban should be
   revisited, not permanently rejected, once the implementation lane lands. Its native states
   (`request-review --reviewer <profile>`, `request-changes`, `reopen-review`, `promote`) map
   directly onto the two review tiers — no new state machine needed.
5. **Target:** Flip `DP-xxxx` tickets, `gogogo-service` / `biller-service`.
6. **`agents.json` roster split:** `command-code` = implementer, `pi` = reviewer-only. The
   `pi-executor` entry (pi as implementer) was discarded 2026-09-16 as contradicting this
   decision — see the corrected project memory `orch-plan-execute-verify-pattern`.
7. **Worktree mechanism:** `orca worktree`, not `command-code`'s own `-w` flag — confirmed orca
   already tracks parent/child worktree relationships and display names that `-w` doesn't offer,
   and orca-managed worktrees for this lane already exist (see tracer bullet below).
8. **Promote mechanism:** open a GitLab MR via `glab mr create` — confirmed `gogogo-service` and
   `biller-service` remotes are `gitlab.com:flip-id/default/...` (not GitHub — `gh` fails against
   them), and `glab` is installed and authenticated as the user. Nothing lands on the base branch
   without a human clicking merge.
9. **First tracer-bullet ticket: `DP-10156`, `biller-service` only** (not `gogogo-service` —
   that worktree is empty/unused for this ticket). Its fix ("return row-level errors for bulk
   biller-product CSV upload") is **already implemented, committed (`b587d67a`), and pushed to
   `origin/DP-10156`**, with test-evidence artifacts already captured under
   `docs/evidence/DP-10156/` (untracked — from the `test-evidence` skill). No MR is open yet
   (`glab mr list --source-branch DP-10156` → empty).

   This changes what the tracer bullet actually exercises: the implement step already happened
   outside this pipeline (by the user, 2 days before this spec), so running it through v2 tests
   **review → gate → promote**, not implement. That's arguably the better first exercise, since
   those three stages are v2's actually-new, actually-unbuilt machinery — implement was already
   proven by hand. Re-running `command-code` against already-correct code would add no signal.

## Open Decisions — resolve before /implement, not during it

These are gaps the plan file and handoff do not settle. Do not invent answers under time
pressure while implementing a ticket — resolve them explicitly, the same way the `pi-executor`
conflict was resolved, or they'll produce the same kind of silent drift.

1. ~~`agents.json` schema for the three new roster entries~~ — **RESOLVED 2026-09-17**, see
   `orch/docs/adr/0005-two-tier-review-command-code-implements.md`. `cc-implementer`
   (`command-code`, model `zai-org/glm-5.3`, `capabilities: []` — measured: headless mode's
   default tool set already covers normal implementation work), `pi-reviewer` (not
   model-backed — no run has ever needed to override `pi`'s default), `orca-worktree` (plain
   `cli` entry). `orca`/`command-code`/`pi` added to `orch.mjs`'s `LAYERS`; `orch doctor`
   confirms all 5 layers reachable. 168/168 tests still pass. **Not yet committed** — sitting
   as uncommitted changes in `~/.agent-tools`.
2. **v2's orch CLI surface.** Still open — no new verbs added, and per ADR 0005 the tier-2
   gate is deliberately *not* a recipe step (mirrors how v1 never made `claude-planner` a
   subprocess), so this may need less new surface than assumed. Revisit once a recipe exists.
3. **Error codes for review/gate rejection.** Still open — moot until a recipe exists to need
   them.
4. ~~Inter-step data flow~~ — **RESOLVED 2026-09-17.** `orch.mjs` gained a `capture` field
   (`{as, json?}`) on a step and `{captured.<name>}` command substitution, resolved per step at
   run time (not at plan time — `planSteps` leaves it as a literal placeholder). 18 new tests.
5. ~~The `ponytail` `--skill` grant~~ — **RESOLVED, and the plan's assumption was wrong.**
   Confirmed `command-code --skill` wants `~/.agents/skills/<name>/SKILL.md` (a shared,
   cross-tool namespace — `find-skills`/`orca-cli` live there); ponytail's plugin has no
   `SKILL.md` anywhere. It does ship `.agents/rules/ponytail.md` — the same condensed prose
   this session's own hook injects — so the grant is `--append-system-prompt <that file>`, not
   `--skill`.
6. ~~Per-step working directory~~ — **RESOLVED same day.** Drafting the recipe surfaced a
   third gap: `realExec` never set a `cwd`, so every step ran wherever `orch` was invoked from,
   never inside a worktree a step's own capture might report. Steps gained an optional `cwd`
   field (substitutes like `command`, including `{captured.*}`), forwarded into `spawnSync`.
7. ~~`orch verify`'s access to captures~~ — **RESOLVED same day.** A capturing step now writes
   `{name, value}` onto its own audit line; `findRunCaptured` folds a run's lines back into a
   map; `runVerify` takes an optional `captured` and resolves `{captured.*}` in both
   `verify.command` and a new `verify.cwd`. Writing the test for this caught a real bug in the
   fix that shipped just before it — see ADR 0005's own entry for the fix.
   **205/205 total, all still uncommitted** in `~/.agent-tools`.
8. ~~`hermes kanban` wiring~~ — **RESOLVED, the fork dissolved.** A hermes "profile" is
   hermes's own agent identity (model/gateway/skills) — confirmed via `hermes profile
   list`/`show`, only one exists (`default`, muse-spark). `--assignee`/`--goal` hand a task to
   *that* actor, not to `command-code`/`pi`. A task created with no `--assignee` is never
   touched by `hermes kanban dispatch` (confirmed in `hermes`'s own source). Kanban is
   ledger-only here, exactly as ADR 0005 always said.
9. ~~No recipe file~~ — **RESOLVED.** `orch/recipes/ticket-implement.json` (worktree → kanban
   create → `cc-implementer` → `pi-reviewer` tier-1 → kanban request-review; Verify: `go build
   ./...` in the worktree) and `orch/recipes/ticket-promote.json` (`hermes kanban promote` →
   `glab mr create --fill`; Verify: `glab mr view`, confirmed to exit 0 exactly when the branch
   has an MR). Schema-validated and dry-run-checked with `planSteps`, **not yet actually run**
   against a real ticket — that's a separate, explicit, consequential step (real worktree, real
   kanban task, real command-code spend, potentially a real MR) that needs the owner's go-ahead,
   not something to do under the same momentum that built the recipes.

**Status: the code-implementation lane is now buildable end to end on paper.** Nothing here has
been committed to git, and the recipes have never actually been run. Both are deliberate stops,
not oversights.

None of these block running the tracer bullet by hand first (below) — they're about how orch
*automates* this lane, not about whether `DP-10156` can go through review → gate → promote.

## Out of Scope (for the first tracer-bullet slice)

- Anything generic (orch recipe wiring, `agents.json` entries, new CLI verbs) before one real
  ticket has gone through the lane by hand, successfully, once. Mirrors how v1's ticket 01
  carried the scaffold before the other seven built on it. For `DP-10156` specifically that means
  tier-1 review → tier-2 gate → promote (implement is already done — see "Decided" #9).
- Cleaning OmniRoute's dead `cmd/*` legs — separate job, and per the plan file's Risks section,
  `command-code` is invoked as its own CLI (its own `login`/`auth status`), not through
  OmniRoute's `auto/coding` combos, so this lane doesn't obviously depend on that cleanup. Worth
  confirming, not assuming, if command-code's own auth turns out to route through OmniRoute
  after all.
- Grading/SIAKAD, quality scoring beyond the two-axis gate — same exclusions as v1.

## Further Notes

- Rotate the credential noted in the handoff (Anthropic OAuth token pair printed into an earlier
  session transcript while debugging pi context pollution) if not already done — unrelated to
  v2's design but flagged as still-open in the handoff.
- Re-verify the "facts worth re-checking" list in the handoff
  (`/private/tmp/claude-502/.../orch-v2-handoff.md`) if more than a day or two has passed since
  2026-09-16: OmniRoute `provider_connections`, `hermes kanban` board emptiness, the
  `combo-benchmark` cron's first real fire, the RISE session cookie, and the published Artifact's
  staleness.
