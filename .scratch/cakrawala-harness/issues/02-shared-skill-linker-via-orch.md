# 02 — Shared skill linker, first used by orch

**What to build:** a shared root script that links a tool's `stubs/` into `~/.agents/skills/<tool>` and links Claude's, pi's and Hermes's (category dir) skill folders to that, per ADR `docs/adr/0001`. `orch`'s installer switches to it. The orch stub's stale "worktree/review/gate not built" description is corrected (ADR 0005 built it). The house-conventions section of the context map describes linking, not copying.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A root `test.mjs` runs the script against a temp `HOME` with fake `.claude`, `.pi`, `.hermes`, `.agents` and asserts every link target
- [ ] Re-running is idempotent; an absent agent is skipped with a message
- [ ] A pre-existing real directory at a target is moved aside with a timestamped suffix, never deleted
- [ ] `orch/install.sh` runs clean; `readlink` on each agent's `orch` skill resolves to `orch/stubs`
- [ ] The marker-guarded `AGENTS.md` append still works unchanged
