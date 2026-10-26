# The visual deck — the actual projectable artifact

Three different files get called "the deck". Only one is what "slides" or "pdf" means
(user correction 2026-09-18, BI Sesi 04: *"It not same with existing. Check Sesi 03 -
Slides.html"*):

| Artifact | Produced by | Role |
| :---- | :---- | :---- |
| `Sesi NN - Naskah.md` | you, by hand | source of truth; reviewed then `approve`d |
| `Sesi NN - Materi.md` | `deck.mjs render` | student handout; gitignored |
| **`<course> - Sesi NN - Slides.html` + `.pdf`** | `deck.mjs build` (ADR 0007), approved naskah only | **the projectable deck; this is what "slides"/"pdf" means** |

`build` is the only producer of the Slides file and refuses an unapproved naskah (ADR 0007). Older Sesi files were hand-built; the steps below describe that. When asked for "final slide html and pdf": (1) check for
`Sesi NN - Slides.html`; (2) if absent, build it from the naskah's `§8` using the course's
previous visual deck as the CSS/JS template (see `sdlc-sesi03-04-parallel-visual-build.md`
for a fan-out recipe when two sessions need it the same night); (3) probe with
`scripts/probe-visual-deck.py`; (4) print per `print-sesi-slides-batch.md`. 

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

## Text-only deck → add diagrams via the DIAGRAMS library (2026-10-01)

A `build`-generated deck is text-only unless its naskah carries `DIAGRAM <name>` lines:
`deck.mjs` renders those from the fixed hand-drawn SVG library in `DIAGRAMS` (deck.mjs).
A session whose VISUAL directives say "diagram" but whose deck greps 0 `<svg` means the
library lacked entries — extend it (helpers `arrowHead` + `msg` sit next to `figure()`),
insert `DIAGRAM <name>` lines into the naskah KONTEN, then `check → approve → build`.
Done for SDLC Sesi 07: 8 new UML behavior diagrams (activity/sequence/state notation,
guards bad-good, fork-vs-decision, swimlane-handoff, fragments, PurchaseRequest
machine), committed in rps-deck `24bb9fb`. Rules learned:

- **Visual-verify before handoff**: render each new diagram to PNG (playwright
  `figure.screenshot()` from a preview HTML built via `renderKonten`), then eyeball each
  with the vision tool. Structural tests pass diagrams with real collisions; layout
  errors the validator cannot see are the norm, not the exception.
- **`.diagram svg` carries `max-height:320px`** (deck.mjs CSS) — tall diagrams scale
  down instead of spilling slides onto a second PDF page. If a new diagram still pushes
  slide content past one page, shrink the SVG's viewBox aspect or shorten the slide's
  prose; do not raise the cap above ~320px.
- Pages = slides + 2 on Sesi 07 (s2 and the s21 lab slide legitimately overflow) —
  compare page-first-lines against slide order rather than trusting a page count.
- `msg()` labels sit above the arrow line — keep ≥24px vertical gap between successive
  messages, and put self-message loops to the right of the activation bar.
- Playwright for probes/prints resolves from `~/Code/Project/career-ops/node_modules` —
  import it by absolute path (`.../node_modules/playwright/index.mjs`); ESM does not
  resolve `playwright` from scripts living outside that project.

## `deck.mjs build` can emit the Slides pair itself — still probe (2026-09-30)

Observed on SDLC Sesi 07: `approve` + `build` wrote `Software Development Life Cycle -
Sesi 07 - Slides.html` + `.pdf` directly (22 sections / 22 notes, ~640K PDF) — the
hand-build step is not always needed anymore. What `build` does **not** do is strip
instructor-only wording from visible text: a lab slide whose `KONTEN` carries
`Contoh — … (tampilkan setelah 5 menit lab, jangan di awal):` ships that directive
on-screen, and `probe-visual-deck.py` fails with `instructor wording … visible on [sN]`.
Fix before handoff: patch the visible `<p>Contoh — …:</p>` down to `Contoh — …:` (the
delay rule already lives in that slide's `NOTES`), then re-print. The probe path from
SKILL.md (`scripts/probe-visual-deck.py`) resolves under the *skill* dir
(`~/.hermes/skills/teaching/rps-deck/scripts/`), not `~/.agent-tools/rps-deck/`.
Probe LEAD warnings that show `**sa…` fragments are marker-stripping artifacts (naskah
LEAD contains `**bold**`, HTML doesn't) — confirm the plain text is present and ignore.

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
