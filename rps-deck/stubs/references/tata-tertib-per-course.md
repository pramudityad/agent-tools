# Tata Tertib Per-Course — Cakrawala RPS Ketentuan Drill (2026-09-06)

Source: docx reads via python-docx + md Proposed Revisions + RPS Defects.md. Template kontrasting: contoh.docx DWM CIK4101 (80%, 20/35/10/35) — do not reuse numbers.

## Institutional shared (all 3 courses)
- Bobot: UAS 25% / UTS 25% / Tugas Individu 20% / Tugas Kelompok 20% / Kehadiran 10%
- Ambang kehadiran: <75% of sesi terlaksana → no UAS, UAS=0 (contoh says 80% — wrong)
- Perhitungan Kehadiran table: arrival 0-10 =1.00, >15 =0.67 (3× late =1 absent), izin sah ≤8h + bukti = excluded max 2 sesi, >2 =0, tidak hadir =0, tidak terlaksana excluded. ×100 ×10%.
- Evening constraints (CONTEXT.md): hardest block first 45 min, 0-10 late-safe (no new/assessed), break real, absence normal + 15-min catch-up, mixed-role groups 3-4, ≤12 min without interaction, lab HOLD example after 5 min.

## Business Intelligence Systems — SDA2161, 3 SKS Teori1/Praktikum2 (RPS_Business_Intelligence_Systems.docx 2026-08-30)
Table 9 holds 10-butir (single cell, 10 paras):
1. Kehadiran 10% arrival/late/<75% rule
2. Pengumpulan D0-D13 in-session by menit 150 → DEFECT D1: slot real 105 min (18:15-20:00) never reaches 150; deck uses "sebelum meninggalkan ruang"
3. Ketidakhadiran sah ≤8h + bukti → artefak pengganti max 80%, else 0
4. Kontribusi individu = kelompok × faktor 0-1 from (a) observed 13 sesi (b) peer (c) defend any part; observation beats claim
5. Artefak wajib dapat dipertahankan → cannot explain =0
6. AI allowed praktikum with brief disclosure on artefact; banned UTS/UAS; butir 5 applies
7. Tidak dapat dijalankan/incomplete =0 functional; pipeline run 2× before dosen
8. Scope cut capstone: 1 fact +1 conformed dimension signed Sesi 8 (D7); rubrik S15 against it; no signature = not graded S15
9. Batas lulus: UAS<50 or any CPMK<50 → fail; 1× remedial max 60
10. Banding 3 working days, only miscalc/wrong rubric
Rubrik: Fungsionalitas 50% / Kualitas 20% / Dokumentasi 15% / Pembelaan 15% (0/1/2 scale). D1/D2 defects logged.

## Web Application Development — Vue3+FastAPI+Postgres, Teori3/Praktikum0 pending confirmation (RPS - Web Application Development Revisi Pengampu 2026-08-31, Tables 12/15/16)
Same butir 1-3, 9-10 as BI verbatim.
4. Kontribusi = commit+PR atas nama sendiri + peer + defend code; NO commit =0 for Tugas Kelompok (stricter than BI)
5. Artefak defendable + commit history is proof → cannot explain =0
6. AI disclosure on README repo
7. Cannot run/build/CI red =0; run live not screenshot
8. Security as gate: committed credentials (API key/DB password/token) voids artifact since Sesi 2 (before formal Sesi 10)
D1 defect: menit 150 unreachable (slot 120 min 20:00-22:00).

## Software Development Life Cycle — IK103, 2 SKS Teori1/Praktikum1 (RPS - Software Development Life Cycle.docx 2026-08-20 official)
Currently NO 10-butir Ketentuan in .docx — only Perhitungan Kehadiran + Bobot 25/25/20/20/10.
Proposed Revision md (2026-08-28) would add same structure:
- butir 4 = branch-commit-PR-review per person (Sesi 10) + peer checklist Sesi 8 + defense S15
- butir 8 = scope cut Sesi 8 (project proposal)
EKSEPSI slot: 18:30-21:30 = 2 sesi/meet (Sesi 1 18:30-20:00 + Sesi 2 20:00-21:30 =90+90), so menit 150 not a defect at meet level but RPS wording needs "akhir tiap sesi (menit 90)". Needs drafting before Kontrak.

## Kontrak Kuliah generation guidance
- Never copy bobot/80%/generic Tata Tertib from contoh — RPS wins.
- For 90% online mode, rewrite butir 2 to bounded async window; flag threshold change for SAC.
- Keep grading table A-E from contoh only if RPS lacks it — RPS has only pass/fail thresholds; add table as supplement if needed.
