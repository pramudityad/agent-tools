# sin-think

Design pipeline toolkit: PROBLEM → annotated call Graph → code that IS the Graph.
Agent skill for designing before coding and for reviewing code against its design.
Adapted from "Design Thinking" (r17x):
https://gist.github.com/r17x/90eb2f7be93932b5693753aedb09c01a

## Layout

| File | What |
|---|---|
| `stubs/SKILL.md` | agent pointer installed into `~/.claude/skills/sin-think/` etc. |
| `stubs/AGENTS.md` | block appended to codex/hermes AGENTS.md by install.sh |
| `CONTEXT.md` | glossary — read first; terms are load-bearing, `_Avoid_` lists enforced |
| `DESIGN.md` | playbook: problem → Design Doc |
| `REVIEW.md` | playbook: code vs Graph → `matches` / `stale-doc` / `wrong-code` |
| `CONTRACT.md` | exact CLI + check rules; source of truth when docs and code disagree |
| `EFFECT.md` | Effect-TS reference mapping (+ a note for Go) |
| `TEMPLATE.md` | canonical Design Doc layout |
| `sin-think.mjs` | zero-dep Node ESM CLI: `new`, `check`, `nodes` |
| `test.mjs` | hermetic test suite: `node test.mjs` |
| `docs/adr/` | why the toolkit is shaped this way |

## Install / upgrade

```bash
~/.agent-tools/sin-think/install.sh   # idempotent; only touches agents present
```
