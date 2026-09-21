# 0003. Three verdicts, not one law

## Status
Accepted

## Context
The gist states an absolute: "If the code doesn't match the call graph, the
implementation is wrong." Taken literally, any design learning during
implementation becomes a violation, which trains teams to either stop learning
or stop writing docs.

## Decision
REVIEW.md issues one of three verdicts: `matches`, `wrong-code`, or `stale-doc`.
`stale-doc` is the law's release valve: the design genuinely changed, the code is
right, and the doc must be updated in the same change — never silently. The
burden of proof sits with the change: when unsure, the verdict is `wrong-code`.

## Consequences
The gist's law keeps its teeth (drift is a finding, not a shrug) while honest
iteration stays cheap (update the doc, re-run `check`, in the same PR). The risk
is `stale-doc` becoming an excuse to never update designs first; mitigated by
the rule that doc and code move together or not at all.
