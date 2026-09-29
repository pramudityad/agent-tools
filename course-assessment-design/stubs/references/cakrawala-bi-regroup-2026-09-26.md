# BI regroup + re-slice — 2026-09-26 (after both prodi sheets landed)

User dissolved BI's 9 two-to-three-person teams and rebuilt them as **6 groups of 4–5**, based on
**attendance over the last 4 sesi (S3–S6)**, then assigned a topic/slice per group and posted it.
This is the third shape of BI's group structure in one semester (theme-free briefs → 9 slices →
6 groups), and the sequence that worked is reusable for any course.

## The working sequence

1. **Read attendance per-student for exactly the requested window** from
   `~/.config/cakrawala/registers/<COURSE>-kehadiran.md` (regenerate with `rise-ops register`
   if stale). Parse the S-columns, count HADIR, sort descending. State the floor caveat (28 marks
   still missing in BI) once — the user already ruled numbers are used as-is.
2. **Respect the group-size constraint arithmetic.** BI: 25 students, user said "4 people in each
   kelompok" — 25 = 6×4 + 1, so six groups with **one group of 5** is the honest fit. Say which
   group got the extra and why (BI: the group with the weakest attendance mix, so the strongest
   anchors spread evenly across the other five). An explicit remainder beats an invented rule.
3. **Snake-draft from the sorted list** so every group gets a mix of anchors (4/4 attendees) and
   at-risk students — never cluster all low-attendance students into one group.
4. **Write to RISE via `PUT /v1/class-group/class/{class_id}/replace-all`** (complete table;
   resolve NIM → `user_data_id` from `/state`'s existing `groups[].members`, since all students
   were already grouped — the `unassigned` list was empty and useless here). `max_member` per
   group; leader is positional (first id). Verify by reading `/state` back: groups, counts,
   `unassigned: 0`, and note `is_visible_to_student` — BI's was already `true`, so the new groups
   were **student-visible immediately** (the skill's "draft means hidden" assumption does not
   hold after a pure API replace-all).
5. **Assign slices per group with difficulty↔strength matching** and write the reasoning down:
   hardest slice (no-rain k3, wind-only signal) → a group with a strong anchor; easiest
   (k1, rain+wind both live) → the weakest group; smallest-scope slice (k9, −20%) → the group
   that otherwise had the thinnest margin. Reuse slices that already have seed + fallback in the
   starter repo; parked slices (k2/k6/k7) stay in the zip as resit stock. Cross-check the
   per-slice pitfall list in `Starter Repo - Setup Lab.md` (e.g. k3/k6 zero-rain → `is_siaga`
   must use wind) when choosing.
6. **Post the group+topic table to the class discussion** (direct API with clean HTML — the
   `descriptionHtml()` escape issue), including per-group profiling commands and the
   slice-specific data warning. Verify with two GETs ~20 s apart.
7. **Audit-log by hand** (replace-all and discussion posts are not rise-ops commands) and **update
   the vault**: rewrite `Penetapan Topik dan Slice per Tim.md` (frontmatter `replaces:` the old
   grouping; the mapping table; profiling commands; the assignment logic; what changed elsewhere).

## Cascade — a group-count change breaks printed artifacts

The old print pack assumed 9 teams: `Forms Cetak - UTS Design Checkpoint.pdf` page 3 confirms
"9 tim K1–K9", and the defense round plan (5 ronde of paired teams) died with it. After any
regroup, sweep: printed forms, the defense-round arithmetic in the UTS brief, and the rollback
note that unused fallback `.duckdb` files become resit stock. Flag these to the user — they
re-render/print, the agent patches the vault docs.

The actual sweep that landed: form PDF page 3 re-rendered via headless Chromium
(`--print-to-pdf` on the existing `Forms Cetak …html`, then assert new rows present / old rows
absent) — and while inside it, a stale "kriteria penilaian pertama (50%)" (pre-D13 RPS rubric)
was caught and corrected to 30%. Defense became **3 ronde × 2 kelompok (±30 min/ronde, ±6–7
min/member)**; session plan minutes moved to 10–110 defense + 110–120 close (intentional
overflow into Sesi 9). Grading sheets: one per group (6), not per old team (9) —
`Forms Cetak - Lembar Nilai UTS Defense.pdf` carries the 30/15/15/40 rubric and a per-member
"bagian yang ditunjuk dosen" table.

## Announcement trim — names stay in RISE, not in the post

The group+topic post v1 carried the full member-name table. User: *"tidak butuh ini, refer ke
link kelompok saja"*. RISE's Groups tab already renders the canonical roster; the post only
needs group → topic/slice → `--slice` code → per-group profiling command, plus the direct
Groups URL. When the platform already renders a canonical list somewhere, **link it — don't
mirror it**; duplicated personal data in an announcement is a removal, not an addition. The
vault keeps the member composition (with attendance bands) as a dosen note.

## Take-home pivot (same day, user ruling: "uts take home, sesi 8 cuma defence")

Confirmed by clarify: **full take-home** — design work happens at home, anytime before Sesi 8,
no in-class work sessions at all (which also removes the need to author the next session's
teaching set: "uts gak perlu sesi 7" = use what exists + the starter repo). Sesi 8 = defense
only. The pivot rewrote the announcement wholesale (patching the old body left stale framing —
"malam ini kalian mendesain", "dikerjakan di dalam sesi" — which the user returned as "kenapa
kata2nya spt ini?" / "not align with me"; **after a mode pivot, rewrite, don't patch**).

What the pivot changed, concretely:

- **Submission**: one PDF (design doc + pre-filled D7) uploaded to a RISE **group tugas** + all
  work committed to the team repo (commit "UTS") — repo is where the document lives, the PDF is
  the reading snapshot. Both before Sesi 8.
- **Group tugas**: `rise-ops tugas publish` refuses group type. POST
  `/v1/task/create-with-groups` directly — plain task fields (class_id, schedules_id,
  schedules_session, title, type:"group", plain-text description, start_date, end_date,
  on_close, submit_attempt, max_file_size) **plus** `groups:[{title, max_member,
  member_user_data_ids}]` from `/state`. Returns 201 + task id + roster. (Verified
  2026-09-26, task `33c3ca78`.)
- **checkpoint advisory**: `checkpoint.py verify --sesi 8` is a recommended self-check, *"bukan
  syarat nilai"* — user ruling, not inherited from the repo's docstring.
- **D7 pre-filled by the team at home**; lecturer strikes through + signs after the defense —
  not negotiated in the room.
- **Rules split by phase** in the announcement: while working (all sources open, AI allowed,
  profiling allowed; load/tests/dashboard forbidden) vs defense night (camera ON wajib, AI +
  internet banned, no repo edits after deadline, absent-without-notice loses the 40% defense
  component and the lecturer may refuse the resit).
- RISE's calendar for BI Sesi 8 shows 2026-10-02 while the real class is 2026-09-30 — every
  student-facing string states 30 Sep explicitly; don't trust the platform date.
- Cookie expired mid-session (401 on a previously-working call): the user pasted the raw cookie
  value in chat; write it to `~/.config/cakrawala/session` (single line) and retry — no
  re-login needed.

## Verification probes that caught real bugs

- A post-check reported `no escaped html: false` — the `&lt;` was inside
  `<code>&lt;topik&gt;_&lt;slice&gt;</code>`: a correct escape of a literal filename pattern,
  not a mangled post. Check **where** the escape occurs before declaring failure.
- A tugas probe for "Camera ON" failed while the live text used "WAJIB OPEN CAMERA" — assert on
  exact authored strings, and when a probe fails, print the surrounding context before
  concluding anything.
