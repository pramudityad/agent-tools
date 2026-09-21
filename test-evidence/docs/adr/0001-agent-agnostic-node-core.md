# Agent-agnostic Node core, not a Claude skill

The toolkit must be drivable by Claude Code, pi, Codex, and Hermes, so the deterministic
half (execute Checks → assert → render Evidence Cards → write the Evidence Set) lives in a
single-file, zero-dependency Node ESM script that any agent invokes from the shell, and the
judgement half lives in plain markdown playbooks containing no agent-specific syntax. Thin
per-agent stubs (`~/.claude/skills/.../SKILL.md`, an `AGENTS.md` section, pi and Hermes
equivalents) only redirect to the canonical directory. We chose Node over Go despite these
being Go services because a compiled binary needs a per-machine build step and is the least
convenient artifact for an agent to inspect or modify mid-flow; over Python/uv because Node
24 has `fetch` and JSON natively and so needs no resolve step at all; and over bash+curl
because deep-subset JSON assertions and HTML templating in bash do not stay maintainable.

Consequence: the toolkit assumes a Node runtime is present wherever an agent runs it. This
is verified for Claude Code and pi on this machine and unverified for Codex and Hermes,
which are not yet installed.
