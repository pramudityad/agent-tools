# PLAN — expand the Goal into an approved Path

Planning is backwards expansion from the Goal, reading the Ledger as it goes. It produces
one artifact: the ordered walk of Concepts the Session will teach (`path propose`), which
the learner approves (`path approve`) before teaching begins. That approval is the
learner's one cheap redirect of the Goal — "intuition, not the proof" — which is why it
gates mechanically rather than by request.

## Ledger-first

Read the Ledger before expanding anything. A Concept whose Standing is `demonstrated` has
its Strand below it **never expanded and never probed**. A `stale` Concept at the Frontier
gets one confirmation item before its Strand is pruned (see PROBE.md). Only this ordering
prunes whole Strands before items are generated — the actual return on keeping the Ledger,
and the reason the Ledger exists at all.

## What makes a good walk

- Each node is a Concept in the registry: `concept lookup` before `concept add`, and
  homonyms are qualified at creation on real collision only (`entropy` exists, so
  information theory creates `entropy-information` — never a taxonomy invented up front).
- Each node is testable by a Recall: a free-response prompt the learner could genuinely
  reproduce. If a node cannot be individually demonstrated, it is not a node.
- Failing a node genuinely blocks the next. That direction of dependence is what a
  prerequisite chain means here — a Strand is a chain, and pruning happens at its root.
- **The walk is the Path; the graph is scaffolding.** Present the ordered walk, not a
  20-node diagram — an undecidable diagram gets approved unread. The learner redirects
  the Goal against the walk.
- Say the Goal back in the walk's terms. The Goal is a request: it may decompose into
  many Concepts and is never given a Standing.

## Declining

A Goal whose Shape is not `hierarchical` is declined and logged (`decline`). Vocabulary,
anatomy, an instrument: pointed at these the walk would look confident and be fiction —
a confident fabricated prerequisite graph with demonstrated rows for Concepts that were
never real. Declining is much cheaper than that failure mode.

`session start` refuses with `wrong_shape`; log the refusal and say the reason in the
learner's own framing.

## The gate

`path approve` before `next` — mechanically enforced by the core, deliberately. The gate
exists because a long, absorbing, well-taught Session is exactly the one where
bookkeeping gets skipped: the best Sessions would otherwise produce the least evidence,
undetectably.