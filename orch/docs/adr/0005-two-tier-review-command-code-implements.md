# 0005 — Two-tier review; command-code implements, pi reviews, Claude gates

**Status:** accepted · 2026-09-17

## Context

v1 deferred the code-implementation lane entirely (see the "Deferred to v2" section of the
plan that grilled v1 into shape): worktree isolation, tiered review, and a merge gate are
code-shaped work with no chosen phase in v1's two use cases. This ADR is that lane's design,
written after actually running it once by hand, end to end, against a real ticket
(`DP-10156` in `biller-service`) — not designed in the abstract.

**Why command-code implements, not pi.** Measured and reproducible, re-verified while writing
this ADR: `pi`'s only clean-context switch is `-ne`/`--no-extensions`, confirmed via
`pi --help`, and it is all-or-nothing. `pi-subagents` — the package the `reviewer` subagent
ships from — is itself installed as a `pi` extension, confirmed via `pi list`
(`npm:pi-subagents`). `-ne` would disable it along with everything else. There is no way to
get a clean `pi` implementer and a working `pi` reviewer from the same `pi` installation in
the same breath, so `pi` is reviewer-only and something else has to implement.
`command-code`'s grants are per-flag, not all-or-nothing — confirmed via `command-code
--help`: `--no-skills` and `--tools-enable <names>` are independent flags — so it can be run
clean-by-construction without touching pi's package at all.

**`--tools-enable` needs less than the plan assumed.** Measured tonight: `command-code -p`'s
*default* headless tool set already includes `edit_file`, `shell_command`, `read_directory`,
`glob`, `grep` — everything a normal implementation task needs, granted with no flag at all.
Comparing that default set against `--tools-all` shows `--tools-enable` only gates exotic
tools an implementer has never needed: `cron_create`/`cron_delete`/`cron_list`,
`enter_plan_mode`, `plan_review`, `taste`, `todo_write`, `ask_user_question`. So
`cc-implementer`'s `capabilities` in `agents.json` is `[]` — not under-provisioned, just
honest about what actually needs re-granting, which tonight was nothing.

**The tier-2 gate is not a recipe step.** v1 never made `claude-planner` a subprocess a recipe
step shells out to — it is the harness *driving* `orch run`, per `agents.json`'s own
`"role": "drive"`. The tier-2 gate is the same shape: it is Claude (the session driving the
recipe) running the two-axis Standards+Spec review directly — using the
`mattpocock-skills:code-review` skill, exactly as done for every v1 ticket — not a command a
recipe step invokes. A recipe can sequence up to "worktree exists, implementation committed,
tier-1 review recorded" and can record that the gate ran, but the gate's own execution is
outside `orch run`'s step list, same as planning always has been.

**The ledger switches to `hermes kanban`.** ADR 0003 chose `~/.config/orch/audit.jsonl` for
v1 *specifically* because v1 had no review states to record, and said explicitly that the
choice should be "revisited alongside" the implementation lane landing, not treated as a
permanent rejection of kanban. That review-state machine now exists: `hermes kanban`'s native
verbs — `request-review --reviewer <profile>`, `request-changes`, `reopen-review`,
`promote` — map directly onto the two tiers with no new state machine needed. `hermes kanban
boards` was confirmed empty (`default`, 0 tasks) as of this ADR — this lane is kanban's first
real user, exactly as ADR 0003 anticipated.

**Promote opens a GitLab MR.** `gogogo-service` and `biller-service` remotes resolve to
`gitlab.com:flip-id/default/...` — confirmed via `git remote -v` — not GitHub, so `gh` fails
against them. `glab` is installed and authenticated as the owner. Promote is `glab mr create`;
nothing lands on a target branch (`v2` in both repos, as of this ADR) without a human clicking
merge.

**Target:** Flip `DP-xxxx` tickets in `gogogo-service` and `biller-service`.

## Decision

The roster (`agents.json`) gains three entries:

```json
{ "id": "cc-implementer", "harness": "command-code", "model": "meta/muse-spark-1.3-contributor", "capabilities": [] },
{ "id": "pi-reviewer", "harness": "pi" },
{ "id": "orca-worktree", "harness": "cli" }
```

`cc-implementer`'s model was changed from the plan's original `zai-org/glm-5.3` to
`meta/muse-spark-1.3-contributor` (owner edit, 2026-09-17) — both are real, catalog-listed
`command-code` models (`command-code --list-models`), and the new one was live-verified the
same way (`command-code -p "say hi" --model meta/muse-spark-1.3-contributor ...` responded
correctly). A discounted "contributor" tier, not a typo or a mix-up with hermes's
similarly-named `muse-spark` profile model — they are different products' catalogs that
happen to offer models from the same family.

`pi-reviewer` is deliberately not model-backed: no run has ever needed to override `pi`'s
default provider/model, so there is nothing yet for a `{model}` template to carry. Add it the
day a real recipe needs to pin one.

The lane's shape: Claude plans → `orca worktree` isolates → `cc-implementer` implements →
`pi-reviewer` (the `reviewer` subagent) does tier-1 review → Claude does the tier-2 gate
(Standards + Spec, outside the recipe) → `hermes kanban` `promote` → `glab mr create`.

`orca`, `command-code`, and `pi` join `LAYERS` in `orch.mjs`, so `orch doctor` probes them —
CONTEXT.md's Layer entry ties this to `agents.json` naming an entry with that harness, which
is now true for all three.

## Consequences

- ADR 0003 is revisited, not reversed: v1's JSONL ledger stands for v1's own recipes (nothing
  about harness maintenance or teaching ops gained review states), but any *new* recipe in
  this lane records its lifecycle in `hermes kanban`, not `audit.jsonl`.
- `doctor` now reports `layer_down` for `orca`, `command-code`, or `pi` being unreachable,
  the same way it already does for `claude`/`hermes` — verified all three resolve on PATH
  (`/opt/homebrew/bin/orca`, mise shims for `command-code`/`pi`).
- **Inter-step data flow — resolved 2026-09-17, same day.** `orca worktree create --json`'s
  path is not a fixed convention worth hardcoding — confirmed via `orca worktree create
  --help` (path shape is not part of its documented contract) and by reading a real
  `orca worktree show --json` payload, which put it at `result.worktree.path`. `orch.mjs`
  gained a `capture` field on a step (`{as, json?}`) and `{captured.<name>}` command
  substitution, resolved per step at run time rather than at plan time (`planSteps` leaves it
  as a literal placeholder, since no capture exists before its step has run). 18 new tests;
  186/186 passing. Documented in CONTEXT.md's new **Capture** entry.
- **The `ponytail` skill grant — resolved, and the plan's assumption was wrong.**
  `command-code --skill <path>` wants a directory with a `SKILL.md` — confirmed by finding
  command-code's actual "Global" skills at `~/.agents/skills/<name>/SKILL.md` (a shared,
  cross-tool skill namespace; `find-skills` and `orca-cli` live there). Ponytail is not there
  and is not shaped that way: `~/.claude/plugins/cache/ponytail/ponytail/4.10.0` is a Claude
  Code *plugin* (`commands/*.toml`, `plugin.json`, no `SKILL.md` anywhere in it) — a different
  mechanism that happens to also use the word "skill". It does, however, ship
  `.agents/rules/ponytail.md` — confirmed to be the same condensed ponytail prose this very
  session's own `SessionStart` hook injects as a rule, not a skill. `command-code` has exactly
  the flag for that: `--append-system-prompt <file>`. So `cc-implementer` is granted ponytail
  via `--append-system-prompt ~/.claude/plugins/cache/ponytail/ponytail/4.10.0/.agents/rules/ponytail.md`,
  not `--skill` — a correction to the plan, not a gap left open.
- **Per-step working directory — resolved 2026-09-17, same day.** Drafting the actual recipe
  surfaced a third gap: `realExec` never set a `cwd`, so every step ran wherever `orch` itself
  was invoked from, never inside the worktree a step's own `capture` might have just reported.
  A step gained an optional `cwd` field, substituted exactly like `command` (including
  `{captured.*}`, resolved per step at run time) and forwarded through `execOrFailure` into
  `spawnSync`'s own `cwd` option — confirmed with a real (non-hermetic) spawnSync check, not
  just the injected-fake unit tests, since this is the one impure boundary. 8 more tests;
  194/194 passing.
- **`orch verify`'s access to captures — resolved 2026-09-17, same day.** A capturing step now
  writes its `{name, value}` onto its own audit line; `findRunCaptured` folds a run's lines
  back into a map, the same way `findRunArgs` already recovers positional args; `runVerify`
  takes an optional `captured` map and resolves `{captured.*}` in both `verify.command` and a
  new optional `verify.cwd`. Writing this test caught a real bug in the fix that shipped just
  before it: `capturedValue` throwing (e.g. a step's stdout doesn't match its declared
  `capture.json` shape) was let to propagate out of `runRecipe` entirely, silently discarding
  every already-collected line — including the failing step's own — before `cmdRun` ever got
  to append them. Fixed by folding a capture failure into the exact same "record the line, stop
  the run" path a non-zero exit already uses, instead of a separate throw. 11 more tests;
  205/205 passing.
- **`hermes kanban` wiring — resolved, the fork dissolves once "profile" is understood.**
  `hermes profile list` shows exactly one profile, `default` (model
  `muse-spark-1.2-contributor`, hermes's own gateway) — a profile is hermes's *own* agent
  identity (model + gateway + skills + `SOUL.md`), confirmed via `hermes profile show
  default`. `--assignee <profile>` and `--goal` hand a task to *that* actor, not to an
  arbitrary external CLI — there is no profile wrapping `command-code` or `pi`, and nothing in
  `hermes profile create` suggests one is meant to. A task created with **no** `--assignee` is
  never touched by `hermes kanban dispatch` (confirmed reading `_cmd_create` in
  `~/.hermes/hermes-agent/hermes_cli/kanban.py` — assignee is stored, not defaulted). So kanban
  really is ledger-only for this lane, exactly as this ADR already decided — the two models
  were never in conflict, only under-investigated.
- **Two recipes now exist**, `orch/recipes/ticket-implement.json` and
  `orch/recipes/ticket-promote.json` — schema-validated against `loadRecipe`, and `planSteps`
  dry-run-checked with realistic args (no real worktree/task/MR created; that is a separate,
  explicit step). `ticket-implement`: `orca worktree create --json` (captures `wt`) →
  `hermes kanban create --workspace worktree:{captured.wt} --json` (captures `task`, no
  `--assignee`) → `cc-implementer` (`--no-skills`, `--append-system-prompt <ponytail rules.md>`,
  `--trust`, `--max-turns 40`, `cwd: {captured.wt}`) → `pi-reviewer`'s tier-1 review
  (`cwd: {captured.wt}`) → `hermes kanban request-review {captured.task}`. Verify: `go build
  ./...` in the worktree. Deliberately stops there — the tier-2 gate is still not a recipe
  step (unchanged from this ADR's original decision). `ticket-promote` (run by the driving
  Claude only after doing that gate by hand) takes `(taskId, worktreePath, targetBranch)`:
  `hermes kanban promote {1}` → `glab mr create --fill --yes --target-branch {3}` in the
  worktree. Verify: `glab mr view` in the worktree — confirmed (via a real, harmless read
  against `biller-service`'s already-merged `DP-10156` branch) that it exits 0 exactly when the
  branch has an associated MR record, non-zero otherwise. `--reviewer` is deliberately not
  passed — GitLab's own project approval rules populated all 6 reviewers on `!795` without one.
