# Slidev — how `build` renders the Deck (ADR 0009)

`build` on an approved naskah writes `<course> - Sesi NN - Slides.md` (Slidev source, never
hand-edited), then exports `Slides.pdf` (required) and `Slides.pptx` (`pptx-editable`, warns
on failure) next to it.

## Workspace

`~/.agent-tools/rps-deck/slidev/` is a pinned npm workspace (`@slidev/cli` 53.0.0,
`playwright-chromium`) holding the `theme-cakrawala` theme. `deck.mjs` has no npm dependency;
it spawns `slidev/node_modules/.bin/slidev`. Install once:

    cd ~/.agent-tools/rps-deck/slidev && npm install && npx playwright-chromium install chromium

Missing workspace or Chromium: `build` exits non-zero and prints that command. Override the
location with `RPS_DECK_SLIDEV_DIR` (the tests use a stub workspace this way).

## Does a theme resolve for an entry file outside the workspace? Yes.

Tested 2026-10-26 with Slidev 53.0.0: an entry in a temp dir with
`theme: /abs/path/to/slidev/theme-cakrawala` exports fine as long as the `slidev` binary is run
with the workspace as cwd (it resolves its own packages from there). So `build` writes
`Slides.md` beside the naskah, emits the absolute theme path in the headmatter, and no
temp-dir copy is needed. Consequence: `Slides.md` carries this machine's absolute path, so it
is deterministic per machine, not across machines.

## Mapping

| Naskah | Slidev |
|---|---|
| KONTEN | slide body, byte for byte; a `## title` is prepended unless KONTEN opens with `#` |
| NOTES (+ `[min · clock]` stamp) | trailing `<!-- -->` presenter note |
| HOLD | `class: hold` (amber bar + "TAHAN DI LAYAR" chip) |
| UNIT (when it changes) | a `layout: section` divider slide before it |
| VISUAL | not rendered |

Page count of the PDF = naskah slides + UNIT dividers.

## Known noise

The export logs a harmless `Failed to patch FloatingVue` console error; ignore it.

## Smoke test (2026-10-26)

Fixture naskah with 3 slides, 2 UNITs, 1 HOLD, 1 Mermaid block: `pdfinfo` reported 5 pages (3 + 2 dividers); navy/teal palette, amber HOLD chip and section dividers all render; first-slide divider does not leak its layout into later slides.
