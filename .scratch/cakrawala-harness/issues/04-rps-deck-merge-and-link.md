# 04 — rps-deck: merge Hermes lessons, scripts and templates, then link

**What to build:** Hermes's rps-deck lessons (the four-things-called-"the-deck" table, the intro-deck path, SDLC double-sesi notes, …) become references behind one-line pointers in a lean stub SKILL.md; Hermes-only `references/`, `scripts/`, `templates/` move into `stubs/` as-is. The stub's stale `build --final` wording is corrected. Then rps-deck installs through the shared linker.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] Stub SKILL.md stays lean; nothing from Hermes's 44 KB copy is lost without a note in the ticket's comments
- [ ] The lecturer has reviewed the merge in `git diff` before linking
- [ ] Every agent's `rps-deck` resolves to `rps-deck/stubs`; `scripts/probe-visual-deck.py` is reachable from it
- [ ] rps-deck tests pass
