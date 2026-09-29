# The visual deck — the actual projectable artifact

Four different files get called "the deck". Only one is what "slides" or "pdf" means
(user correction 2026-09-18, BI Sesi 04: *"It not same with existing. Check Sesi 03 -
Slides.html"*):

| Artifact | Produced by | Role |
| :---- | :---- | :---- |
| `Sesi NN - Naskah.md` | you, by hand | source of truth; reviewed then `approve`d |
| `Sesi NN - Materi.md` | `deck.mjs render` | student handout; gitignored |
| `sesiNN-deck-pengampu.html` / `-mahasiswa.html` | `deck.mjs build` | plain render — **an intermediate, not the deliverable** |
| **`Sesi NN - Slides.html` + `Sesi NN - Slides.pdf`** | hand-built visual deck (course CSS/JS, one `<section class="slide">` per slide) | **the projectable deck; this is what "slides"/"pdf" means** |

`build` passing proves the naskah was released — it does **not** mean the slide
deliverable exists. When asked for "final slide html and pdf": (1) check for
`Sesi NN - Slides.html`; (2) if absent, build it from the naskah's `§8` using the course's
previous visual deck as the CSS/JS template (see `sdlc-sesi03-04-parallel-visual-build.md`
for a fan-out recipe when two sessions need it the same night); (3) probe with
`scripts/probe-visual-deck.py`; (4) print per `print-sesi-slides-batch.md`. Printing
`sesiNN-deck-*.html` to PDF substitutes for none of those steps.

## Build order, once the naskah is approved

1. Hand-build `Sesi NN - Slides.html` from the approved naskah (single-file, one CSS/JS
   family reused across the course, inline SVG per `VISUAL`, `VEIL` chips with
   covered/revealed states, a notes toggle, arrow/space/Home/End nav, `@media print` one
   page per `.slide`). One `notes` block per slide, hidden from students.
2. Probe before handoff:
   ```sh
   python3 scripts/probe-visual-deck.py "Sesi NN - Slides.html" ["Sesi NN - Naskah.md"]
   ```
   Checks sequential slide ids, `notes` count = slide count, `@media print`, leftover
   `TODO`/`FLAG`, employer identifiers, and the leak a plain grep on the raw file cannot
   see: **instructor-only wording sitting in visible text**. It strips `.notes` and the
   hidden `#contohContent` box before searching for `proyeksikan` / `instruktur` /
   `berkeliling` / `jangan di awal` — a real build shipped `instruktur` visible on two
   slides until it was probed. Never hand off an un-probed visual deck, and never trust a
   delegated build's "done" report without running the probe yourself.
3. Print via Playwright (`pathToFileURL`, 1280×720, margin 0, `printBackground:true`) — see
   `print-sesi-slides-batch.md`. Verify `pdfinfo` pages = slides + 1 and file size is in the
   1–2 MB range a real deck lands in.
4. After any CSS or content patch, re-print — the PDF never updates itself.

## Editing after release stales the visual deck

`Sesi NN - Slides.html` comes from a separate hand-build step that reads `§8`, so a naskah
edit that changes slide text leaves the visual deck — and every PDF derived from it — behind.
Patch or regenerate the affected slide's HTML, then re-print `Sesi NN - Slides.pdf`. The
naskah edit is not finished until the HTML and PDF both reflect it.

## Escaping and `file://` handling (WAD Sesi 05)

Titles containing `{{ }}` (Vue interpolation), backticks, or em-dashes break naïve HTML
generation — `html.escape(title)` before writing `<h2>`, and wrap a backtick-bearing title in
`<code>` after escaping. Keep the `<h2>` text verbatim (the probe compares it to the naskah
title after stripping tags) — simplifying it trips a `title drift` warning even though the
deck is still structurally clean. A placeholder deck (generic "Konten slide N" bodies) passes
`probe`'s structure checks but is not a verbatim deliverable; rebuild from the naskah before
class. When a `file://` link is sent back, verify the path resolves and report the URL
verbatim — that is the deck currently in focus.

## Other artifacts once a deck exists — optional, not part of the six steps

Offer these once a naskah is approved; do not fold them into authoring:

- `session-demo-scripts.md` — a runnable script (e.g. DuckDB) that demonstrates a slide's
  claim instead of just asserting it.
- `excalidraw-session-diagrams.md` + `templates/excalidraw-scene-generator.py` — a framed
  Excalidraw scene presenting the session's architecture, reusing the deck's own table names.
