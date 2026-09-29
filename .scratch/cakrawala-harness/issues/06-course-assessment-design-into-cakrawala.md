# 06 — course-assessment-design into cakrawala

**What to build:** Hermes's `course-assessment-design` (156 KB with dated UTS references) becomes a second skill in the `cakrawala` context with a lean SKILL.md and its lessons as references, reachable from every agent; the router's UTS/UAS on-ramp points at it.

**Blocked by:** 05

**Status:** done (commit 6989242)

- [x] SKILL.md is lean; dated UTS/PRD notes live under references
- [x] The lecturer has reviewed the move in `git diff` before linking
- [x] Every agent resolves the skill to the repo; Hermes's copy is moved aside

## Comments

Layout decision: `link-skills.sh` links exactly one `stubs/` per tool name (its own usage
line: `link-skills.sh <tool> <hermes-category>`, one `STUBS="$ROOT/$TOOL/stubs"` per
invocation). `cakrawala/stubs/` already holds the router skill, so a second skill could not
live there under the same tool name without either renaming the router's own skill or
teaching the script to link more than one `stubs/` per tool — both of which meant touching
`link-skills.sh`, which the ticket says to leave alone. So `course-assessment-design` is its
own top-level tool directory (`~/.agent-tools/course-assessment-design/`), with its own
`install.sh` calling `link-skills.sh course-assessment-design teaching` — same pattern as
`cakrawala/install.sh`. The pairing is documented, not structural: a "Cross-reference"
section in `cakrawala/CONTEXT.md`, a sibling-context note in `CONTEXT-MAP.md`'s
cross-context notes, a new table row for `course-assessment-design/` in `CONTEXT-MAP.md`,
and the router's UTS/UAS on-ramp line now names the concrete path instead of "a sibling
skill in this same context."

SKILL.md went from Hermes's 571-line/43.5 KB (156 KB directory total) copy to a ~90-line
lean version: frontmatter + use/not-for, the 6-step shape condensed to one paragraph each
(recon → outcome sentence → in-room DoD → real slot → authoring register → RPS
verification → multi-doc sweep), a short paragraph each for prodi-approval and
session-Tugas mechanics, a one-line pointer to pitfalls, and the same "Files" index Hermes's
copy already had (kept as-is — it's already lean and is exactly the index a reader needs).
All 11 dated reference files, both scripts, and both templates copied byte-for-byte into
`stubs/references|scripts|templates/` — no lesson dropped, just not inlined into SKILL.md.

Lecturer review: the merge was authored and staged as a single, `git diff`-reviewable commit
(`6989242`) before `course-assessment-design/install.sh` ran for real. That install moved
`~/.hermes/skills/teaching/course-assessment-design` aside to
`course-assessment-design.bak-20260929T022425Z` (not deleted) and replaced it, plus
`~/.agents/skills/`, `~/.claude/skills/`, `~/.pi/agent/skills/`, with symlinks to
`~/.agent-tools/course-assessment-design/stubs`. `readlink` on all four confirmed the same
target; re-running `install.sh` reported all four already-linked, unchanged.
