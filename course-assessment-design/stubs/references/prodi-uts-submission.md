# Prodi UTS submission (Cakrawala) — worked detail

Session: 2026-09-22. Prompt was a pasted prodi announcement + *"siapkan untuk project cakrawala"*.
Announcement: upload the **draft UTS to the prodi Drive folder before sharing it with students**,
one folder per prodi, deadline that Friday (2026-09-25). User rulings same session: all three
courses, **student-facing sheet only**, and *"check if we already have naskah prepared?"*.

## Prodi ↔ course ↔ identity map

Source of truth = each course's `Kontrak Kuliah.md` frontmatter (plus `The Build - Project Brief.md`
for WAD, which carries the code the Kontrak leaves blank).

| Course | Kode | Prodi | Smt | SKS | Real slot |
| :---- | :---- | :---- | :--: | :--: | :---- |
| Business Intelligence Systems | SDA2161 | **Sains Data** | 5 | 3 | 18:15–20:00 (105) |
| Web Application Development | CIK3101 (Kontrak: `-`) | **Sains Data** | 3 | 3 | 20:00–22:00 (120) |
| Software Development Life Cycle | IK103 | **Ilmu Komputer** | 1 | 2 | 2 sesi/meet 18:30–21:30 (180); `Sesi 08` declares 20:00–21:30 (90) |

So **two** prodi folders matter: Sains Data gets BI + WAD, Ilmu Komputer gets SDLC. Lecturer
`Damar Arba Pramuditya` / `damararba.pramuditya@cakrawala.ac.id` — recoverable from any
`Sesi NN - Tugas.md` submission instructions or `RPS Evaluation 2026-08-30.md`.

## RPS Sesi-8 rows, quoted (the numbers the sheet must obey)

- **BI:** `| 8 | 25% | … | UTS (80 menit dalam sesi) + scope cut wajib (D7) | Ujian tertulis/praktik dalam sesi, dilanjut role-play negosiasi lingkup |`
- **WAD:** `| 8 | 25% | Evaluasi capaian paruh pertama semester | UTS — ujian praktik individual | Ujian praktik dalam sesi (buka repositori sendiri) |`
- **SDLC:** `| 8 | 25% | … | UTS | Ujian tertulis/praktik & peer review |`

All three RPS revisions use the institutional scheme UAS 25 · **UTS 25** · Tugas Individu 20 ·
Tugas Kelompok 20 · Kehadiran 10. "Praktik" in the BI and WAD rows is the licence for a
practical/design format instead of a written paper.

## What existed vs what was authored

| Course | Source that held the content | Sheet produced |
| :---- | :---- | :---- |
| BI | `UTS - Design Checkpoint.md` (v1 `berlaku` 2026-09-19) + `Forms Cetak - UTS Design Checkpoint.pdf` + `Pengumuman RISE …md` | **extract** — 180 lines, items 1–6 + DoD + rubric 50/20/15/15 |
| WAD | `Sesi 08 - UTS Practical Coding Exam.md` (English plan, 150-min fiction, B1–B6 / F1–F5 / Q1–Q5 = 100) | **new** — translated, refit to 120 min |
| SDLC | `Sesi 08 - UTS and Proposal Review.md` (English plan, Part A/B/C = 100 in 70 min) | **new** — translated, Part C scenario written from scratch |

`find . -iname "*naskah*"` → only `Sesi 01–05` (BI, WAD) and `Sesi 01–04` (SDLC). No `Sesi 08`
naskah had ever existed; the git-history sweep (`git log --all --pretty=format: --name-only | sort -u
| grep -iE 'uts|ujian|soal'`) confirms nothing was deleted either.

## Decisions each draft carries in its `## Catatan internal` block

**WAD** — build window cut 115 → **95 min** to fit the real 120-min slot (revision 15 → 10, setup
7 → 5, never the requirements). **F3 (search + debounce, 8 marks) is the first cut candidate** if the
room is still tight — left as the lecturer's call, not applied. Open: SAC policy on AI assistants
during exams, and whether a 10-minute revision block counts as examination time (both flagged as
ASSUMPTIONs in `Sesi 08`; these are the ones that block publication, not the paper itself).
**Missing to run it:** the exam starter repo (FastAPI + seeded dataset + Vite/Vue skeleton + README)
and the second differently-scenarioed version.

**SDLC** — RPS gives Sesi 8 = 90 min but the plan needs 150, i.e. the UTS borrows the whole Meet 4
and leaves no room for Sesi 7 (UML behaviour) in that meet. Three options written into the draft:
**(a)** whole meet 18:30–21:30 with ~30 min spare (recommended), **(b)** 90 min = revision 15 +
paper 70 + closing 5, pushing the proposal review and the scope decision into the Sesi 9 lab, or
**(c)** shorten the paper to 50 min. Option (b) is the one to avoid: it moves the load-bearing
artifact (signed scope decision) out of UTS night. Also recorded: `Sesi 08` says UTS 20% — RPS says
**25%**, the note needs correcting. **Missing to run it:** per-item answer key + rubric, printed
10-point checklist and scope-statement form, and the Meet 4 date (absent from the vault).

**BI** — kept 25%, 80-min design, 105-min slot. The submission doubles as the vehicle for the two
confirmations that block the student announcement: the practical/design format versus the old RPS
baseline (*"take-home project, duration 1 week"*, RPS Defects B4), and the D7 signature block having
only 20 min for 9 teams. **Missing to run it:** Sesi 6–7 materials, repo + seed in students' hands,
print 9 sets of D7 + checklist.

## Sequence that worked

1. Per-course `ls -lt` + git-history sweep → proof the paper never existed (cheap, and it is what the
   user then asked for anyway).
2. Read the three `Sesi 08` notes end-to-end, BI's brief, each `Kontrak Kuliah.md`, and the Sesi-8
   row of each RPS revision.
3. One `clarify` with three questions (which courses / deliverable shape / upload path). The user
   answered Q1–Q2 and replaced Q3 with the inventory question — so keep the inventory *inside* the
   report that precedes the questions, not as a follow-up.
4. Author the three sheets, print absolute paths, wait for review. No PDF, no upload.

## Session: 2026-09-25 — SDLC sheet replaced by the lecturer's own pasted text (three days later)

The 2026-09-22 SDLC draft (70-min written paper, Part C clinic scenario written from scratch)
did not survive contact with the user's actual prodi submission: on 2026-09-25 the user pasted
**the lecturer's own final sheet** — a PRD-writing individual UTS (3 topics × kelompok, ten
mandatory PRD sections, rubric 15 oral / 20 scope / 25 requirements / 20 use case / 20 reference
= 100) with a `Catatan internal untuk dosen` block still inside. Lessons that generalize:

- **A pasted dosen sheet is a ruling, not raw material.** Write it to the vault *verbatim* as
  `UTS - Naskah Soal (Draft).md` (this legitimately overwrote the 2026-09-22 draft — the old file
  was already marked superseded), keep every wording choice including the ones that contradict
  internal docs, and put the contradictions in the `## Catatan internal (jangan ikut dicetak)`
  block as numbered items. Never silently merge the pasted text with the vault's version.
- **Expect the pasted sheet to drift from internal docs in three recurring places** — put each in
  the internal block instead of fixing it: (1) identity tokens (this sheet carried a *new* class
  code `20261/IKR2149/SDLC3` vs `IK103` in every vault doc — ask which one RISE/prodi uses before
  rendering); (2) format options dropped or added (pasted sheet said "Google Docs" only; internal
  naskah + RISE pengumuman said "Google Docs or Markdown"); (3) constraints the sheet states as
  round numbers ("3 sampai 4 orang") that the kelompok doc already violates out of necessity
  (one group of 5 because 17 <75% students isn't a multiple of 4).
- **The sheet's own internal note is the open-items list.** The pasted text still contained
  *("tentukan durasi presentasi per mahasiswa; urutan: bergantian dalam kelompok atau terjadwal
  terpisah")* — i.e. the durasi/urutan decision was still live inside the official text. Cross-
  link it to `UTS - Rollout Checklist.md`'s "Belum diputuskan" section rather than duplicating
  the list; the checklist remains the single place the dosen works the queue.
- **Format drift propagates**: the Google-Docs-only change means `UTS - Tugas PRD.md` and
  `Pengumuman RISE - UTS PRD.md` ("Google Docs atau Markdown") now disagree with the official
  sheet — flag for the doc sweep (SKILL.md Step 6) the moment the user confirms which is right.

Keep the report tight: this user reads the draft files, not process narration, and answers menus
faster than prose questions.
