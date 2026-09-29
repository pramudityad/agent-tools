# Intro deck (00 Intro Dosen) — build & print recipe

Validated end-to-end 2026-09-06: `02-Projects/Cakrawala/00 Intro Dosen - Slides.html` →
`00 Intro Dosen - Slides.pdf` (6 slides, ~540 KB).

## What it is

- **Separate artifact** from teaching decks — user: "this separate slide only for
  introduction. i already have slide for teaching". Do NOT funnel it through the Sesi
  naskah / render / build pipeline; no RPS row, no DUR, no slot math applies.
- Course-neutral: one deck serves BI/SDLC/WAD. Lives at `02-Projects/Cakrawala/` root,
  not inside a course dir.
- **Language: English.** First draft was Indonesian; user corrected "revise, pls use
  english" (2026-09-06). Exception applies to the intro deck only — teaching decks
  stay Indonesian.

## 6-slide content pattern

1. **Cover** (gradient navy `#0f2a44 → #123a5e → #155a5a`) — name, role one-liner,
   3 chips (years, degree, focus).
2. **Introduction** — "Who I am": navy ID card (avatar initials, role, Jakarta,
   "Previously: Cloudeats · Flip · Traveloka · Ericsson") + 4 fact cards (8+ years,
   M.Sc. CS UGM, 10M+ users, AI-native) + one personal quote with evening-class
   empathy (finished S2 while working full-time).
3. **Background — professional journey** — vertical timeline, 6 rows: Telkom
   (2014–18) → Coders Colony (2018–19) → Ericsson (2019–21, Graduate Integration
   Engineer → Fullstack Engineer: trainee program, React+Python/Node on Azure, PM
   duties + intern mentoring) → Traveloka (2021–24) → UGM M.Sc (2022–24) →
   Flip/LIT (2024–now). 6 rows fit 720px only with compressed `.tcard`
   (`padding:10px 20px; margin-bottom:9px`), `.tdot` `margin-top:11px`,
   `.t-what` 14.5px — validated 2026-09-06.
4. **Background — what-I-build** — two cards side by side: fintech day job (10M+
   users, jt+/hari transaksi, 98% SLO, chips Go/K8s/Terraform/Kong/PostgreSQL/Pub-Sub)
   + open source career-ops (740+ lowongan, 81 sumber, 134 skrip).
5. **Contact** — navy mail card: **damararba.pramuditya@cakrawala.ac.id** as primary
   channel; three cards: response time ≤24h on working days (subject format
   `[Name – Course] – Topic`), flexible address Pak/Mas/Kak, LinkedIn +
   pramudityad.github.io.
6. **Closing** (gradient navy) — "the real material starts in Session 1" + email chip.

Facts source: career-ops repo `cv.md` (Traveloka 70%/60% cost cuts, 10M+ users, 98% SLO,
IEEE paper, RBA thesis) — matches the standing rule: never put an unmeasured number on a
slide. BUT cv.md is incomplete as a career source: it omits Ericsson 2019–2021 (user had
to supply it in chat; vault notes `03-Spaces/Career`, daily notes, and career-ops
`reports/`+`interview-prep/` confirm). For career history, grep all of these and treat
the user's own words as the tiebreaker. LinkedIn scraping returns only partial metadata
— do not rely on it as a source.

## Style (family-matches `Sesi NN - Slides.html`)

Same CSS vars as `Business Intelligence Systems/Sesi 01 - Slides.html`:
`--navy:#0f2a44 --teal:#0e6e6e --teal-soft:#dcefed --amber:#b45309 --amber-soft:#fdf3e3
--bg:#f6f7f9 --card:#fff --ink:#0f172a --muted:#5a6675 --border:#e2e8f0`, Inter font,
1280×720 `section.slide` with `page-break-after:always`, kicker pill + h2 + accentbar +
footer with `N / 6` pager. NOTE: `.kicker` needs `width:fit-content` or inline-flex in a
flex column stretches it full-width.

## HTML→PDF via Playwright (career-ops repo has it)

career-ops (`~/Code/Project/career-ops`) ships Playwright + cached Chromium
(`node_modules/.bin/playwright`, `~/Library/Caches/ms-playwright/chromium-*`).

- **Copy the print script INTO that repo dir before running `node`** — ESM resolution is
  relative to the script's own path; the identical script in `~/.hermes/cache` fails with
  `ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`. Delete the temp copy after.
- **Use `pathToFileURL(src).href` (node:url)** — hand-rolled `encodeURI('file://' +
  src.replace(/ /g,'%20'))` double-encodes spaces (`%2520`) → `ERR_FILE_NOT_FOUND`.
- Print call: `page.pdf({ path, width:'1280px', height:'720px', printBackground:true,
  margin:{top:0,bottom:0,left:0,right:0} })` — one PDF page per `.slide`.

## Verify before handoff

Element-screenshot each `#sN` via `page.locator('#sN').screenshot()` and inspect visually
(vision) — full-page PDF render alone hides defects. Caught this way in the validated
build: full-width kicker pill (→ `width:fit-content`), cramped s6 footer (→ `gap:12px`).
After any CSS patch, **re-run the print script** — the PDF never updates itself.
