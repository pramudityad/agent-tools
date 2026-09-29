# BI (SDA2161) UTS — "Decision POC" — worked example, 2026-09-19

Draft lives at
`02-Projects/Cakrawala/Business Intelligence Systems/UTS - Decision POC (Draft).md`.
Built with the user's three rulings: **team** (2–3 people), **dataset provided by the
instructor** (not self-chosen), **replaces** the old DoD UTS (which was D0 + D2 + D3 + D4).

## The design

Outcome sentence the whole assessment hangs off:

> Buat 1 keputusan di timmu berubah — atau jadi lebih tajam — karena ada angka yang bisa
> dipertahankan.

POC = *thin but unbroken*: 1 fact, 3 dimensions, 1 metric. "Boleh jelek, tidak boleh putus
rantainya." What is graded is the chain decision → question → grain → load → test → number →
metric, plus **what the number cannot answer**.

Session shape — **after the user's 2026-09-19 ruling** ("make 80 menit"): honour the RPS's
80-minute UTS and squeeze the signature block instead, rather than the reverse. The earlier 65′
variant is dead; do not resurrect it.

| Menit | Blok |
| :---- | :---- |
| 0–5 | presensi + aturan (closed-internet, AI dilarang — RPS butir 6); Kimball 4 langkah + tabel SCD + template 12 field tetap di papan |
| 5–85 | **build 80′** — `checkpoint.py verify --sesi 8` boleh diulang |
| 85–100 | **D7 scope cut**, bergilir sambil tim lain menyelesaikan commit — form sudah terisi tim **sebelum menit 85**, dosen hanya mencoret + tanda tangan ±1,5–2′/tim (9 tim) |
| 100–105 | tutup |

No separate break: 80 + 9 signatures fills the 105-minute slot. That leaves a residual squeeze
(D7 gets 20′ where the old plan assumed 25′) — the pre-filled form is what makes it fit, and the
second remedy in `RPS Defects.md` D3 (move signing into the Sesi 9 lab) stays available.

Item 1 ("Desain BI") content that worked: 1.1 grain sentence written out in full; 1.2 star =
1 fact + 3 dim with surrogate keys and exactly 1 JOIN per dim (a `fact → dim → dim` chain means
either flatten or justify); 1.3 one SCD type per dim + one-line reason + ≥1 Type 2 or a written
justification; 1.4 additivity label per measure, forcing ≥1 non-additive (`hadir` semi-additive,
`margin_pct` / `persentase_miskin` non-additive); 1.5 **two questions the schema can answer +
one it cannot**, with a reason (grain too coarse / column absent / needs data outside the set);
1.6 the files collected (`sql/20_dim_*.sql`, `sql/30_fact_*.sql`, `docs/UTS_decision_brief.md`).
Always include a "kesalahan yang paling sering" list — the instructor says those out loud anyway.

DoD kept from the old design because it is instructor-verifiable live: run 2× in front of the
lecturer, ≥1 test FAIL live (not `WHERE 1=1`), grain matches `COUNT(*)`, additivity labelled,
D7 signed. Added: the Brief must contain the *"apa yang TIDAK terjawab"* column.

## Topics × teams (from `Boilerplate Proyek Mahasiswa - Rencana Sesi 1-16.md`)

| Topik | Seed | Tim & slice (anti-contek) |
| :---- | :---- | :---- |
| T1 Kampus: Presensi & Kelulusan | `mahasiswa.csv`, `matakuliah.csv`, `presensi.csv`, `nilai.csv` | K4 (2024), K5 (2023), K7 (2022) |
| T2 POS UMKM Multi-Outlet | `transactions.csv`, `transaction_items.csv`, `products.csv`, `customers.csv`, `outlets.csv` | K8 (A+B+C, 12 bln), K9 (Outlet A, 6 bln, scope −20%) |
| T3 **Cuaca Ekstrem per Desa (BMKG)** | `prakiraan_cuaca.csv` (frozen BMKG snapshot) + `provinsi/kabkot/kecamatan/desa.csv` from `wilayah.id` + `SOURCE.md` — APBD **dropped**, its national per-kab/kota file does not exist | K1 Kota Bogor, K2 Kota Semarang, K3 Kota Makassar, K6 Kota Kupang (names/codes editable in the puller). **Correction 2026-09-21: k6 is Kota Denpasar `51.71` since the 2026-09-20 re-pull — 774 rows / 43 desa; see `cakrawala-bi-uts-design-checkpoint-2026-09-19.md`** |

Same schema inside a topic (teams may help each other technically); the **data slice and the
circled decision differ** (numbers, insight and defence cannot be copied). Also in the starter
repo and therefore not UTS work: `dim_date` generator, `sql/00_profiling.sql`,
`pipeline/load.py --twice`, `tests/run_tests.py`, `checkpoint.py`,
`warehouse/fallback/<topik>.duckdb`.

## Sesi 01–07 → what must be visible in the POC

| Sesi | Brought forward |
| :---- | :---- |
| 1 Intro BI & decision support | decision + named decision-maker (not a department) |
| 2 Architecture & requirements | business questions answerable by the data at hand |
| 3 Dimensional modeling | Kimball 4 steps, grain sentence, surrogate key, SCD, additivity, star vs snowflake |
| 4 ETL fundamentals | profiling before transforming, ETL vs ELT, idempotency |
| 5 Pipelines & data quality | tests as code, blocking vs warning, reconciliation |
| 6 OLAP & cubes | roll-up/aggregate queries, when NOT to pre-aggregate |
| 7 Metrics & KPIs | unambiguous metric definition, owner, time basis, anti-gaming |

## Doc map — the contradictions this folder carries (found 2026-09-19)

Five planning docs, four of them disagreeing:

| Doc | Says |
| :---- | :---- |
| `Sesi 08 - UTS and Mid-Review.md` | 80-min **written** paper, Part A/B/C, 100 marks, **UTS 20%**, exam + mid-review |
| `UTS Brief Track A/B (Tema Bebas).md` (2026-09-09) | UTS = **project checkpoint**, DoD D0+D2+D3+D4, UTS 25%, **tema bebas**, self-chosen dataset |
| `Mapping RPS ke Sesi - Track A_B …md` (2026-09-09) | UTS 25% via DoD Track A/B; tema bebas; teams of 3 |
| `Boilerplate Proyek Mahasiswa - Rencana Sesi 1-16.md` (2026-09-11, newest) | **3 curated topics** replacing tema bebas, data seeds provided, 65′ build + 25′ D7, 2,5′ signature per team |
| `RPS - Business Intelligence Systems (Proposed Revision).md` | institutional weights: UAS 25 · UTS 25 · Tugas Individu 20 · Tugas Kelompok 20 · Kehadiran 10 |

Rulings obtained 2026-09-19 (later revisions of this note must not re-ask them):
**3 curated topics × slice per team** (not one dataset for all) · **build 80′, D7 20′** ·
**T3 = cuaca BMKG**, its seeds pulled and frozen (APBD dropped as unsourceable) ·
**replaces** the old DoD UTS, and the old briefs stay untouched until the user says go.
Still open at the end of the session: which kabupaten/kota per slice (defaults set in the puller),
whether the snapshot is taken H-1 or H-3 before Sesi 1 · keep or archive the old Track A/B briefs ·
whether the 20′ D7 squeeze gets its own `RPS Defects.md` entry · whether to log the Sesi 08
correction (20% → 25%, written paper → POC) as its own defect.

Resume point when this file is read next: item 1 of the draft is written and reviewed; items 2–6
were still titled placeholders (pipeline idempotency, one live-FAIL test, one decision-changing
query, one 12-field metric + how it can be gamed, what is NOT answered).

## Reusable framing the user responded to

Brainstorm was requested, so it was delivered as a **table of candidate outcomes** (run-it POC,
decision POC, schema-as-answer, metric POC, query-pack, full-chain dossier) with *strong for /
risk* columns and one recommended option — then the three blocking questions (team? dataset?
replace or add?). That shape (options table → recommendation → the 2–3 questions) is what moved
this session forward; the user answered all three in one line.
