# Append-only Observations over stored mastery

The only thing this toolkit ever writes about a learner is an **Observation** — one
appended event. The Ledger (Standing, counts, spacing) is never stored; it is derived from
the Observations by the derive function, stamped with the Policy that produced it, and
rebuildable from scratch at any time. A mistake is answered by appending another
Observation (an Override), never by repairing the first.

The obvious alternative is a stored learner profile — fields updated in place as sessions
happen, a "score" or "level" that teaching reads and writes. It fails on three counts that
are load-bearing here, not stylistic:

**Auditability.** A profile mutated in place is indistinguishable from the Observations
that produced it. The mechanism that prunes Strands — the thing that decides what is never
taught again — would run on data whose provenance is gone. The Ledger's one inviolable
audit is `ledger rebuild`: reproduce every row exactly from `observations.jsonl` alone. A
stored profile makes that audit meaningless, because there is nothing left to rebuild
against.

**Sync.** The data lives in a git-synced vault (ADR 0004). Line appends conflict by union
and resolve mechanically; a file rewritten in place conflicts on every line. Append-only is
the format that survives two devices without a human referee.

**Re-derivation.** A Recall keeps the learner's answer verbatim so a later, better model
can re-judge it (ADR 0002). That is only possible if the Ledger is a disposable view. If
the judgement were folded into a stored mastery value, the original material for
re-judging would have been destroyed at write time.

## Consequences

If the Ledger and the Observations disagree, the Observations are right — the invariant
makes the audit direction unambiguous, so `why` can always name the Observations and the
Policy rule behind a Standing. Nothing in either append-only store is ever edited or
removed. And because the Ledger carries no state of its own, changing a Policy re-derives
every Standing retroactively with no migration — parameters, never data.
