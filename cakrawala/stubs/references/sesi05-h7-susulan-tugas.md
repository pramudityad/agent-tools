# Sesi 05 H+7 Susulan Tugas — canonical example (2026-09-21)

BI Sesi 05 (Advanced ETL Pipelines & Data Quality, CPMK3, D4) is verified in-room via a
35-min HOLD lab. No Tugas was planned. User approved a susulan lane with H+7 deadline.

## File created

`02-Projects/Cakrawala/Business Intelligence Systems/Sesi 05 - Tugas.md`

## Frontmatter

```yaml
type: session-tugas
course: Business Intelligence Systems
session: 5
title: Tugas Sesi 5 — Enam Test Kualitas Data (D4)
tugas-type: personal
due: 2026-09-28T14:00:00Z  # 28 Sep 2026 21:00 WIB = H+7 from 21 Sep
on-close: lock
submit-attempt: 1
max-file-size: 10485760
```

Due calc: class 2026-09-21 → +7d = 2026-09-28, 21:00 WIB = 14:00Z.

## Body shape

1. Six tests in `tests/test_definitions.yml` (completeness, uniqueness, validity,
   consistency, timeliness, accuracy), each with `blocking|warning` + 1-line reason.
2. `python tests/run_tests.py` must show one FAIL (seed-injected dirt).
3. ≤100-word paragraph on hardest blocking vs warning call, citing
   `sesi05-advora-clid.md` (avclid 0%) as pipeline-green/data-red.

Rubric: 4 criteria, Sesi 5 = 2% (functional/quality/documentation/defence).

Closing note (required):
> D4 aslinya dikerjakan dan diverifikasi di dalam sesi (lab HOLD 35 menit,
> runner dijalankan dosen di laptop tim). Tugas ini adalah jalur susulan H+7
> bagi yang belum tuntas di kelas — yang sudah tuntas di kelas tidak perlu
> mengumpulkan ulang.

## Verification

```sh
rise-ops tugas list BI  # expect: ada Tugas.md · 0 di RISE for sesi 5 before publish
rise-ops tugas publish BI 5  # title match = upsert; re-run updates after edits
```

Auth was `auth_expired` at creation time, so file stayed `ada · 0 di RISE` pending
`cakrawala_session_siakad` refresh + `rise-ops sync`.
