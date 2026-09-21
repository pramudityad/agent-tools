# A Check is exactly one request, with no captured variables

A Check sends one HTTP request and asserts against its response. It cannot capture a value
from one response and reference it in another, so a Test Case like "create a registration,
then cancel it" cannot be executed as a unit. Such Test Cases are either decomposed by hand
into independent Checks with pre-seeded fixture data, or given an `STG-ONLY` Verdict. We
chose this because it keeps Specs flat, order-independent, and individually re-runnable via
`--only`, and because state coupling between Checks is the usual source of flaky, unreadable
API test suites.

This is the decision most likely to be re-argued, because create→fetch→cancel is a common
shape in these services. Reverse it only if hand-decomposition becomes the routine case
rather than the exception — and if reversed, accept that Checks gain ordering and shared
state, and that `--only` can no longer re-run an arbitrary Check in isolation.
