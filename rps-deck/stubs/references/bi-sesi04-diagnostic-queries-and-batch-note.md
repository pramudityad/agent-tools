# BI Sesi 04 — two artifacts, 150→105 refit, lab 35 bukan 40

BI Sesi 04 (2026-09-18) is the second dual-artifact BI session and the first whose lab is a
**graded pipeline** (D3 idempotent load). Same 105-min slot as every other BI sesi.

## Artifacts

| # | Source (vault) | Sanitised dst | Sections kept |
|---|----------------|---------------|---------------|
| 1 | `02-Projects/Cloudeats/docs/CLOUDEATS_DOCS/request-type-cleanup-diagnostic-queries.md` (534 lines) | `artifacts/sesi04-profiling-queries-nusakitchen.md` (116 lines) | `--lines 1-115` of the raw extract = queries 1–6 + their `Look for:` lines; the per-environment results, migration SQL and summary tables are dropped |
| 2 | `02-Projects/Flip/airflow - unregister many device.md` (105 lines) | `artifacts/sesi04-unregister-batch-nusapay.md` (100 lines) | whole file minus frontmatter (Go snippet, input cap 1k, return lists, soft/hard delete, `IN` vs CTE comparison) |

## The two maps, and why they look odd

Artifact 1 renames the internal tables the note names — but **not** to the note's
`service_request*` names, because a map key may not be a substring of its own replacement
(the residual scan is a case-insensitive substring search, so `request` → `service_request`
flags itself). Values therefore sit on a different root:

```
custom_module_value → ref_value      request_type       → ticket_type
request            → service_ticket   request_count      → ticket_count
request_log        → service_log      request_display_id → ticket_display_id
requests/Requests  → tickets/Tickets  Request            → Ticket
```

The apply is **case-sensitive** while the scan is not — `request` does not rewrite `Request`,
so both spellings need keys. Frontmatter was dropped by line range, which is also what keeps
`#work/cloudeats` out.

Artifact 2 needs the PII sweep the note asks for: eight real `user_id`s → `U-0001…U-0008`,
the attachment embed `![[10482439_…csv]]` → a generic name, `alaflip` → `nusapay`,
`aladin` → `identity`, `Flip/flip` → `NusaPay/nusapay`.

## Refit shape (Σ DUR 105, 21 slides)

| Menit | Blok | Durasi |
| :---- | :---- | :---- |
| 0–7 | arrival + cek environment (satu `SELECT`) + kumpulkan D2 | 7 |
| 7–15 | hook 02:14 + predict-then-reveal + idempotency reveal | 8 |
| 15–27 | primer istilah 2 · ETL vs ELT 4 · **demo idempotensi 6** di laptop instruktur | 12 |
| 27–37 | jigsaw tiga sumber 4 · tujuh cara CSV 3 · watermark trap 3 | 10 |
| 37–46 | profiling enam query 4 · teardown artefak 1 5 | 9 |
| 46–50 | surrogate key pada effective date + anggota Unknown | 4 |
| 50–56 | istirahat (HOLD) | 6 |
| 56–64 | sort empat kartu + pertanyaan artefak 2 5 · brief enam syarat 3 | 8 |
| 64–99 | **lab HOLD 35** | 35 |
| 99–105 | klinik debug 4 · tutup 2 | 6 |

Boilerplate §3 gives Sesi 4 "varian lab berat: core 30 → lab 40 (52–92)". 105 minutes cannot
hold arrival 10 + hook 10 + three named methods + clinic + close *and* a 40-minute lab: the
honest number is **lab 35**, and the two dropped fast-finisher extensions (watermark trap,
Unknown member) move to the Sesi 5 opener. Logged as 🟡 D6 in `RPS Defects.md`.

Protect across the refit: the demo (user correction 2026-09-18 — the note's 6-minute fishbowl
was replaced by a live 4-run idempotency demo on the instructor's laptop, same duration so no
stamp moved; the ETL-vs-ELT PII judgement survives as a `FINE:` line on the ETL/ELT slide,
and the RPS names neither fishbowl nor demo as metode), the real-artifact teardown, and lab
syarat 6. Compress the primer/CDC/load-strategy blocks instead — CDC survives as three
strategies + the watermark trap, which is all the RPS materi line needs.

## Release with an open dependency (2026-09-18)

The starter repo for Sesi 4 was not ready on release day and the owner asked for the final build
anyway. What was done — reusable whenever a `FLAG` is a genuine but non-blocking prerequisite:
demote `**FLAG** …` to `FINE: …` so the warning still renders in the pengampu deck, move the
full prerequisite text into naskah §5.3 («Ketergantungan yang harus ada sebelum kelas») and the
register (🟡 D8), then re-approve and `build --final`. Also check what the demoted line says to
students: the materi deck prints `KONTEN` verbatim, so "belum dikonfirmasi terpasang" reads as
noise in the handout — reword it as student-facing reassurance ("disiapkan dosen; kalau belum
ada di mesinmu, pakai berkas DuckDB di channel kelas").

## Lab slide shape for a pipeline session

Per `references/lab-example-pattern.md`: 6-rule checklist table, rule 6 marked with the
**⭕ DILINGKARI** row, and a `Contoh` table whose cells carry **no numbers at all** — the
instructor must not put any team's row counts on screen. The Contoh column reads "bentuk
pengisian yang diharapkan" (what a filled-in rule looks like), not measured values.
