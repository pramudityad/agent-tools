# PROBE — locate the Frontier

Probing is binary search. It exists to find the edge of the learner's understanding
cheaply, not to teach and not to judge. The design principle it serves: *maximize
struggle, concentrate cognitive work into the material* — probing spends learner
attention only at the edge, never below it and never above it.

## Instrument

A Probe is multiple-choice, graded by the core (`observe probe`). `correct` is computed
deterministically from `--key` against `--chosen`; **the agent never asserts it**, and a
caller that could would turn the one graded field in the system into opinion. Because the
grade is a fact, Probe items are reliable comparators — that is what makes binary search
possible across sessions.

Probes cannot establish understanding. Recognition among four options is exactly the
format that lets a learner gaslight themselves, so no quantity of Probes moves a Concept
to `demonstrated`. Only a Recall can close.

## Where to probe: the Frontier

`frontier <session>` lists the Path nodes whose Standing is `unknown` or `stale`. Those
are the only places probing happens:

- **`unknown`** — binary search the Strand. Each item should halve the region between
  "clearly held" and "clearly not". A handful of items locates the edge; more than that is
  the agent showing off, not probing.
- **`stale`** — one confirmation item before its Strand is pruned. The asymmetry that
  drives this: wrongly pruning a Strand teaches the next Concept on a foundation that is
  not there, silently, and the error then enters the very mechanism that decides what is
  never taught again. The opposite error costs one question.

Never probe below a `demonstrated` node. The Strand below it is never expanded and never
probed — that pruning is the whole return on keeping the Ledger.

## Procedure

1. `concept lookup <query>` before anything. Lookup-before-write is mandatory; a duplicate
   slug is a design error, not a moment.
2. `observe probe --session <id> --concept <slug> --item "..." --options "a,b,c" --key "a" --chosen "b"`
   — the core grades it and appends the fact to the Ledger's raw material.
3. Re-read `standing` or `frontier` to see where the edge actually is, then stop.

Probing belongs in the same Session as the teaching it calibrates, and it feeds the
template-record that `next`'s gate consumes — the Ledger decides what a Session must
actually teach.