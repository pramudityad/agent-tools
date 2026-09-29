# Session Tugas — authoring pattern

A session Tugas is the small written task that hangs off one sesi. It is authored **after** the sesi
has run, it must be answerable only from the student's own repo, and it rides alongside that sesi's
own rubric. This file records the shape that survived contact with the room.

## The rewrite that produced the pattern (WAD, 2026-09-21)

| | Sesi 4 Tugas (open) | Sesi 5 Tugas (guided) |
| :--- | :--- | :--- |
| Item 1 | "Ceritakan satu bug yang kamu alami" — no list | **Menu of 5 named failures** (a–e), each with symptom + cause |
| Item 2 | "Satu keputusan yang harus kamu ambil" — fully open | **Option-taking**: ⓐ pagination vs ⓑ granular patch, must state the cost |
| Result | user: *"Mahasiswa kesulitan karena ini open question"* | rewritten item 2 into a menu + two named options before publishing |

The user's correction is the rule: **an open question that costs the student their first 10 minutes
is a design defect, not a difficulty knob.** Keep the reflection, remove the blank page.

## Shape that works — three items is the ceiling, not the target

Three is what one message from the user can ask for; **one assessed item is a normal, finished
answer**. The compression ladder, in the order the user actually pulled these levers (WAD Sesi 5,
2026-09-21):

| Round | Asked as | What changed |
| :--- | :--- | :--- |
| 3 items | the first draft | diagnosis menu + perform-and-capture + classification |
| 2 items | *"buat tugas medium-easy"* | dropped the "dua hipotesis" part, dropped branch/capture duty, 150-word cap, *"screenshot tidak dihitung kata"*, classification → *"tambahan, tidak dinilai"* |
| 1 item | *"nomor 2, dan cantumkan link/reference ke kode"* | only the perform-and-capture item is marked; the rest stays on the page as unmarked extras |

Two rules fall out of it:

- **Demote, do not delete.** An item cut for marking load moves to a *"Tambahan — tidak dinilai"*
  list at the bottom; the material still reaches the students and is still available for the ones who
  want it.
- **Every assessed item needs an already-correct exit.** *"Kalau `:key="item.id"` sudah benar,
  jelaskan 2–3 kalimat saja"* — a student whose code is right should finish in five minutes, not pay
  for the one whose code is not.

## Shape that works — three items, max 250–300 words each

1. **Diagnosis item, chosen from a menu.** 5 candidates is the sweet spot; write each as
   `symptom — one-line cause` so the student recognises their own night. Ask for the same four parts
   every time: **gejala · dua hipotesis · akar masalah · bukti**. Menu items must come from the sesi's
   own slides (WAD S5: `.value` rule, props/reactive destructure, missing `defineEmits`, `watch`
   without cleanup, `v-html` on outside data).
   - Always add the escape hatch: *"kalau tidak ada satu pun yang kamu alami: tulis 'tidak ketemu'"*.
     Without it, students invent a bug to look diligent.
   - Prefer menu items that carry a **real console message** (`Set operation on key "filter" failed:
     target is readonly`) — quotable evidence beats a described symptom.
2. **Perform-and-capture item.** Branch + deliberately broken line + diff + screenshot/20-second
   capture + ≤100 words of why. The student must *run* something; the marker can falsify it. WAD S5:
   flip `:key="item.id"` → `:key="index"`, filter, show the wrong row holding the state. Say
   explicitly *jangan merge ke `main`* so nobody ships the bug.
3. **Classification item (one, at most).** Take one decision from the session's projected artifact and
   classify it 🟢 kita lakukan / 🟡 kita tunda / 🔴 kita tolak, with the reason bound to the team's own
   constraints. Add the line *"bukan soal benar/salah — yang dinilai apakah alasanmu masuk akal untuk
   timmu"*, otherwise students hunt for the intended answer.

Close with a one-paragraph  penilaian line that names the criteria in order: completeness of the
four diagnosis parts · technical accuracy on the session's concepts · **real reproduction evidence** ·
quality of the trade-off reason · honesty.

## Rubric language that suppresses fabrication

Both lines, together:

- *"Rujuk jawabanmu ke berkas dan fungsi milik timmu sendiri. Teori umum tanpa rujukan lokal dianggap
  belum dijawab."*
- *"Menulis 'tidak ketemu'/'belum tahu' tidak mengurangi nilai — mengarang bukti iya."*

The second is what makes the first safe to obey. A rubric that only punishes generic answers gets
invented transcripts instead of an honest "I never found one".

## The reference zip that ships beside it

Naming: `<course>-sesiNN-referensi.zip` in the course's `artifacts/`, published as an **extra Materi
row on the same sesi** — never as the sesi's only material, which would bury the deck.

Layout that worked (WAD S5, 4 files, ~9 KB):

| File | Role |
| :--- | :--- |
| `README.md` | item → file map, how to use each, and an explicit *"tidak ada kunci jawaban di sini"* |
| `01-<item1>.md` | for each menu item: wrong code → symptom → root cause → correct version |
| `02-<item2>.html` | the reproduction, runnable by double-click, with a mode toggle (broken ⇄ correct) |
| `03-<item3>.md` | condensed version of the projected artifact + the sticky template + 2–3 worked reasons |

Rules learned:

- **No answer key, ever** — the zip teaches the mechanism and points at the student's own files. If an
  answer key is genuinely needed it is a sibling `Sesi NN - Kunci Tugas.md` beside the tugas file, never
  inside the shipped zip.
- **Publish the pair together.** A reference up with no tugas confuses students as much as a tugas with
  a dead link. Draft both, then one `rise-ops tugas publish` + one `rise-ops material … --title`.
- **Reuse the projected artifact** rather than rewriting it: station summaries come straight from
  `artifacts/sesiNN-*.md` (already sanitised). The zip may quote it; it must not leak the full source
  document.
- **A runnable demo must be proven to fire** before it ships (see `scripts/dump-dom.sh`). A bug demo
  that no longer reproduces is worse than no demo.

## Hosting the reference on GitHub

The user may want a link rather than a file (*"can we use github?"*). Shape that worked:

```
pramudityad/cakrawala-referensi          # public, gh already authenticated as pramudityad
├── README.md                            # course × sesi table, with the live-demo links
└── wad/sesi05/
    ├── README.md                        # which file is the marked item, which are extras
    ├── 01-kegagalan-klasik.md
    ├── 02-index-as-key.html             # the runnable demo
    └── 03-stasiun-react.md
```

- One repo for all courses, `course/sesiNN/` per sesi — sibling naming to the class repos
  (`wad-cakrawala-starter`, `bis-cakrawala-starter`).
- The Tugas body links the **folder** plus the demo URL; the folder link is the fallback when the
  demo host is down.
- **Probe every URL before it goes into student-facing text.** `raw.githubusercontent.com` always
  returns 200 but serves the file as `text/plain` — the student sees source, not a rendered demo —
  and a GitHub Pages URL can 404 while the repo is perfectly fine. A link in a published Tugas is a
  promise; treat an unverified URL as a defect, and say plainly to the user that it is unverified
  rather than shipping it as working.
- Zip-on-RISE and repo-on-GitHub are alternatives. Ship one; the pair rule (reference never without
  the Tugas) still holds.

## Caveat to surface when shipping a runnable demo

The demo's mechanism and the student's copy can differ. WAD S5: the reproduction uses an **unmanaged**
`<input type="checkbox">` because `v-model` patches `checked` and hides the key bug — so the demo says
so, in-page, or students conclude the bug does not exist in their own project. Whenever a demo isolates
a mechanism, state what it deliberately leaves out.

## Authoring a retrospective Tugas from student submissions

The user often hands over real submissions (`~/Downloads/<name>-WAD09-sesiN.md`) and asks for the task
that produced them. What they want is the **question set**, not the answers recycled.

1. Read the submissions and list the steps the students actually performed — that list *is* the item
   list, already validated against the room.
2. Turn each step into an instruction + what to hand in; strip every answer, screenshot and student
   name.
3. Keep their evidence expectations (*"screenshot tiap langkah"*, *"sebut ukuran font yang kamu
   ukur"*) — those came from the students' own standard of proof.

When a long paste arrives truncated (this TUI elides pastes over ~8 lines), do not ask for a re-paste:
ask for the path, then find it — `ls -lt ~/Downloads | head -30`, and `grep -rl "<distinctive
phrase>" ~/Downloads` to locate the file by its content.

## Deadline and frontmatter conventions seen in use

- Flat frontmatter only: `type: session-tugas`, `course`, `session`, `title`, `tugas-type: personal`,
  `due` (ISO UTC), `on-close: lock`, `submit-attempt: 1`, `max-file-size: 10485760`.
- `due` = the sesi date + ~2–4 days at 21:00 WIB = `T14:00:00Z`. Confirm with the user rather than
  assuming; they adjust it.
- Body opens with the submission mechanics paragraph (single file PDF/DOCX/markdown ≤10 MB, or a Google
  Doc opened to the lecturer's address), then the deadline in **WIB**, then the items.
- Tulis `Catatan` only if it carries a real rule; a stray *"tidak perlu menyertakan jawaban referensi"*
  line is a sign the reference/answer split was left ambiguous.
