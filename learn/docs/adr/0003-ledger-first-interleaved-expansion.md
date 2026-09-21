# Ledger-first interleaved expansion

A Path is produced by backwards expansion from the Goal, reading the Ledger as it goes: a
Concept whose Standing is `demonstrated` has its Strand below it **never expanded and
never probed**. Probing happens at the Frontier, interleaved with expansion — not after a
complete plan is drawn.

The source system this toolkit is modeled on orders the work Probe → Plan → Teach: build
the full graph, then probe it. Plan-then-probe generates items below demonstrated
Concepts — work the Ledger already says is wasted — and, worse, presents those Concepts to
the learner as open territory. Pruning whole Strands *before* items are generated is the
entire return on keeping a Ledger; the alternative spends the two scarce resources
(learner attention, model tokens) on exactly the Concepts the Ledger says are closed.

Interleaving, not just ledger-first ordering, matters for the stale case. A Concept at the
Frontier whose Standing is `stale` gets one confirmation item before its Strand is pruned.
When expansion and probing interleave, that confirmation happens at the moment the Strand
is reached: a failed confirmation re-opens the Strand before deeper items were ever
generated, and a passed one prunes it on the spot. Strict plan-then-probe would have to
guess at both outcomes in advance.

## Consequences

Expansion is not a one-shot artifact of a planning phase. The Ledger can legitimately
change what the Path should be between proposal and teaching, which is why a material
change (`path amend`) returns the Path to unapproved rather than silently continuing. The
Strand is the unit of pruning, and the pruning decision is always made against the Ledger
— never against a model's memory of what a previous Session did, and never against the
shape of the graph alone.
