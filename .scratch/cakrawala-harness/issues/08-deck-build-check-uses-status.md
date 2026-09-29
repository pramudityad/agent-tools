# 08 — deck-build check uses status

**What to build:** the `deck-build` recipe's check stops re-running `build` and instead asserts via `rps-deck status` that the given naskah is `approved` with Slides and Materi present — so `orch verify` can go green.

**Blocked by:** 07

**Status:** done (commit dc1cee7)

- [x] orch tests pass
- [x] `orch run deck-build …` on an approved BI naskah, then `orch verify <run>`, exits 0
- [x] The same check exits non-zero on a draft naskah

## Implementation note

The `verify.command` in `orch/recipes/deck-build.json` was replaced with a small
dependency-free `python3 -c` script (no other file touched). It takes the naskah path
(`{1}`), derives the course directory (`dirname`) and sesi number (from the
`Sesi NN - Naskah.md` filename), shells out to `rps-deck status <course-dir>`, finds
that sesi's row in the output, and exits non-zero unless the row reads
`naskah: approved`, `slides: yes`, and `materi: yes`. It never re-runs `build`.

Written as `python3` (not `node -e`) deliberately: orch's `substitute()` regex-replaces
every `{...}` span in every command token, including `verify.command` — so a script
containing `{ ... }` blocks (JS `if`/object literals) would collide with placeholder
substitution and fail as `bad_input`. Python's indentation-based blocks and no dict/set
literals in this script mean it contains zero `{`/`}` characters, matching the same
pattern already used by `graphify-update.json`'s verify script.

**Note on the commit:** this fix's diff (`orch/recipes/deck-build.json` only) was
staged with `git add` and then swept into `dc1cee7` ("docs: rps-deck — merge Hermes
lessons into stub references, link via shared linker") by a concurrent agent's
broader `git add`/`git commit` on ticket 04, before this ticket's own `fix:` commit
could be made — a real staging-area race in the shared repo. The content is correct
and was fully tested (see below) before that commit landed; rewriting `dc1cee7` after
the fact would rewrite history under a later commit (`122c24f`) from the same
concurrent agent, which is unsafe, so it was left as-is rather than force-rewritten.
No separate `fix:` commit exists for this reason — the diff has no delta left to
commit.

## Verification performed

- `node orch/test.mjs` — 211 passed (unchanged, no regressions).
- Real run against the approved BI naskah `Sesi 04 - Naskah.md`:
  `orch run deck-build` → run `154ba003-1615-40d2-b30f-17a049c8dbe9`, all 4 steps
  passed, exit 0. `orch verify 154ba003-1615-40d2-b30f-17a049c8dbe9` → exit 0
  (`✓ verify passed`).
- Real run against a copy of that same naskah with `status: approved` rewritten to
  `status: draft` in a scratch course dir: `orch run deck-build` → run
  `bd086973-0a64-4026-a568-0a97679a05bb`, stopped at `build-decks` (`step_failed`, as
  expected — `build` itself refuses an unapproved naskah). `orch verify
  bd086973-0a64-4026-a568-0a97679a05bb` → exit 1, `code: "verify_failed"`, stderr
  `Sesi 04 not ready: Sesi 04  naskah: draft    slides: no  materi: no`.
- Side effect: the positive-case `build`/`render` steps wrote two new files into the
  real BI course dir (`Business Intelligence Systems - Sesi 04 - Slides.html/.pdf` —
  a duplicate of the existing prefix-less `Sesi 04 - Slides.html/.pdf`, due to the
  naskah's `course` frontmatter). These are regenerable build artifacts, currently
  left untracked in the vault git repo (`rm` was denied by the sandbox's destructive-
  action guard); the lecturer can delete them or leave them.
