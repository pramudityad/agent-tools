# rps-deck

Builds instructor (**naskah**) and student (**materi**) session decks from a Markdown spec
the lecturer has reviewed.

Zero dependencies, Node built-ins only.

```sh
node deck.mjs check    <spec.md>                  # validate
node deck.mjs build    [--final] <spec.md>        # emit both builds
node deck.mjs scan     <file> <map.json>          # residual identifier scan
node deck.mjs sanitise <src> <map.json> <dst>     # apply map, then scan
node test.mjs                                      # 26 tests, hermetic
```

Install the agent-facing pointers:

```sh
./install.sh
```

- `CONTEXT.md` — domain language. Read before using the vocabulary.
- `FORMAT.md` — the spec grammar and marker table.
- `SANITISE.md` — how to sanitise a real artifact, and what the tool cannot check.
- `docs/adr/` — why the tool is shaped this way, including what was declined.

## Why two builds rather than one with a toggle

The naskah carries candid classroom notes. A toggle leaves them in the page source; separate
render paths mean they were never written. `build` asserts it and fails rather than emitting
a leaking file. See ADR 0002.
