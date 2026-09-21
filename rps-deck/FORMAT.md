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
**DUR** 4
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

## Time: DUR owns the clock

`**DUR** <minutes>` declares how long a slide gets. `restamp` then computes every
`[min NNN · HH:MM]` from `slot-start` plus the cumulative total, and fails when
`Σ DUR ≠ slot-minutes`, naming the shortfall.

```sh
node deck.mjs restamp "Sesi 02 - Naskah.md"
  ✓ 27 slides · Σ DUR 105 = slot · stamps rewritten
```

Durations are local judgement and easy to write; stamps are arithmetic and were the single
biggest authoring cost before this existed. `DUR 0` is legitimate — two slides shown inside
the same minute.

Either every slide declares `DUR` or none do; a half-timed deck is an error. A naskah
without `DUR` keeps hand-authored `[min NNN · HH:MM]` stamps in `NOTES`, and `check`
verifies them against `slot-start + min` — the drift it exists to catch was 15 minutes wide
and sat unnoticed in the source note.

The naskah's cut table stays prose for the reader. `DUR` is the only machine-readable
budget, so there is no second copy to drift.

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

## Lab HOLD — Contoh (delayed example, not a marker)

Every lab that produces an artifact uses `**HOLD**` to keep the task slide on screen.
After ~5 minutes of pair work, overlay a worked example — never at start. This gives a
scaffold without spoon-feeding the first attempt and rescues latecomers.

In `**KONTEN**`, after `FINE:` add a plain prose line (not a marker — lowercase `Contoh`):

```md
FINE:
- Minimal dua baris: saat ini diputuskan dari intuisi atau spreadsheet
Contoh NusaPay — tampilkan setelah 5 menit lab, jangan di awal:
| # | Keputusan | Siapa (peran) | Frekuensi | Data hari ini | Data seharusnya | Tipe | Catatan |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | ... | Head of Ops (shift malam) | Jam-an | Grup WA | `transactions` per `biller_code` | Operasional | Intuisi |
| 2 | **⭕ DILINGKARI — ...** | Product Ops Lead | Mingguan | Spreadsheet | Agregasi `transactions` JOIN `fulfillments` | Taktis | Akan jadi D1 |
```

Shape: 5 rows, 1 circled (`⭕ DILINGKARI — ` → next artifact), ≥2 rows intuition/spreadsheet,
`Siapa` = named role not department. For non-BI labs swap rows only (Sesi 02: 8 questions,
Sesi 03: 1 fact + 2 dims + grain sentence, Sesi 04-05: 6-rule checklist). In `**NOTES**`
add: `Setelah 5 menit, proyeksikan Contoh di atas sebagai referensi — jangan di awal.`
Full per-course instantiations: `references/lab-example-pattern.md`.

Do **not** write `CONTOH` in ALL-CAPS at line start — that trips `unknown marker CONTOH`.
Write `Contoh —` (capital C only).

## Gotchas that fail `check`

Each of these has cost a real authoring session.

- **Every field on its own line.** Bullets that look like content under `**VISUAL**` but
  belong under `**KONTEN**` make VISUAL swallow them, and KONTEN goes missing — reported as
  *"slide N has no **KONTEN**"*. `VISUAL` is a directive phrase; `KONTEN` is what the room
  reads.
- **No bold line-starts inside KONTEN.** A line beginning `**Something**` parses as a field
  and fails as unknown. Drafting debris — stray `**NOTES-AUX**`, duplicated `**NOTES**` —
  fails the same way. Before running `check`, scan for `^\*\*` lines that are not real
  fields. Mixed-case bold *inside* a sentence is safe; only line-starts trip it.
- **The stamp is `slot-start + min`, with no off-by-one.** For `slot-start: "18:15"`,
  minute 1 is `18:16`, not `18:15`. Let `restamp` do it and the question never arises.
- **Write the file with a heredoc.** Content carrying literal `\n` escapes (JSON-encoded
  strings pasted through a write tool) lands as backslash-n rather than newlines, and
  `check` reports *0 slides* while `grep "### SLIDE"` shows many. Symptom and cause look
  unrelated.
- **Use absolute paths.** A shell's working directory persists between calls; relative
  paths in a later write resolve somewhere you did not intend.

A line-leading ALL-CAPS word that is not in the table above fails the parse. That is
deliberate — the alternative is a typo rendering as literal text on a classroom screen. If
the prose genuinely starts with an acronym and a colon, lowercase it or rephrase.
