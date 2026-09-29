# Excalidraw diagrams for a session — framed scene, generated not hand-drawn

Triggered by "can u draw this using excalidraw? so I can present better to student". Validated
2026-09-18: BI Sesi 04, `04-Extras/Excalidraw/Sesi 04 - ETL Architecture.excalidraw` — 6 frames,
141 elements, 117 KB, generator kept at
`02-Projects/Cakrawala/Business Intelligence Systems/tools/excalidraw_sesi04.py`
(`python3 excalidraw_sesi04.py` rewrites the scene; `--check` validates without writing).

**A third generator exists — BI Sesi 05 (2026-09-20):**
`tools/excalidraw_sesi05.py` → `04-Extras/Excalidraw/Sesi 05 - Kualitas Data dan Test.excalidraw`,
6 frames / 75 elements / 70 KB. Frames: dua jenis monitoring · temuan nyata per topik → calon test ·
test sebagai kode (YAML + keluaran `run_tests.py` asli) · blocking vs warning · reconciliation ·
alur lab 35 menit. It imports the Sesi 04 kit (`_base, box, arrow, frame, label, validate, mono,
rows` pattern) exactly like the lab generator, so rebuild all three after touching helpers.

## What to deliver

A scene whose **frames** are the presentation units — one frame per slide-claim, named
`F1 · Peta sesi 105 menit`, `F2 · ETL vs ELT`, … so the deck and the diagram have the same
skeleton. Frames also give the user something to pan/zoom through live. Labels must reuse the
deck's own table and column names (`source_orders`, `raw_orders`, `fact_revenue`) so that when
the demo script runs in the terminal, the projected diagram is already the map of it.

## Vault format facts (checked against plugin 2.25.3 on 2026-09-18)

- Vault convention is `04-Extras/Excalidraw/<name>.excalidraw.md`, but the plugin **saves**
  those with a ```` ```compressed-json ```` block (lz-string) and a `excalidraw-plugin: parsed|raw`
  text mode — not writable by hand.
- The loader accepts the plain form: `DRAWING_REG_FALLBACK` in `main.js` is
  `/\n##? Drawing\n(```json\n)?(.*)(```)?(%%)?/gm`, and `isCompressedMD` only branches on
  `compressed-json`. So a `## Drawing` section with a plain ```json block is readable.
- **Simplest safe choice: write a plain `.excalidraw` file** — the standard Excalidraw scene JSON
  (`{type, version: 2, source, elements, appState, files}`). No text-mode round trip, no
  compression, unambiguous, and the vault already contains legacy `.excalidraw` files.
- Plugin 2.25.3 bundles `syncInvalidIndices`, so elements without the newer `index` field are
  repaired on load — do not hand-invent indices.
- **There is no slideshow command in this plugin version.** `grep -c "slide show\|presentation"
  main.js` → 0; only `toggleFrameRendering` exists (hide the frame borders while presenting).
  Say so plainly instead of promising a frame-by-frame clicker; offer PNG/SVG export per frame
  if they want the diagrams inside the slide deck.

## Generator pattern (`templates/excalidraw-scene-generator.py`)

Hand-writing element JSON for 100+ elements is where this goes wrong; build helpers instead:

- `box(id, x, y, label, w, h, fill)` → rectangle plus a text element with
  `containerId = rect.id`, listed in the rectangle's `boundElements`. The text is then centred
  and moves with the shape, and the labels wrap through a small `_wrap()` width estimate.
- `arrow(id, x1, y1, x2, y2, bind_start, bind_end)` → `points: [[0,0],[dx,dy]]`, `endArrowhead:
  "arrow"`, plus `startBinding`/`endBinding` with `{elementId, focus: 0, gap: 6}`.
- `label(...)` for free-standing text (titles, `FINE:`-style footnotes in `#5a6675`).
- `frame(id, name, x, y, w, h)` — and the trick that makes the layout workable: **each builder
  writes local coordinates** and `scene()` adds the frame's (x, y) to every child plus sets
  `frameId`. Moving one frame then never disturbs its contents.

Colour vocabulary that matches the course decks: navy `#0f2a44` text, teal `#0e6e6e` stroke,
soft fills `#dcefed` / `#fdf3e3` / `#e6f2ea` / `#fbeae9`, muted `#5a6675` for footnotes, red for
the broken path, green for the safe path, dashed grey for "not retained".

## Validation battery (run it before handing over)

The generator's `validate()` + `--check` asserts, and each one caught something real:

1. ids unique across the whole scene;
2. every arrow `startBinding`/`endBinding` target exists;
3. every text `containerId` and every `boundElements` entry exists;
4. **every child of a frame sits inside that frame's rectangle** — the first attempt shipped
   8 elements hanging outside frame 1;
5. the file re-parses as JSON after writing.

**6. Add an overlap check — `validate()` does not catch collisions (2026-09-20).** Hand-written `y`
coordinates are the real hazard: a 26–28 px title that wraps to two lines grows ~65 px tall and eats
into the 40 px gap you *thought* you left. Cheap check, per frame, over text/rect elements only
(skip frames, skip arrow, skip a rect and its own `id + "-t"` text child), flag any pair whose
bboxes intersect by more than ~4 px on both axes. It found 6 collisions across the two Sesi 05 /
repo scenes that the structural battery reported clean.

**The durable fix is `stack(x, y0, gap, items)`** — place elements vertically and let each next `y`
come from the *measured* height of the element before it (`len(lines) * size * 1.25` for prose,
`* 1.35` + padding for mono panels), not from a hand-typed constant. Every title-plus-panels frame
should use it; the wide/two-column frames can keep explicit coordinates.

**Obsidian rewrites the file if the user opens it.** After a scene is opened in the Excalidraw
plugin, the same file comes back with nanoid ids on some text elements and extra elements (a
75-element scene read back as 82). That is the plugin repairing ids on save, not corruption — but it
means: regenerate *before* the user opens it if you plan further edits, and expect a fresh generator
run to overwrite the plugin's version (same content, different ids).

## Layout pitfalls

- **Size each frame from its children's bbox, not from a guess.** Declared frame sizes shrink to
  `max(declared, bbox + 48px)` in `scene()` — a frame wider than its content is a frame that
  renders small on a projector when the room hits *fit to frame*. Validated 2026-09-20 on BI
  Sesi 05 (`tools/excalidraw_sesi05.py`, 6 frames / 75 elements / 70 KB): compute
  `bbox_w = max(el["x"] + el["width"] for el in kids) + PAD` for both axes before placing the
  frame, and keep `validate()`'s containment check as the guard.
- A 9-segment timeline frame is ~1600 px wide; a uniform grid gives it 1180 and the tail
  overflows. Give the wide frame its own full-width row and grid the rest (1260-wide frames at
  x = 0 / 1320, rows 780–840 tall) — cheaper than shrinking boxes until the labels wrap badly.
- Text that must stay readable when projected: 28 px for frame titles, 16 px body, 14 px inside
  small boxes. Terminal output and diagram labels should agree on vocabulary, not font size.
- Keep the visual/element count honest: 6 frames × 16–30 elements is a full session's
  architecture. Do not pad frames to look thorough.

## Second pass — when the user says "still not clear" (2026-09-18)

The first scene was judged unclear: *"Still not clear. Can we build excalidraw detailed? U can
ignore other slide. Focus on lab and explain concept and example."* Two things follow, and both
are the lesson:

1. **Scope down to one session part.** The second file covers the lab only — no timeline, no
   ETL-vs-ELT, nothing the other frames already said:
   `04-Extras/Excalidraw/Sesi 04 - Lab Idempotent Load.excalidraw` (101 elements, 6 frames,
   93 KB, 15 monospace panels), generator `tools/excalidraw_lab_sesi04.py`.
2. **Concrete beats schematic.** Labelled boxes ("Sumber → Transform → Warehouse") read as
   abstract; the same architecture with **the actual six rows**, the actual `MERGE`/`DELETE` SQL,
   and the actual `NULL → sk -1` path reads as instructions. If a diagram explains a procedure,
   put the real values in it.

Frame set that worked, in order: **F1** concept (three layers, the guard each needs, and the
`6 → 12 ✗` vs `6 → 6 ✓` tables side by side) · **F2** sources → six profiling queries with an
example result per query → `raw_orders` all-TEXT · **F3** `dim_customer` with `-1 Unknown`,
two rows for one customer, and an arrow to the *effective-date* version versus a dashed red arrow
to `is_current` · **F4** `fact_orders` + the two proving counts and the orphan-check SQL ·
**F5** the guard per layer as three SQL blocks, plus a red "yang TIDAK boleh" panel showing the
`insert … select *` that produces 6 → 12 · **F6** the six-step work order with file names, and
what the dosen does at each laptop.

### `mono()` — plain-text panels for data and SQL

A second helper on top of the box/arrow kit: a rectangle plus a **`fontFamily: 3`** text element
(monospace) carrying pre-joined text, with `rows(head, data)` producing column-aligned fake tables
(`"  ".join(cell.ljust(width))`). This is how the real rows and SQL get in without inventing one
element per cell. Sizing notes:

- The panel rectangle is sized from the **measured** text width, and the wrap factor differs by
  font: `len * size * 0.6` for monospace, `0.58` for Inter prose.
- `label()` must set the element width to the **measured** text width, not the wrap width. Setting
  it to the wrap width made three labels report as "outside frame bounds" — the validator caught
  what the eye could not.
- Watch id collisions between a `mono("s-raw", …)` panel and its own `-t` text child; a label
  named `s-raw-t` clashed with it. Namespace label ids differently from panel ids.

### Two generators, one helper module

The lab generator imports the first one (`from excalidraw_sesi04 import _base, box, arrow, frame,
label, validate, …`) and re-points the shared module-level frame prefix while it builds
(`kit._frame_prefix = fid`). Rebuild both after touching helpers; run each with `--check`.

## Honest disclosure

Structural validation is not visual verification. This session could not eyeball the render
(the configured vision model was unavailable), so the hand-off said exactly that: structure
proved, appearance not. Offer the export-to-image step if they need it checked or embedded.
