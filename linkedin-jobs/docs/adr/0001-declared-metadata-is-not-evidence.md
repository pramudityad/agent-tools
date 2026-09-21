# LinkedIn's claims about a posting are not evidence about the role

LinkedIn supplies, free and structured, both a declared seniority level and a "no longer
accepting applications" marker. The obvious path is to trust both. This toolkit trusts
neither, because both have been observed to be claims about the *advert* rather than facts
about the *role*.

**Declared seniority is never a scoring input.** Measured against a corpus of 125 real
evaluations: all 9 reports citing LinkedIn's "Entry level" tag also stated a multi-year
experience requirement — a 100% contradiction rate. One evaluation named the pattern
outright ("a classic LinkedIn misclassification — the actual level is Mid"); others
annotated the value as `(LinkedIn tag)` to hold it apart from the level derived from the
JD. One evaluation scored its role down to 2.0/5 led by that tag. Level is therefore
derived from the requirement text, and a contradiction between the two is recorded as a
legitimacy and compensation-risk signal.

**Employment type is treated differently.** `Full-time` / `Part-time` / `Contract` is
structural rather than a judgement, and matched the requirement text everywhere it was
checked. It is trusted as a filter input.

**A closure marker triggers a bounded lookup, not abandonment.** The `closed-job` marker
reports a Route closure. Under an Off-site apply arrangement that says nothing about
whether the employer is still hiring, so the posting is classified `uncertain` and one
bounded Resolution attempt is made against the employer's own system before deciding.

## Consequences

Before anyone tries to make the closure rule smarter: the Off-site apply arrangement is
observable only while a posting is *live*. The marker sits on the apply control, which is
gone once the posting closes — verified against captured payloads in both states. A
posting first encountered already-closed cannot be classified and gets the bounded lookup
unconditionally.

Consumers that want the declared values must read them from the namespaced `declared`
object in the output. That namespacing is deliberate and load-bearing: it exists so no
caller can mistake a claim for a derived fact.
