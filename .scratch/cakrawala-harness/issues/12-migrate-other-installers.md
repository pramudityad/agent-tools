# 12 — Move the other tools' installers to the linker (optional)

**What to build:** `learn`, `linkedin-jobs`, `sin-think` and `test-evidence` install through the shared linker, after checking each agent's copy against its stub for divergence.

**Blocked by:** 02

**Status:** done (commit 75241f0)

- [x] Any divergent copy is merged or its loss noted before linking
- [x] Each tool's tests pass and every agent's skill resolves to the repo

## Comments

No divergence found for any of the four tools. Every installed copy (Claude and pi;
Hermes had never received a real copy for any of these four, only its root `AGENTS.md`
pointer) was byte-identical to its tool's `stubs/SKILL.md`, and no tool's `stubs/`
carried extra files (`references/`, `scripts/`, `templates/`) that an installed copy
also had — so `link-skills.sh` replacing them was a pure no-op on content.

None of the four tools' `install.sh` previously set a `HERMES_CATEGORY` default (they
never installed into a Hermes category directory at all, only appended the root
`AGENTS.md` pointer), so categories were chosen fresh from Hermes's existing category
list to match each tool's `CONTEXT-MAP.md` description: `learn` -> `teaching`
(matches `rise-ops`/`rps-deck`'s precedent), `linkedin-jobs` -> `research`, `sin-think`
-> `software-development`, `test-evidence` -> `software-development`.

One incidental fix: `sin-think/install.sh` pointed its pi install at
`~/.config/pi/skills`, a path that has never existed on this machine (the real pi
skills dir is `~/.pi/agent/skills`, confirmed present and already holding every other
tool's skill). That copy call was consequently always a silent no-op — pi never
actually got a `sin-think` skill from this installer despite the script reporting no
error. `link-skills.sh` targets the real `~/.pi/agent/skills` path, so this migration
fixes that as a side effect rather than carrying the bug forward.

`test-evidence` has no `test.mjs` (doc-only test surface per `CONTEXT-MAP.md`); its
`install.sh` was verified by a clean real run instead.
