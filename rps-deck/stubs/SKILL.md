---
name: rps-deck
description: >
  MUST USE when the user wants slides, a deck, or presentation material built for a
  university session that has an RPS contract — the six-step pipeline that reconciles the
  RPS against the session note, refits the plan to the real slot, sanitises the artifacts
  it projects, authors a reviewable spec, and builds separate instructor and student
  builds. Triggered by phrases such as buat slide sesi N, bikin deck untuk sesi, slide
  generation prompt, naskah pengampu, materi mahasiswa, or a request to prepare teaching
  material from a Week NN session note. Also use to re-render a deck after editing its
  spec, or to sanitise an artifact a session projects.
  NOT for: writing the RPS itself, grading, or lesson design from scratch — this builds
  from an existing session note plus an approved RPS contract.
---

# rps-deck

Toolkit at `~/.agent-tools/rps-deck/`. Read its `CONTEXT.md` before using the vocabulary —
**RPS contract**, **slot**, **cut ledger**, **naskah**, **materi**, **residual scan** — and
respect the ADRs in `docs/adr/`.

Run `node ~/.agent-tools/rps-deck/deck.mjs --help` for the commands.

## The six steps

Each ends on a checkable criterion. Do not move on before it holds.

### 1. Reconcile

Read the **RPS contract** and the session note in full. List every conflict with a ruling.

The RPS contract wins by default. Where it is **impossible** — an instruction that cannot be
carried out in the real slot — the deck states the workable version and the deviation is
appended to `<course>/RPS Defects.md`. Where it is **silent** on a fact a slide needs, ask;
do not infer.

*Done when:* every conflict is listed with a ruling, and any deviation is in the register.

### 2. Refit

Session notes are written for a nominal length that is usually not the **slot**. Recompute
the minute plan against the real slot and write the **cut ledger** — every dropped segment
names where it went.

Stamp the note: add `slot:` to its frontmatter and one banner line under the header. Leave
its original plan intact as the full-length design.

*Done when:* offsets are monotonic, sum to the slot, every cut names its destination, and
the note carries the stamp.

### 3. Sanitise

For each artifact the session projects, **read the whole file** — see `SANITISE.md` for why a
grep is not enough and for the identifier classes. Propose a rename map, then:

```sh
node deck.mjs sanitise <source> <map.json> <destination>
```

*Done when:* the scan exits clean. Tell the user plainly that renaming does not hide
structure, and let them make the disclosure call.

### 4. Author

Write `Sesi NN - Slide Generation Prompt.md` in the grammar in `FORMAT.md`. Content is fixed
verbatim; styling is the renderer's. The mandate applies to a teaching deck; a session note
whose slide outline says *logistics only* locks to its declared count via
`deck-type: logistics`.

Include a `DO NOT INVENT` section listing every hard number that appears on a slide.

*Done when:* `node deck.mjs check <spec>` passes.

### 5. Build

```sh
node deck.mjs build <spec>            # warns on open FLAGs
node deck.mjs build --final <spec>    # refuses while any FLAG is open
```

*Done when:* both files emit and the materi assertion passes.

### 6. Publish

Publish the **materi** only. Open the **naskah** as a local file — if no instructor URL
exists, none can be pasted into a class channel.

## Standing rules

- Generated HTML is gitignored; the spec, the sanitised artifacts and the defect register
  are committed.
- Never put a number on a slide that nobody has measured. Use `TODO` plus a slide-level
  `FLAG`, and let `--final` hold the line.
