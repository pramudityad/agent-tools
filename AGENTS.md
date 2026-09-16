# ~/.agent-tools

A collection of independent, zero-dependency agent tools. Each top-level directory is its own tool
with its own glossary and contract.

Start at [`CONTEXT-MAP.md`](CONTEXT-MAP.md).

## Agent skills

### Issue tracker

Local markdown — issues and specs live under `.scratch/<feature-slug>/`; this repo has no git
remote. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — a root `CONTEXT-MAP.md` pointing at one `CONTEXT.md` per tool, with ADRs held
per-tool in `<tool>/docs/adr/`. See `docs/agents/domain.md`.
