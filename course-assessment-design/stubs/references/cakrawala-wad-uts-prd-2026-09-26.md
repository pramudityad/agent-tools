# WAD UTS prodi-paste — 2026-09-26 (third course, first mid-draft paste)

The WAD (Web Application Development, `CIK3101`, kelas `WAD09`, 31 students, slot 20:00–22:00
120 min) UTS naskah arrived as a chat paste while the agent was still editing `Sesi 08 - Tugas
(Draft).md`. Distinctive vs SDLC (PRD individual) and BI (design checkpoint + take-home): WAD is
**group build + all-member oral defense**, and the paste landed mid-workflow.

## Sheet shape (as pasted)

- `Kode Kelas: 20261/CIK3101/WAD09` — prodi header format, same as SDLC's.
- 65 code marks (B25 + F27 + Q13) + 35 defense marks = 100; UTS 25%.
- Nine requirements: B1–B5 backend (pagination+search, 404, POST w/ Pydantic in/out + 201,
  DELETE 204, CORS), F1–F4 frontend (mount/unmount, four states + retry, create form w/
  client+server validation, delete w/ confirm), Q1–Q5 quality (semantic HTML/labels, keyboard,
  clean console, ≤100-line files, ≥3 commits).
- Defense: every member defends one assigned requirement in breakout rooms (min 15–110,
  ~10 min × 8 groups); "cannot explain = 0 even if the code runs".
- Timeline: 0–10 revision block (unmarked) → 10–15 setup → 15–110 build+defense → 110–117
  push → 117–120 close.
- AI: "mengikuti kebijakan SAC" (left open in the sheet; RPS Ketentuan butir 6 already bans AI
  at UTS/UAS).
- Claims the **starter repo already contains** seeded dataset + FastAPI skeleton + Vite/Vue
  skeleton + README — contradicted by the user's same-day ruling "starter biarin kosong".

## What this third paste changed in the working pattern

1. **Paste can land mid-draft.** Handle file collisions explicitly: the pasted naskah is
   verbatim-authoritative, the old draft gets recovered from git (`git show <commit>:<path>`)
   and renamed `(Superseded)`. After every move/overwrite, probe a distinctive line of BOTH
   bodies (`'20261/CIK3101/WAD09' in text`; the superseded doc's marker) — a rename in the
   wrong direction looked clean until this check.
2. **Sheet numbers beat draft numbers on every point.** Diff sheet-vs-draft as a numbered
   list first (rubric detail included — WAD sheet B2=4/F2=11/F4=3 differed from the working
   draft's split), then write the sheet verbatim. "Yes/agree" to the diff = the ruling.
3. **Same-session sweep extends to the tugas.** The group tugas draft had to be re-aligned to
   the sheet's 65+35 split, format wording, and starter-repo promise — the tugas is downstream
   of the naskah and silently inherits contradictions otherwise.

## Live-state findings (checked 2026-09-26)

- **Groups not final**: RISE `/class-group/class/{id}/state` held 5 groups (4/4/5/5/5 = 23)
  + 8 unassigned; `/summary` `is_ready_to_finalize: false` — while every doc says "8 kelompok
  × 4" (RPS Defects D7). Group/topic tables in the tugas wait on the regrouping (`replace-all`).
- **Team repos not ready**: dosen-owned k01–k08 = untouched template, **0 collaborators**
  (students cannot push); three student-made repos exist with inconsistent numbering
  (`MDRNPNAP/wad-2026-k02`, group-3 leader owning `AndiniPrihartiningtias/wad-2026-k06`,
  `khaerulanamm/wad09_2026_K05`), all "Initial commit" only. → collect **repo URLs via the
  tugas submission**, not pre-registered links.
- **Build window collapsed**: the sheet says "bangun di Sesi 6 dan 7", but Sesi 6 (Fri 25 Sep)
  ran as a normal teaching night — effective build = Sesi 7 (Mon 28 Sep) only. Verify claimed
  build weeks against the register/daily notes before publishing a running order.
- **Date anchor**: WAD Sesi 8 = Wed 30 Sep 20:00 (BI Sesi 8 = same night 18:15; both courses
  run Mon/Wed/Fri nights; SDLC = Thu 1 Oct).

## Post-review close-out (five numbered rulings, 2026-09-26 evening)

The user reviewed and replied in numbered literal rulings; each was applied to BOTH the
naskah and the tugas draft the same turn, then verified with positive AND negative string
probes (e.g. `22:00` gone, `susulan` gone, `Kelompok 6` gone from the body):

1. **"kenapa nambah anggota? pakai yg di rise aja"** — the recomputed regroup proposals were
   REJECTED; the live 5-group state is final as-is. The 8 unassigned students stay out of
   this group tugas (their exam status = open, parked decision, recorded in the internal
   notes only). Lesson: ask "keep live groups or regroup?" BEFORE computing snake-draft
   tables, and treat the basis question ("sudah lihat hadir sesi 03–06?") as a correction to
   answer + confirm, not as an order to regenerate twice (two full proposals were wasted).
2. **Topic table → 5 domains** (K1 Pelatihan HR, K2 Klinik, K3 Perpustakaan, K4 Kantin
   kampus, K5 Gym; Transportasi/Event/Asrama dropped), rotation text "5 kelompok".
3. **Deadline = before Sesi 8 starts** — frontmatter `due: 2026-09-30T13:00:00Z` (20:00
   WIB), body "paling lambat Rabu 30 September 2026, 20:00 WIB — sebelum Sesi 8 dimulai".
4. **"let me review"** — everything stays `status: draft`, nothing published.
5. **"susulan apa? gak ada"** — the berhalangan/susulan bullet deleted outright (never
   softened), grep-verified absent.

Earlier same-day rulings already folded into the sheet body: starter repo stays empty
(naskah promise rewritten to "template belum berisi kode"), AI banned **only during the
Sesi-8 defense session** (allowed while building, with README disclosure; deviation from RPS
butir 6 kept visible on the prodi-ACC list), topic table "ditetapkan dosen 2026-09-26,
final".

## Open items at session end

- ~~Publish (blocked on the user's post-review "go")~~ **DONE 2026-09-26 evening.** The user
  replied "go" and both tasks went live (see "Publish-day mechanics" below for the API
  traps): group task `5292bfd6-bcff-410a-804b-7e0be1b90cca`, individual task
  `1114e4af-fc12-42f5-b26c-fd5c34142d90`, both verified with two GETs ~20 s apart
  (title/end_date/description stable).
- **The 8 unassigned students — resolved by user ruling**: *"mahasiswa tsb tidak aktif,
  bagaimana kalo buat tugas individu saja?"* → a second, **individual** task (type
  `personal`) was created for them via `POST /v1/task/create`, same deadline
  (`2026-09-30T13:00Z`), same rubric, domain bebas (usulan Transportasi), defense done
  individually at Sesi 8. RISE's group-task validator hard-requires **every** enrolled
  student to sit in some group before ANY group task exists — so the 8 were first placed
  into a holding group `Kelompok 6 (Non-Aktif)` via `replace-all` purely to satisfy the
  check. They remain members of K6 in the group task's roster (cosmetic); the individual
  task is their real work order. If you ever remove K6, expect the validator to fire again.
- Prodi ACC route for the RPS deviations: "ujian praktik individual" vs group + AI ban
  scoped to the defense session only (RPS butir 6 bans outright at UTS). Still open.
- `Sesi 08 - UTS Practical Coding Exam.md` (session note) still describes the individual form
  + 150-min slot — full rewrite is due on the ACC sweep, like SDLC's.
- Regroup proposals (S2–S5 basis, then S3–S6 after the window correction) computed but NOT
  applied — live groups won; JSONs sit at `~/wad_regroup_proposal*.json`, marked not-applied
  so no later session resurrects them as pending.
- Announcement (discussion post) NOT yet published — tugas exist but no class-discussion
  announcement was posted this session.

## Publish-day mechanics (what actually worked vs the runbook's assumptions)

- **`rise-ops tugas publish` refuses group tugas — use raw API.** POST
  `/v1/task/create-with-groups`, base `https://api-pmb.cakrawala.ac.id/api`, headers
  `x-client-app: rise`, `Origin`/`Referer` on `rise.cakrawala.ac.id`, cookie
  `cakrawala_session_siakad`. Payload: plain task fields (`class_id`, `schedules_id`,
  `schedules_session`, `title`, `type:"group"`, `description`, `start_date`, `end_date`,
  `on_close`, `submit_attempt`, `max_file_size`) plus `groups:[{title, max_member,
  member_user_data_ids}]`. 201 returns the task id at `data.id`.
- **`schedules_id` comes from `/v1/shared/lecture-class/{class_id}/sessions/accordion`** —
  walk the nested JSON for `session_number: N`; for WAD Sesi 8 it was `458d5360-3572-46f7-
  a371-ec82bfb293e0` (RISE labels it "Pertemuan 8", status TERJADWAL, `is_uts: true`).
- **The group-task validator needs zero unassigned students across the WHOLE class**, not
  just in your payload groups — with 8 unassigned it 400s: `"Ada 8 mahasiswa yang belum
  masuk kelompok manapun"` (the error itself lists their user_data_ids — handy). Also:
  **send ALL groups in the payload**, including the holding group; a payload subset failed
  even when live state was already clean.
- **Finding the created task afterwards: use the right listing endpoint.**
  `/v1/dosen/lecture-class/{id}/task-sessions?limit=50` (spelled `lecture-class`) nests at
  `data.data` → 16 schedule-group rows each with `tasks[].task_id` + `tasks[].title`. The
  tempting `/v1/dosen/lecture_class/…` (underscore) returns naskah rows with `id: null` —
  wrong endpoint; don't hunt there.
- **Description is stored as raw markdown and rendered client-side** — tables, bold, and
  headings survive verbatim (`<table` count is 0 in the stored string, which is expected,
  not a bug; assert on the markdown strings instead: `'Pelatihan HR' in desc`, deadline
  line, no `'Catatan internal'`, no `'susulan'`).
- **Verification double-GET applies to tasks too** — first GET showed the new description,
  second GET 20 s later confirmed stability (`desc2 == desc`).
- **Audit entries are manual for raw API writes** — one JSONL line per create, with payload
  summary + result id + the ruling that justified it (K6 holding group, individual track).
- **Transcription discipline**: every failed call in this session traced to a hand-typed id
  or path (home-dir and uuid segments retyped from memory). Pull ids programmatically
  (`cache.json → classes.WAD.id`, response `data.id`) and never retype a uuid into a later
  call.
