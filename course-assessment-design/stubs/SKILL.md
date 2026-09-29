---
name: course-assessment-design
description: Use when authoring UTS/UAS briefs, DoD checklists, rubrics, the prodi naskah soal, or the RISE Tugas text students read.
---

# course-assessment-design

**Use when** a Cakrawala course needs a graded artifact designed or revised: UTS/UAS briefs,
DoD checklists, rubrics, the student-facing naskah soal a course submits to its prodi for
approval, the RISE Tugas text students read, or a generation-and-defence assessment (build in a
slot, defend live). Sibling skill to `cakrawala` (this same context) — the router's UTS/UAS
on-ramp merges onto this skill.

**Not for:** building decks/naskah/materi (→ `rps-deck`), writing the RPS itself, grading, or
publishing to the RISE portal (→ `rise-ops`).

## The shape, in order

0. **Recon before writing a line.** The course folder holds 3–5 planning docs that contradict
   each other; the newest by mtime usually wins, but read it end to end and report the doc map
   (which is authoritative, what numbers disagree) rather than silently picking one.
1. **Pin one outcome sentence** — what "done" means for the student, as a change in the world.
   Every deliverable, DoD line, and rubric row must trace back to it; cut what doesn't.
2. **DoD must be checkable in the room in under a minute** — something the instructor does live
   (re-run and diff, force a test to fail, read a definition aloud), not a written claim. A
   design-only assessment (no build, no run) needs a design-only variant of this check.
3. **Fit the real slot**, not the session note's fiction — see the course's own `CONTEXT.md` for
   the real minutes. Cut the assessment shape before cutting the deadline; add a signed in-room
   scope cut when time is the real risk.
4. **Author in the register the user dictates** — one item at a time, fully, with placeholders
   for the rest; draft under `(Draft)` and stop at the review gate; Indonesian official register
   for student-facing text; anchor each item to the sessions that taught it.
5. **Verify every number against the approved RPS row**, clause by clause, as a table in the
   draft (`yang dipakai draft` / `bunyi RPS` / status) — weight, format, CPMK range, in-session
   rule, tooling rule, scope cut. A session note that disagrees with the RPS is itself a defect;
   name the correction, never quietly follow the note.
6. **One ruling is a multi-document edit.** The brief, the session note, the mapping doc, the
   boilerplate, and `RPS Defects.md` all repeat the same numbers — sweep all of them the same
   session, then `grep -rn` for retired words until there are zero hits.

Prodi approval (a pasted exam sheet) is a trigger, not an endpoint — it becomes a vault file
verbatim, and the same-session sweep (stamp `status: final`, lock the weight, rewrite the
session note, sync Course Overview, queue the publish runbook) follows immediately. Full worked
mechanics, four courses' worth of rulings, and the publish-day API calls:
`references/prodi-uts-submission.md` and `references/cakrawala-uts-publish-runbook.md`.

Session-level Tugas (not a mini-UTS — a guided menu of named failures, one perform-and-capture
item, shipped with a reference zip or repo, never an open question): `references/session-tugas-patterns.md`.

## Pitfalls worth reading before you start

Rubric drift, a promised-but-unbuilt dataset, a "build week" that didn't happen as planned, a
brief that outlives a scaffolding decision the user just declined, group state drifting between
documents and the live RISE portal, a regroup proposal computed before anyone asked for one —
all logged with the ruling that fixed them in the dated references below. Read the reference for
the course/topic closest to your task before re-deriving any of this from scratch.

## Files

- `references/prodi-uts-submission.md` — the prodi UTS submission: announcement mechanics, the
  prodi ↔ course ↔ slot map, and what each draft's internal-notes block carries.
- `references/cakrawala-uts-publish-runbook.md` — the publish-day recipe after ACC prodi:
  template rendering, RISE publish order, verification GETs.
- `references/cakrawala-bi-uts-decision-poc.md` — worked example: BI's "Decision POC" UTS, the
  topic × team data slices, and the Sesi 01–07 → POC mapping.
- `references/cakrawala-bi-uts-design-checkpoint-2026-09-19.md` — the design-only ruling: DoD
  changes, design items, the signature-block timing, seed inventory, defects.
- `references/cakrawala-bi-uts-prd-2026-09-26.md` — BI's second prodi-paste run: rubric-split
  ruling, intentional-overflow timeline, AI-rule scoping.
- `references/cakrawala-bi-regroup-2026-09-26.md` — regrouping teams by last-4-sesi attendance,
  plus the same-day take-home pivot (group tugas via `create-with-groups`).
- `references/cakrawala-sdlc-uts-prd-2026-09-25.md` — SDLC's PRD UTS end to end: prodi paste →
  verbatim naskah, ACC-day sweep, presentation-slot arithmetic, anti-duplicate topic rule.
- `references/cakrawala-wad-uts-prd-2026-09-26.md` — WAD's group-build+defense UTS: mid-draft
  paste recovery, sheet-beats-draft numbering, live-state vs document-claim gaps.
- `references/cakrawala-uts-status-2026-09-22.md` — three-course UTS readiness check and the
  precondition-checking framework it used.
- `references/indonesian-public-dataset-sourcing.md` — which Indonesian public-data sources
  actually answer to a script, and the freeze-as-committed-CSV pattern.
- `references/session-tugas-patterns.md` — how to author a per-sesi Tugas students can actually
  answer, and how to reconstruct one retrospectively from submissions.
- `templates/assessment-brief.md` — brief skeleton (outcome, timeline, items, DoD, rubric).
- `templates/prd-student-template.md` — copy-paste-ready student PRD template.
- `scripts/probe-dataset-sources.py` — re-runnable dataset-source probe; run before naming a
  dataset in a brief.
- `scripts/dump-dom.sh` — dump a local HTML file's DOM after scripts run, to verify an
  interactive teaching artifact before publishing it.
