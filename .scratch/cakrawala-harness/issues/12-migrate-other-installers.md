# 12 — Move the other tools' installers to the linker (optional)

**What to build:** `learn`, `linkedin-jobs`, `sin-think` and `test-evidence` install through the shared linker, after checking each agent's copy against its stub for divergence.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Any divergent copy is merged or its loss noted before linking
- [ ] Each tool's tests pass and every agent's skill resolves to the repo
