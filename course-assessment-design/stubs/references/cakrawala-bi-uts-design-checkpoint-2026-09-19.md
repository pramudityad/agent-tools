# BI UTS 2026 — the design-checkpoint ruling (2026-09-19)

Session detail behind `SKILL.md` Step 2's design-only variant. Artifacts live in
`02-Projects/Cakrawala/Business Intelligence Systems/`.

## The ruling

User, mid-session: *"What is ur proposal? UTS just for desain only. Not implementation yet."*
The UTS keeps the 25% weight and the four-criterion rubric; only the **artifact** changes — a
blueprint the next engineer can build from, not a running warehouse.

| Was (first draft) | Now (design-only) | Honoured at |
| :---- | :---- | :---- |
| pipeline run twice in front of the instructor | **design** of the load: strategy per table, natural key, partition column, when it would double rows | Sesi 4 (D3) + UAS Sesi 16 |
| one test made to FAIL live | 6 tests **designed**, ≥1 expected FAIL with a count taken from profiling | Sesi 5 (D4) + UAS |
| three queries executed | three queries + **the expected answer in one sentence** | not executed at UTS |
| — | scoring criterion 1 re-read as *"someone else could build from this without asking"* | — |

Files: brief `UTS - Design Checkpoint (Draft).md`; session note `Sesi 08 - UTS and Mid-Review.md`
(rewritten, 199 lines); mapping `Mapping RPS ke Sesi - 3 Topik (105 menit).md` (renamed from
`… Track A_B …`); `Boilerplate Proyek Mahasiswa - Rencana Sesi 1-16.md` §5; `RPS Defects.md`.

## The six items (student-facing, Indonesian)

1. **Desain BI** — grain sentence in full, 1 fact + 3 dim, surrogate keys, SCD type per dimension
   with a one-line reason, additivity per measure, 2 questions the schema answers + 1 it cannot.
2. **Desain load** — `pipeline/DESIGN_load.md` + `pipeline/load.sql` skeleton; one strategy per
   table from `TRUNCATE+INSERT` / `MERGE` by natural key / `DELETE partition + INSERT`; three
   required lines: natural key, partition/window column, when the strategy doubles rows.
   Banned: `INSERT` with no idempotency clause; "pakai dbt" without models + materialisation.
3. **Desain 6 test** — `tests/test_definitions.yml` with `name`/`sql`/`severity`/`justifikasi`;
   ≥1 blocking + ≥1 warning; the expected-FAIL one carries the number; `WHERE 1=1` scores 0.
4. **Desain 3 kueri** — `sql/40_analytics/q01..q03.sql`, ≥1 window function or CTE, ≥1 filtered to
   the team's slice; each with output columns + expected answer as a sentence.
5. **Kamus 1 metrik** — 12 fields + one way it would be gamed + the guard test.
6. **Apa yang TIDAK terjawab** — three sentences naming the grain, column or rule that blocks it.

Allowed: `pipeline/profile.py`, `sql/00_profiling.sql`. Not allowed: create/load tables, run the
suite, open Metabase.

## Session timings (105 min, no break)

`0–5` attendance + rules · `5–10` warm-up (three Sesi 7 revision questions, reference material left
on the board) · **`5–85` design, 80 min** (RPS figure, user ruling *"make 80 menit"*) · `85–100`
D7 scope cut **rotating**, ±1.5–2 min/team with the form already filled in by the team · `100–105`
close. Nine signatures ≈ 18 min, so the form must be filled **before minute 85** and the signature
block runs while other teams commit (defect D10). Fallback if the room proves tighter: move the
signature to a 20-minute block inside the Sesi 9 lab.

## Seeds — one `seed/` root, deterministic, with an instructor key

```
seed/
├── t1_kampus/    2,700 students · 12 courses · 117,936 attendance · 8,264 grades   (synthetic)
├── t2_umkm/      4 outlets · 120 products · 800 customers · 15,892 transactions · 31,343 items
├── t3_publik/    k1 Kota Bogor 1,156 (68 desa) · k2 Semarang 3,009 (177) ·
│                 k3 Makassar 2,874 (153) · k6 Kota Denpasar 774 (43)  = 7,813 rows  (real, BMKG)
└── _cache/       raw wilayah.id + BMKG responses — re-run is offline and identical
```

Generators: `tools/t1_t2_seed_gen.py` (fixed RNG seed — re-runs give identical row counts),
`tools/t3_seed_pull.py` (`master` + `cuaca` subcommands, `--check` prints the idempotency proof).
Instructor keys: `seed/<topic>/_KUNCI_PENYUNTIKAN.md`.

**Dirt that makes a test writable** (each measured, not asserted):

- T2 — 25% of products rise 10% on 2025-07-01 (this is what forces SCD Type 2); 15% of timestamps
  are UTC while the rest are naive local; 5 status spellings; 200 duplicate `transaction_id`; one
  row with a missing FK and `diskon` > price.
- T1 — 9 attendance status spellings incl. `-`; 4% duplicated attendance rows; 5% `dd/mm/yyyy`
  dates mixed with ISO; out-of-range grades (`117`, `-5`); `sks` as `3` vs `3 SKS`.
- T3 (real) — `vs` + `vs_text` empty in 1,156/1,156 rows; weather codes `0` and `1` both read
  `Cerah`; `time_index` is an hour **offset** (11–37), not a clock time; `tp` zero in 812/1,156
  (dry snapshot — so rain cannot be the only measure); 11 desa names collide between Kota Bogor
  and Kab. Bogor (`Sukadamai`, `Sukasari`, `Batu Tulis`, …), which is why joins go through codes.

## Defect register entries opened

- **D9** — the old `Sesi 08` note claimed UTS 20% and a Part A/B/C written paper: corrected.
- **D10** — an 80-minute UTS leaves 20 minutes for the D7 signatures (derived from D3).
- **D11** — design-only no longer satisfies butir 7 (*pipeline run twice*); honoured at Sesi 4 and
  UAS, **needs prodi/SAC confirmation** or a 10-minute demo slot in Sesi 9.

## Still open

**UAS format contradicts itself the same way D9 did.** The approved RPS Sesi 16 row says
*"Ujian tertulis dalam sesi"*, `Sesi 16 - UAS Final Evaluation.md` is written as a 25-mark
Part A/B/C paper, while the mapping doc and boilerplate §6 assume build + dashboard + defend.
One side has to win before Sesi 16 is authored — raise it, do not resolve it silently.
