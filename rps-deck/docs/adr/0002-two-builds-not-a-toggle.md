# 0002 — Two builds, not a toggle

**Status:** accepted · 2026-09-03

## Context

The naskah carries candid classroom-management notes — how particular roles in the room will
struggle, when not to contradict a student, how to handle a cold-call. The lecturer needs
them while teaching and must never hand them to students.

The obvious design is one page with a notes toggle.

## Decision

Two files, rendered from separate code paths. `NOTES` and `VISUAL` are never written into
the materi.

`build` asserts this after emit — no `notes` block, no `visual` block, no clock rail — and
fails rather than writing a leaking file.

## Consequences

A toggle would leave the notes in the page source, readable by anyone who views source
regardless of what the UI shows. That is not a boundary, it is a curtain.

The first prototype build proved the failure is real and not hypothetical: slide 23's
`UKUR SEBELUM KELAS` placeholder — an instruction to the lecturer — reached the student
file. `KONTEN-MAHASISWA` exists because of it.

## Companion decision — the FLAG gate

There are two moments, so there are two gates. `build` warns on an open FLAG and proceeds,
because previewing a deck with one unmeasured number is legitimate. `build --final` exits
non-zero, because teaching from that placeholder is not.
