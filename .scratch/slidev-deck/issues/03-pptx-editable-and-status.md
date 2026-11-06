# 03 — Editable Slides.pptx, and status recognises the Deck

**What to build:** `build` also exports `Slides.pptx` with `pptx-editable`. If that export
fails, `build` warns and still exits 0 as long as the PDF landed. `status` reports
`slides: yes` when it finds the canonical `Slides.pdf` or `Slides.pptx`.

**Blocked by:** 02

**Status:** done (rise-ops material dry run not run: needs live RISE portal)

- [ ] The PPTX opens with editable text and carries presenter notes (manual check on the fixture)
- [ ] A forced PPTX failure produces a warning, exit 0, and the PDF present
- [ ] There is a `status` test for a pptx-only sesi, and the existing status tests stay green
- [ ] `orch run deck-build` verify passes on the fixture sesi
- [ ] `rise-ops material` dry run accepts the new PDF
