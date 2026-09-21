# 0006 — Fetching and grading tugas submissions

**Status:** accepted · 2026-09-20

## Context

`tugas rm` already reads `/v1/task/{id}/submissions` to check who has handed work in, but
the tool had no way to see *what* a student submitted or record a score for it. Grading
meant opening RISE in a browser, per student, per file — no `todo` visibility, no local
record of what was downloaded or graded.

Two live (read-only) GETs against a real task confirmed the shapes to build against:

- `GET /v1/task/{id}/submissions?page=1&page_size=N` — one row per roster student
  (`user_data_id`, `user_name`, `user_nim`, `submit_date`, `score`, `is_graded`,
  `submission_status`), same "whole roster" shape `tugas rm` already relies on.
- `GET /v1/task/{id}/user/{userDataId}/review` — **the URL's second UUID is `user_data_id`
  from the submissions list, not `user_id`.** Returns the task, `list_files` (each
  `{original_name, file_url, file_size}` — a presigned S3 URL, ~15 min TTL, no RISE auth
  needed), `student_note`, `lecturer_feedback`, `score`/`is_graded`/`graded_at`.

There is no documented write endpoint. Probing one live means either grading a real
student's real submission for real, or guessing — there's no side-effect-free way to test a
write against production student data. The task description also allows a Google Docs link
as an alternative to a file upload; no sample submission used one, so the field it lands in
is unknown.

## Decision

**`review` and `grade` are separate verbs**, not one verb with a mode-switching flag.
`review` only ever reads (list submissions, download one). `grade` is the only verb that
writes. This means the exact same command shape can never accidentally mutate a grade —
copy-pasting a `review` command with an extra flag does nothing destructive, because there
is no flag that turns it into a write.

**The grade write is a best-guess**, not a verified contract: `PUT /v1/task/{id}/user/{userDataId}/review`
with body `{score, lecturer_feedback}`, inferred from the GET response's own field names and
the existing `PUT /v1/task/{id}` update convention used by `tugas publish`. The tool's
existing `http_error` path already surfaces the portal's real error message on a non-2xx
response, so a wrong guess is a one-line fix, not a silent failure or a corrupted write —
RISE will reject a malformed request rather than accept and mangle it. The first real
`tugas grade` call is its own verification.

**Score is required, feedback is optional.** Score is the number that has to be
right — never inferred from a downloaded file's content, matching the tool's "never
inferred" write semantic elsewhere. Feedback defaults to empty rather than being forced,
because requiring a comment on every grade adds friction to quick grading passes; the field
exists to be filled in when it matters, not on every call.

**`grade` refuses to overwrite an already-graded submission unless `--force`** — same guard
`tugas rm` uses for a task with submissions, because there is no RISE-side undo for a score,
only the audit log's `prior` value.

**File reading is delegated to the calling agent, not done inside `ops.mjs`.** `review`
downloads files and writes a `_review.json` dump of the full raw response; it does not parse
docx/pdf content. The calling agent reads the folder with the `Read` tool (native PDF
support) and the existing `nutrient-document-processing` skill for docx. Adding a parsing
dependency to a zero-dep single-file tool would duplicate capability that already exists one
layer up.

**A `.zip` submission is auto-extracted one level** into a `contents/` subfolder via the
system `unzip` (already on macOS — no new dependency). Not recursive: a submission nested
more than one zip deep is rare enough to open by hand if it ever comes up.

**The Google-Docs-link case falls back to the raw JSON dump**, not a guessed field name.
`_review.json` is written unconditionally, so whatever field actually carries a link is
visible without the tool having to know its name in advance.

**Downloaded submissions never land in the vault.** They go to
`~/.config/cakrawala/submissions/<task-id>/<nim>-<name-slug>/` — the same reasoning as
`REGISTER_DIR` (CONTEXT.md "Register"): the vault auto-commits to a remote, and student
submission files are not something that belongs in git history.

## Consequences

- A malformed grade write surfaces as a normal `http_error` with the portal's message, not a
  crash — expected to need one correction after the first real call, not zero.
- `original_name` (a student-controlled upload filename) is sanitized to a safe basename
  before use in a filesystem path — it is untrusted input used to construct a path.
- If a future submission arrives via Google Docs link, its exact field is still unknown until
  one is actually observed; `_review.json` is the safety net until then.
- No new error codes — `grade`'s overwrite guard and score-range check both use `bad_input`,
  consistent with the existing contract.
