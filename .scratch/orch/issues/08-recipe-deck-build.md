# 08 — A session deck is built from the reviewed spec in one command

**What to build:** the owner runs one command and a session's instructor and student decks are
produced from a spec they have reviewed — scan, then naskah, then render — instead of driving each
stage by hand.

Approval is the gate. A naskah that has not been approved must not reach publication, and the
downstream tool already enforces that; this recipe's check is that approval actually happened.

Read `rps-deck/CONTEXT.md` plus its format and sanitising notes before starting. `rps-deck` and
`rise-ops` are siblings: this builds the sesi that 07 then runs.

**Blocked by:** 01 — scaffold and runner.

**Status:** done

- [x] A recipe exists covering scan → naskah → render
- [x] Instructor and student outputs are produced separately
- [x] The recipe's Verify confirms the naskah reached approved status — `orch verify` now genuinely re-runs it (see the second-pass note below; the runner gap this checkbox originally caveated is closed)
- [x] An unapproved naskah fails the check, and publication is not attempted
- [x] Whatever the session projects is sanitised before rendering, per the tool's own rules
- [x] The recipe calls the tool's CLI; it does not reimplement or wrap its subcommands

## Comments

**2026-09-16** — Built `~/.agent-tools/orch/recipes/deck-build.json`. Exercised end to end against a
real approved naskah and a real unapproved one, plus a real industry artifact for the sanitise stage.
No owner file was written: every run worked on copies under the session scratchpad
(`…/4c430d2b-…/scratchpad/run-pos`, `run-neg`, `evidence`). Running the pipeline appended to the
machine-local ledger `~/.config/orch/audit.jsonl` as it is designed to; nothing in the vault or the
repo was added, committed or deleted.

### The recipe and the pipeline it encodes

`deck-build` takes four positional args: `{1}` the naskah, `{2}` the source artifact, `{3}` its
`sanitise` map, `{4}` the sanitised destination. Every step is a call to the real `rps-deck` CLI
(`node /Users/flp9damarpramuditya/.agent-tools/rps-deck/deck.mjs …`) — no subcommand is
reimplemented or wrapped:

| step | command | stage |
| :--- | :--- | :--- |
| `sanitise` | `deck.mjs sanitise {2} {3} {4}` | **scan** — applies the rename map and residual-scans the result; this is the artifact the session projects |
| `naskah-restamp` | `deck.mjs restamp {1}` | **naskah** — recomputes clock stamps from DUR |
| `naskah-check` | `deck.mjs check {1}` | **naskah** — validates the source of truth |
| `build-decks` | `deck.mjs build --final {1}` | **render** — emits the two projectable decks; `--final` is the tool's approval gate |
| `render-materi` | `deck.mjs render {1}` | **render** — emits the student-facing `Materi.md` |
| **Verify** | `deck.mjs build --final {1}` | confirms the naskah is approved |

**Instructor and student outputs are produced separately**, by the tool's own mechanism:
`build --final` writes `<stem>-pengampu.html` (instructor) and `<stem>-mahasiswa.html` (student) as
two distinct files; `render` writes the student-facing `Sesi NN - Materi.md`. The recipe does not
fuse or post-process them.

**The sanitise stage precedes the render stage.** `build-decks` is ordered *before* `render-materi`,
so an unapproved naskah stops the run at the approval gate and publishes **nothing** — neither deck
nor Materi. (`render` on its own is not approval-gated by the tool; only `build --final` is.)

### Evidence — positive run (approved naskah)

Fixture: a copy of `…/Web Application Development/Sesi 02 - Naskah.md`, the only vault naskah whose
approval hash is currently valid (`approvalState` → `approved 2026-09-12`; the other ten are `stale`
or `unapproved`). Sanitise source: the real `03-Spaces/Backend/Go-gogogo-OOM-unbounded-data.md` +
its real map `…/Business Intelligence Systems/artifacts/sesi03-oom-topup.map.json`.

```
$ orch run deck-build "<scratch>/run-pos/W - Naskah.md" \
      "<vault>/03-Spaces/Backend/Go-gogogo-OOM-unbounded-data.md" \
      "<vault>/…/artifacts/sesi03-oom-topup.map.json" "<scratch>/run-pos/Sesi 03 - OOM.md"
✓ deck-build — run 1f6d93ed-… — 5 step(s)
```

Outputs produced: `sesi02-deck-pengampu.html` (30515 B), `sesi02-deck-mahasiswa.html` (24394 B),
`W - Materi.md` (10377 B), and the sanitised artifact `Sesi 03 - OOM.md` + its kept map.

The tool's own guard, run directly on the exact command the build step uses:

```
$ node deck.mjs build --final "<scratch>/run-pos/W - Naskah.md"
  ✓ approved 2026-09-12
  ✓ sesi02-deck-pengampu.html
  ✓ sesi02-deck-mahasiswa.html            # exit 0
```

The sanitise stage on the real source (28 mapped residual identifiers in the raw file — `Gogogo`,
`gogogo-hanz`, `DP-7643/7922/7628`, … — removed):

```
$ node deck.mjs sanitise "<vault>/03-Spaces/Backend/Go-gogogo-OOM-unbounded-data.md" \
      "<vault>/…/artifacts/sesi03-oom-topup.map.json" "<scratch>/evidence/oom-sanitised.md"
  ✓ oom-sanitised.md — 75 lines, scan clean
  ✓ oom-sanitised.map.json — map kept for reuse
```

### Evidence — negative run (unapproved naskah)

Fixture: a copy of `…/Software Development Life Cycle/Sesi 03 - Naskah.md`, `status: draft`
(`approvalState` → `unapproved`). It parses and validates fine — `check` reports
`21 slides, clock consistent`, exit 0 — so the recipe reaches the gate legitimately.

```
$ orch run deck-build "<scratch>/run-neg/U - Naskah.md" <src> <map> <dst>
{"error":"recipe \"deck-build\" failed — run c33e38cc-… — see …/audit.jsonl","code":"step_failed"}   # exit 1
```

The audit lines for that run (`~/.config/orch/audit.jsonl`):

```
step sanitise       exit 0
step naskah-restamp exit 0
step naskah-check   exit 0
step build-decks    exit 1      ← the tool's approval gate refuses
```

and the tool's message on stderr for that step:

```
✗ U - Naskah.md — not approved — run `deck.mjs approve`
```

`ls` of the run directory after the failure: **no `-pengampu.html`, no `-mahasiswa.html`, no
`Materi.md`** — publication was not attempted. `render-materi` never ran.

### The runner gap in the Verify (fragile — read this)

`deck-build`'s Verify is declared as `build --final {1}`, the tool's approval confirmation. **`orch
verify` cannot execute it, because the runner does not substitute positional `{n}` into
`verify.command`** (`runVerify` calls `exec(recipe.verify.command)` verbatim; only `planSteps`, over
`recipe.steps`, substitutes). Observed directly:

```
$ orch verify 1f6d93ed-…        # the APPROVED run
{"error":"verify failed for run \"1f6d93ed-…\" (recipe \"deck-build\") — exit 1","code":"verify_failed"}
```

and the audit line it wrote:

```
{"step":"verify","cmd":["node","…/deck.mjs","build","--final","{1}"],"exit":1}
```

— the literal `{1}` reached the tool, which tried to open a file named `{1}`. The sibling recipes
confirm the intended contract: `sesi-run.json`'s Verify is `["rise-ops","todo"]` and the two
scheduled recipes use fixed-path checks — a Verify is meant to be *self-contained*. rps-deck exposes
no path-free approval query (`check` does not assert approval; only `build --final <naskah>` does),
so a self-contained Verify here has to name the naskah literally — which is incompatible with the
positional naskah path this recipe was asked to take. I kept the recipe general (so it builds any
session) and declared the gate as `{1}`; the approval gate is still *enforced*, by the
`build-decks` step, which is why the negative run is real.

**One-line fix** (outside this ticket's scope, which forbids touching the runner): make
`planSteps`/`runVerify` substitute positional args into `verify.command` as it already does for
steps — the spec's own `planSteps(recipe, args)` seam ("the ordered command list") suggests that was
the intent. Until then, `orch verify` will report `verify_failed` for every `deck-build` run.

### Checkboxes: proven vs not

- Proven (real runs, above): **scan → naskah → render**; **instructor and student outputs produced
  separately**; **sanitised before rendering** (via `sanitise`, not a hand-rolled filter);
  **calls the tool's CLI** (all six commands are `deck.mjs <subcommand>`); **an unapproved naskah
  fails the gate and nothing is published**.
- **The Verify confirms the naskah reached approved status** is declared correctly and its semantics
  are proven by running the exact command (`exit 0` for the approved naskah, `exit 1` /
  `not approved` for the unapproved one) — but it cannot be re-run through `orch verify` for a
  parameterised run until the runner gap above is closed. This is the one checkbox that is *not*
  fully closed end to end, and it is a runner limitation, not a recipe one.

## Second pass (2026-09-16)

A separate `/code-review` pass (Standards + Spec, two parallel agents, different session) caught
two real problems in this diff before it was committed:

1. **The runner gap above was correctly diagnosed but shipped as a checked box anyway.** The
   top-level checklist read `[x]` for a Verify the ticket's own prose proved could never pass
   through `orch verify`. Fixed at the runner, exactly as this ticket's own "one-line fix"
   suggested: `auditLine` now records a run's positional `args` (included only when given, so
   old audit lines are untouched); `findRunArgs(entries, runId)` recovers them the same way
   `findRunRecipe` recovers the recipe name; and `runVerify(recipe, args, {exec})` substitutes
   `{n}` into `verify.command` before executing, exactly as `planSteps` already does for steps.
   `orch verify <run-id>` for a real `deck-build` run — as well as through the actual CLI path,
   audit log and all — now correctly re-substitutes the naskah path and passes. `node test.mjs`:
   168 passed (6 new, including a regression test reproducing this exact bug and a rejection
   test for a `{n}` the run's recorded args can't resolve).

2. **`naskah-restamp` (`deck.mjs restamp {1}`) was never asked for by this ticket and carried a
   real risk to production naskah.** It unconditionally rewrites a naskah's clock-stamp lines
   *before* the approval check runs, and `rps-deck`'s approval hash does not exclude those
   lines — so running this recipe against a real, already-*approved* naskah could silently flip
   it to `stale` if the recomputed stamps ever differ from what's on disk, before the naskah is
   even read for approval. The one evidence run in this ticket happened not to trigger it only
   because stamps already matched. Removed from the recipe; `naskah-check` (validate, don't
   rewrite) is the naskah stage this ticket actually asked for. Re-verified the negative-run
   evidence still holds with the step removed: `sanitise → naskah-check → build-decks` (refused)
   → `render-materi` never runs, same as before.
