# Context Map

This repo is a collection of independent agent tools. Each top-level directory is its own
**context** with its own glossary — the terms are load-bearing, and each entry's `_Avoid_` list is
binding.

**Read this file first, then read only the `CONTEXT.md` of the context your task touches.** Reading
all of them is waste; reading none of them is how an avoided term ends up in a commit.

| Context | What it does | Docs |
| :--- | :--- | :--- |
| [`learn/`](learn/CONTEXT.md) | Teaching one person a hierarchically-structured subject, keeping honest records of what they have actually demonstrated | `CONTEXT.md` |
| [`linkedin-jobs/`](linkedin-jobs/CONTEXT.md) | Reading a LinkedIn job posting honestly, without an account — separating what LinkedIn claims from what is verifiable | `CONTEXT.md` |
| [`rise-ops/`](rise-ops/CONTEXT.md) | Running and recording a Cakrawala sesi in the RISE portal: attendance, berita acara, session open/close. Never touches SIAKAD | `CONTEXT.md`, `CONTRACT.md`, `docs/adr/` |
| [`rps-deck/`](rps-deck/CONTEXT.md) | Builds instructor and student session decks from a spec the lecturer has reviewed | `CONTEXT.md`, `FORMAT.md`, `SANITISE.md` |
| [`sin-think/`](sin-think/CONTEXT.md) | Design-thinking glossary and design pipeline — turns a problem into an annotated call graph before code | `CONTEXT.md` |
| [`test-evidence/`](test-evidence/CONTEXT.md) | Turns QA-supplied test cases into reproducible, attachable proof that an endpoint behaves as specified | `CONTEXT.md` |

## Cross-context notes

- **`rise-ops` and `rps-deck` are siblings.** `rps-deck` builds the sesi that `rise-ops` then runs
  and records. A naskah must be `approved` in `rps-deck` before `rise-ops material` will publish it.
- **Course-level teaching vocabulary is not in this repo.** It lives at
  `~/Documents/Obsidian Vault/02-Projects/Cakrawala/CONTEXT.md`. Read it before either teaching tool.

## House conventions

Every tool in this repo follows the same shape:

- `<tool>.mjs` — zero-dependency single file. No `node_modules`, no build step.
- `test.mjs` — run by `install.sh`, which **refuses to install if the tests fail**.
- `install.sh` — idempotent; symlinks the CLI into `~/.local/bin`, copies `stubs/SKILL.md` into
  each agent that is actually present (`~/.claude`, `~/.pi`, `~/.hermes`), and marker-guards an
  append of `stubs/AGENTS.md` into each agent's root `AGENTS.md` (`~/.claude`, `~/.codex`,
  `~/.hermes`) so re-running the installer never duplicates the block.
- `CONTEXT.md` — the glossary. `CONTRACT.md` — exit codes and the stderr-JSON error shape.
- `docs/adr/NNNN-<slug>.md` — decisions that would be expensive to reverse.

There is **no YAML parser anywhere in this repo**. Config is JSON; frontmatter is parsed by a small
regex that handles flat `key: value` only. Adding a YAML dependency would break the zero-dep rule.
