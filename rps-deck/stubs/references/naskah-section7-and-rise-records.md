# Naskah §7 → the RISE berita acara — interface and preview recipes

A naskah is not only a deck: §7 becomes an official record on RISE. Validated 2026-09-18 on BI
Sesi 04 (`rise-ops acara BI 4`). The rise-ops side of these rules is documented in the
`rise-ops` skill, which is user-owned and currently not curator-adoptable; this file keeps the
authoring-side facts where the naskah is written.

## What reads §7, and exactly how

`~/.agent-tools/rise-ops/ops.mjs` → `buildAcara(naskahText)`:

1. requires frontmatter `status: approved` (the hash is not re-checked — a stale approval passes,
   so re-approve anyway);
2. derives `material_plans` as `topic (CPMK) · Slot N menit (start-end) · Menit <a> <beat> …
   Artefak: <artifact>`;
3. derives `material_realizations` as *"Terlaksana sesuai rencana. "* + the same plan text
   (ADR 0002 — it records the sesi as having run to plan; the tool never asks what happened);
4. takes the beats from `parseSegments(body)`: §7 only, every line split on `|`, rows with ≥4
   cells whose **second** cell starts with a digit, using cell 2 as the text.

Consequences for authoring:

- **One table in §7.** Nothing tells the parser which table is the delivery plan (BI Sesi 04:
  adding a second table produced 19 segments instead of 10, with beats like *"Menit 64–99 Slide
  19 (HOLD) · frame F2–F5"*). Move adjunct tables (tools per segment, fallbacks) into §9.x.
- **Plain text in the cells that become beats.** `**bold**` markers are copied into the record;
  name the RPS materi topics in that column, since that text is what a reviewer reads.
- **The §7 beats are capped by nothing** — a 12-row §7 becomes a 12-beat paragraph in an
  official record. Keep the segment table to the real delivery segments.
- **Insert new sections after §8, not inside the six steps.** Adding §9 (delivery) and §10
  (references) shifted §0's "serahkan §1 sampai §9" instruction; re-point the range, and never
  hand §9+ to the slide-generation agent (it is pengampu-only, and one §9 table in §7's slot is
  exactly the failure above).

## Preview the exact text before it reaches a record

`ops.mjs` ends with an `invokedDirectly` guard, so its pure half can be imported without running
the CLI (note: the field is `realizations`, with a `z`):

```js
// /tmp/acara-preview.mjs — no side effects, prints exactly what would be PUT to RISE
import { readFileSync } from 'node:fs';
import { buildAcara, parseSegments } from '/Users/<user>/.agent-tools/rise-ops/ops.mjs';
const txt = readFileSync('/…/Business Intelligence Systems/Sesi 04 - Naskah.md', 'utf8');
const body = txt.split(/^---\s*$/m).slice(2).join('---');
console.log(parseSegments(body).map((s) => s.menit).join(' | '));  // count the beats first
const a = buildAcara(txt);
console.log(a.plans, '\n\n', a.realizations);
```

Delete the temp script afterwards. Then read back what RISE stored, with the same headers the tool
sends (`x-client-app: rise`, `origin`/`referer` `https://rise.cakrawala.ac.id`, `cookie:
`cakrawala_session_siakad=<token from ~/.config/cakrawala/session>`):

```sh
GET https://api-pmb.cakrawala.ac.id/api/v1/lecture-schedule/<schedules_id>/edlink
```

BI Sesi 04: plans 1143 chars, realizations 1170 chars. The CLI prints 110 characters of each —
enough to prove the head, nothing about the tail.

## Two things to check before running `acara`, and one to report after

- **`rise-ops brief <class> --sesi N` first.** RISE marks a sesi `SELESAI` by itself when the
  booked block ends, so the sesi is often already closed and `--end` would POST pointlessly. The
  open item is the empty berita acara; write it without `--end` and say plainly that nothing
  needed closing.
- **The write overwrites whatever is in the fields.** `~/.config/cakrawala/audit.jsonl` records
  `prior`: BI Sesi 04 replaced the placeholder `etl` in both columns. An empty field and a
  placeholder are different states — report which one you replaced.
- **A retrospective tugas cannot be back-dated.** RISE stamps the start date at publish time and
  only the deadline is authored, so tasks for earlier sesi appear to students as opened today.
  Say that out loud when backfilling rather than letting the dates imply otherwise.
