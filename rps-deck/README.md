# rps-deck

Builds instructor (**naskah**) and student (**materi**) session decks from one Markdown file
the lecturer authors and reviews. Course-agnostic: the precondition is an **RPS contract**,
not a named course.

Zero dependencies, Node built-ins only.

```sh
node deck.mjs session <n> <rps.md>            # read the RPS contract for one session
node deck.mjs restamp  <naskah.md>            # recompute every clock stamp from DUR
node deck.mjs check    <naskah.md>            # validate
node deck.mjs render   <naskah.md>            # emit Sesi NN - Materi.md
node deck.mjs approve  <naskah.md>            # stamp approval, bound to a content hash
node deck.mjs build    [--final] <naskah.md>  # emit both projectable decks
node deck.mjs scan     <file> <map.json>      # residual identifier scan
node deck.mjs sanitise <src> <map.json> <dst> [--section "A|B"] [--lines 20-90]
node test.mjs                                  # 59 tests, hermetic
```

Install the agent-facing pointers — Claude, pi, Codex and Hermes, whichever are present:

```sh
./install.sh
```

- `CONTEXT.md` — domain language. Read before using the vocabulary.
- `FORMAT.md` — the naskah grammar, the marker table, and how `DUR` drives the clock.
- `SANITISE.md` — extracting and sanitising a real artifact, and what the tool cannot check.
- `docs/adr/` — why the tool is shaped this way, including what was declined and deferred.

## The two things worth knowing

**Two builds, never a toggle.** The naskah carries candid classroom notes. A toggle leaves
them in the page source; separate render paths mean they were never written. `build` asserts
it and fails rather than emitting a leaking file (ADR 0002).

**`DUR` owns the clock.** Declare each slide's minutes; the tool computes every stamp and
refuses a budget that misses the slot. It reproduces 52 hand-authored stamps across two real
sessions byte-for-byte (ADR 0006).
