# 01 — Settle pending rps-deck work

**What to build:** the lecturer commits (or explicitly discards) the uncommitted rps-deck changes and the untracked ADR 0007, so later tickets change `deck.mjs` from a clean base.

**Blocked by:** None — can start immediately.

**Status:** done (commit eef9475)

- [x] `git status` in the repo shows nothing pending under `rps-deck/`
- [x] ADR 0007 is tracked, or its removal is a deliberate commit
- [x] rps-deck tests pass on the committed state (63 passed)
