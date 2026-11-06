# 04 — Delete the old renderer and the marker vocabulary

**What to build:** rps-deck has one way to render: Slidev. Remove the HTML/CSS/NAV renderer,
`renderKonten`, the marker checks in `validate`, the hand-drawn diagram table and the
headless-Chrome printer, along with the tests that only exercise them. FORMAT.md and the
skill describe KONTEN as Slidev markdown. The README's test count is corrected. Naskah for
Sesi 01–14 still pass `check`.

**Blocked by:** 02

**Status:** done

- [ ] Running `check` on every existing naskah in the BI, WAD and SDLC course dirs gives the same pass/fail as before, apart from failures that existed only because of markers
- [ ] `render` (Materi) output for an existing naskah is byte-identical before and after
- [ ] `deck.mjs` shrinks by roughly the size of the renderer, and no dead exports remain
- [ ] FORMAT.md, SKILL.md and README describe only the Slidev path
- [ ] `node test.mjs` passes
