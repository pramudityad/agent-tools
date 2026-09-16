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
_Avoid_: putting long-running work inside an `agent` turn. That pairing — `envelope: "agent"`
plus a script the agent is expected to shell out to — is the exact defect that has broken the
combo-benchmark job's scheduled runs since 2026-09-13 while its manual runs kept passing. It
is refused as `envelope_mismatch` wherever orch can see it declared.

**Run**:
One instantiation of a recipe, identified by a run id, recorded as lines appended to
`~/.config/orch/audit.jsonl`. There is no separate run registry — `orch verify <id>` recovers
which recipe a run used by reading the audit log itself, so the log and the lookup can never
drift apart.
_Avoid_: "task" or "job" for a Run specifically — those names are already owned by `hermes
kanban` and `hermes cron` respectively, and this tool does not use either as its ledger (see
`docs/adr/0003-jsonl-until-review-states-earn-kanban.md`).

**Step**:
One command within a recipe: an `id` and a `command` array, plus two optional fields —
`agent` (the id of an `agents.json` roster entry that carries out this step) and `settings`
(that step's own declared overrides, e.g. a specific `model`). Commands are argv arrays,
never shell strings — a step never passes through a shell, so there is nothing for a
placeholder substitution to accidentally break out of.
_Avoid_: writing a step's `command` as a single string. `loadRecipe` rejects anything that
is not an array.

**Agent** (roster entry):
One entry in `agents.json`: an `id`, a `harness`, and — only when model-backed — a `model`
and its granted `capabilities`. `claude-planner` is the only model-backed entry in v1; it
drives recipes and authors naskah. Every other entry (`rise-ops`, `rps-deck`, `graphify`,
`hermes`) is a deterministic CLI with no model and nothing to grant.
_Avoid_: assuming every roster entry carries a model — most don't, and `loadAgents` refuses
`capabilities` declared on an entry with no `model` as `bad_input`.

## Configuration

There is **no YAML parser anywhere in this repo**. Recipes and the agent roster are JSON;
adding a YAML dependency would break the zero-dependency rule every sibling tool holds to.
A step's command tokens support two closed forms of substitution, never a shell and never
general templating: `{n}` (1-indexed) pulls from `orch run`'s positional args; any other
`{name}` pulls from that step's own *resolved* settings — the output of `resolveConfig`, so
a step whose command names `{model}` genuinely runs with whatever model won precedence for
that run, not a copy the owner has to keep in sync by hand.

Four files, two of them versioned with the tool and two machine-local:

| File | Versioned? | Holds |
| :--- | :--- | :--- |
| `agents.json` | yes | the roster — every agent's harness, model, and granted capabilities |
| `recipes/*.json` | yes | the recipes themselves |
| `~/.config/orch/config.json` | no | machine-local settings only — paths, delivery target |
| `~/.config/orch/audit.jsonl` | no | the run ledger (see below) |

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
