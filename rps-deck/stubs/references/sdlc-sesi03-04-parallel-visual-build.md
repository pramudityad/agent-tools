# SDLC Sesi 03+04 parallel visual build — 2026-09-17

Same-meet, same-course parallel: Meet 2 = Sesi 3 (18:30–20:00, 90) + Sesi 4 (20:00–21:30, 90). Both naskah already `approved` and `build --final` clean, but final visual `Sesi NN - Slides.html/.pdf` still missing — `build --final` only guarantees `sesiNN-deck-pengampu/mahasiswa.html` (plain render), not the hand-built projectable deck.

## Detection
```sh
ls -lh "Sesi 03 - Slides.html" "Sesi 04 - Slides.html"  # missing
node ~/.agent-tools/rps-deck/deck.mjs check "Sesi 03 - Naskah.md"  # 21 slides ok
node ~/.agent-tools/rps-deck/deck.mjs check "Sesi 04 - Naskah.md"  # 22 slides ok
node ~/.agent-tools/rps-deck/deck.mjs build --final "Sesi NN - Naskah.md"  # passes but no Slides.html
```
If `check` + `build --final` pass yet `Sesi NN - Slides.html` absent, the visual step was never run.

## Fan-out pattern (intra-course, 2 sesi)
- Prior multi-course fan-out is BI+WAD+SDLC for a bare "sesi 03" (see `parallel-3-course-sesi03.md`).
- Intra-course variant: SDLC Meet 2 fans out Sesi 3 + Sesi 4 in parallel via `delegate_task` (2 children), each reads its own §8 manifest and `Sesi 02 - Slides.html` as CSS/JS template (navy #0f2a44 / teal #0e6e6e).
- Each child: (1) write `Sesi NN - Slides.html` single-file from manifest verbatim, (2) probe with HTMLParser (ids `s1..sN` sequential, `notes` count = slides, HOLD count, no TODO/FLAG, `@media print` present), (3) print via Playwright from `~/Code/Project/career-ops` (`pathToFileURL`, 1280×720, margin 0, `printBackground:true`), verify `pdfinfo` pages = slides+1 and `ls -lh` ~1–2 MB.

## Validated 2026-09-17
- Sesi 03: 21 slides, HOLD s17/s20/s21, 47K HTML → 1.6 MB PDF, 22 pages (21+1).
- Sesi 04: 22 slides, HOLD s18/s19/s22, 53K HTML → 1.5 MB PDF, 23 pages (22+1).
- CSS/JS copied from `Sesi 02 - Slides.html` works for both ganjil (18:30) and genap (20:00) slots; no drift. Probe + pdfinfo both pass first try when kicker `[min NNN · HH:MM]` comes straight from NOTES.

## Pitfall
- Don't conflate `sesi03-deck-mahasiswa.html` (plain `deck.mjs render` output) with `Sesi 03 - Slides.html` (hand-built projectable). The former existing does not mean the latter exists.
- **A child agent's "success" is a self-report.** BI Sesi 04's child returned `sections: 21, notes_divs: 21, visible_flag_or_todo: 0` and was still wrong: `instruktur` sat in visible text on s2 and s19. Put the constraint in the child's brief (instructor-facing wording belongs in `.notes` or the hidden `#contohContent` box) **and** run `scripts/probe-visual-deck.py` yourself — it strips notes and the Contoh box before searching, which a grep cannot do.
- After any CSS patch, re-print PDF — PDF never updates itself. That holds for naskah-driven edits too: changing slide `KONTEN` (not just the HTML) makes this deck stale, so the edit is unfinished until the HTML for that slide and all derived PDFs are regenerated.
