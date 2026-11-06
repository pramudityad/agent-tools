# UTS practical coding exam — grading recipe

For Cakrawala courses whose UTS is a code build submitted as a group repo URL (BI, WAD
both used this shape: FastAPI + frontend repo, rubric in the Tugas file, oral defense per
member). The vault's BI draft (`Draf Penilaian UTS BI - per Kelompok (pra-defense).md`)
is the format standard to match.

## 1. Twin tasks on one sesi

A group task and a personal task can share the same sesi. Compare them with raw
`GET /v1/task/{id}` per id, diff field-by-field excluding ids/timestamps — expected
differences are only `title`, `type` (`group` vs `personal`), and `description`. Any other
drift (dates, `on_close`, `submit_attempt`, `max_file_size`) is a defect.

- The task listing (`/v1/dosen/lecture-class/{class_id}/task-sessions`) double-wraps its
  payload: iterate `json["data"]["data"]["data"]`, each entry keyed by `schedule_id` with
  `session_number` and `tasks[]`.
- The CLI refuses group tasks on `publish` — edits to a group task go through raw
  `PUT /v1/task/{id}` using the GET's own field names (title, description, end_date, type,
  on_close, submit_attempt, max_file_size), and verify with a delayed GET, never the write
  output (see `verify-writes.md`).
- After any date change decided outside RISE, re-check the twin tasks' `end_date` and
  description — a reschedule written into the vault Tugas file does **not** propagate to
  RISE; the portal silently keeps the old deadline and old prose.

## 2. Collect every submission

Loop over `tugas review <class> <task-id>` output: the user-data-id is the LAST
whitespace-separated token of each student row; skip the trailing "N shown · M belum
mengumpulkan" footer line. Then `tugas review <class> <task-id> <user-data-id>` per id
downloads to `~/.config/cakrawala/submissions/<task-id>/<nim>-<name>/`.

## 3. Read what was actually submitted

- Per student, `_review.json` carries everything: repo URLs almost always ride in
  `student_note`, uploaded files in `list_files[]` (`original_name`, `file_url`). An empty
  note with no files is still a valid submission on a group task — one member uploads for
  all.
- On the individual task, a note pointing at a group repo means no individual work exists
  — list those students separately for the dosen to decide (chase repo vs grade from
  group contribution).
- Check the class-group `/state` endpoint (see `kelompok-endpoints.md`) before treating
  anyone as unassigned: students outside the working groups can sit in a group titled
  with a non-active marker, and that roster is the authoritative list to reconcile
  submissions against.

## 4. Repo audit (the standard)

1. Clone every group repo into `~/Code/Project/cakrawala-repo/<course>-k<N>`.
2. Static checks first, per the Tugas requirements: README has run instructions (grep for
   `uvicorn`/`npm run dev`), dataset file exists at the specified path with ≥ the minimum
   row count, `requirements.txt` present, CORS configured to the frontend origin, no file
   over the stated line limit (`find … | xargs wc -l`), commit history ≥ minimum.
3. Deadline check with the timezone filter: `TZ=Asia/Jakarta git log --format='%ci %an'`
   and compare against the exam start, not the RISE `end_date` — they disagreed once.
4. Per-member contribution: `git log --format='%an' | sort | uniq -c`. Author names
   routinely match neither RISE names nor each other (nicknames, noreply handles, two
   emails per student) — map via the leader's known account and commit-message patterns,
   mark every mapping as a guess, and confirm at the defense. Members with zero commits
   are the finding, not a parsing error.
5. Grade nothing from structure alone. Mark everything needing a live server (endpoint
   codes, runtime states, console errors) as `perlu run` and leave it open.

## 5. Draft file convention

`Draf Penilaian UTS <COURSE> - per Kelompok (pra-defense).md` in the course's vault
folder. Frontmatter: `type: grading-draft`, `sumber` (clone paths + submission source),
`jangan dibagikan ke mahasiswa: ya`. Body: ringkasan table (one row per group, static
check columns), then a section per group — member table (NIM, git author, commit count),
deliverable evidence per rubric block, and an explicit "keputusan dosen" list for every
rules-ambiguity found (late push, location deviation, empty repo). Close with langkah
lanjut: run repos → fill code marks → add defense scores → write to RISE only after the
dosen's go-ahead. Angka stay empty until steps 1–2 are actually done.
