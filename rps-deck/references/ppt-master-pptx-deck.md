# ppt-master PPTX deck pipeline (field-tested, WAD Sesi 09)

A `Sesi NN` deck produced through the ppt-master SVG→PPTX pipeline instead of the
hand-built `Slides.html`+`.pdf`. Deliverables: `exports/<project>_native_charts_tables.pptx`
+ `.pdf`. Everything below was hit for real; don't re-derive it.

## Runner and commands

- ALWAYS run ppt-master scripts with `~/.agent-tools/ppt-master/.venv/bin/python` from
  `~/.agent-tools/ppt-master/`. System `python3` is 3.9 and dies on `type | type` syntax
  with a confusing import traceback.
- Checker takes the project path POSITIONALLY — there is no `--project` flag:
  `.venv/bin/python skills/ppt-master/scripts/svg_quality_checker.py projects/<proj> --stage final`
- Export refuses to run unless the quality report on disk is FRESH **and** was produced
  with `--canonical-authoring`. Before every export:

```sh
.venv/bin/python skills/ppt-master/scripts/svg_quality_checker.py projects/<proj> --canonical-authoring --stage final --json
.venv/bin/python skills/ppt-master/scripts/svg_to_pptx.py projects/<proj> --native-charts-and-tables
soffice --headless --convert-to pdf exports/<pptx> --outdir exports/   # PDF preview
```

- After editing any chart/table metadata OR its visible fallback:
  `.venv/bin/python skills/ppt-master/scripts/stamp_native_fallbacks.py --write projects/<proj>/svg_output`
  (takes the svg_output dir, not the project root). The stamp hash covers only the visible
  fallback, so metadata-only edits don't change it — but the checker still re-reads metadata,
  so re-run the gate either way.

## Quality-gate gotchas

- "Font-size 44 undeclared" that persists after patching spec_lock = STALE REPORT on disk.
  Re-run the checker before debugging anything.
- Checker overflow hints give px/char and chars-that-fit — trust them; font-size cuts of
  2–5px or a two-line tspan reflow fix almost everything. `data-pptx-bounds` may be SHRUNK
  to avoid an image panel overlap (checker errors on module-bounds overlaps too).
- Warnings tagged `(blocks --native-charts-and-tables)` are advisory in the gate but fatal
  to the native export. Clear them if native was requested.
- Noncanonical-style warnings from `--canonical-authoring` are advisory and do NOT block
  export; leave the explicit form rather than running compact_svg_styles and re-stamping.

## Native table parity (semantic-table.v2)

- `row_heights` is a TOP-LEVEL field (not under `style`) and its count must equal
  header_rows + body rows exactly.
- First-column text color must match the fallback exactly — put the real color
  (e.g. `#8B949E`) on the header `columns[0].color` AND every body row's first cell.
- `style.header_fill` + `style.header_text` must be present when the fallback draws a
  header band.

## Native chart parity

- `categories` strings must match the fallback's visible category labels character-for-
  character (`Before (N+1)` ≠ `Before · N+1`).
- Any fallback text that is not a category/data-label/axis label needs a payload companion
  (`caption` / `note`). LibreOffice/PowerPoint renders the companion as an editable text
  box near its fallback position — keep it SHORT and place the fallback copy where it
  cannot hit axis labels or category labels (bottom-left of the chart group worked;
  top-center collided with the 200 tick AND the first category label).
- Always spot-check the rendered PDF pages with `pdftoppm -png` + vision after export:
  the checker validates SVG geometry, not how LibreOffice lays out the native chart's
  internal labels. Chart-internal collisions are invisible to the gate.
