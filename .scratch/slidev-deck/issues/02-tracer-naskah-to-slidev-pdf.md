# 02 — Tracer: approved naskah → Slidev Deck → Slides.pdf

**What to build:** Running `build` on an approved naskah writes
`<course> - Sesi NN - Slides.md`, a Slidev source, and exports `Slides.pdf` next to the
naskah, using a pinned Slidev workspace that rps-deck owns. KONTEN passes through unchanged
as Slidev markdown. NOTES, including the clock stamp, become presenter notes. HOLD becomes
`class: hold`. UNIT emits a section-divider slide. The deck uses the Cakrawala palette. If the
workspace or Chromium is missing, `build` fails loudly and names the install command. The
gate is unchanged. The old HTML renderer can stay in the code until ticket 04, but `build` no
longer calls it.

**Blocked by:** 01

**Status:** done

- [ ] Emitter tests are written first and pass: KONTEN byte-identical, NOTES only in the trailing comment, HOLD mapped, UNIT divider emitted, deterministic output, slide count = naskah slides + UNIT dividers
- [ ] Existing gate tests still pass (FLAG, unapproved, stale, `--final` no-op)
- [ ] A missing workspace or Chromium gives a non-zero exit and a message containing the fix command
- [ ] Answered and recorded in the Slidev reference: does a theme resolve for an entry file outside the workspace, and which approach `build` uses as a result
- [ ] Smoke test on a fixture naskah: `pdfinfo` page count = slide count, and the palette is visibly Cakrawala
- [ ] `deck.mjs` still has zero npm dependencies
