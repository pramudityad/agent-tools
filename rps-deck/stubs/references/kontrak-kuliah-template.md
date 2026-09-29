# Kontrak Kuliah — contoh extraction (2026-09-06)

Source: `02-Projects/Cakrawala/kontrakKuliah - contoh.docx` (3.7 MB, DWM CIK4101, Genap 2025/2026, Drestanto Muhammad Dyasputro) — copied from `~/Downloads/kontrakKuliah - contoh.docx` via `cp`.

## Extracted structure

1. **Header table** — Program Studi | Mata Kuliah | Kode MK | Dosen Pengampu | Semester | Tahun Akademik | SKS | Prasyarat (Ya/Tidak + MK Prasyarat/Semester: Database Systems / 2)
2. **Manfaat Mata Kuliah** — one paragraph linking DWH to career paths (SE, Data Engineering, System Analyst)
3. **Deskripsi Mata Kuliah** — (1) Dimensional Modeling, (2) Layer DWH (source, staging, DWH core, Data Mart, BI), (3) Data Mining
4. **Standar Kompetensi** — single outcome sentence referencing capaian pembelajaran
5. **Bobot Penilaian** — Kehadiran syarat lulus 80% + UTS 20% (Langsung, individu) + UAS 35% (Take home, individu) + Tugas Kecil 10% (individu) + Tugas Besar 35% (kelompok) = 100%
6. **Ranking Nilai** — 10-row table: A 85-100 (4) | A- 80-84.99 (3.7) | B+ 75-79.99 (3.3) | B 70-74.99 (3.0) | B- 65-69.99 (2.7) | C+ 60-64.99 (2.3) | C 55-59.99 (2.0) | C- 50-54.99 (1.7) | D 40-49.99 (1.0) | E 0-39.99 (0)
7. **Tata Tertib Perkuliahan** — 9 clauses: Kehadiran (tepat waktu, 80%, aksi=hadir) | Etika Perkuliahan | Penggunaan Perangkat Elektronik (laptop/tablet OK, ponsel non-akademik dilarang, rekaman tanpa izin dilarang) | Tugas dan Ujian (penalti keterlambatan, ujian susulan bukti) | Partisipasi Aktif | Kode Etik Akademik (plagiat) | Pakaian | Kesehatan dan Keselamatan | Perubahan Jadwal (info H-7)
8. **Signature block** — Jakarta, 10 Maret 2026 — Dosen Pengampu | Perwakilan Mahasiswa | Mengetahui Ka. Prodi (Drestanto Muhammad Dyasputro)

## Field map for Cakrawala per-course generation

| Contoh field | Cakrawala replacement source |
|---|---|
| Program Studi: Ilmu Komputer | Sains Data (BI/WAD) or Ilmu Komputer (SDLC) — per `README.md` |
| MK: Data Warehousing and Mining | Business Intelligence Systems / Web Application Development / Software Development Life Cycle |
| Kode MK: CIK4101 | Per official RPS (WAD official blank; BI draft SDA2161 unverified — ask prodi) |
| Semester: Genap | Per RPS |
| TA: 2025/2026 | Confirm (e.g. Ganjil 2026/2027) |
| SKS: 3 | Per RPS SKS split (Teori 3 Praktikum 0) |
| Prasyarat: Database Systems / 2 | Per RPS prerequisite (WAD: Web Client Development) |
| Bobot: 20/35/10/35 | **Do not reuse** — use RPS bobot: WAD 25/25/20/20/10, BI official 30/30/30/10, etc. RPS wins. |
| Tata Tertib | Replace with Cakrawala constraints: 0-10 recap only, no homework, 105/120-min slot, absence normal + catch-up block, mixed-role groups — see `CONTEXT.md` |

## Docx handling notes

- Copy with `cp` to preserve zip structure; never reconstruct via `write_file`.
- Inspect with `scripts/docx_read.py` from the `docx` skill (`--text`, `--structure`, `--styles`, `--revisions`) before editing.
- Template extraction: create `Kontrak Kuliah - TEMPLATE.docx` with `{{prodi}}`, `{{mk}}`, `{{kode}}`, `{{dosen}}`, `{{semester}}`, `{{ta}}`, `{{sks}}`, `{{prasyarat}}` tokens, then fill via `docx_template.py` per course.
