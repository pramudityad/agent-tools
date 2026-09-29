# Kontrak Kuliah — value-only docx editing (2026-09-06)

Pattern used when user says "prohibited to change format and grade nilai, only change value".
Source session: copying `kontrakKuliah - contoh.docx` (71 paras, 3 tables, Arial 12pt, podomoro styles) into per-course `Kontrak Kuliah.docx` for BI/WAD/SDLC.

## Constraints
- Keep paragraph count, table count, row/col merges, font name/size/color, alignment.
- Grade table (Table 1: A 85-100 .. E 0-39.99) = untouched.
- 5 Bobot lines stay 5 lines — renaming labels (e.g. "Tugas Kecil" → "Kuis Sesi") is a value change, adding a 6th row is a format change → fishy, ask first.
- 9 Tata Tertib subsections stay 9 — embed new rules (90% online, AI Log, token, SLA, kamera opsional) inside existing paragraph text rather than adding new headings.

## Helper
```python
import docx
def set_para_text(para, new_text):
    if not para.runs:
        para.add_run(new_text)
        return
    first = para.runs[0]
    for r in para.runs[1:]:
        r.text = ""
    first.text = new_text  # inherits first run's formatting
```

## Header table (Table 0) — merged duplicates
`python-docx` reports 7 cols where Word shows 3–4 due to merges. Update all mirrors:
- R0 Prodi: C2,C3,C4,C5,C6
- R1 MK: C2,C3 ; Kode: C4="Kode MK", C5=":", C6=kode
- R2 Dosen: C2-C6
- R3 Semester: C2,C3 ; Tahun: C4="Tahun Akademik", C5=":", C6=TA
- R4 SKS: C2-C6
- R5 Prasyarat: C2="Ya / Tidak ", C3-C6 = 3 paras ("MK Prasyarat/Semester:", value, "– ")
Keep `c.width` and `vertical_alignment` untouched.

## Body paragraph indices (src docx)
- 1 = Manfaat heading, 2 = Manfaat body, 3 = Deskripsi heading, 4 = Deskripsi body, 5 = Kompetensi heading, 6 = Kompetensi body
- 7 = Bobot heading, 8..12 = Kehadiran/UTS/UAS/Tugas Kecil/Tugas Besar (5 lines)
- 20 = Tata Tertib heading (bold), 21 = Kehadiran:, 22 = Kehadiran body 1, 23 = Kehadiran body 2 (aksi=hadir), 26 = Etika:, 27 = Etika body 1 (inject sapaan fleksibel here), 28 = Etika body 2, 30 = Perangkat:, 31..33 = Perangkat bodies (slot, ponsel, rekaman), 36 = Tugas dan Ujian:, 37..39 = Tugas bodies, 42 = Partisipasi Aktif:, 43..44 = Partisipasi bodies, 47 = Kode Etik:, 48..49 = Kode bodies, 52 = Pakaian:, 53 = Pakaian body, 55 = Kesehatan:, 56..57 = Kesehatan bodies, 60 = Perubahan Jadwal:, 61 = Jadwal body
- Table 2 cell 0 holds signature paras: "Jakarta, 10 Maret 2026" + "Ka. Prodi ..." + "(Drestanto ...)"

## Verification after save
```python
d = docx.Document(path)
assert len(d.paragraphs) == 71 and len(d.tables) == 3
assert d.tables[1].rows[2].cells[1].text.strip() == "85 - 100"
print([d.paragraphs[8+i].text[:60] for i in range(5)])
```

## Fishy consult list
1. Bobot 5→6 rows or label rename beyond value? Ask.
2. Sapaan Pak/Mas/Kak as new paragraph vs inject? Ask (now injected into para 27).
3. Full 10-butir Ketentuan as new section vs embedded summary? Ask — new section = format change.
4. Slot time in header table vs in Kehadiran paragraph? Now in paragraph to avoid table structure edit.
