# Spec format

The spec stays readable in Obsidian; the grammar below is what `check` enforces.

## Frontmatter

```yaml
---
course: Business Intelligence Systems
session: 1
topic: Pengantar BI & Sistem Pendukung Keputusan
slot-start: "18:15"      # required for the clock check
slot-minutes: 105        # required; the last slide must land inside it
mandate: 30-40           # optional; skipped when deck-type is logistics
deck-type: teaching      # teaching | logistics
title-naskah: Naskah Pengampu Sesi 1
title-materi: Pengantar BI Sesi 1
---
```

## Slides

```
### SLIDE 22 · OLTP vs OLAP
**UNIT** — U4 · Mengapa butuh sistem terpisah
**VISUAL** — tabel 3 kolom, 5 baris. Baris terakhir diberi penanda.
**KONTEN**
| Aksis | OLTP | OLAP |
| :---- | :---- | :---- |
| Orientasi | row-store | column-store |
**HOLD**
**FLAG** butuh dua angka hasil pengukuran
**KONTEN-MAHASISWA**
TODO ditampilkan di kelas
**NOTES** `[min 037 · 18:52]` Kerjakan empat baris pertama dengan cepat.
```

`VISUAL`, `KONTEN` and `NOTES` are required — a slide missing one fails the parse with its
number and line rather than being dropped. `UNIT` opens a new section. `HOLD` marks a slide
that stays on screen during a work block. `FLAG` declares something unresolved.
`KONTEN-MAHASISWA` replaces `KONTEN` in the materi only.

The `[min NNN · HH:MM]` stamp is required in `NOTES`. `check` recomputes every clock from
`slot-start + min` and errors on any disagreement — the drift it exists to catch was 15
minutes wide and sat unnoticed in the source note.

## Markers

A marker is **a word plus a space, applied to the segment it starts**. Segments are
`|`-delimited inside tables and panels; otherwise the segment is the whole line.

| Marker | Placement | Renders |
| :---- | :---- | :---- |
| `LEAD:` | line | the large opening line |
| `FINE:` | line or segment | small footnote text |
| `SPLIT:` | line, then indented `PANEL` lines | side-by-side comparison panels |
| `PANEL` | indented under `SPLIT:` | one panel; `\|`-separated segments follow |
| `NUM` | segment | large figure |
| `LABEL` | segment | panel eyebrow |
| `STRUCK:` | line, before a list | crossed-out list |
| `VEIL` | segment | covered cell — predict-then-reveal |
| `TODO` | segment | unmeasured placeholder chip; pair with `FLAG` |
| `HI` | segment | accent span |
| `MARK` | a table cell of its own | emphasises that row |

Plain Markdown carries the rest: tables, bullet and numbered lists, `**bold**`, `*italic*`,
`` `code` ``, `~~strikethrough~~`.

`NUM`, `LABEL`, `FINE`, `VEIL`, `TODO` and `HI` also apply mid-segment, running to the end
of it — `Jumlah baris: TODO UKUR SEBELUM KELAS` is how that content actually reads. Use the
braced form to bound a marker to one word when the sentence continues after it:
`secara HI{reliably} (andal) dan HI{repeatedly} (berulang)`.

The cost of mid-segment markers is a false positive if prose genuinely contains one of those
six words followed by a space. None occur in Indonesian teaching prose, but if you hit one,
brace the real marker or rephrase.

A line-leading ALL-CAPS word that is not in the table above fails the parse. That is
deliberate — the alternative is a typo rendering as literal text on a classroom screen. If
the prose genuinely starts with an acronym and a colon, lowercase it or rephrase.
