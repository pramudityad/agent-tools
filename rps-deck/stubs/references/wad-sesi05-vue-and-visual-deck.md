# WAD Sesi 05 — Vue port + gallery walk teardown

Reference for the WAD Sesi 05 rps-deck run (2026-09-20). Complements the canonical Sesi 05 Naskah (`02-Projects/Cakrawala/Web Application Development/Sesi 05 - Naskah.md`, 24 slides, Σ DUR 120, slot 20:00–22:00).

## Contract sync

- Authority: `RPS - Web Application Development.docx` (2026-08-30, approved) — Sesi 05 = Vue 3, CPMK1, 2%, Port Vue enam komponen.
- Tool parses markdown only: `deck.mjs session 5 <docx>` → `✗ sesi N not found`. Sync `RPS - Web Application Development (Proposed Revision).md` rows 3–6 to docx (DOM / Async / Vue / FastAPI) before `deck.mjs session`. Verified after sync: `✓ sesi 5 · bobot 2% · CPMK1`.

## Sanitise

- Source: `02-Projects/Cloudeats/docs/CLOUDEATS_DOCS/CLOUDEATS_FRONTEND_ADMIN.md` (27KB, 1043 lines).
- Needed: 4 single pages for gallery walk — Service Overview, State Management (Jotai+React Query+Redux), Forms & Validation (RHF+Zod), Component System (40+ V3 `/src/ui/new/`).
- Map (`artifacts/sesi05-frontend-admin-nusafoods.map.json`): `CloudEats→Nusa Foods`, `api.cloudeats.com→api.example.internal`, `#work/cloudeats→""`, `ai-first: true→""`. Case-sensitive apply, case-insensitive scan — need both `CloudEats` and `CLOUDEATS` if present. Do not add identity keys (`3000→3000`) — they self-flag as residual.
- Sections: `Service Overview` ✓ clean, `Component System` ✓, `Forms & Validation` ✓, `State Management` flagged 2 URLs (`context7.com`, `github.com/dai-shi`) — strip those lines, re-scan clean. `Architecture` flagged 3 URLs — skip.
- Combined file `artifacts/sesi05-frontend-admin-nusafoods.md` (13KB, 486 lines, 4 sections joined with `---`): remove `| Port |` row, replace `localhost:8080` host, and **do not mention original names in the file's own info box** or scan flags them.

## Naskah refit 150→120

| Segment | Was | Now | Cut |
| :---- | :---- | :---- | :---- |
| Arrival | 10 | 9 | recap merged |
| Hook | 10 | 7 | harvest shortened |
| Core I | 35 | 30 | transitions compressed |
| Teardown | 13 | 12 (3 brief + 9 HOLD) | debrief 4→3 |
| Break | 12 | 8 | standard |
| Scaffold | 2 | 2 | — |
| Lab | 43 | 35 | tree/order given |
| Vue vs React | 8 (was 15) | 4 | one slide, honest |
| Checkpoint | 9 | 6 | walk-round |
| Close | 8 | 6 | catch-up + preview |

Lab fast-finisher: `useItems(filter)` composable (Custom Hooks preview, Sesi 12) + index-as-key bug reproduction.

## Visual deck

- Hand-built from `Sesi 04 - Slides.html` CSS/JS (navy/teal, `@media print`, notes toggle N, HOLD). 24 slides `s1..s24`, DUR list `[1,2,2,2,2,4,3,3,4,4,2,3,5,4,5,2,5,3,12,2,3,35,6,6]`.
- Placeholder (generic bodies) passes `probe` structure (`24 sections, 24 notes, print CSS clean`) but shows `title drift` vs Naskah — acceptable for preview, not for class. Verbatim rebuild must keep `LEAD` text verbatim inside HTML and escape titles with `html.escape` (esp. `` `{{ }}` ``).
- Print: `cp print_sesi05.mjs ~/Code/Project/career-ops/ && node ~/Code/Project/career-ops/print_sesi05.mjs` (pathToFileURL, 1280×720, printBackground:true) → `Sesi 05 - Slides.pdf` (25 pages, 100–240KB for placeholder, 1–2MB for full verbatim with SVGs).
