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
- **Nilai / grading** — "grade tugas", "rekap nilai", "nilai UTS/UAS", drafting the ledger or
  running the final recap: read the **Grading flow** section of
  `~/.agent-tools/rise-ops/stubs/SKILL.md` (fetch → draft ledger → lecturer approves → post
  → `rise-ops recap`, ADR 0007). RISE is the score of record; the SEVIMA entry is typed by
  hand; nilai akhir itself stays out of scope (see Out of scope below).

## Out of scope

This router — and every tool it routes to — never writes nilai akhir. That record lives in
SEVIMA SIAKAD, a separate system this harness deliberately does not touch (`rise-ops` ADR
0001). `rise-ops tugas grade` is the one score this harness does write, and it is a
RISE-native task score, not nilai akhir — do not conflate the two.

## Real slot

Do not restate slot numbers here; they drift. The course's real slot lives at
`~/.agent-tools/rps-deck/CONTEXT.md` — read it, not this file, for BI/WAD/SDLC's actual
start times and minutes.

## naskah-review (before approve)

A checker prompt, not a formality: **not finding problems is your failure.** If you run
this section and come back with nothing, you did not look hard enough — hunt actively for
each of the four things below, do not passively skim the naskah once and call it clean.

This is the judgement pass. It runs *after* `rps-deck check` (slot-truth ticket 09,
verbatim sub-CPMK ticket 10, DUR-sum-equals-slot) — never instead of it. `check` is
mechanical and catches what a string comparison can catch; naskah-review exists for
everything a mechanical check cannot see. Run `check` first; only run this against a
naskah that already passes it.

For the naskah under review, check:

- **Topic vs sesi-order drift** — does the naskah's `topic` frontmatter match its RPS
  contract row for that `session` number? For WAD specifically (known drift since Sesi 3),
  does the pertemuan / session-note title actually agree with what the naskah claims to
  teach, or has the sesi numbering and the calendar week drifted apart?
- **Pedagogy for the slot** — does the lesson shape actually fit the real slot from
  `rps-deck/slots.json`, not just sum to it? A 105-minute slot cannot hold, say, a
  45-minute uninterrupted lecture block plus a 60-minute lab with no break — DUR summing
  to the right total does not mean the *shape* is teachable. Read §6/§7 (or their
  equivalent) and ask: is there a break, is any single block longer than the room can sit
  through, does the interaction pattern actually change often enough for a Kelas
  Profesional coming straight from work?
- **Assessment numbers vs the approved RPS** — do the weights/rubric numbers quoted in the
  naskah (UAS/UTS/Tugas/Kehadiran split, CPMK weight, rubric scale) match the *approved*
  RPS contract, not a draft, a proposed revision, or an old revision sitting next to it in
  the course folder? A course directory often holds more than one RPS-shaped file; confirm
  which one is actually approved before trusting its numbers.
- **Sanitisation calls `scan` can't see** — judgement-level renames or references that
  `rps-deck scan`'s residual scan wouldn't catch mechanically, because they're not a
  literal string in the rename map: a real client or product named in a way that doesn't
  match any mapped term (a nickname, a plural, a translated form), a detail specific enough
  to re-identify the source even with names swapped, or a reference to an internal system
  by its function rather than its name.
- **Teaching craft** — does the lesson *teach*, not just fit the slot? Run the RED/AMBER
  list in `~/.claude/skills/rps-deck/references/pedagogy-checklist.md`: retrieval opener,
  I do / We do before each lab, a hinge question with a decision rule, CFU cadence and an
  exit ticket, one idea per slide. Fix by reshaping existing DUR minutes, never by adding
  slides past the mandate.
- **AI-prose tells** — the naskah should have had the `humanizer` pass
  (`~/.claude/skills/rps-deck/references/humanize-naskah.md`). Skim NOTES/LEAD for not-X-but-Y, one-line
  closers, forced triads and dash-everywhere; report as AMBER, never RED.

**Output shape** — two lists, nothing softer:

- **RED** — blocks `approve`. Anything in the checks above that is actually wrong,
  not just debatable.
- **AMBER** — advisory. Worth the lecturer's attention, does not block.

**Rework cap** — at most two rework rounds. If a naskah is still RED after two rounds of
fixes, stop and hand it back to the lecturer rather than iterating a third time.

**Approval stays manual.** `rps-deck approve` is always run by the lecturer, never by the
agent that ran this review — no agent approves its own naskah, and no agent approves
another agent's either.
