# 02 — Declare every agent and step in configuration

**What to build:** the owner can see and change each agent's model and granted capabilities, and
each step's settings, without reading code. Settings resolve predictably: a flag passed for one run
beats what the recipe says, which beats the roster, which beats machine-local defaults.

Configuration is JSON. No YAML parser exists in this repo and adding one would break the
zero-dependency rule.

**Blocked by:** 01 — scaffold and runner.

**Status:** done

- [x] `agents.json` holds the roster; each entry declares its harness and, where model-backed, its model and granted capabilities
- [x] Only `claude-planner` is model-backed in v1; every other entry is a CLI with no model
- [x] `~/.config/orch/config.json` holds machine-local settings only — paths, delivery target
- [x] Versioned config lives with the tool; machine-local config does not
- [x] `resolveConfig(flag, step, agents, config)` implements the four-level precedence
- [x] A CLI flag overrides a recipe step for a single run without editing a file
- [x] Tests assert each precedence level wins over the one below it
- [x] Malformed config is refused with `bad_input`, naming what was wrong

## Comments

**2026-09-16** — Implemented in `orch.mjs`: `loadAgents`/`findAgent` validate the
`agents.json` roster, `loadOrchConfig` validates `~/.config/orch/config.json`, and
`resolveConfig(flag, step, agent, config)` merges the four layers most-specific-first
(flag → step → agent → config), filtering `undefined` per key so an absent value falls
through rather than blanking out a real one below it. `parseSetFlags` turns repeatable
`orch run <recipe> --set key=value` flags into that top layer.

A step gained two optional fields, `agent` and `settings` (`loadRecipe`), and the existing
`{n}` positional-substitution mechanism was extended to also resolve any other `{name}`
token from that step's *resolved* settings (`planSteps`/`substitute`) — e.g. a step naming
`{model}` in its command genuinely runs with whichever model won precedence for that run.
`cmdRun` computes each agent-backed step's resolved settings before executing, prints them,
and threads them through `runRecipe` into the actual command.

`/code-review` (Standards + Spec, two parallel agents) ran against the diff before commit
and both independently flagged the same real gap in the first pass: `--set` resolved and
printed settings but nothing consumed them, so the override was decorative, and
`agents.json`/`config.json` were only validated when a run happened to pass `--set`. Fixed
by wiring resolved settings into command substitution as above, and by loading/validating
the roster and config whenever a recipe has *any* agent-backed step — not only when `--set`
is passed. `CONTEXT.md` and `CONTRACT.md` updated to describe the real (not decorative)
mechanism.

`node test.mjs`: 67 passed (41 new, covering `loadAgents`, `findAgent`, `loadOrchConfig`,
`resolveConfig`'s four-level precedence, `parseSetFlags`, agent-backed step validation in
`loadRecipe`, and named-placeholder substitution through both `planSteps` and `runRecipe`).

Frontier unblocked: ticket 03 (schedule and doctor), which was blocked on this ticket, can
now start.
