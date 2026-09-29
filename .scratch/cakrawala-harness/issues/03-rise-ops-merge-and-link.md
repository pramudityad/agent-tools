# 03 — rise-ops: merge Hermes lessons, then link

**What to build:** every lesson that exists only in Hermes's rise-ops skill (e.g. the description-field HTML-escaping pitfalls) moves into `stubs/references/<topic>.md` with a one-line pointer from a lean stub SKILL.md that keeps the newer `tugas review/grade` section. Then rise-ops installs through the shared linker.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Every paragraph in Hermes's copy that the stub lacks is either in a reference file or named in the ticket's comments as deliberately dropped
- [ ] The lecturer has reviewed the merge in `git diff` before linking
- [ ] After install, Hermes's old directory is moved aside (not deleted) and every agent's `rise-ops` resolves to `rise-ops/stubs`
- [ ] rise-ops tests pass
