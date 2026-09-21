# orch — context

Facts and vocabulary an agent needs before running this tool. Read `../CONTEXT-MAP.md` first
for how this tool fits alongside its siblings.

## Language

**Recipe**:
An ordered, linear list of steps, each a literal command (an argv array, never a shell
string), plus one declared Verify. Linear because each underlying tool guards its own
preconditions — `rise-ops` already refuses to publish against an unapproved naskah and
refuses to write attendance with no roll source. The guard belongs next to the thing it
protects, not in orch.
_Avoid_: "pipeline" — it implies orch enforces ordering or dependency edges between steps,
which it deliberately does not.

**Verify**:
A command that exits `0` or `1`, declared on the recipe. A recipe with no Verify is refused
at load time with `no_verify`, before anything executes. A Run has no opinion on whether the
work is done — only on what the declared check returned.
_Avoid_: treating a clean run of all steps as proof of completion. Steps succeeding and the
declared check passing are different claims; `orch verify` checks the second one, on demand,
independent of the first.

**Envelope**:
Where a scheduled recipe's expensive work runs, relative to the agent turn that reports it.
Three envelopes: `script` (the work runs *outside* the turn; its stdout is injected as
context for the agent to summarise), `monitor` (a byte-stable gate — unchanged output
suppresses the run entirely, at zero cost), `agent` (a plain turn with no external script).
The envelope a schedule declares decides which script slot it may fill: `script` requires a
`script`, `monitor` requires a `monitorScript`, and `agent` declares neither.
_Avoid_: putting long-running work inside an `agent` turn. That pairing — `envelope: "agent"`
plus a script the agent is expected to shell out to — is the exact defect that has broken the
combo-benchmark job's scheduled runs since 2026-09-13 while its manual runs kept passing. It
is refused as `envelope_mismatch` in `loadSchedule`, the only way a schedule can be
constructed (`docs/adr/0004-envelope-mismatch-unrepresentable.md`), and jobs created by other
tools before this one existed are caught by `orch doctor` instead.
_Avoid_: thinking the schedule alone closes the hole. A scheduled job's prompt runs `orch run
<recipe>`, so the recipe's own steps are the other half: a scheduled recipe whose step shells
out to a hermes script puts the same work back inside the turn and is refused at load time as
`envelope_mismatch` too. A scheduled recipe's steps are the cheap remainder — the part that
genuinely needs the turn.

**Schedule**:
A recipe's cron expression plus the Envelope its work runs in, held in the recipe file itself
so there is one versioned source of truth for what a recipe does and when it runs. `orch
schedule` registers it with `hermes cron` and records it in the recipe only after the
scheduler has accepted the job. Where the job delivers is deliberately not part of it: a
destination is a machine fact, so it comes from `--deliver` or `~/.config/orch/config.json`
at registration and is never written into the recipe.
_Avoid_: scheduling a recipe by hand-editing the recipe and running `hermes cron create`
yourself — that path skips the `envelope_mismatch` refusal, which is the entire point of
routing every schedule through `loadSchedule`.

**Run**:
One instantiation of a recipe, identified by a run id, recorded as lines appended to
`~/.config/orch/audit.jsonl`. There is no separate run registry — `orch verify <id>` recovers
which recipe a run used by reading the audit log itself, so the log and the lookup can never
drift apart.
_Avoid_: "task" or "job" for a Run specifically — those names are already owned by `hermes
kanban` and `hermes cron` respectively, and this tool does not use either as its ledger (see
`docs/adr/0003-jsonl-until-review-states-earn-kanban.md`).

**Open run**:
A Run that no passing Verify line has closed — the honest answer to "what is in flight", since
every step exiting zero is a different claim (ADR 0002). `orch status` states each one as
`unverified` (everything recorded exited zero, but nothing has checked it), `failed` (the last
step exited non-zero, so the steps after it never ran), or `verify failed` (every step passed
and the declared check did not — a different finding with a different fix).
_Avoid_: reading "open" as "currently executing". The audit log records a step once it has
returned, so a run killed mid-flight looks like one still working and both read `unverified` —
a reason to go and check rather than to assume either way.

**Step**:
One command within a recipe: an `id` and a `command` array, plus four optional fields —
`agent` (the id of an `agents.json` roster entry that carries out this step), `settings`
(that step's own declared overrides, e.g. a specific `model`), `capture` (see below), and
`cwd` (the directory the command runs in — defaults to wherever `orch` itself was invoked
from when absent; substitutes the same way `command` tokens do, including `{captured.*}`, so
a step can run inside a worktree an earlier step just created). Commands are argv arrays, never shell strings — a step never passes through a shell, so there
is nothing for a placeholder substitution to accidentally break out of.
_Avoid_: writing a step's `command` as a single string. `loadRecipe` rejects anything that
is not an array.
_Avoid_: giving a step the id `verify`. `orch verify` records its own line under that id, and
that line is the only thing that closes a Run — so `loadRecipe` refuses the id as `bad_input`,
and a step can never close a run it did not check.

**Capture**:
A step's declared `{as, json?}` — how that step's own result feeds a *later* step's command.
With no `json`, the capture is the step's trimmed stdout verbatim; with a dotted `json` path
(e.g. `"result.worktree.path"`), stdout is parsed as JSON first and that path is pulled out.
A later step's command references it as `{captured.<as>}`. Added for the code-implementation
lane (ADR 0005), whose first step — `orca worktree create --json` — reports a filesystem path
no fixed naming convention could stand in for.
_Avoid_: expecting `{captured.*}` to resolve at plan time. `planSteps` substitutes `{n}` and a
step's own named settings for *every* step up front, before any of them run — a captured
value cannot exist yet at that point, so it is left as a literal, unresolved placeholder.
`runRecipe` resolves it per step, immediately before that step executes, once every earlier
step has actually run and folded its capture in. Referencing a capture out of order, or one no
step ever declares, is `bad_input`, raised at that step rather than at plan time.
_Avoid_: assuming a capture is only visible inside the same `orch run`. Every captured value
is also written onto its step's own audit line, so `orch verify <run-id>` — a separate
invocation, possibly long after the run finished — can recover the whole map via
`findRunCaptured` and resolve `{captured.*}` in `verify.command` or `verify.cwd` too.
_Avoid_: treating a capture's own failure (e.g. `capture.json` not matching what the step
actually printed) as a distinct failure mode from a non-zero exit. It is folded into the same
one: the step's line is still recorded, and the run still stops — the alternative (letting it
throw past `runRecipe`) was tried and found to silently drop every already-collected line,
including the failing step's own.

**Agent** (roster entry):
One entry in `agents.json`: an `id`, a `harness`, and — only when model-backed — a `model`
and its granted `capabilities`. `claude-planner` and `cc-implementer` are the model-backed
entries; every CLI entry (`rise-ops`, `rps-deck`, `graphify`, `hermes`, `pi-reviewer`,
`orca-worktree`) has no model and nothing to grant. `pi-reviewer` is deliberately not
model-backed even though `pi` itself is an LLM harness — no run has ever needed to override
`pi`'s default model or tool grants (see ADR 0005), so there is nothing yet for a `{model}`/
`{capabilities}` template to carry; add them the day a real recipe needs to.
_Avoid_: assuming every roster entry carries a model — most don't, and `loadAgents` refuses
`capabilities` declared on an entry with no `model` as `bad_input`.
_Avoid_: assuming `capabilities: []` on `cc-implementer` means it is under-privileged.
Measured (ADR 0005): `command-code -p`'s default headless tool set already includes
`edit_file`, `shell_command`, `read_directory`, `glob`, `grep` — everything a normal
implementation task needs. `--tools-enable` only re-grants exotic tools (`cron_create`,
`task_create`, `enter_plan_mode`, …) that an implementer has never needed.

**Layer**:
A harness orch sits on top of, and therefore depends on being reachable before a recipe
failure can be trusted to be the recipe's fault. v1 had two — `claude` and `hermes`; `orca`,
`command-code` and `pi` joined once `agents.json` grew entries with those harnesses (ADR
0005). `orch doctor` probes each one and reports an unreachable harness as `layer_down`, so a
broken layer is never mistaken for a broken recipe.
_Avoid_: expecting `doctor` to probe the CLI tools a recipe calls (`rise-ops`, `rps-deck`,
`graphify`). Those are Steps inside a layer that already answered; a missing one surfaces as a
failed step carrying its own message, not as a layer finding.

## Configuration

There is **no YAML parser anywhere in this repo**. Recipes and the agent roster are JSON;
adding a YAML dependency would break the zero-dependency rule every sibling tool holds to.
A step's command tokens support three closed forms of substitution, never a shell and never
general templating: `{n}` (1-indexed) pulls from `orch run`'s positional args; `{captured.X}`
pulls from an earlier step's declared `capture`, resolved per step at run time rather than at
plan time (see Capture, above); any other `{name}` pulls from that step's own *resolved*
settings — the output of `resolveConfig`, so a step whose command names `{model}` genuinely
runs with whatever model won precedence for that run, not a copy the owner has to keep in
sync by hand.

Four files, two of them versioned with the tool and two machine-local:

| File | Versioned? | Holds |
| :--- | :--- | :--- |
| `agents.json` | yes | the roster — every agent's harness, model, and granted capabilities |
| `recipes/*.json` | yes | the recipes themselves, each with its optional `schedule` |
| `~/.config/orch/config.json` | no | machine-local settings only — paths, delivery target |
| `~/.config/orch/audit.jsonl` | no | the run ledger (see below) |

A recipe may declare a `schedule`, and it is deliberately a closed schema —
`{cron, envelope, script|monitorScript, workdir?}`. The envelope decides which script slot is
even legal, and a fifth field is refused as `bad_input` rather than accepted and ignored: a
setting orch reads past is a setting that looks configured and does nothing. It is versioned
with the recipe because it is behaviour, not a machine fact; the one field a machine supplies
instead — the delivery target — is not part of it at all.

An effective setting (a step's `model`, say) resolves through `resolveConfig`, most specific
first: a `--set key=value` flag passed to `orch run` for one invocation beats what the
recipe step itself declares, which beats that step's named agent's `agents.json` entry,
which beats `~/.config/orch/config.json`. A key absent at one level falls through to the
next rather than blanking out a real value below it.
_Avoid_: editing `agents.json` to work around a one-off need for a different model — `orch
run <recipe> --set model=...` does that for a single run without touching a file.

## Audit log

`~/.config/orch/audit.jsonl` — outside the repo, on purpose, matching `rise-ops`'
`~/.config/cakrawala/audit.jsonl`. One line per step, append-only, never rewritten:

```json
{"ts": "2026-09-16T10:37:32.510Z", "run": "c74b3b38-…", "recipe": "orch-smoke-test", "step": "touch", "cmd": ["touch", "/tmp/x"], "exit": 0}
```

```sh
python3 -c "import json;[print(json.loads(l)['ts'], json.loads(l)['run'], json.loads(l)['step'], json.loads(l)['exit']) for l in open('$HOME/.config/orch/audit.jsonl')]"
```

`exit` is `null` rather than a number when a step's command could not even be spawned (a
typo, a missing binary) — distinct from a normal non-zero exit, where the command ran and
returned failure. Either way the line is written; a step is never silently dropped.

## What this tool does not do

orch owns no engine of its own (`docs/adr/0001-orch-owns-no-engine.md`). It has no worktree
manager, no review states, and as of this ticket no task board — every one of those exists
already, in another harness, and is deferred until a recipe actually needs it. Adding one
speculatively is exactly what this tool's own house rule (KISS, see the sibling tools'
conventions) exists to prevent.
