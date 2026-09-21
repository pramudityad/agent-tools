# 0005 — Tugas come from a file, not from the command line

**Status:** accepted · 2026-09-17

## Context

RISE carries tasks (`/v1/dosen/lecture-class/{id}/task-sessions`, `POST /v1/task/create`).
This tool had no task concept at all, so four graded tugas were posted by hand-rolled
scripts. Nothing in the tool knew they existed: `todo` could not see them, and no verb could
re-run or correct one.

That produced the exact failure this toolkit exists to prevent. The portal asserted four
homework tasks while all four Naskah asserted *"tidak ada pekerjaan rumah"*. Two records of
the same sesi disagreed, and neither was wrong by its own lights.

Two candidate sources for the task text:

- **Command-line flags.** Fast, but it makes the shell history the record. Every future
  posting is another chance for the portal and the vault to diverge.
- **A file in the vault.** The record is a file, the way ADR 0002 made the Naskah the source
  for berita acara.

The Naskah was the obvious home, and it is the wrong one. `deck.mjs` binds approval to
`approvalDigest` — a hash of the whole file minus the three approval lines. Adding a tugas
block changes that digest, so editing a task's wording would mark an approved Naskah
`stale` and force a re-review. Tugas text and slide content change on different schedules;
coupling them makes both expensive.

## Decision

One Tugas file per sesi: `Sesi NN - Tugas.md`, beside the Naskah.

- Flat frontmatter (`title`, `due`, `tugas-type`, `on-close`, `submit-attempt`,
  `max-file-size`) plus a body that is the task description verbatim.
- `rise-ops tugas publish <class> <sesi>` creates the task, or updates it when a task on
  that sesi carries the same title exactly (ADR 0004).
- `rise-ops tugas list` reads RISE against the files. `rise-ops tugas rm` deletes.
- No free text from the CLI. A missing file is `not_found`; a malformed one is `bad_input`.
- `due` is matched by ISO-8601 shape, never by `Date.parse`. `Date.parse("Sesi 5")` is
  2001-04-30 rather than NaN, so a typo would have been published as a deadline from 2001.

## Consequences

- The file is the only source, so the portal and the vault cannot drift. Posting a tugas the
  vault does not describe is now impossible without writing the file first.
- RISE refuses a `start_date` before today, so a sesi can only ever be *opened* now. Only
  `due` is authored; a retrospective tugas still cannot be back-dated.
- No new error codes — `not_found` and `bad_input` carry it, so the CLI contract is unmoved.
- `due` is not checked against the future. A past deadline reaches RISE and fails there as
  `http_error`. Checking locally would make `parseTugasFile` depend on the clock and turn its
  tests into a time bomb.
- **Group tugas are declared in the format but refused by `publish`** (exit `bad_input`,
  pointing at the RISE UI), because they need `create-with-groups` and a member list. The
  format mirrors RISE; the verb reports what the tool can actually do.
- **`rm` refuses while students have submitted** unless `--force`. `/v1/task/{id}/submissions`
  lists the whole roster — one row per student, submitted or not — so its `total_items` is the
  class size and never a submission count. `task_log_id` is the only field that means a
  student handed something in. Guarding on `total_items` would have refused every delete.
- `todo` is unchanged. Its stdout is contractual (see CONTRACT.md), and tasks are not
  attendance; `tugas list` answers the tugas question without reopening that contract.
