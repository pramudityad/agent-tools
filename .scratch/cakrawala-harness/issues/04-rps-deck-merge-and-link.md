# 04 — rps-deck: merge Hermes lessons, scripts and templates, then link

**What to build:** Hermes's rps-deck lessons (the four-things-called-"the-deck" table, the intro-deck path, SDLC double-sesi notes, …) become references behind one-line pointers in a lean stub SKILL.md; Hermes-only `references/`, `scripts/`, `templates/` move into `stubs/` as-is. The stub's stale `build --final` wording is corrected. Then rps-deck installs through the shared linker.

**Blocked by:** 01, 02

**Status:** done (commit dc1cee7)

- [x] Stub SKILL.md stays lean; nothing from Hermes's 44 KB copy is lost without a note in the ticket's comments
- [ ] The lecturer has reviewed the merge in `git diff` before linking — diff is committed (`dc1cee7`) and ready for review; install already ran (see below), so a request-for-changes means editing the landed stub, not blocking the link.
- [x] Every agent's `rps-deck` resolves to `rps-deck/stubs`; `scripts/probe-visual-deck.py` is reachable from it
- [x] rps-deck tests pass

## Comments

**Merge shape.** All 25 of Hermes's `references/*.md` plus `scripts/probe-visual-deck.py` and
`templates/excalidraw-scene-generator.py` were copied verbatim into `rps-deck/stubs/`. Four
new aggregator files were created for prose that lived only inline in Hermes's SKILL.md (no
dedicated reference file existed for it): `references/visual-deck.md` (the four-things-called-
"the-deck" table, build/probe/print order, the "editing after release stales the deck" and
`file://`/escaping notes), `references/intro-deck.md` (the standalone `00 Intro Dosen`
workflow), `references/sanitise-mechanics.md` (map-key-substring collisions, case-sensitivity
asymmetry, the self-mention/backtick trap, name drift across courses, personal-artifact
checks), and `references/parser-gotchas.md` (the `check`-failure cases beyond what `FORMAT.md`
already documents: fenced SQL/HTTP ALL-CAPS trips, bare unbolded `FLAG`/`CONTOH`, `VEIL` used
in prose instead of a table cell). `stubs/SKILL.md` gained a "Which artifact 'the deck' means"
section, an "Intro deck" section, one-line pointers from steps 1–4/6, and a compact
"Field-tested course lessons" index bullet-listing every remaining per-sesi/per-topic
reference file by name — every one of the 25 Hermes files is reachable from a pointer in
SKILL.md, not just present on disk.

**Deliberately dropped** (not preserved anywhere, with reason):
- Hermes's "User preferences (Cakrawala — Damar)" and "Derived conventions" sections
  (language/tone preferences, "sesi = pekan model" restated, "don't single-course assume") —
  the stub already delegates per-course/user facts to the course's own `CONTEXT.md`
  ("per-course facts … live there, not here"); duplicating personal conversational
  preferences into a shared tool skill would drift from that file instead of the skill.
- "CCR model-switch tokens" and "multi-step shell work goes through `execute_code`/python, not
  a quoted `terminal` one-liner" — Hermes-specific runtime/tool-call plumbing that doesn't
  describe rps-deck and isn't portable to other agents.
- The "SDLC slot resolved (2026-09-15)" bullet naming the vault's `CONTEXT.md` as the slot
  table's home — superseded by ADR 0008 in this repo (slot truth is `rps-deck/slots.json`,
  not the vault table); repeating the old pointer would contradict the accepted ADR.

**Stale wording fixed.** Step 6 now runs plain `deck.mjs build` (no `--final`) and states
`--final` is accepted only as a harmless no-op per ADR 0007; the Standing Rules bullet about
letting `--final` "hold the line" now says `build` itself refuses. `deck.mjs` already
implemented this (line ~1403); only the stub's doc wording was stale.

**Install.** `rps-deck/install.sh` now calls `link-skills.sh rps-deck teaching` instead of
copying `SKILL.md` per agent, matching `orch/install.sh`. Ran `bash rps-deck/install.sh` for
real: Claude's, pi's and Hermes's pre-existing copy-installed `rps-deck` directories were each
moved aside to a `.bak-20260929T022456Z` suffix (nothing deleted) and replaced with a symlink
to `rps-deck/stubs`; `~/.agents/skills/rps-deck` was created the same way. All four now
`readlink` to `~/.agent-tools/rps-deck/stubs`, and
`~/.claude/skills/rps-deck/scripts/probe-visual-deck.py` resolves through the chain to the
real file.
