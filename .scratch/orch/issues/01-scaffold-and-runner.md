# 01 — Scaffold the tool and make one recipe run end to end

**What to build:** `orch run <recipe>` takes a named recipe, runs its steps in the order declared,
stops at the first step that exits non-zero, and appends one JSON line per step to an audit log so
the owner can see afterwards what ran and what it returned. A recipe that declares no check is
refused before anything executes.

This is the tracer bullet: the thinnest complete path through the tool. It carries the scaffold too,
because a scaffold on its own demonstrates nothing.

Follow `rise-ops` for structure — zero-dependency single `.mjs`, a hermetic `test.mjs`, an
idempotent `install.sh` that refuses to install when tests fail. Read `rise-ops/CONTRACT.md` for the
error shape and `../../../CONTEXT-MAP.md` for house conventions before starting.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `orch.mjs` exists as a zero-dependency single file; no `node_modules`, no build step
- [x] `loadRecipe(obj)` returns a validated recipe, or throws with a `code`
- [x] A recipe with no declared check is refused with `no_verify` — exit 1, JSON on stderr
- [x] `planSteps(recipe, args)` returns the ordered command list
- [x] `runRecipe({ exec })` takes `exec` as an injected parameter
- [x] Steps run in declared order
- [x] A non-zero exit stops the run, and later steps do not execute
- [x] The failing step is recorded before the run stops
- [x] `auditLine(runId, step, result)` produces one JSON line; runs append to `~/.config/orch/audit.jsonl`
- [x] `orch verify <id>` runs the declared check on its own
- [x] `test.mjs` is hermetic — no network, no filesystem, no dependencies beyond Node built-ins
- [x] Tests cover: ordering, stop-on-failure, the failing step being logged, and `no_verify`
- [x] `install.sh` refuses to install when `node test.mjs` fails
- [x] `install.sh` symlinks the CLI to `~/.local/bin` and copies `stubs/SKILL.md` into each harness present
- [x] `CONTEXT.md` defines Recipe, Verify, Envelope and Run, each with a binding `_Avoid_` list
- [x] `CONTRACT.md` documents exit codes and the stderr JSON shape
- [x] ADR 0001 orch owns no engine; ADR 0002 no Verify, no Run; ADR 0003 JSONL until review states earn a task board
- [x] `orch` is registered as a row in the root `CONTEXT-MAP.md`

## Comments

**2026-09-16** — Implemented and committed as `2121af5` (setup precondition) and `2e3e353`
(this ticket). `/code-review` (Standards + Spec, two parallel agents) ran against the staged
diff before commit and surfaced two real issues, both fixed before committing rather than
filed as follow-ups:

- Standards: `CONTRACT.md` cited a not-yet-existing ADR 0004 (that ADR belongs to ticket 03).
  Reworded to stop pointing at a dangling path.
- Spec: `exec` throwing (a command that cannot be spawned at all — confirmed live with a
  typo'd binary name) aborted `runRecipe`/`runVerify` before they returned, silently losing
  every audit line already collected, including for steps that had already succeeded. Fixed
  with `execOrFailure`; added two regression tests the original `fakeExec`-based suite could
  not have caught by construction, since it never modeled a throwing `exec`.

`node test.mjs`: 26 passed. `orch` is live at `~/.local/bin/orch` and registered in
`~/.claude`, `~/.pi`, `~/.hermes` (skill) and `~/.claude`, `~/.codex`, `~/.hermes` (AGENTS.md).

Frontier unblocked: tickets 02 (config model), 04 (status + insights), 07 (sesi-run), and 08
(deck-build) can now start; 04/07/08 depend only on this ticket.
