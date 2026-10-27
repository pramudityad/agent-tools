# BI Sesi 05 (105 min) + visual-deck pitfalls found 2026-09-19

Built `Sesi 05 - Naskah.md` → approved → `build --final` → `Sesi 05 - Slides.html` (23 slides)
→ `Sesi 05 - Slides.pdf` (23 pages, 1:1). What cost time, in order.

## `check` failures that are not obvious from FORMAT.md

- **A code-fence continuation line starting with an ALL-CAPS SQL keyword fails as `unknown marker GROUP`.**
  Indentation does NOT save it (the parser strips leading whitespace). Fix: keep the SQL on ONE
  line inside `sql:` — `sql: SELECT count(*) FROM (SELECT id FROM raw_x group by 1 having count(*) > 1)`.
  Lowercasing the continuation works too, but one line is simpler.
- **`**HOLD**` placed before the slide's content swallows `KONTEN`** → `slide N has no **KONTEN**`.
  Order inside a slide: `UNIT` · `DUR` · `VISUAL` · `KONTEN` (LEAD/table/FINE/Contoh) · `HOLD` · `NOTES`.
  HOLD is a chip about the slide, not a section opener.

## Visual deck: measure heights BEFORE printing

`pdftotext | awk` page-mapping shows `slides + 1` when exactly one slide overflows 720px, which is
indistinguishable from the harmless trailing blank page if you only count pages. Measure instead —
run this in the Playwright print script before `page.pdf()`:

```js
await page.evaluate(() => document.querySelectorAll('.slide').forEach(s => { s.style.display = 'block'; }));
const h = await page.$$eval('.slide', els => els.map(e => ({ id: e.id, h: Math.round(e.getBoundingClientRect().height) })));
console.log('meluber >720px:', JSON.stringify(h.filter(x => x.h > 720)));
```

BI Sesi 05 s2 (peta sesi: 11-row table + timeline SVG) measured 752px → 24 pages. Cutting the table
font to 13px, the SVG `margin-top` to 6px, and merging two rows (brief lab + lab) brought it to
719px → 23 pages. Cheaper fixes on a too-tall slide: table `font-size:13px`, then merge rows, then
drop the `FINE` line — in that order.

## Instructor wording that the probe flags on a lab HOLD slide

The Contoh block belongs inside `<div id="contohContent" style="display:none">`; the probe strips
`#contohContent` and `.notes`, but NOT the outer box header. So the veil label must be content-neutral
("◆ Contoh — tiga bentuk test") and the timing instruction ("setelah 5 menit", "jangan di awal",
"tampilkan setelah") must live only in `NOTES`. Same for `instruktur` / `berkeliling` in body text —
use `dosen` and phrase it as a fact ("Dosen datang ke mejamu"), not as a move to perform.

`s1: title drift` (naskah 'Sampul' vs cover h2) is present in the shipped Sesi 04 deck too — a
warning, not a defect. Do not contort the cover headline to silence it.

## Sanitising map for the conversion-tracking artefact

`artifacts/sesi05-advora-clid.map.json` (reusable): Flip/gogogo → NusaPay, TikTok → AdVora,
ttclid → avclid, gclid → spclid, SGTM → TagServer, GTM → TagHub, `gitops-flip-*` → `ops-nusapay-*`.
`deck.mjs sanitise --section "Issue Summary|🔴 Root Cause Found - Backend Issue"` produced a clean
90-line handout; the emoji heading matches fine.

## Rebuilding the deck after a naskah edit

`tools/build_sesi05_slides.py` generates `Sesi 05 - Slides.html` from the §8 manifest with Sesi 04's
CSS/JS copied verbatim (so the deck family does not fork). After editing slide text: re-run that
script, then re-print (historical: the probe script and HTML decks are retired, ADR 0009). The naskah edit is not finished until the
`.html` and `.pdf` are regenerated.
