# 0002. Design Docs are committed files, not chat

## Status
Accepted

## Context
Designs discussed in a chat session evaporate; designs in a repo diff, review,
and survive. The user's existing superpowers convention already commits dated
design docs under `docs/`. Chat-only design also makes REVIEW impossible — there
is nothing stable to compare code against.

## Decision
The pipeline's artifact is a committed markdown file, scaffolded by
`sin-think.mjs new` from TEMPLATE.md, defaulting to `docs/design/<date>-<slug>.md`.
The `check` command exists because an on-disk artifact can be linted; a
conversation cannot. `--dir` accommodates repos with their own docs convention.

## Consequences
Design changes appear in diffs and PRs, which is what makes the `stale-doc`
verdict enforceable: an undocumented design change is visible as a missing doc
hunk in the same change. The cost is one more file per feature — accepted.
