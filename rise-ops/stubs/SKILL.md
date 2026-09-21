---
name: rise-ops
description: >-
  MUST USE when the user wants to mark attendance, fill a berita acara (rencana/realisasi
  materi), close a sesi, publish a sesi deck to Materi, get a pre-class briefing, fetch or
  read student tugas submissions, grade a tugas, or see what is still open in the Cakrawala
  RISE portal. Triggered by phrases such as "isi absen sesi N", "tutup sesi", "berita acara",
  "realisasi materi", "upload materi", "publish deck ke RISE", "siapa yang belum hadir",
  "brief kelas besok", "apa yang belum beres", "cek tugas mahasiswa", "download tugas",
  "review submission", "grade tugas", or a Zoom participants CSV handed over for a class.
  Also use to regenerate the attendance register. NOT for: writing an RPS, building slides or
  a naskah (that is rps-deck), or entering nilai akhir (that is SEVIMA SIAKAD, a different
  system this tool deliberately does not touch — task-level tugas scores are a different,
  RISE-native thing this tool does write).
---

# rise-ops — run and record a sesi

`rise-ops` talks to RISE (`rise.cakrawala.ac.id`), the LMS. It marks attendance, writes the
berita acara, opens and closes sesi, and keeps a local attendance register.

It does **not** write nilai akhir — the final academic record lives in SEVIMA SIAKAD, a
separate system with separate auth. See `docs/adr/0001-rise-is-not-siakad.md`. It *does*
write the task-level tugas score (`tugas grade`, below) — a different, RISE-native thing.

Read `~/.agent-tools/rise-ops/CONTEXT.md` before the first command of a session, and the
vault's `02-Projects/Cakrawala/CONTEXT.md` for teaching vocabulary.

## Before anything

```sh
rise-ops auth        # → "Damar Arba Pramuditya · LECTURE · …"
```

On `auth_expired`, the cookie is stale. Ask the user to refresh it — there is no automatic
renewal and no stored password:

> Chrome → `rise.cakrawala.ac.id` → DevTools → Application → Cookies →
> copy the value of `cakrawala_session_siakad` → paste into `~/.config/cakrawala/session`

Then `rise-ops sync` to refresh the class, sesi and roster cache.

## Pre-class

```sh
rise-ops brief BI              # next unfinished sesi
rise-ops brief BI --sesi 3     # a specific one
```

Gives the Zoom link, the taught slot, the roster, who is under the 75%
RPS gate, the artefak due from the Naskah frontmatter, and whether the previous sesi is
still unclosed.

Read the at-risk list with the caveat it prints. While marks are missing the percentages
are a floor, not a verdict — do not tell a student they are failing off this number until
the backlog is closed.

## Post-class

1. **Attendance.** Needs a roll source; the tool never guesses (ADR 0003).

   ```sh
   rise-ops attendance zoom BI 3 ~/Downloads/participants_97303290176.csv
   ```

   Ask the user for the Zoom usage export: Zoom → Reports → Usage → the meeting → Export.
   Always relay the four counts the command prints, and open the `.unmatched.md` file with
   the user — a low match rate is easy to miss if only the successes are reported.

   Students with no Zoom row are left unmarked on purpose. They are not absent by default.

   For a handful of corrections, name them:

   ```sh
   rise-ops attendance set BI 3 --izin 24120500011 --sakit 24120500022
   ```

   One unknown NIM aborts the whole batch and writes nothing.

2. **Berita acara**, then close:

   ```sh
   rise-ops acara BI 3 --end
   ```

   Built from `Sesi NN - Naskah.md`, which must exist and be `status: approved`. It records
   the sesi as having run to plan (ADR 0002) — if it materially did not, say so to the user
   and let them amend it in the RISE UI afterwards.

   On `no_naskah`, do not invent content for an official record. Offer to build the Naskah
   with `rps-deck` first, or to leave the row for the user to fill by hand.

3. **Register**, when you want the running picture:

   ```sh
   rise-ops register BI
   ```

   Writes `~/.config/cakrawala/registers/BI-kehadiran.md`. Outside the vault deliberately —
   the vault auto-commits to a remote and this holds full names, NIMs and attendance.

## Materi

Publish the deck to the sesi's RISE Materi row:

```sh
rise-ops material BI 3 "Sesi 03 - Slides.pdf"
```

Title and description come from the Naskah (`title-materi`, `sub`), so the portal reads like
the deck the room saw. Override with `--title` / `--description`.

- `--at YYYY-MM-DD` sets the publish date. RISE refuses anything before today, so a
  retrospective upload has to use today; that is already the default.
- Upload the **student** deck. Never `sesiNN-deck-pengampu` — that one carries the teaching
  notes.
- A second run with the same title refuses instead of duplicating; `--replace` swaps it. The
  new material is created before the old is deleted, so a failed upload never costs what is
  already up.

The material id is written to the audit log; `DELETE /v1/learning-material/{id}` reverses it.

## Sweeping

```sh
rise-ops todo
```

One line per open row across all three classes. This is the right opening move whenever the
user asks "apa yang belum beres" or comes back after a gap.

## Known sharp edges

- **`percentage_attendance` from RISE is always 0.** Never quote it. The tool computes the
  real number from per-sesi marks.
- **`attendance_deadline` is advisory** — late corrections are accepted, verified against a
  sesi a day past its deadline.
- **The 75/80 conflict is unresolved.** The RPS says 75%, the Kontrak Kuliah says 80% and is
  what students signed. The tool gates at 75 and lists the in-between students separately.
  Flag this to the user before the Sesi 4 early check; it needs prodi, not a code change.
- **The slot has three disagreeing sources.** The Naskah's `slot-minutes` is the taught
  length and wins; RISE's window is the *booked* block (BI is booked 120, taught 105) and is
  only the fallback; the vault CONTEXT.md is stale for SDLC. The tool handles this — just do
  not quote a duration from the Week note, which says 150 for every course.

## Tugas

A sesi's homework lives in `Sesi NN - Tugas.md` in the course folder, beside the Naskah —
flat frontmatter (`title`, `due`, `tugas-type`, `on-close`, `submit-attempt`,
`max-file-size`) and a body that is the task description verbatim.

```sh
rise-ops tugas list SDLC              # what RISE carries against each Tugas file
rise-ops tugas publish SDLC 3         # create it, or update it if the title already exists
rise-ops tugas rm SDLC <task-id>      # delete; refuses while students have submitted
```

Writing the file first is the point, not a formality: a tugas no file describes cannot be
posted, so the portal and the vault cannot drift apart (ADR 0005). `publish` matches on the
exact title, so re-running after an edit updates instead of duplicating. Group tugas are
refused — they need the RISE UI. `rm` refuses while students have handed work in unless
`--force`.

`due` is an ISO UTC instant (`2026-09-24T11:30:00Z`). RISE will not accept a start date
before today, so a sesi is always *opened* now and only the deadline is authored — a
retrospective tugas cannot be back-dated. `on-close: lock` lets late work in at a penalty;
`close` shuts the door outright.

## Grading tugas

```sh
rise-ops tugas review SDLC <task-id>                    # who submitted, ungraded first
rise-ops tugas review SDLC <task-id> --all              # include not-submitted students too
rise-ops tugas review SDLC <task-id> <user-data-id>     # download that student's submission
rise-ops tugas grade  SDLC <task-id> <user-data-id> --score 85 --feedback "…"
```

`review` is read-only; `grade` is the only verb that writes a score — kept separate on
purpose so a `review` command can never accidentally grade someone (ADR 0006). Files land in
`~/.config/cakrawala/submissions/<task-id>/<nim>-<name>/` — never the vault, same reason the
attendance register lives outside it. Read the downloaded PDF/DOCX with the `Read` tool
directly (PDF is native; DOCX may need the `nutrient-document-processing` skill) — do not try
to parse it yourself. A `.zip` is auto-extracted one level into a `contents/` subfolder.

- `--score` is required, 0–100. `--feedback` is optional and defaults to empty — don't invent
  one; ask the user for the actual feedback text, or leave it off.
- `grade` refuses to overwrite an already-graded submission unless `--force` — there is no
  undo for a score once RISE accepts it, only the audit log's prior value.
- If `list_files` comes back empty, the student likely submitted a Google Docs link instead
  of a file (the task description allows either) — check the downloaded `_review.json` for
  it; the exact field isn't nailed down yet, so don't assume it's missing without looking.
- The `grade` write payload (`PUT /v1/task/{id}/user/{userDataId}/review`) is inferred from
  the GET response's own field names, not from documentation — if it 400s, that's the real
  contract disagreeing with the guess, not a bug to route around.

## User preferences (Cakrawala — Damar)

- Concise and direct. No preamble.
- Indonesian for anything that reaches students or the portal; English is fine for tooling.
- File-based deliverables, absolute paths.
- **Sesi ≠ week.** One sesi is one meeting; a pekan holds two.
- RPS governs assessment; the Kontrak governs logistics.
