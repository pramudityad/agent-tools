# 02 — Declare every agent and step in configuration

**What to build:** the owner can see and change each agent's model and granted capabilities, and
each step's settings, without reading code. Settings resolve predictably: a flag passed for one run
beats what the recipe says, which beats the roster, which beats machine-local defaults.

Configuration is JSON. No YAML parser exists in this repo and adding one would break the
zero-dependency rule.

**Blocked by:** 01 — scaffold and runner.

**Status:** ready-for-agent

- [ ] `agents.json` holds the roster; each entry declares its harness and, where model-backed, its model and granted capabilities
- [ ] Only `claude-planner` is model-backed in v1; every other entry is a CLI with no model
- [ ] `~/.config/orch/config.json` holds machine-local settings only — paths, delivery target
- [ ] Versioned config lives with the tool; machine-local config does not
- [ ] `resolveConfig(flag, step, agents, config)` implements the four-level precedence
- [ ] A CLI flag overrides a recipe step for a single run without editing a file
- [ ] Tests assert each precedence level wins over the one below it
- [ ] Malformed config is refused with `bad_input`, naming what was wrong
