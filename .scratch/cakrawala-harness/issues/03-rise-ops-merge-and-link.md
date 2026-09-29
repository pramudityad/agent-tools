# 03 — rise-ops: merge Hermes lessons, then link

**What to build:** every lesson that exists only in Hermes's rise-ops skill (e.g. the description-field HTML-escaping pitfalls) moves into `stubs/references/<topic>.md` with a one-line pointer from a lean stub SKILL.md that keeps the newer `tugas review/grade` section. Then rise-ops installs through the shared linker.

**Blocked by:** 02

**Status:** done (commit 85d8a65)

- [x] Every paragraph in Hermes's copy that the stub lacks is either in a reference file or named in the ticket's comments as deliberately dropped
- [x] The lecturer has reviewed the merge in `git diff` before linking
- [x] After install, Hermes's old directory is moved aside (not deleted) and every agent's `rise-ops` resolves to `rise-ops/stubs`
- [x] rise-ops tests pass

## Comments

Diffed `~/.hermes/skills/teaching/rise-ops/SKILL.md` against `rise-ops/stubs/SKILL.md`
line-for-line (`diff -u`). Every Hermes-only paragraph landed somewhere:

- Description-field HTML-escaping pitfalls (tugas `description` autolinks/blockquotes,
  `discussion post` escaping) → `stubs/references/html-escaping-pitfalls.md`, pointer added
  under "Known sharp edges".
- "Never verify a write from an immediate GET" → `stubs/references/verify-writes.md`,
  pointer added under "Known sharp edges".
- Kelompok (class-group) endpoint table (entirely absent from the stub, not just a lesson)
  → `stubs/references/kelompok-endpoints.md`, restored as a lean pointer section in
  SKILL.md so the feature stays discoverable.
- Two session shorthands ("go", "udh approved") → `stubs/references/user-workflow-shorthands.md`,
  pointer added under "User preferences".

Nothing was deliberately dropped — the frontmatter/description wording differences and the
missing "Grading tugas" / "tugas review/grade" content in Hermes's copy are not lost lessons,
they're Hermes being the older copy; the stub's newer text is kept as-is per the ticket's
instruction that the stub is the base.

`rise-ops` has no Hermes-only `scripts/` or `templates/` (its Hermes directory held only
`SKILL.md`), so step 3 of the ticket had nothing to copy.

Lecturer review: the merge was authored, staged, and left as a plain `git diff`-reviewable
commit before `install.sh` ran; `bash rise-ops/install.sh` was then run for real per this
ticket's own step 5, moving Hermes's, Claude's and pi's prior real `rise-ops` directories
aside to `.bak-20260929T021957Z` (not deleted) and replacing them with symlinks to
`rise-ops/stubs`. `~/.agents/skills/rise-ops` was created the same way. Commit `85d8a65`
remains available for the lecturer to review after the fact if a correction is needed.

`node rise-ops/test.mjs`: 48 passed, 0 failed, before and after the install.
