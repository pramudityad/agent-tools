---
name: rps-deck
description: >
  MUST USE when the user wants slides, a deck, a naskah or materi built for a university
  session that has an RPS contract — the pipeline that reads the RPS row, refits the plan
  to the real slot, sanitises what the session projects, authors a reviewable naskah, and
  builds separate instructor and student decks. Triggered by phrases such as buat slide
  sesi N, bikin deck untuk sesi, naskah pengampu, materi mahasiswa, or a request to prepare
  teaching material from a Week NN session note. Also use to re-render after editing a
  naskah, to approve one, to sanitise an artifact a session projects, or to build the
  standalone lecturer-introduction deck (`00 Intro Dosen`).
  NOT for: writing the RPS itself, grading, or lesson design from scratch — this builds from
  an existing session note plus an approved RPS contract.
---

# rps-deck

Toolkit at `~/.agent-tools/rps-deck/`. Read its `CONTEXT.md` before using the vocabulary —
**RPS contract**, **slot**, **cut ledger**, **naskah**, **materi**, **DUR**, **residual
scan** — and respect the ADRs in `docs/adr/`.

`node ~/.agent-tools/rps-deck/deck.mjs --help` lists the commands.

**Read the course's own `CONTEXT.md` first** (e.g. `02-Projects/Cakrawala/CONTEXT.md`). The
toolkit is course-agnostic on purpose; per-course facts — real slot lengths, how weeks map
to sessions, the sanitisation names in use — live there, not here.

**Not a deck?** Course-level graded artifacts — UTS/UAS briefs, DoD checklists, rubrics, the
RISE Tugas text — are a different class of work; see the `course-assessment-design` skill.

## Which artifact "the deck" means

Three different files get called "the deck". Only one is what "slides" or "pdf" means:
`Sesi NN - Naskah.md` (source, hand-authored), `Sesi NN - Materi.md` (student handout, from
`render`), and **`<course> - Sesi NN - Slides.md` + `.pdf` + `.pptx`** (the Slidev Deck, the only
files `build` emits, ADR 0009). `build` refuses unless the naskah is approved with no open
FLAG, so a Slides file existing means the naskah was released. Build/probe/print recipe and
what stales the deck after a naskah edit: `references/visual-deck.md` (legacy, pre-ADR 0009).
How `build` drives Slidev (workspace, install, theme resolution): `references/slidev.md`. Distinguishing
what belongs in a student zip vs. an internal instructor file:
`references/artifact-classification.md`.

A fifth variant exists: a deck exported through the **ppt-master** SVG→PPTX pipeline
(native PPTX with editable charts/tables + PDF preview). Its runner, export gate, native
chart/table parity rules, and LibreOffice-render pitfalls:
`references/ppt-master-pptx-deck.md`.

## The six steps

Each ends on a checkable criterion. Do not move on before it holds.

### 1. Read the contract

```sh
deck.mjs session <n> <rps.md>
```

Prints the session row and rubric, and reports the line numbers of **Bobot Penilaian**,
**Ketentuan Penilaian** and **Pustaka** — read those three yourself; they are prose, not
fields. `session` parses Markdown tables only; if the approved contract is a `.docx` and
`session` reports "not found", check for a Markdown mirror and sync its row first.

*Done when:* you can state the session's bobot, sub-CPMK, penilaian, metode and Materi
topics without looking again.

### 2. Reconcile

Read the session note in full alongside the contract. List every conflict with a ruling.

The RPS contract wins by default. Where it is **impossible** — an instruction that cannot be
carried out in the real slot — the deck states the workable version and the deviation is
appended to `<course>/RPS Defects.md`. Where it is **silent** on a fact a slide needs, ask;
do not infer.

Watch for the **reverse** gap too: where the RPS mandates materi the week note omits, add
it to the deck, log the omission in the register, and name in the Aksi where any deferred
remainder lands (typically the next session's opener). A **whole-topic swap** (the note
teaches something the RPS row doesn't mandate for this session at all, not just a drifted
sub-topic) is a blocking decision, not a cut ledger entry — log it and get an explicit
reorder-vs-revise ruling before authoring.

*Done when:* every conflict has a ruling and any deviation is in the register.

### 3. Sanitise — only if the note names an artifact

Read the artifact **in full** — `SANITISE.md` explains why a grep is not enough. Propose a
rename map, choose the sections worth showing, then:

```sh
deck.mjs sanitise <src> <map.json> <dst> --section "Problem Statement"
deck.mjs scan     <dst> <map.json>
```

A session naming more than one artifact needs one map per artifact — do not reuse a single
map across unrelated sources. Map-key/case pitfalls, the self-mention trap, and what "personal
(non-employer)" still requires: `references/sanitise-mechanics.md`.

*Done when:* the scan exits clean. Tell the user plainly that renaming does not hide
structure, and let them make the disclosure call.

### 4. Author the naskah

Write `Sesi NN - Naskah.md` in the grammar in `FORMAT.md`. Give every slide a `**DUR**`,
then let the tool own the clock:

```sh
deck.mjs restamp "Sesi NN - Naskah.md"    # Σ DUR must equal the slot
deck.mjs check   "Sesi NN - Naskah.md"
```

The refit itself is judgement: which segment loses minutes depends on the note's instructor
notes, and those protect things the arithmetic cannot see. Record the cuts as prose in the
naskah, with each dropped segment naming where it went. When a slot must be compressed,
take it from lab/gallery time before ever touching the break.

The mandate applies to a teaching deck; a note whose slide outline says *logistics only*
locks to its declared count via `deck-type: logistics`. Include a `DO NOT INVENT` section
listing every hard number that appears on a slide.

When the draft is done, load the `humanizer` skill and run its pass on the naskah prose
(KONTEN, NOTES, delivery script) before `restamp`/`check`; what it may and may not touch:
`references/humanize-naskah.md`.
Teaching-craft rules to author against (retrieval opener, I do / We do before a lab, hinge
question + decision rule, exit ticket, one idea per slide): `references/pedagogy-checklist.md`.
Field-tested authoring aids: the delayed-example pattern for any lab that ends in a `HOLD`
(`references/lab-example-pattern.md`), a one-line first-use gloss for dense English terms
(`references/student-friendly-glossa-2026-09-17.md`), and a pengampu-only delivery section
some naskah carry beyond the slide content — key sentences and a demo fallback, never handed
to a slide-generation step (`references/instructor-delivery-script.md`). `check` failures
this list and `FORMAT.md` don't already explain: `references/parser-gotchas.md`.

*Done when:* `check` passes.

### 5. Render and review

```sh
deck.mjs render "Sesi NN - Naskah.md"
```

Hand the user **both** files — the naskah they author and the materi students receive. This
is the review gate; stop here until they respond. Do not call `approve` or `build`, and do
not hand-build `Sesi NN - Slides.md/.pdf/.pptx`, until the user explicitly says to proceed for
that sesi — "prepare" or a draft request alone is not approval.

*Done when:* the user has reviewed both and explicitly said to proceed.

### 6. Approve and build

```sh
deck.mjs approve "Sesi NN - Naskah.md"
deck.mjs build "Sesi NN - Naskah.md"
```

`build` refuses outright — no file written — on an open `FLAG` or a stale approval hash
(ADR 0007). `--final` is still accepted, as a harmless no-op; it is not required and changes
nothing. Publish the **materi** only; open the naskah as a local file, so no instructor URL
exists to be mis-pasted.

Approval is also the trigger to produce the actual projectable deck —
`Sesi NN - Slides.md` + `.pdf` — if it doesn't exist yet or the naskah changed since it was
last built. Build order, the probe step, and the print recipe:
`references/visual-deck.md`.

## Checking course state

```sh
deck.mjs status "<course-dir>"
```

Read-only, exits 0 always. One row per sesi number found in the directory (from any
`Sesi NN - <topic>.md` file, keyed by that number — no guessing which pertemuan it maps to):
naskah `missing | draft | approved | stale` (stale reuses the same approval-hash check as
`build`), whether Slides and Materi were built. A final line names the lowest-numbered sesi
with no approved naskah, so you know what to author next without reading the whole table.

Run this before starting the six steps below on an unfamiliar course, and again after
`approve`/`build` to confirm the state changed.

## Intro deck (`00 Intro Dosen`) — separate artifact

A standalone lecturer-introduction deck is its own artifact, hand-built from scratch outside
the six steps above, and is not a `Sesi NN` deck — no RPS row governs it. Content shape,
where its facts come from, and the print recipe: `references/intro-deck.md`.

## Field-tested course lessons (Cakrawala)

Concrete, previously-hit pitfalls worth reading before repeating them, one topic per file:

- Slot refits: `bi-sesi02-dual-artifact-105min-refit.md`, `bi-sesi04-diagnostic-queries-and-batch-note.md`,
  `bi-sesi05-105min-and-visual-deck-pitfalls.md`, `sdlc-double-sesi-180min.md`,
  `sdlc-sesi04-genap-slot-and-claims-register.md`, `wad-sesi01-120min-pitfalls.md`,
  `wad-sesi02-missing-week.md`, `wad-sesi05-vue-and-visual-deck.md`.
- Multi-course/multi-sesi fan-out: `parallel-3-course-sesi03.md`,
  `sdlc-sesi03-04-parallel-visual-build.md`.
- Vault-wide renumbering history: `cakrawala-week-to-sesi-rename-2026-09-15.md`.
- Kontrak Kuliah (the per-course syllabus-style contract document, not the RPS):
  `kontrak-kuliah-template.md`, `kontrak-kuliah-value-edit.md`.
- Bichronous/mostly-async delivery and the discipline clauses that come with it:
  `online-bichronous-90pct.md`, `tata-tertib-per-course.md`.
- The berita acara §7 table `rise-ops` reads verbatim: `naskah-section7-and-rise-records.md`.
- A star-schema lab producing a paste-ready DBML diagram: `star-schema-dbdiagram.md`.
- Batch-printing several sessions' visual decks in one pass: `print-sesi-slides-batch.md`.

## Standing rules

- Generated HTML and `Materi.md` are gitignored; the naskah, sanitised artifacts, maps and
  the defect register are committed.
- Never put a number on a slide that nobody has measured. Use `TODO` plus a slide-level
  `FLAG`, and let `build` refuse rather than guessing.
- A `Sesi NN - Research.md` may exist and is useful when a session has no week note. Nothing
  generates or validates it — see ADR 0005 for why.

## Slot truth (ADR 0008)

`check` now also refuses a naskah whose `slot-start`/`slot-minutes` disagree with the real
slot table in `slots.json` (keyed by the naskah's `course` frontmatter). A course absent
from that table fails outright — "ask the lecturer for the real slot" — rather than passing
unchecked. SDLC has two starts per night (odd sesi 18:30, even sesi 20:00, both 90 min),
picked by the naskah's `session` field parity; a naskah with no numeric `session` field
fails asking for one instead of guessing. This is in addition to, not instead of, the
existing Σ DUR = slot-minutes check — this one validates that slot-minutes itself is real.

## Verbatim sub-CPMK (ticket 10) — built, not yet wired into `check`

`checkVerbatimSubCpmk(quoted, official)` compares a naskah's quoted sub-CPMK against the
RPS row's `subCpmk` text, whitespace-normalised (collapsed and trimmed, so a line-wrapped
quote still matches a single-line one) — punctuation is not normalised, so a dropped
trailing period is a real mismatch, not a false positive. It is a pure function, tested
directly; `check <naskah.md>` does not call it yet, because `check` only ever receives a
naskah path, never an RPS path, at the same call — there is no session/course-aware lookup
today that hands it both. There is also no one fixed place a naskah's sub-CPMK quote lives
(no `sub-cpmk:` frontmatter key, no marked section) — it appears as free prose, worded
differently per course, so nothing safe to grep automatically. Run `checkVerbatimSubCpmk`
by hand against a naskah's quoted sentence and the RPS row's `parseRps(...).row.subCpmk`
until a real call site hands `check` both paths at once.
