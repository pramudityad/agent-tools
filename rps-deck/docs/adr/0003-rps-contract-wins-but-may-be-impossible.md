# 0003 — The RPS contract wins, except when it cannot be obeyed

**Status:** accepted · 2026-09-03

## Context

Two documents described the same course and disagreed. The session note called the weekly
artifact a single 20% component graded pass/revise with "best 11 of 13 counted"; the
approved RPS split it across two 20% components, weighted the session at 2%, counted every
session, and applied a four-criterion rubric. Only reading both caught it.

Worse, the approved RPS contains instructions that cannot be carried out. It sets the
artifact deadline at "menit ke-150" in a session that ends at minute 105, and allots the
final exam 105 minutes inside a 105-minute slot.

## Decision

The RPS contract wins conflicts against a session note.

Where it is **impossible**, the deck states the workable version and the deviation is
recorded in the course's `RPS Defects.md`, using the severity idiom of the existing RPS
evaluation. Where it is **silent** on a fact a slide needs, stop and ask — do not infer.

## Consequences

Following an impossible instruction literally would print something false on a student
slide, and students notice. Refusing to build until the document is amended would stop the
class that happens next week.

Recording rather than merely deviating is what turns scattered one-off judgements into a
list that can be taken to prodi.

## Note

The clock check in `validate` comes from the same failure. The source note's clock column
drifted 15 minutes mid-table while its minute offsets stayed consistent, and the prose
inherited the error. Recomputing every stamp from `slot-start + min` makes that class of
drift impossible to ship.
