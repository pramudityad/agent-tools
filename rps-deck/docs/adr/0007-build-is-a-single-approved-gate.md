# 0007 — `build` emits one file, and only once approved

**Status:** accepted · 2026-09-23

**Amends:** the "Companion decision — the FLAG gate" section of ADR 0002, and the
`--final` behaviour described in ADR 0006.

## Context

`build` grew a second HTML/PDF pair this session — a materi variant alongside the naskah,
matching the audience split ADR 0002 established for the review-era HTML. But by ADR 0006,
review had already moved to Markdown: `naskah.md` and `materi.md` are what get read before
approval, and the HTML/PDF pair exists only as the classroom-projectable artifact. Across
every session actually taught (Sesi 01-04), the materi variant was never produced or used —
the real student deliverable was always `Sesi NN - Materi.md`. The materi HTML/PDF was
dead weight the moment it was built.

Separately, `build` (no flag) has always been able to emit a working deck for an
**unapproved** naskah — only `build --final` enforced the approval + no-open-FLAG gate.
Nothing stopped an unapproved draft from being projected by mistake; the safety depended on
remembering to type `--final`, not on the tool.

A real reference file surfaced a second drift while checking this: `Sesi 04 - Slides.pdf`
renders portrait US Letter (612×792pt) — Chromium's unset default, not a chosen page size.

## Decision

**One file.** `build` emits only the naskah/instructor deck —
`"<course> - Sesi NN - Slides.html"` plus a `.pdf` twin. The student deliverable stays
`Materi.md`, produced by `render`, untouched by this change.

**One gate, unconditional.** `build` refuses outright — no file written — unless there is no
open `FLAG` and the naskah's approval hash matches its current content. There is no lesser
"preview an unapproved draft" mode. `--final` is accepted as a harmless no-op so old habit
still works, but it changes nothing: plain `build` now does what `build --final` used to do.

**PDF stays landscape**, `@page{size:338mm 190mm}` — a deliberate choice for the deck's wide
single-column layout, not a revert to the old files' incidental portrait default.

## Consequences

A file can no longer exist at all without having passed review and approval first — the
failure ADR 0002's companion decision tolerated (an unapproved preview) is now structurally
impossible, not just discouraged.

Sesi 01-04's existing output files are untouched; this only governs builds from here
forward. Sesi 05 and 06, built earlier the same day under the two-file scheme, were
regenerated under this one to avoid two conventions coexisting in the same folder.
