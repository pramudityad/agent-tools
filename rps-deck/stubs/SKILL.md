---
name: rps-deck
description: >
  MUST USE when the user wants slides, a deck, a naskah or materi built for a university
  session that has an RPS contract — the pipeline that reads the RPS row, refits the plan
  to the real slot, sanitises what the session projects, authors a reviewable naskah, and
  builds separate instructor and student decks. Triggered by phrases such as buat slide
  sesi N, bikin deck untuk sesi, naskah pengampu, materi mahasiswa, or a request to prepare
  teaching material from a Week NN session note. Also use to re-render after editing a
  naskah, to approve one, or to sanitise an artifact a session projects.
  NOT for: writing the RPS itself, grading, or lesson design from scratch — this builds from
  an existing session note plus an approved RPS contract.
---

# rps-deck

Toolkit at `~/.agent-tools/rps-deck/`. Read its `CONTEXT.md` before using the vocabulary —
**RPS contract**, **slot**, **cut ledger**, **naskah**, **materi**, **DUR**, **residual
scan** — and respect the ADRs in `docs/adr/`.

`node ~/.agent-tools/rps-deck/deck.mjs --help` lists the commands.

## The six steps

Each ends on a checkable criterion. Do not move on before it holds.

### 1. Read the contract

```sh
deck.mjs session <n> <rps.md>
```

Prints the session row and rubric, and reports the line numbers of **Bobot Penilaian**,
**Ketentuan Penilaian** and **Pustaka** — read those three yourself; they are prose, not
fields.

*Done when:* you can state the session's bobot, sub-CPMK, penilaian, metode and Materi
topics without looking again.

### 2. Reconcile

Read the session note in full alongside the contract. List every conflict with a ruling.

The RPS contract wins by default. Where it is **impossible** — an instruction that cannot be
carried out in the real slot — the deck states the workable version and the deviation is
appended to `<course>/RPS Defects.md`. Where it is **silent** on a fact a slide needs, ask;
do not infer.

*Done when:* every conflict has a ruling and any deviation is in the register.

### 3. Sanitise — only if the note names an artifact

Read the artifact **in full** — `SANITISE.md` explains why a grep is not enough. Propose a
rename map, choose the sections worth showing, then:

```sh
deck.mjs sanitise <src> <map.json> <dst> --section "Problem Statement"
```

*Done when:* the scan exits clean. Tell the user plainly that renaming does not hide
structure, and let them make the disclosure call.

### 4. Author the naskah

Write `Sesi NN - Naskah.md` in the grammar in `FORMAT.md`. Give every slide a `**DUR**`,
then let the tool own the clock:

```sh
deck.mjs restamp "Sesi NN - Naskah.md"    # Σ DUR must equal the slot
deck.mjs check   "Sesi NN - Naskah.md"
```

The refit itself is judgement: which segment loses minutes depends on the note's instructor
notes, and those protect things the arithmetic cannot see. Record the cuts as prose in the
naskah, with each dropped segment naming where it went.

The mandate applies to a teaching deck; a note whose slide outline says *logistics only*
locks to its declared count via `deck-type: logistics`. Include a `DO NOT INVENT` section
listing every hard number that appears on a slide.

*Done when:* `check` passes.

### 5. Render and review

```sh
deck.mjs render "Sesi NN - Naskah.md"
```

Hand the user **both** files — the naskah they author and the materi students receive. This
is the review gate; stop here until they respond.

*Done when:* the user has reviewed both and said so.

### 6. Approve and build

```sh
deck.mjs approve "Sesi NN - Naskah.md"
deck.mjs build --final "Sesi NN - Naskah.md"
```

`--final` refuses on an open `FLAG` or a stale approval hash. Publish the **materi** only;
open the naskah as a local file, so no instructor URL exists to be mis-pasted.

## Standing rules

- Generated HTML and `Materi.md` are gitignored; the naskah, sanitised artifacts, maps and
  the defect register are committed.
- Never put a number on a slide that nobody has measured. Use `TODO` plus a slide-level
  `FLAG`, and let `--final` hold the line.
- A `Sesi NN - Research.md` may exist and is useful when a session has no week note. Nothing
  generates or validates it — see ADR 0005 for why.
