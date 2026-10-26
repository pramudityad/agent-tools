# rps-deck

Builds the instructor deck and the student Materi from a naskah the lecturer has approved. This
glossary pins terms that collide with vocabulary already used in course notes and RPS
documents.

## Language

**RPS contract**:
The approved *Rencana Pembelajaran Semester* — the document supplying authoritative facts:
assessment weights, per-session rows, discipline rules, rubric. Wins every conflict against
a session note. Course-agnostic: this tool needs an RPS contract, not a named course.
_Avoid_: syllabus (loses the approval status that makes it binding), RPS draft.

**Session note**:
The lecturer's per-sesi lesson plan (`Sesi NN - <topic>.md`; formerly `Week NN`). Rich in teaching design, not
authoritative on assessment. Where it disagrees with the RPS contract, it loses.
_Avoid_: lesson plan (also names the in-session timing table specifically), syllabus.

**Slot**:
The real wall-clock length of a session. The constraint that forces every cut. Not what the
session note claims: every note declares a 150-minute plan, but the real slot differs per course
and is held in one place `check` compares a naskah against — never re-typed from a note.
_Avoid_: duration, session length (both read as the note's stated figure).

**Cut ledger**:
The written record of what was removed to fit the slot and where it went — a later session,
a static slide, or nothing. Lives in the spec, not in the tool.
_Avoid_: changelog, diff.

**Naskah**:
`Sesi NN - Naskah.md` — the one authored file and the source of truth. Everything else the
tool emits is derived from it (ADR 0001). Carries slide content, speaker notes and visual
directives together.
_Avoid_: spec, manifest, script, prompt, instructor deck.

**Materi**:
`Sesi NN - Materi.md` — generated from the naskah, never edited. Safe to hand out because
the notes were never written into it, not because they are hidden (ADR 0002).
_Avoid_: student deck, public version, redacted version.

**DUR**:
A slide's length in minutes. The only machine-readable budget: `restamp` derives every
clock stamp from it and `check` verifies the total equals the slot.
_Avoid_: duration (ambiguous with the session's), timing, length.

**Approval**:
`status: approved` plus a hash of the naskah's content. Editing after approval revokes it,
because the failure worth stopping is approve → tweak → ship.
_Avoid_: sign-off, review status (review is the act; approval is the record).

**Deck**:
`<course> - Sesi NN - Slides.md` — the Slidev source `build` derives from an approved naskah —
plus its exports `Slides.pdf` (what goes to RISE) and `Slides.pptx`. Never hand-edited;
regenerate from the naskah instead (ADR 0009).
_Avoid_: visual deck, ppt-master deck, Deck Pengampu, slides (alone, ambiguous with the
naskah's `### SLIDE` blocks).

**Marker** (retired for new naskah, ADR 0009):
A word plus a space applied to the segment it starts — `LEAD:`, `PANEL`, `NUM`, `VEIL`,
`TODO`. Only Sesi 01–14 naskah carry them; new `KONTEN` is Slidev markdown.
_Avoid_: tag (reserved for the on-slide `HOLD`/`FLAG` chips), directive, shortcode.

**FLAG**:
A slide-level declaration that something is unresolved — most often a number nobody has
measured yet. `build` refuses outright while one is open.
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
