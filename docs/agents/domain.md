# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **multi-context**: each top-level directory is an independent agent tool with its own
vocabulary. Contexts are top-level tool directories, not `src/<context>/`.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per context. Read each one
  relevant to the topic.
- **`<tool>/CONTEXT.md`** — the glossary for that one tool.
- **`<tool>/docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`<tool>/CONTRACT.md`** where present — the tool's exit-code and stderr-JSON contract.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT-MAP.md                     ← index of every context
├── docs/
│   ├── agents/                        ← this directory (skill configuration)
│   └── adr/                           ← repo-wide decisions, if any
├── rise-ops/
│   ├── CONTEXT.md
│   ├── CONTRACT.md
│   └── docs/adr/                      ← context-specific decisions
├── rps-deck/
│   └── CONTEXT.md
└── <tool>/
    ├── CONTEXT.md
    └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in that tool's `CONTEXT.md`. Don't drift to synonyms the
glossary explicitly avoids — each entry's `_Avoid_` list is binding, and correcting an avoided term
is expected behaviour rather than pedantry.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0003 (no roll, no write) — but worth reopening because…_
