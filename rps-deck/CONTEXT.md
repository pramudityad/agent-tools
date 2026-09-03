# rps-deck

Builds instructor and student session decks from a spec the lecturer has reviewed. This
glossary pins terms that collide with vocabulary already used in course notes and RPS
documents.

## Language

**RPS contract**:
The approved *Rencana Pembelajaran Semester* — the document supplying authoritative facts:
assessment weights, per-session rows, discipline rules, rubric. Wins every conflict against
a session note. Course-agnostic: this tool needs an RPS contract, not a named course.
_Avoid_: syllabus (loses the approval status that makes it binding), RPS draft.

**Session note**:
The lecturer's weekly lesson plan (`Week NN - ….md`). Rich in teaching design, not
authoritative on assessment. Where it disagrees with the RPS contract, it loses.
_Avoid_: lesson plan (also names the in-session timing table specifically), syllabus.

**Slot**:
The real wall-clock length of a session. The constraint that forces every cut. Not what the
session note claims: all 48 notes declare a 150-minute plan against a 105-minute slot.
_Avoid_: duration, session length (both read as the note's stated figure).

**Cut ledger**:
The written record of what was removed to fit the slot and where it went — a later session,
a static slide, or nothing. Lives in the spec, not in the tool.
_Avoid_: changelog, diff.

**Spec**:
`Sesi NN - Slide Generation Prompt.md` — the reviewed source of truth. Everything the tool
emits is derived from it (ADR 0001).
_Avoid_: manifest (names only §8 of it), script, prompt.

**Naskah**:
The instructor build. Carries speaker notes, visual directives and the clock rail. Never
published, never shared.
_Avoid_: instructor deck, teacher version.

**Materi**:
The student build. Slide content only. Safe to hand out because the notes were never
written into it, not because they are hidden (ADR 0002).
_Avoid_: student deck, public version, redacted version.

**Marker**:
A word plus a space applied to the segment it starts — `LEAD:`, `PANEL`, `NUM`, `VEIL`,
`TODO`. Carries the structure Markdown has no syntax for. Grammar in `FORMAT.md`.
_Avoid_: tag (reserved for the on-slide `HOLD`/`FLAG` chips), directive, shortcode.

**FLAG**:
A slide-level declaration that something is unresolved — most often a number nobody has
measured yet. `build` warns; `build --final` refuses.
_Avoid_: TODO (reserved for the inline marker that renders the placeholder chip), blocker.

**Residual scan**:
The check that must return nothing before a sanitised artifact is projectable. Runs the
rename map *and* the generic identifier classes, because the map is only as good as the
reading that produced it.
_Avoid_: audit, lint, redaction check.

**Deck type**:
`teaching` or `logistics`. A logistics deck (exam, presentation session) is exempt from the
slide mandate — there is no teaching content to expand and padding would mean inventing it.
_Avoid_: session type (that is the RPS contract's own column).
