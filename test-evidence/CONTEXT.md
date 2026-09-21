# Test Evidence Toolkit

An agent-agnostic toolkit for turning QA-supplied test cases into reproducible,
attachable proof that an endpoint behaves as specified. This glossary pins terms
that collide with vocabulary already in use across the Flip DPT service repos.

## Language

**Test Case**:
A behaviour QA described in their own words, in the form they handed it over. Owned by QA.
_Avoid_: scenario, requirement.

**Check**:
One HTTP request plus the assertions made against its response. A Test Case decomposes
into one or more Checks.
_Avoid_: test (reserved for Go unit tests — `make test`), step (implies ordering and
shared state, which Checks deliberately do not have), request (names only half of it).

**Stub**:
A canned HTTP response injected into MockServer so a Check can run without the real
downstream provider (OMS, Biller, Fraud).
_Avoid_: mock (reserved for mockgen-generated Go interface doubles — see each repo's
`make mock-gen`), expectation (MockServer's own wire term; translate at the boundary only).

**Verdict**:
Where a Test Case can be run — `LOCAL`, `LOCAL-WITH-STUB`, or `STG-ONLY`. A property of a
Test Case, decided by triage before anything executes.
_Avoid_: feasibility, status.

**Outcome**:
Whether a Check passed — `PASS`, `FAIL`, or `BLOCKED`. A property of a Check, decided by
execution. `FAIL` means the service misbehaved and is the only Outcome QA should act on.
`BLOCKED` means the Check never reached a verdictable state, which indicts the Verdict
rather than the service.
_Avoid_: result, status (reserved strictly for the HTTP status code), verdict, error.

**Spec**:
The machine-readable file listing the Checks to execute against one environment
(`<TICKET>.local.json`, `<TICKET>.stg.json`). Produced by triage, consumed by capture.
_Avoid_: test plan, suite, config (config is the repo's own settings).

**Run**:
One execution of one Spec against one environment at one moment in time.
_Avoid_: session, execution, attempt.

**Evidence Card**:
The rendered HTML and PNG pair proving what one Check sent and received.
_Avoid_: screenshot, report.

**Evidence Set**:
Everything one Run produced, kept per environment under `docs/evidence/<TICKET>/<env>/`.
Two Runs never share an Evidence Set.
_Avoid_: evidence folder, bundle, artifacts.
