# rps-deck

Builds the instructor Slidev deck and, separately, a student (**materi**)
handout, from one Markdown file the lecturer authors and reviews. Course-agnostic: the
precondition is an **RPS contract**, not a named course.

Zero npm dependencies in `deck.mjs`; `build` shells out to the pinned Slidev workspace in
`slidev/` (`cd slidev && npm install`).

```sh
node deck.mjs session <n> <rps.md>    # read the RPS contract for one session
node deck.mjs restamp  <naskah.md>    # recompute every clock stamp from DUR
node deck.mjs check    <naskah.md>    # validate
node deck.mjs render   <naskah.md>    # emit Sesi NN - Materi.md (student handout)
node deck.mjs approve  <naskah.md>    # stamp approval, bound to a content hash
node deck.mjs build    <naskah.md>    # requires approval; emits "<course> - Sesi NN - Slides.md/.pdf/.pptx" (Slidev)
node deck.mjs scan     <file> <map.json>      # residual identifier scan
node deck.mjs sanitise <src> <map.json> <dst> [--section "A|B"] [--lines 20-90]
node test.mjs                                  # 76 tests, hermetic
```

Install the agent-facing pointers — Claude, pi, Codex and Hermes, whichever are present:

```sh
./install.sh
```

- `CONTEXT.md` — domain language. Read before using the vocabulary.
- `FORMAT.md` — the naskah grammar, KONTEN as Slidev markdown, and how `DUR` drives the clock.
- `SANITISE.md` — extracting and sanitising a real artifact, and what the tool cannot check.
- `docs/adr/` — why the tool is shaped this way, including what was declined and deferred.

## The two things worth knowing

**One Deck, one gate.** `build` refuses unless the naskah is approved with no open FLAG, then
derives the Slidev Deck from it; it is never hand-edited (ADRs 0007, 0009). Students get
`Materi.md` from `render`, which never contains notes.

**`DUR` owns the clock.** Declare each slide's minutes; the tool computes every stamp and
refuses a budget that misses the slot. It reproduces 52 hand-authored stamps across two real
sessions byte-for-byte (ADR 0006).
