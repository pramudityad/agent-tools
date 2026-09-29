# SDLC Sesi 04 — genap slot (20:00–21:30) + claims register lab

Canonical for the second half of an EKSEPSI meet. First validated 2026-09-15: `Sesi 04 - Requirements Engineering and Elicitation` — 22 slides, slot-start 20:00, slot-minutes 90, DUR sum 90, `check` + `restamp` ✓, approved 2026-09-15.

## Why Sesi 04 differs from Sesi 03 (ganjil)

Sesi 03 (ganjil) is the template for 18:30–20:00 — soft open recaps the meet's first half lightly. Sesi 04 (genap) starts at 20:00 with a **tired room** that has already done 90 minutes — Sesi 03. You cannot replay the full tree-swing hook or stakeholder checklist at full length; compress and keep every instruction before the break.

Previous attempt summed DUR 83 → `Σ DUR is 83 min, slot is 90 — 7 short`. The fix is to **expand the lab HOLD**, not to add a slide: lab HOLD 33 → 40 took the 7 minutes exactly (Sesi 04). Do not pad core blocks — lab tolerates compression, lecture does not.

## DUR map that fits 90 (22 slides, genap)

| Slides | DUR | What |
| :---- | :---- | :---- |
| 1 Sampul | 2 | 20:00 title |
| 2 Tonight peta | 2 | 7-row minute→clock table ending "48–90 Lab" |
| 3 Tree swing | 2 | Cartoon 6 panels |
| 4 Has this happened | 2 | Two-direction hands |
| 5 Solutions not problems | 2 | One-line pivot |
| 6 Process 5 activities | 3 | Elicitation→Management loop |
| 7 Validation | 2 | The skipped step |
| 8 Seven-category checklist | 3 | Direct→Negative |
| 9 Negative stakeholders | 2 | Sink projects |
| 10 Elicitation techniques | 3 | 6-row good/limitation |
| 11 Observation contradicts | 2 | Spreadsheet workaround |
| 12 Interview moves | 3 | 7 moves + tally sheet |
| 13 Summarise back | 2 | Within the hour |
| 14 Ambiguous words | 2 | 7-word list + real-time |
| 15 Glossary _Avoid_ | 2 | Sandbox Avoid: container, VM, jail, box, environment, persistent sandbox |
| 16 Unstated assumptions | 2 | Two obvious-not-mentioned examples |
| 17 Measured/documented/assumed | 3 | Three claims same confident voice |
| 18 PRD labels its claims | 4 | Reading-order + metrics "Measured ~1.2 s" + risk High→Low "was H" — HOLD 7-min teardown (slide 18–19 shared) |
| 19 Findings overrules | 3 | "For future Claude" + mount whole-home writable — HOLD |
| 20 MoSCoW | 2 | Must/Should/Could/Won't(this time) |
| 21 Scope creep change control | 2 | request→impact→decision→record |
| 22 Lab HOLD | 40 | Part 1 role-play 3×7 min (23) + Part 2 write-up 10 + debrief 4 + close 3 — Contoh 5-row NusaPay table after 5 min, never at start |

Total 90. After any DUR edit run `deck.mjs restamp` — it rewrites every `[min NNN · HH:MM]` as `slot-start + min` (20:00 + min). Do not hand-patch stamps.

## Artifacts (sanitised, scan-clean)

- `artifacts/sesi04-prd-findings-nusapay.md` — 2-page extract from `02-Projects/Personal/Pi-Sandbox/PRD.md` + `FINDINGS.md` (personal, non-employer — no Flip/CloudEats scrub). Sanitised: `/Users/flp9damarpramuditya` → `/Users/<user>` (mount line `lima-… on /Users/<user>`), `grep -nE "sk-|eyJ|AIza"` clean (no API key). Scan pitfall: attribution line `02-Projects/Personal/Pi-Sandbox/PRD.md` itself trips `vault-path` residual → replace with short `Pi-Sandbox PRD.md` (and FINDINGS/CONTEXT similarly) before `scan`. Map `sesi04-prd-findings-nusapay.map.json` = `{"/Users/flp9damarpramuditya":"/Users/<user>", "flp9damarpramuditya":"<user>"}` — `scan` then clean.
- `artifacts/sesi04-glossary-nusapay.md` — verbatim `Pi-Sandbox/CONTEXT.md` (implementation-free glossary with `_Avoid_` lists) — no sanitisation needed.
- `artifacts/sesi04-cards/` — 8 briefing cards (koperasi, sekolah, distributor etc.) — stated solution + hidden problem + 2 unstated assumptions + 1 exception case.

## Lab assessment (RPS 2%, Tugas praktik)

Rubric: stakeholder completeness incl. ≥1 negative stakeholder with named consequence (30%); evidence of open questioning & exception-probing in notes (30%); claims register correctly distinguishes measured/documented/assumed and conversion questions are answerable (40%). Claims register is the heaviest weight — it is the habit that transfers.

Lab shape reuses the universal HOLD pattern: 5-row table, 1 row circled `⭕ DILINGKARI — …` → next artifact (here: Sesi 3 proposal benefit table), ≥2 rows intuition/spreadsheet, `Siapa` = named role (Product Owner NusaPay, PM NusaPay…) not department. See `references/lab-example-pattern.md`.
