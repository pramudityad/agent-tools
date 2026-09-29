# Parallel 3-course Sesi 03 fan-out (Cakrawala, 2026-09-12)

Vault `02-Projects/Cakrawala/` holds 3 courses. A bare "sesi 03" is ambiguous — fan out, don't pick one.

## Why
User correction 2026-09-12: agent focused only on SDLC for "cek sesi 03" while BI and WAD also have Sesi 03. User then asked "ketiganya pararel".

## Pattern
Use `delegate_task` with 3 parallel subagents:

- **BI Sesi 03** — `RPS - Business Intelligence Systems (Proposed Revision).md` + `Week 03 - Data Warehousing and Dimensional Modeling.md` — slot 105 (18:15–20:00), bobot 3%, D1+D4 active, artifacts: `database-schema-relations.md` + `Go-gogogo-OOM-unbounded-data.md`
- **WAD Sesi 03** — `RPS - Web Application Development (Proposed Revision).md` + `Week 03 - JavaScript Essentials DOM and Events.md` — slot 120 (20:00–22:00), bobot 2% (Proposed) vs 5% (Official), artifact: `5070.md`. **Critical full-topic mismatch**: RPS = FastAPI server-side, Week = JS/DOM — needs reorder-vs-revise ruling (D11).
- **SDLC Sesi 03** — `RPS - Software Development Life Cycle (Proposed Revision).md` + `Week 03 - Agile Frameworks.md` + `00d WIP Simulation Run-Sheet` — slot 90 (18:30–20:00, EKSEPSI 90+90), bobot 2%, lab 105–150 overflows slot, 4 artifacts (Retro + Template + Sprint 9 + 12 principles).

Each subagent runs: `deck.mjs session 3 <rps.md>` → read Week 03 full + `RPS Defects.md` + `00 Course Overview` → reconcile table → sanitisation check → `ls` for Naskah existence → report. No file writes during readiness pass; only reporting.

## Slot/bobot table (authoritative)

| Course | Real slot | Week declares | RPS Sesi 3 bobot | Week 03 topic |
|---|---|---|---|---|
| BI | 18:15–20:00 · 105 | 150 (19:00–21:30) | 3% (CPMK-2 star schema) | Data Warehousing |
| WAD | 20:00–22:00 · 120 | 150 | 2% Proposed / 5% Official (CPMK1+4 FastAPI) | JS DOM Events (CPMK-2) — MISMATCH |
| SDLC | 18:30–20:00 · 90 (Meet 2 = 90+90) | 150 but frontmatter already 90 | 2% (CPMK-1 Agile) | Agile Frameworks |

## Common pitfalls captured from this session
- SDLC CONTEXT stale (105) vs Defects (90) — always cross-check both.
- Sanitisation drift same service, different fictional names per week — ask before reusing maps.
- WAD full-topic mismatch cannot be solved by cut ledger — needs explicit decision.
- Sesi 03 Naskah missing in all three as of 2026-09-12; Sesi 01/02 approved.
