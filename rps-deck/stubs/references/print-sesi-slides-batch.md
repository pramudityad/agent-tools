# Sesi Slides HTML → PDF — batch print (3 courses)

Validated 2026-09-14: 3× `Sesi 03 - Slides.html` → `.pdf` in one Playwright run.

## When to use

User asks "buat pdf" / "cek ... Slides.html pls create pdf version" for any `Sesi NN - Slides.html` (visual deck, not `deck.mjs` render output). Handles single or multi-course batch. Same engine as intro deck (`references/intro-deck-print-to-pdf.md`) — this file adds the batch pattern and page-count expectations. These files are the projectable deliverable; do not print `sesiNN-deck-pengampu|mahasiswa.html` in their place (see SKILL.md, *Which artifact "final slides" means*).

## Source files (Cakrawala 2026)

- `02-Projects/Cakrawala/Software Development Life Cycle/Sesi 03 - Slides.html` — 21 slides (s1–s21) → 1.7M, 23 pages
- `02-Projects/Cakrawala/Web Application Development/Sesi 03 - Slides.html` — 26 slides (s1–s26) → 1.2M, 27 pages
- `02-Projects/Cakrawala/Business Intelligence Systems/Sesi 03 - Slides.html` — 25 slides (s1–s7, s7b–e, s8–s21) → 1.6M, 26 pages

Slide counts include `s1` with `class="slide on"` — grep must match `section class="slide` not just `class="slide"` (the `on` variant). BI Sesi 03 uses sub-slides `s7b`/`s7c`/`s7d`/`s7e` — count lines, not `sN` numeric max.

## Page-count expectation

`@media print { .slide{display:block!important;min-height:auto;page-break-after:always} }` gives one PDF page per `.slide`. The trailing blank from the last `page-break-after:always` is **not guaranteed**: current Chromium drops it on some decks (BI Sesi 04 hand-built deck: 21 slides → **21** pages, 2026-09-18) while earlier runs kept it (WAD 26→27, BI Sesi 03 25→26). So both `pages = slides` and `slides + 1` are healthy — do not treat the missing blank page as a defect, and verify by content mapping instead of arithmetic:

```sh
pdftotext -layout "Sesi NN - Slides.pdf" - | awk 'BEGIN{RS="\f"} {gsub(/^[ \n]+/,""); split($0,a,"\n"); printf "p%d: %.55s\n", NR, a[1]}'
```

Every page must open with the next slide's kicker/heading. `slides + 2` means one slide overflowed 720px (SDLC 21→23, BI Sesi 02 19→21) — acceptable, but inspect that slide's height.

Existing Sesi 02 baseline: WAD 26→27, BI 19→21 — same +1/+2 pattern.

## Playwright batch script (copy into career-ops)

Reuse `~/Code/Project/career-ops` (has `playwright` + `~/Library/Caches/ms-playwright/chromium-*`). ESM resolution is relative to script path — running from `~/.hermes/cache` fails with `ERR_MODULE_NOT_FOUND`.

```js
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const jobs = [
  { src: "/Users/flp9damarpramuditya/Documents/Obsidian Vault/02-Projects/Cakrawala/Software Development Life Cycle/Sesi 03 - Slides.html", out: ".../Sesi 03 - Slides.pdf" },
  { src: "/Users/flp9damarpramuditya/Documents/Obsidian Vault/02-Projects/Cakrawala/Web Application Development/Sesi 03 - Slides.html", out: ".../Sesi 03 - Slides.pdf" },
  { src: "/Users/flp9damarpramuditya/Documents/Obsidian Vault/02-Projects/Cakrawala/Business Intelligence Systems/Sesi 03 - Slides.html", out: ".../Sesi 03 - Slides.pdf" },
];
const browser = await chromium.launch();
for (const {src, out} of jobs) {
  const url = pathToFileURL(src).href; // not hand-rolled encodeURI — double-encodes %2520
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.pdf({ path: out, width:'1280px', height:'720px', printBackground:true, margin:{top:0,bottom:0,left:0,right:0} });
  await page.close();
}
await browser.close();
```

Steps: write as `~/Code/Project/career-ops/print-sesi03.mjs` → `node print-sesi03.mjs` from that dir → delete temp file → verify with `pdfinfo <pdf> | grep Pages` and `ls -lh`.

## deck.mjs-built decks (`sesi NN-deck-pengampu|mahasiswa.html`) — validated 2026-09-18

The `deck.mjs build` output prints with **its own** `@media print` block, so no CSS work is needed:
`.deck{position:static}`, `.slide{display:block;page-break-after:always;min-height:auto;overflow:visible}`,
`.hud,#pane,.bar{display:none}`. Same 1280×720 px (= 960×540 pt) pages; one page per slide, and a slide
whose content exceeds 720 px spills one extra page (BI Sesi 04 slide 19, the lab slide carrying both the
six-requirement table and the Contoh table: 21 slides → 22 pages).

- **Speaker notes never print.** `.notes,.visual{display:none}` and the notes are injected into the
  fixed bottom `#pane` by JS, which the print block hides unconditionally. For an annotated instructor
  copy, inject CSS via `page.addStyleTag({content})` before `pdf()`:
  `.notes{display:block!important;margin-top:16px;padding-top:10px;border-top:1px dashed #C6CED7;
  font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#3B4B8C;white-space:pre-wrap}` plus
  `.visual{display:block!important;font-size:11.5px;color:#8B95A1}` and `.slide{padding-bottom:24px!important}`.
  Validated: notes fit under each slide and the page count does not change (21-slide deck → 22 pages, 533 KB).
- **Do not chase dead space.** `body.pane-on .slide{padding-bottom:calc(38vh + 44px)}` does not apply in
  print — pane-on is never set in a headless PDF run.
- Notes excluded, the only printed difference between the two decks is the per-slide **clock chip**
  (`min 000 · 18:15 · 2m`), present in the pengampu build and omitted by the materi build. Distribute the
  student PDF; keep the pengampu one for yourself.
- Run the print from a temp script inside `~/Code/Project/career-ops` (playwright + cached Chromium) and
  delete it after; verify with `pdfinfo | grep -E "^Pages|^Page size"` — `slides` or `slides + 1` both
  pass (see *Page-count expectation*); anything below `slides` means two slides shared a page.
- **File size tracks inline SVG, not correctness.** The three-course batch decks were 1.2–1.7 M because
  they carry diagrams; the BI Sesi 04 hand-built deck (13 SVGs, mostly tables) printed at 920 K for 21
  slides and is fine. Verify page-to-slide mapping, never `ls -lh`.
- Decks rendered from a naskah are gitignored (`.gitignore`: `02-Projects/**/sesi*-deck-*.html`,
  `02-Projects/**/Sesi * - Materi.md`) but the **PDFs are not**, so a printed draft gets swept into the
  vault's auto-commit.

## Verify

- `pdfinfo` pages ≈ slides + 1; `ls -lh` 1–2M for 20–26 slides is normal.
- After any CSS patch, re-run print — PDF is stale.
- For visual defects (kicker pill full-width, cramped footer), use element screenshots `page.locator('#sN').screenshot()` as in intro-deck recipe — full PDF hides them.
