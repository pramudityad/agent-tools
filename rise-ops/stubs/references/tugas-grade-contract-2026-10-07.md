# tugas grade — contract change 2026-10-07

`PUT /v1/task/{id}/user/{uid}/review` returns 405 now (GET still works). Actual write:
`PUT /v1/task-log/{task_log_id}/score` with `{score, lecturer_feedback}`; `task_log_id` comes from
the review GET. Only submitted students have one — non-submitters can't be graded via API.

Batch pattern: GET review → skip if `is_graded` or no log id → PUT task-log score → re-GET after
~25s asserting `is_graded===true && score===expected`. Already implemented in `ops.mjs` (`tugas grade`).

See also `uts-practical-grading.md` for the UTS group-repo grading recipe.
