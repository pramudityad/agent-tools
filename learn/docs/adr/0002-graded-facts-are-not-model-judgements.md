# Graded facts are not model judgements

A record's graded facts live in flat fields: `correct` on a Probe, the verbatim `answer`
on a Recall, the tallies on a Ledger row. A model's opinion lives namespaced and
attributed — `judged.verdict`, `claim`, `learnerVerdict` — and is never merged into a fact
field. A caller must never be able to mistake a claim for a graded fact.

This is the same seam `linkedin-jobs` draws with its `declared.*` object (see
`linkedin-jobs/docs/adr/0001-declared-metadata-is-not-evidence.md`): a claim that can be
mistaken for a fact stops being auditable, and the namespacing is what makes the
distinction structural rather than stylistic.

The three specific dangers in this toolkit:

**`correct` supplied by the caller.** A caller that can assert `correct` can assert
anything. The one field the system grades deterministically would become as soft as the
rest — and then nothing in the Ledger is a fact, and the Frontier is being pruned on
opinion all the way down. Hence the core computes `correct` and never accepts it.

**A judgement merged into a fact field cannot be re-derived.** The verbatim answer is kept
precisely so a later, better model can re-judge an old Recall with a fresh verdict and a
fresh attribution. A merged verdict destroys that possibility; the re-judgement would have
nowhere to land except an edit, which the append-only invariant forbids.

**An Override edited into the judgement it disputes.** Editing would destroy one side of
the dispute and launder the rest. Appended as its own Observation, both survive, and the
derive function prefers the Override — the learner's challenge is visible forever, not
folded silently into the record.

## Consequences

`grounding` is required on every Recall, with no default: `model-recall` is a legitimate
value and a common one; an *absent* value is not, because an unmarked claim taught
confidently and then used to prune a Strand is the one error this system cannot
self-correct. Claims stay namespaced (`judged.*`, `claim`, `learnerVerdict`) so `why` can
attribute each one to the model that made it — and re-derivation by a better model later is
the designed repair path, not an afterthought.
