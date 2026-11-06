# 0007 — The grading flow: ledger, recap, and what stays manual

**Status:** accepted · 2026-10-18

## Context

Grading happens in pieces that work: `tugas review` and `tugas grade` post to
`PUT /v1/task-log/{id}/score` (163 successful posts, 12–17 Oct), and batches have run as the
agent looping the single-student verb. What is missing is the flow around them: where draft
scores live before they are posted, how a final recap is produced for SEVIMA, and which of
those steps the tool owns versus the lecturer owns.

Grilled decisions 1–14 settled each of these; this ADR is the written record (the
`/grill-with-docs` step left no artifact of its own).

## Decision

**Fetch → draft → approve → post → recap**, with no new batch verb:

- **The agent loops the existing `tugas grade` verb.** No `grade --from`. The ledger's
  `posted` column makes the loop resumable and `audit.jsonl` already records each write.
- **RISE is the score of record**, not the ledger. Every Tugas, the UTS and the UAS are
  RISE tasks with a per-student score (ADR 0006 made task-level scores writable; this ADR
  makes them the record). The ledger is only a working draft for scores not yet posted.
- **The ledger** lives at `~/.config/cakrawala/grades/<CLASS>-<assessment>.csv` — flat,
  following the existing `WAD-UTS.csv`. Nothing in the vault (ADR 0006). Required columns
  `nim,nama,user_data_id,score,feedback,posted`; rubric-criteria or group/factor columns sit
  between them, free-form.
- **The agent drafts, the lecturer approves.** Per-criterion scores and feedback (in
  Indonesian) are drafted against the rubric or the `Kunci Tugas` answer key. Uncertain
  cases get `?`; suspected AI-generated or copied work gets `flag:`. Nothing posts without
  the lecturer's approval. Group-to-individual scoring (the BI factor formula) is worked out
  in the ledger by the agent from that course's RPS rule — also lecturer-approved, also
  skill instruction, not code. "Artefak tidak bisa dijelaskan = 0" is applied by the
  lecturer after the defense; the agent never decides it.
- **`rise-ops recap <class>`** is read-only and reads RISE live: the existing
  `review --all` scores plus the existing `attendanceHistory()`/`attendancePercent()`. No
  local ledger is read, so nothing can drift. Task categories come from sesi and title:
  sesi 8 → UTS, sesi 16 → UAS, a title containing "kelompok" → Tugas Kelompok, everything
  else → Tugas Individu. The mapping is printed first so it can be checked. Tugas averages
  count a missing submission as 0.
- **Weights are the constant 25/25/20/20/10** (UTS / UAS / tugas individu / tugas kelompok
  / kehadiran), which all three RPS share. A per-class override is only added if an RPS
  changes.
- **RPS caps are flagged, never applied** in a `catatan` column: attendance below 75%
  (blocks UAS), susulan max 80, remediation max 60, UAS below 50.
- **SEVIMA stays manual** (ADR 0001 amended, not replaced): recap writes
  `~/.config/cakrawala/grades/<CLASS>-recap.csv` and prints a table; the lecturer types it
  into SEVIMA by hand. Nilai akhir is still out of scope.

## Consequences

- No new batch code to trust with writes: the write path is the already-proven `grade`
  verb, and the recap cannot mutate anything.
- The recap is only as good as RISE is: an ungraded task shows as 0 in the average, which
  is why the mapping table and per-category columns print before the final column.
- Score csvs move out of the vault to `~/.config/cakrawala/grades/` once the recap matches
  what RISE carries; git history still holds the old copies, which is accepted.
- No orch recipe and no new skill: the grading flow is documented in the rise-ops
  `stubs/SKILL.md` and routed from the `cakrawala` skill.
