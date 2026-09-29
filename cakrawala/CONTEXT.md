# cakrawala — context

A router, not a tool: it owns no CLI and no state. It tells an agent which sibling tool
(`rps-deck`, `rise-ops`, `orch`) fits the situation for one sesi. Course-level teaching
vocabulary lives in `~/Documents/Obsidian Vault/02-Projects/Cakrawala/CONTEXT.md`; read that
first. This file covers only the routing words.

## Language

**Sesi flow**:
The main path one sesi travels: prep (naskah → review → approve → build/render) → run
(brief, attendance) → close (berita acara, session end, material, register).
_Avoid_: pipeline, lifecycle, recipe (a recipe is an `orch` term).

**On-ramp**:
A situation that starts outside the sesi flow and merges onto it — a susulan Tugas, a batch
publish, UTS/UAS work.
_Avoid_: exception, special case.

## Cross-reference

The UTS/UAS on-ramp merges onto `course-assessment-design`, a sibling skill for the same
courses this router serves. It lives as its own top-level context —
`~/.agent-tools/course-assessment-design/` — because `link-skills.sh` links one `stubs/` per
tool name, and this context already uses its one `stubs/` for the router itself. See
`CONTEXT-MAP.md`.
