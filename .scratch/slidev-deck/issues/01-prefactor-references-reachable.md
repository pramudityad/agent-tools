# 01 — Make rps-deck references reachable and commit them

**What to build:** Every rps-deck reference an agent is told to read can be read through the
symlinked skill. That covers the pedagogy checklist and humanize-naskah, which naskah-review
depends on. The rps-deck files that are currently untracked are committed. No behaviour
changes. Leave the unrelated uncommitted work in rise-ops, orch and
course-assessment-design alone.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The pedagogy checklist and humanize-naskah live under the skill's `stubs/references/`, and every path to them in rps-deck and the cakrawala router resolves through `~/.claude/skills/...`
- [ ] The ppt-master reference is not moved. Ticket 05 deletes it.
- [ ] The skill text that still describes the retired `sesiNN-deck-*` pair is corrected to the ADR 0007 output
- [ ] ADR 0009 and the CONTEXT.md entries for Deck and Soul are committed in the same change
- [ ] `node test.mjs` passes in rps-deck
