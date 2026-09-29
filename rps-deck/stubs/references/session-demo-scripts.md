# Session demo scripts — a runnable claim beats a narrated one

When a session's central idea is **behavioural** (idempotency, watermark trap, data-quality
tests), the thing that lands in a 6-minute slot is a script the instructor runs on the
projected laptop. Canonical: BI Sesi 04, 2026-09-18 — slide 9 was replaced by the user with
"simple demo" and the script below was built for it.

## Where the canonical one lives

`02-Projects/Cakrawala/Business Intelligence Systems/demo/sesi04-load-twice/load.py`
(+ `requirements.txt`). Four load strategies, each run twice, row counts printed side by side:

```sh
python3 load.py                 # all four strategies, ~5 s total
python3 load.py append          # one strategy, for a slow narration
python3 load.py --db demo.duckdb   # write a real file so `ls -lh` shows something on disk
```

Real output: `full refresh 6→6 ✓`, `append tanpa penjaga 6→12 ✗`, `upsert (MERGE) 6→6 ✓`,
`partition overwrite 6→6 ✓`, plus a summary table and the closing line *"run 2 = run 1. Itulah
syarat 6."* Maps to slide 9's four runs (`append` twice → partition twice) and slide 17's four
cards.

## Design rules that made it work in the room

- **One file, no data files, no network.** Source rows are a literal list in the script; six
  rows is deliberate so the numbers are readable from the back of the room.
- **Course tool only.** DuckDB, as the RPS media list says. Python module installs with
  `pip3 install duckdb` (validated 1.4.5); `MERGE INTO` works there. A missing module should
  print one friendly line (`duckdb belum terpasang — jalankan: pip3 install duckdb`) instead
  of a traceback, because the failure mode is standing in front of 26 people.
- **One failing strategy, on purpose.** `append` without a guard is the only ✗; the closing
  line names it (`inilah yang menggandakan laporan pukul 09:05`). Four green ticks teach
  nothing.
- **Accept the lab's own flag.** `--twice` is accepted (and optional) purely because
  `python -m pipeline.load --topic t1 --twice` is what students will type in the starter repo;
  same word, same idea, no new vocabulary.
- **Every strategy is one small function** (3–4 lines of SQL), so "mana SQL-nya?" can be
  answered by showing the file.
- **Keep run 1 and run 2 honest** — the same call both times. For `partition overwrite` the
  table is seeded first with the *previous* days' partition (printed as `tabel sebelum job: 3
  baris (partisi hari sebelumnya)`), so the pair reads 6 → 6 instead of 3 → 3 without faking a
  different job for run 1.
- **No measured numbers anywhere.** The only figures are the demo's own 6 and 12.

## Pitfall hit while building it

Filtering strategies by label fails when labels are multi-word: `load.py append` matched
nothing because the label is `append tanpa penjaga`. Match on prefix —
`label == arg or label.startswith(arg + " ")` — and print the short names in the error line
(`pilihan: full | append | upsert | partition`). A wrong flag during a live demo should cost
one line, not a traceback.

## Promotion path

The script is the seed of the lab starter's `pipeline/load.py --topic tX --twice`
(`Boilerplate Proyek Mahasiswa - Rencana Sesi 1-16.md` §2.1, verified by
`checkpoint.py verify --sesi 4`). When a session's lab is a pipeline, offer that promotion
rather than writing a second, differently-shaped script.

## Coverage question — expect to be audited (2026-09-18)

After the BI Sesi 04 demo was built the user asked *"are this cover ETL and ELT?"*. Answer it
by **checking the file** (`grep -c 'ETL\|ELT\|transform' load.py` → 0) and naming the split
plainly: the demo covers the **L** (four load strategies + run-twice), the **T** is slide 8 and
there it is only a table plus a `FINE` line. Never claim coverage an artifact does not have, and
do not pad the answer — name the gap, name which slide carries it, then offer the demo-able
missing half (below) as a yes/no.

## The ETL vs ELT half — built 2026-09-18 as `python3 load.py etl-vs-elt`

The user said yes to the offered half, so it lives in the same file as a second mode rather
than a sibling script (one command set to remember, one file to show when someone asks "mana
SQL-nya?"). Shape: same `source_orders`, two lanes printed one after the other.

- **The bug is a case typo, not a logic error.** Source writes `'REFUNDED'`; transform v1
  compares against `'refunded'`, so two refunds count as revenue. It passes code review, it is
  fixed by one `.replace()` you can show on screen, and "2 baris" is legible from the back row.
  `TRANSFORM_V1` is the template string; `TRANSFORM_V2 = TRANSFORM_V1.replace("= 'refunded'", "= 'REFUNDED'")`.
- **Evidence, not narration.** The ETL lane's "can't rebuild" step really attempts
  `CREATE OR REPLACE TABLE fact_revenue AS … FROM raw_orders` against a database where raw was
  never retained, so DuckDB raises `CatalogException: Table with name raw_orders does not exist!`
  and the script prints it. A demo that *asserts* the failure proves nothing; a demo where the
  engine refuses does. Prefer a real raised error over a printed sentence every time.
- **Both lanes fail identically first** (`2 baris refund dihitung sebagai pendapatan`), then
  diverge only on the repair — that is the whole argument, and it is why the closing comparison
  table has a `bangun ulang histori` column rather than a verdict column.
- **The ELT lane proves idempotency too:** the corrected transform runs twice more and still
  reports 0 wrong rows, tying slide 8 back to slide 9's run-twice test.
- **Keep the balance line.** ETL is not wrong — it is correct when raw may not be retained
  (PII, data residency); what you buy is that a wrong transform becomes unrecoverable. Slide 8
  makes that same concession, so the demo must not end on a smug note.
- **Regression-check the older mode after adding a mode.** Adding `status` to the source and a
  second dispatcher must leave the four-strategy output byte-identical apart from the new hint
  line (`ETL vs ELT: python3 load.py etl-vs-elt`) — verify by re-running `python3 load.py | tail`,
  not by assumption. Dispatch before the strategy filter, and teach the strategy filter to
  ignore the new mode's name so `pilihan:` still lists only real strategies.

## Extension to offer, not to build unasked

**Watermark trap** (slide 12's claim, otherwise only narrated): update one source row without
 touching its `updated_at`, then show the incremental load missing it — about ten lines in the
 same file. Offer it; do not add it to a demo the user asked to keep simple.

## Where the demo gets referenced

If the deck's notes should name the file and command, that is a **naskah edit**: it invalidates
`approved-sha256`, so it costs `restamp` → `check` → `render` → `approve` → `build --final` →
re-print of both `Sesi NN - Slides.pdf` and the deck PDFs. Offer the cost before doing it.
