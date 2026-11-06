# Spec — One deck pipeline: Slidev

**Status:** ready-for-agent · 2026-10-26 · decisions: `rps-deck/docs/adr/0009-slidev-renders-the-deck.md`

## Problem Statement

As the pengampu, I have three ways to turn an approved naskah into a deck and none of them is
the true one:

- **`rps-deck build`'s HTML renderer.** It can't produce the native tables the naskah's
  Slide Generation Prompt asks for.
- **ppt-master.** An agent hand-writes a generator script for every sesi, so the deck is no
  longer derived from the naskah I approved. Its workspaces are scattered across the vault,
  and decks land under six different names.
- **Hand-built HTML.** Printed with a Playwright install borrowed from another repo.

As a result, `status` tells me "slides: no" for decks that exist. I can't tell which file is
the real deck. Each new sesi re-litigates how the deck gets built.

## Solution

One path: approved naskah → `build` → Deck. `build` turns the naskah into a Slidev source,
`<course> - Sesi NN - Slides.md`, and exports it to `Slides.pdf` and an editable
`Slides.pptx` next to the naskah.

New naskah write each slide's KONTEN directly in Slidev markdown. Mermaid handles diagrams
and ordinary images cover the rest. The old renderer, its marker vocabulary, ppt-master and
every stray workspace are removed.

## User Stories

1. As the pengampu, I want `build` on an approved naskah to produce the Deck in one command, so that I never pick a pipeline per sesi.
2. As the pengampu, I want `build` to refuse an unapproved, stale or FLAG-open naskah exactly as today, so that only reviewed content is ever projected.
3. As the pengampu, I want the Deck's slide text to be exactly my KONTEN, so that what I approved is what students see.
4. As the pengampu, I want NOTES to appear as Slidev presenter notes and never on the slide, so that my delivery script stays private.
5. As the pengampu, I want each slide's `[min · clock]` stamp in its presenter notes, so that I can pace the slot from the presenter view.
6. As the pengampu, I want a HOLD slide visibly marked, so that I know the screen stays there during a work block.
7. As the pengampu, I want each UNIT to open with a section-divider slide, so that the deck's structure matches the naskah's.
8. As the pengampu, I want to draw diagrams in Mermaid inside KONTEN, so that I stop depending on a fixed set of hand-drawn SVGs.
9. As the pengampu, I want images in KONTEN as ordinary markdown, so that Excalidraw exports drop straight in.
10. As the pengampu, I want a `Slides.pdf` under the canonical name, so that `rise-ops material` uploads it without renaming.
11. As the pengampu, I want an editable `Slides.pptx` too, so that I can make a last-minute tweak or share the deck as PowerPoint.
12. As the pengampu, I want a failed PPTX export to warn without failing the build, so that the PDF that matters still lands.
13. As the pengampu, I want `build` to fail loudly with the fix command when the Slidev workspace or Chromium is missing, so that I never get a silent no-PDF build.
14. As the pengampu, I want the Deck in the same landscape palette as today's decks, so that students see a consistent course look.
15. As the pengampu, I want `build` to produce byte-identical `Slides.md` from the same naskah, so that a rebuild never introduces drift.
16. As the pengampu, I want `status` to count a sesi as having slides when the canonical `Slides.pdf` or `Slides.pptx` exists, so that the course overview is true.
17. As the pengampu, I want naskah for Sesi 01–14 to still pass `check`, so that delivered sesi don't turn red.
18. As the pengampu, I want Materi generation unchanged, so that students keep the same handout.
19. As the pengampu, I want the ppt-master clone and its scattered workspaces gone once their decks are confirmed in the vault, so that nothing suggests a second pipeline.
20. As an agent authoring a naskah, I want FORMAT.md and the skill to describe KONTEN as Slidev markdown, so that I write the new syntax and not retired markers.
21. As an agent, I want every rps-deck reference reachable through the skill's symlink, so that the router's naskah-review can actually read the pedagogy checklist.
22. As the `orch deck-build` recipe, I want `build --final` to keep working, so that the recipe and its verify step need no change.
23. As an agent writing for students, I want a SOUL.md that sets the teaching character and the Anda register, so that every naskah, Deck, Materi and Tugas text sounds like the same pengampu.

## Implementation Decisions

- **Slidev emitter.** A pure transform inside `deck.mjs`, from the parsed naskah to the Slidev source string.
  - Headmatter carries the course theme and title.
  - Each naskah slide becomes one Slidev slide. KONTEN passes through unchanged. NOTES become the trailing HTML-comment presenter notes, with the stamp included. HOLD becomes `class: hold`.
  - Each UNIT start emits a section-divider slide.
  - VISUAL is not rendered.
  - Deterministic: no timestamps, no ordering that depends on the environment.
- **Slidev workspace.** A pinned workspace owned by rps-deck: `@slidev/cli` plus `playwright-chromium` and a local Cakrawala theme ported from today's palette. `deck.mjs` gains no npm dependency; it only spawns the workspace's Slidev binary.
  - Open fact: whether Slidev resolves a theme for an entry file outside the workspace. If it does not, `build` writes the entry into a workspace temp dir and copies the outputs back.
- **`build`.**
  - **Unchanged:** the gate.
  - **Replaced:** emitting Slidev source, then PDF export (required), then `pptx-editable` export (warn on failure).
  - **Missing tooling:** a non-zero exit naming the install command.
  - **`--final`:** stays a no-op.
- **`status`.** The slides check accepts the canonical `.pdf` or `.pptx`.
- **Retired.**
  - The HTML/CSS/NAV renderer, `renderKonten`, the marker vocabulary in `validate`, the hand-drawn diagram table and the headless-Chrome PDF printer.
  - The rendering tests that exercise them.
  - `render` (Materi) is kept.
- **Docs.**
  - FORMAT.md describes KONTEN as Slidev markdown.
  - The skill and its references drop the ppt-master, hand-built-HTML and Playwright-batch guidance in favour of one Slidev reference.
  - References move under the symlinked `stubs/`.
- **Soul.** A `SOUL.md` in the cakrawala router context, pointed to from the rps-deck author step and from naskah-review.

## Testing Decisions

- **A good test** checks external behaviour: the emitted Slidev source, the files `build` writes, its exit codes. It never checks internal helper calls.
- **Seam 1, the emitter.** It is pure and mirrors today's direct `renderHtml` tests in `test.mjs`. Cases:
  - KONTEN passes through byte for byte
  - NOTES only appear inside the trailing comment
  - HOLD is mapped
  - UNIT dividers are emitted
  - output is identical across runs
  - slide count equals the naskah's slide count, plus one for each UNIT divider
- **Seam 2, `build` as a CLI.** Reuse the existing spawn-based build tests (the gate refusals and output naming). Exports are asserted only when the workspace is installed; otherwise the test checks for the loud failure message.
- `status` is tested with the existing fixture-directory pattern, adding a `.pptx` case.
- **Manual smoke test** on the first real Slidev naskah: PDF page count equals the slide count, the PPTX opens with editable text and notes, and `rise-ops material` passes a dry run.

## Out of Scope

- Migrating naskah for Sesi 01–14.
- A student deck. Materi.md stays the student deliverable (ADR 0007).
- Changes to rise-ops, orch recipes, RPS parsing, sanitise or slot truth.
- The other uncommitted work in `~/.agent-tools` (rise-ops, orch, course-assessment-design) is not touched.

## Further Notes

- Slidev v53 `pptx-editable` keeps SVG, Mermaid and gradients as pictures inside the PPTX. That is accepted.
- Deleting ppt-master and the vault workspaces requires an md5 check that each deliverable is already in the vault, plus the pengampu's explicit confirmation.
