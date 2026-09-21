# 0001. Framework first, Effect as reference

## Status
Accepted

## Context
The source gist is written in Effect-TS vocabulary (`Effect<A, E, R>`, gen, pipe,
Layer, Schema). The user's Effect usage is aspirational; their day-job repos are
Go. A toolkit hard-coded to Effect idioms would rot unused; a purely abstract one
would lose the gist's precision.

## Decision
The core (CONTEXT, DESIGN, REVIEW, check) speaks only in channels — A, E, R,
Cardinality, Boundary, Layer Scoping — with no library names. All Effect-TS
idioms live in one swappable appendix, EFFECT.md, which also carries a short
Go mapping so the same Design Doc discipline works in the day-job repos.

## Consequences
Adding a mapping for another runtime means appending to EFFECT.md (or one sibling
file), never touching the pipeline. The glossary keeps Effect-adjacent terms
(`Gen body`, `Pipe`, `Layer`) because they are the shortest accurate names, but
defines them structurally, not by import path.
