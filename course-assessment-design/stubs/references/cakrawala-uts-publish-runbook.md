# Cakrawala UTS publish runbook — after ACC prodi

Worked end to end twice on 2026-09-26: SDLC PRD UTS and the BI Design Checkpoint announcement.
The review gate has already opened; this is the execution order, the exact commands, and the
RISE API traps.

## Class ids for direct-API calls

`rise-ops` aliases are `WAD` / `SDLC` / `BI` (BI's RISE class is "BsIn2", code SDA2161 — there
is no "BIS" alias). For posts that bypass the CLI, take `lecture_class_id` from
`~/.config/cakrawala/cache.json` (top-level keys per alias, each carrying `id`/`name`/`code`),
not from guessing the dashboard URL.

## 0. Render the student template (if the UTS ships one)

Vault template is markdown; RISE attaches files, not text. Produce DOCX + PDF:

1. Strip frontmatter and internal `>` blockquotes from the md; convert `[petunjuk]` inline
   placeholders to italic HTML; inline-bold to `<b>`.
2. Wrap in minimal HTML with print CSS (Helvetica 11pt, `h2` with bottom border).
3. Convert with LibreOffice — note the filter quirks:
   - DOCX: `soffice --headless --convert-to 'docx:MS Word 2007 XML' --infilter="HTML (StarWriter)"`
     (a plain `--convert-to docx` fails: *no export filter*).
   - PDF: `--convert-to pdf` works directly from the same HTML.
4. Keep both files next to the template md in the course folder; only the PDF goes up (the
   CLI uploads one attachment), mention the DOCX by name in the tugas body.

## 1. Publish the tugas first

`rise-ops tugas publish SDLC 8` — the announcement and template reference its exact title and
deadline, so it must exist first. Returns the task id; note it.

## 2. Upload the template to Materi — the Naskah prerequisite

`rise-ops material` reads `Sesi NN - Naskah.md` for defaults and **fails `no_naskah` even when
`--title`/`--description` are given**. If the real session design lives elsewhere, write a
minimal logistics Naskah (`slot-minutes`, `topic`, `title-materi`, `sub`, `status: approved`,
a pointer to the full planning doc) — accurately summarizing a session that will run is fine;
fabricating content for `acara` is not.

Then `rise-ops material SDLC 8 "Template … .pdf"` (title/description from the Naskah's
`title-materi`/`sub`). Verify via `GET /v1/dosen/lecture-class/{class_id}/material-sessions?limit=50`
— the generic learning-material listing does **not** show it.

## 3. Post the announcement — the discussion HTML trap

`rise-ops discussion post` escapes ALL HTML through `descriptionHtml()`; pre-rendered HTML comes
back as literal `&lt;h3&gt;…` text in the portal. For a formatted announcement (group/topic table,
headings):

1. Render the announcement md → clean HTML (drop frontmatter, the H1, internal blockquotes, and
   everything under the dosen-notes heading; convert tables, lists, bold).
2. `POST /v1/class-discussion/posts` JSON `{lecture_class_id, title, description_html}` → 201.
3. Mistake? `DELETE /v1/class-discussion/posts/{id}` → 200, gone.
4. Both bypass the tool's audit — append a manual entry to `~/.config/cakrawala/audit.jsonl`
   with the deleted and new ids.

List endpoint nests at `.data.data` (not `.data`, not `.data.posts`).

## 4. Verify — twice, ~20 s apart, asserting on fields

| What | How |
| :---- | :---- |
| tugas | `GET /v1/task/{id}` — title, due, `description` contains tenggat + template title, no `&gt;` |
| material | material-sessions endpoint above — title under the right sesi, `file_ext: pdf` |
| announcement | discussion list → find by id — `description_html` has no *structural* escapes, table count correct, key strings present (group names, camera rule, refusal clause) |

Immediate GETs are not proof; the earlier WAD case had a GET show new text and a later GET
return the old. Two spaced reads, field assertions only.

**A `no escaped html` check that asserts `!desc.includes('&lt;')` false-positives on legitimate
content.** The BI announcement stores `<topik>_<slice>.duckdb` inside `<code>` — correctly
escaped to `&lt;topik&gt;`, so the naive assertion fails on a perfectly rendered post (it did,
2026-09-26). Assert on structure instead: no escaped *heading/paragraph* tags
(`!desc.includes('&lt;h')` and `!desc.includes('&lt;p')`), correct `<table>` count, and the key
content strings present.

## 5. Close the loop in the vault

Stamp the announcement file `status: published` with the three ids (tugas / material /
announcement), and leave the one non-blocking risk line (e.g. attendance backlog may still
re-cut the groups) in the rollout checklist.