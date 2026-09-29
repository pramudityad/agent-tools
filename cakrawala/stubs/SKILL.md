---
name: cakrawala
description: >
  Use for a whole-sesi or "what's next" request — "siapkan sesi berikutnya", "sesi 08 BI
  dari awal sampai tutup", "apa yang belum beres", "tutup sesi kemarin BI". Routes the
  request across the sesi flow (prep, run, close) and its on-ramps (susulan Tugas, batch
  publish, UTS/UAS). NOT for a single `rps-deck` or `rise-ops` verb — "buat slide sesi 8",
  "brief kelas besok", "isi absen sesi 3" — those load that tool's own skill directly; this
  one would only get in the way.
---

# cakrawala

A router, not a tool: no CLI, no state of its own. Read `~/.agent-tools/cakrawala/CONTEXT.md`
first for **sesi flow** and **on-ramp**, and the vault's
`02-Projects/Cakrawala/CONTEXT.md` for course-level vocabulary (**Sesi**, **Sesi NN note**,
**Slot**) before routing anything.

## The sesi flow: prep → run → close

One sesi travels prep → run → close. Each step names the sibling tool's verb; read that
tool's own skill for how to use it — this section only says which one and in what order.

**Prep**
1. `rps-deck status <course-dir>` — see the course's real state before touching anything:
   which sesi has no naskah, which naskah is `draft`/`stale`, which sesi is missing Slides
   or Materi.
2. Author or edit the naskah (`rps-deck`'s own six steps: read the contract, reconcile,
   sanitise, author, render and review).
3. naskah-review — a checker prompt over the naskah before approval (topic/sesi-order
   drift, pedagogy for the slot, assessment numbers, sanitisation). RED blocks approval.
4. `rps-deck approve` — the lecturer's manual act; no agent approves its own naskah.
5. `rps-deck build --final` / `rps-deck render` — build the deck once approved.

**Run**
1. `rise-ops brief <course>` — pre-class briefing: Zoom link, taught slot, roster, at-risk
   list, artefak due.
2. `rise-ops attendance zoom|set <course> <sesi> …` — mark attendance from a roll source.

**Close**
1. `rise-ops acara <course> <sesi> --end` — berita acara (rencana + realisasi), then close
   the sesi.
2. `rise-ops material <course> <sesi> "…Slides.pdf"` — publish the approved deck's Materi.
3. `rise-ops register <course>` — regenerate the attendance register.

## On-ramps

A situation that starts outside the sesi flow and merges onto it.

- **Susulan Tugas** — a team misses the in-session artifact; create a catch-up
  `Sesi NN - Tugas.md` with an H+7 deadline instead of reopening the sesi. See
  `references/sesi05-h7-susulan-tugas.md` for the canonical example.
- **Batch publish** — "upload materi 1-5", "upload tugas 1-2": read what RISE already
  carries before uploading anything, so a re-run does not add a duplicate row. See
  `references/batch-publish-recipe.md`.
- **UTS/UAS** — merges onto the `course-assessment-design` skill
  (`~/.agent-tools/course-assessment-design/stubs/SKILL.md` — its own linked context, see
  `CONTEXT-MAP.md`) for how the graded artifact is shaped. If it is not installed yet, say so
  rather than improvising the assessment design here.

## Out of scope

This router — and every tool it routes to — never writes nilai akhir. That record lives in
SEVIMA SIAKAD, a separate system this harness deliberately does not touch (`rise-ops` ADR
0001). `rise-ops tugas grade` is the one score this harness does write, and it is a
RISE-native task score, not nilai akhir — do not conflate the two.

## Real slot

Do not restate slot numbers here; they drift. The course's real slot lives at
`~/.agent-tools/rps-deck/CONTEXT.md` — read it, not this file, for BI/WAD/SDLC's actual
start times and minutes.
