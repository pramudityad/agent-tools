# 0009 — Slidev renders the deck; KONTEN is Slidev markdown

**Status:** accepted · 2026-10-26

**Supersedes:** the marker-vocabulary clause of ADR 0001, the rendering clause of ADR 0006,
and the HTML/PDF emit of ADR 0007. 0007's single approval gate stands unchanged.

## Context

Since Sesi 09, three deck pipelines have been running side by side:

- **`build`'s own renderer.** About 900 lines of string-built HTML, CSS and 18 hand-drawn SVG
  diagrams, printed to PDF by a headless Chrome.
- **ppt-master.** An untracked clone of an upstream Python tool, with its own venv and an
  OpenAI key. It was used for every deck from Sesi 09 on, because each naskah's
  Slide Generation Prompt asked for native PPTX tables and layouts, which `build` cannot
  produce. For each sesi an agent hand-wrote a `gen_slides.py`, so the deck stopped being
  derived from the naskah and ADR 0001 was broken in practice. Its workspaces ended up in
  four places, and its decks were copied into the vault by hand under six different names.
  `status` reported `slides: no` for decks that did exist.
- **Hand-built `Slides.html`.** Printed with a Playwright install borrowed from an
  unrelated repo.

The only record of why ppt-master replaced `build` was a "ruling" line inside WAD naskah 09–11.

## Decision

**Slidev is the only deck renderer.** `build` keeps its gate: no open FLAG, and the approval
hash must match. Once the gate passes it:

1. writes `<course> - Sesi NN - Slides.md`, a Slidev source derived deterministically from
   the naskah and never hand-edited;
2. exports it to `Slides.pdf`, which is required and is what goes to RISE;
3. exports it to `Slides.pptx` with `--format pptx-editable`. If this export fails, `build`
   only warns.

**KONTEN is Slidev markdown, passed through unchanged.** The marker vocabulary (`LEAD:`,
`SPLIT`/`PANEL`, `NUM`, `STRUCK:`…), `renderKonten` and the hand-drawn `DIAGRAMS` are
retired. Diagrams are written in Mermaid or included as ordinary images. The naskah
fields stay, mapped as follows:

| Naskah field | What it becomes |
|---|---|
| `NOTES` | trailing presenter-note comment |
| `HOLD` | `class: hold` |
| `UNIT` | a section-divider slide |
| `VISUAL` | nothing; optional authoring guidance, not rendered |

`DUR`, restamp, check, approve and Materi still read the naskah, so ADR 0001's single
source of truth holds.

**One pinned Slidev workspace lives inside this tool.** `deck.mjs` stays zero-dependency
and shells out to that workspace. If the workspace is not installed or Chromium is missing,
`build` fails loudly and prints the command that fixes it. It never just warns.

## Consequences

- The ppt-master clone and its stray workspaces are deleted once every deliverable is
  confirmed in the vault.
- Naskah for Sesi 01–14 are delivered and are not migrated. With marker validation gone,
  `check` still passes on them.
- `pptx-editable` keeps text and tables native. SVG, Mermaid and gradients stay as pictures
  in the PPTX; the PDF is unaffected.
- `status` counts a sesi's slides as present when it finds `Slides.pdf` or `Slides.pptx`
  under the one canonical name.
