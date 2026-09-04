# 0005 — Research is deferred, not built

**Status:** accepted · 2026-09-04

## Context

The v2 design agreed a research step: a scaffold command emitting one section per topic in
the RPS **Materi** column, a cited research file, `SRC` markers on slides, and a `check`
rule failing any uncited factual claim. Four pieces of machinery.

Before building it we dry-ran the flow by hand against Sesi 2 and measured what research
actually contributed.

## Measurement

Sesi 2's Materi column names four topics. Three were **fully covered by the week note** —
the seven-layer reference architecture, the batch/streaming primer, and the whole
request-to-question treatment including a real BR-01/BR-02 artifact.

The fourth, lakehouse, was a genuine gap. The week note said so itself:

> *"Where the vault has nothing: it contains no lake/lakehouse implementation. Use public
> substitutes named in the References."*

And it then **named both sources**. Research discovered nothing it had not been handed.

Net contribution: **two citations, zero new content.**

## Decision

Do not build the research step. No `SRC` field, no scaffold command, no citation gate. A
`Sesi NN - Research.md` may exist and the skill mentions it, but nothing generates or
validates it.

## Consequences

Every one of the 48 sessions across the three courses has a week note, so on current
material the research step would run 48 times and contribute nothing 48 times.

`SRC` staying out also buys back grammar headroom. ADR 0001 named ~15 markers as the point
where the naskah stops being pleasant to review; `DUR` (ADR 0006) spends one, and `SRC`
would have spent another on a step that does not pay.

## When to revisit

The first course whose RPS arrives **without week notes**. Then the 58-word RPS row is the
only input, research becomes the sole content source, and provenance stops being optional —
at which point this ADR is the record of exactly what was designed and why it was shelved.
