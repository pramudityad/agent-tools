# rise-ops

Run and record a Cakrawala sesi against the RISE portal: attendance, berita acara, session
open/close, a pre-class briefing, publishing the deck to Materi, and a local attendance
register.

Sibling to [`rps-deck`](../rps-deck), which *builds* the sesi this one *runs*.

```sh
./install.sh                 # runs tests, links the CLI, installs the skill

rise-ops auth                # check the cookie
rise-ops todo                # what is still open across all classes
rise-ops brief BI            # Zoom link, roster, at-risk, artefak due
rise-ops attendance zoom BI 3 participants.csv
rise-ops acara BI 3 --end    # berita acara from the Naskah, then close
rise-ops material BI 3 "Sesi 03 - Slides.pdf"   # publish the student deck to Materi
rise-ops register BI
rise-ops tugas list SDLC                        # RISE tasks vs each Sesi NN - Tugas.md
rise-ops tugas publish SDLC 3                   # create or update that sesi's task
```

## What it will not do

- **Write grades.** RISE has no final-grade surface; nilai akhir lives in SEVIMA SIAKAD, a
  different system with different auth. See `docs/adr/0001-rise-is-not-siakad.md`.
- **Guess attendance.** An unmarked student stays unmarked until a roll source says
  otherwise (`docs/adr/0003-no-roll-no-write.md`).
- **Fuzzy-match a name.** Zoom rows bind to the roster on exact equality or land in a
  residue file (`docs/adr/0004-exact-name-matching.md`).

## Setup

One cookie, no password:

> Chrome → `rise.cakrawala.ac.id` → DevTools → Application → Cookies → copy
> `cakrawala_session_siakad` → `~/.config/cakrawala/session` (mode 600)

State lives in `~/.config/cakrawala/`: the cookie, a 12h cache, `audit.jsonl` (every write
with its prior value — the only undo record), and `registers/`. Nothing is written into the
Obsidian vault, which auto-commits to a remote.

## Docs

| File | |
| :--- | :--- |
| `CONTEXT.md` | vocabulary, auth, and the portal fields that look like data but are not |
| `CONTRACT.md` | exit codes, write semantics, stable stdout |
| `docs/adr/` | the four decisions that shape the tool |

`node test.mjs` — 25 hermetic tests, no network.
