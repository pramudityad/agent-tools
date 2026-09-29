# Cakrawala UTS Status Review — 2026-09-22

**Session**: Three-course UTS preparation check (BI Systems, SDLC, Web Application Development)

## Overall Ready-Status Summary

| Course | Status | Key Blockers |
|--------|--------|-------------|
| **BI Systems** (`SDA2161`) | **NOT READY** (announce-gate `siap tempel`) | Starter repo not pushed to GitHub/lab; SAC/prodi approval for design-only format missing; Sesi 5–7 artifacts not produced; T3 slice ambiguity |
| **SDLC** (`IK103`) | **READY** (draft complete) | One assumption needs RPS/SAC confirmation: 70-min paper + in-class revision block must satisfy examination regulations |
| **WAD** (`CIK3101`) | **NOT READY** (draft only) | Starter repo missing (FastAPI + dataset + Vite/Vue skeleton); second resit scenario unwritten; AI policy during exam unconfirmed by SAC; exam duration decision pending (95 vs 115 min) |

## Precondition‑Checking Framework (applied per‑course)

1. **Starter repo + seed** — template pushed to GitHub, copied to lab machines, verified (zip + Git URL, both servers run from README)
2. **SAC/prodi format approval** — RPS row licence for practical/design format versus written‑paper baseline
3. **Materi Sesi 5–7 artifacts** — D4 test, D6 kamus, D2 DDL (BI); per‑item answer key + 10‑point checklist (SDLC); starter repo (WAD)
4. **Exam‑session slot fit** — real slot vs. note‑slot; no‑homework constraint; revision block timing
5. **Second‑scenario/resit plan** — differently‑scenarioed version for makeup exam

## "Missing to Run It" Patterns (per course)

- **BI**: Sesi 6–7 materials; repo + seed in students' hands; print 9 sets of D7 + checklist; T3 slice definitively Kota (not Provinsi)
- **SDLC**: Per‑item answer key + rubric; printed 10‑point checklist; scope‑statement form; Meet 4 date in vault
- **WAD**: Starter repo built, tested (both servers up from README), verified on Codespaces/StackBlitz; second scenario for resit; SAC policy on AI assistants; 10‑min revision block as examination time

## Style & Workflow Anchors (Ponytail / YAGNI‑first)

- **Three‑course status check** is a repeatable gate: `ls -lt` + `git log --all --pretty=format: --name-only | sort -u | grep -iE 'uts|ua|ujian|soal'` → proof the artifact never existed → read Sesi 08 notes → read each `Kontrak Kuliah.md` → read RPS Sesi‑8 row → author sheet → print absolute paths → wait for review
- **Never silently pick a side** between contradictory planning docs — the newest mtime usually wins; report the disagreement
- **Outcome statement first** (Step 1 of course-assessment-design): one sentence defining "done" for the student, written as a change in the world, not as a list of tables
- **DoD must be checkable in the room** with instructor present; for design‑only assessments replace live execution with the outsider test + number test
- **Refit to real slot, not fiction** — BI 105 min, WAD 120 min, SDLC 180 min (Meet 4); always cut the assessment shape, never the deadline
- **Signed scope cut** is mandatory when scope is the real risk (no‑homework course has no recovery mechanism)

## Files Touched This Session

- `UTS - Design Checkpoint.md` (BI) — already `status: berlaku (v1, 2026-09-19)`
- `Pengumuman RISE - UTS Design Checkpoint.md` (BI) — already `status: siap tempel`
- `Sesi 08 - UTS and Proposal Review.md` (SDLC) — complete draft
- `UTS - Naskah Soal (Draft).md` (WAD) — drafted 2026-09-22