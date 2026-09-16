## orch
- **orch** (`~/.agent-tools/orch/`) — a validated recipe runner: runs a named, linear
  recipe over the owner's existing tools, refuses to run one with no declared check, and
  appends every step's result to an audit log. Read `CONTEXT.md` first. It owns no engine
  of its own (ADR 0001) — worktrees, review, and scheduling all delegate to the harness
  that already has them.
