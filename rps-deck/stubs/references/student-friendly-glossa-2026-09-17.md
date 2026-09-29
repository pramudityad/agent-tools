# Student-friendly glosa — first-use parenthetical (2026-09-17)

SDLC Meet 2 = Sesi 3 (Agile) + Sesi 4 (Requirements) — student year-1 needs Indonesian gloss on first dense term without adding slides or DUR.

## Pattern
- Insert muted parenthetical in the first `<h2>`/LEAD where term appears:
  ```html
  <h2>Term <span style="font-size:.58em;color:#5a6675;font-weight:400">(Indonesian)</span> — rest</h2>
  ```
- Also patch table/card `FINE` line where the term is defined for inline visibility.
- No new slide, no DUR change — glosa is inline, `check` stays 21/22 slides clock-consistent.

## Canonical set (validated)

### Sesi 03 — Agile Frameworks (21 slides, 18:30–20:00)
| Slide | Term | Glosa |
|-------|------|-------|
| s14 | Definition of Done | (kriteria selesai bersama) |
| s16 h2 | Kanban | (papan alir — batasi pekerjaan berjalan) |
| s16 card | WIP limit | (batas pekerjaan berjalan) |
| s16 table | Throughput | (laju selesai) |
| s21 | fishbowl | (1 tim di tengah, lainnya observasi) |

### Sesi 04 — Requirements (22 slides, 20:00–21:30)
| Slide | Term | Glosa |
|-------|------|-------|
| s02 fine | stakeholder + elicitation + claims register | (pemangku kepentingan) / (penggalian kebutuhan) / (daftar klaim + status bukti) |
| s08 | stakeholder | (pemangku kepentingan) |
| s10 | Elicitation techniques | (penggalian kebutuhan) |
| s17 | Measured / documented / assumed | (sudah diukur / tertulis / asumsi) |
| s20 | MoSCoW | (prioritas Must/Should/Could/Won't) |
| s21 | Scope creep + change control | (scope merayap) + (kendali perubahan) |

## Tool pitfall — HTML patch persistence
- `hermes_tools write_file` runs syntax checks and can silently leave `Sesi NN - Slides.html` unchanged (reported "written" but `ls -l` timestamp + `grep` shows miss). Seen 2026-09-17: 5× S03 + 7× S04 patches appeared written (50K) but `grep kriteria` = 0, size unchanged.
- Fix: use `python3 -c "pathlib.Path(p).write_text(t)"` via `terminal` for HTML/CSS patches, then verify with `grep -n "pemangku\|kriteria" Sesi*.html`.
- After any HTML edit, re-print PDF: `chromium.launch() → page.goto(pathToFileURL) → page.pdf({printBackground:true, margin:0})` → verify `pdfinfo` pages = slides+1 and `ls -lh` 1–2 MB.

## Verification
```sh
grep -n "kriteria selesai\|papan alir\|pemangku" "Sesi 03 - Slides.html" "Sesi 04 - Slides.html"
python3 -c "import re; t=open('Sesi 03 - Slides.html').read(); print(len(re.findall(r'id=\"s\\d+\"',t)))" # 21
pdfinfo "Sesi 03 - Slides.pdf" | grep Pages  # 22 = 21+1
pdfinfo "Sesi 04 - Slides.pdf" | grep Pages  # 23 = 22+1
```
