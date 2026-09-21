# Triage Playbook

Decide **where each Test Case can run** before anything is executed. Read `CONTEXT.md` in
this directory first and use its terms exactly — `Test Case`, `Check`, `Stub`, `Verdict`,
`Spec`. In particular never say "mock" for an HTTP Stub; in these repos "mock" means a
mockgen-generated Go interface double.

This playbook is judgement work. It never runs the service. It never calls `evidence.mjs`.

## Input

QA hands over Test Cases as a pasted markdown table, a file in the repo, or a ClickUp link
or `DP-####` ID. Formatting is inconsistent by nature — read for intent, not structure.

If given a ClickUp ID, fetch the task for identity and context, but expect the Test Cases
themselves to live elsewhere (a comment, an attachment, a doc, or a message). Do not invent
Test Cases the ticket does not contain — ask instead.

## Method: static trace

For each Test Case, work out what executing it would actually touch. Do not run anything.

1. **Locate the endpoint.** Find the route registration, then the handler. In these Go
   services routes are wired under `pkg/router/` and handlers live at
   `internal/<domain>/handler/http/`.
2. **Trace downstream.** Follow handler → usecase → repository, and list every dependency
   the path reaches: Postgres, MySQL, Redis, GCS, Pub/Sub, and external providers under
   `external/` (typically `oms`, `biller`, `notification`, `fraud`, `oauth`).
3. **Check each dependency against local reality.** Read `config.yaml` / `config.yaml.tmpl`
   for the configured host, and `docker-compose.y*ml` for what actually comes up locally.
   For external providers, read `mock-providers/initializerJson.json` to see whether a
   canned response already exists, and `mock-providers/README.md` for how scenarios are
   triggered.
4. **Assign a Verdict:**
   - `LOCAL` — every dependency on the path is available locally with no Stub.
   - `LOCAL-WITH-STUB` — reachable locally provided a Stub is injected. **Name the
     dependency and the response the Stub must return.**
   - `STG-ONLY` — something on the path cannot exist locally. **Name the blocking
     dependency.** Vague reasons are worthless to QA.

Read the repo's `CONTEXT.md` (e.g. `gogogo-service/CONTEXT.md`) before tracing, and use its
domain terms in the report.

### Where the Verdict is a prediction

Verdicts are inferred from code and config and are never confirmed by running (ADR-0004 was
considered and declined). Config-driven and feature-flagged paths are where this is weakest.
When capture later reports `BLOCKED`, that is a wrong Verdict surfacing — re-triage that
Test Case rather than treating it as a defect.

## Decomposition

A Test Case decomposes into one or more Checks. A Check is exactly one request and cannot
reuse a value from another response (ADR-0002). So a Test Case like "create a registration,
then cancel it" has two options:

- Pre-seed the entity (fixture, migration, or a prior manual call), then write the cancel
  Check standalone against a known ID.
- Give the Test Case `STG-ONLY` if pre-seeding is not realistic.

Never silently drop the second half of a multi-step Test Case — say which option you took.

## Outputs

### 1. `docs/evidence/<TICKET>-triage.md`

The QA-facing answer. Every Test Case appears, whatever its Verdict.

```md
# Triage — <TICKET>

**Service:** <repo> | **Triaged by:** <name> | **Date:** <YYYY-MM-DD>
**Summary:** N local, N local-with-stub, N STG-only

| # | Test Case | Verdict | Reason | Checks |
|---|-----------|---------|--------|--------|
| 1 | Create registration without Correlation-ID | LOCAL | No downstream calls; validation rejects before the usecase | 1 |
| 2 | Order blocked when fraud flags the user | LOCAL-WITH-STUB | `fraud` is not in docker-compose; Stub must return `{"decision":"at_risk"}` | 1 |
| 3 | Refund settles to partner bank | STG-ONLY | Requires the real Biller settlement callback; no local equivalent | 0 |
```

### 2. `docs/evidence/<TICKET>.local.json` and `<TICKET>.stg.json`

One Spec per environment, containing only that environment's runnable Checks. Omit a file
if the environment has none.

```json
{
  "ticket": "DP-8413",
  "env": "local",
  "base_url": "http://localhost:8085",
  "checks": [
    {
      "name": "Create Registration with Correlation-ID",
      "test_case": "TC-02",
      "method": "POST",
      "path": "/public/v1/registrations",
      "headers": { "Content-Type": "application/json", "Correlation-ID": "dp8413-test-123" },
      "body": { "primary_contact_name": "Ahmad Fauzi", "traveler_count": 3 },
      "expected_status": 201,
      "expect_body": { "correlation_id": "dp8413-test-123", "registration_id": "*" },
      "stubs": [
        {
          "dep": "fraud",
          "expectation": {
            "httpRequest": { "method": "POST", "path": "/fraud/api/v2/internal/decisions/..." },
            "httpResponse": { "statusCode": 200, "body": { "decision": "not_at_risk" } }
          }
        }
      ]
    }
  ]
}
```

Field notes:

- `test_case` links the Check back to QA's numbering. Always set it when QA numbered them.
- `expect_body` is a deep subset — only the keys you name are asserted. `"*"` asserts the
  key exists with a non-null value. Assert the thing the Test Case is actually about, not
  the whole response.
- `stubs[].expectation` is passed to MockServer verbatim, so it uses MockServer's
  `httpRequest` / `httpResponse` wire shape. `dep` is the label shown on the Evidence Card.
- `base_url` must match the env's entry in `docs/evidence/config.json`.

## Hand off

Report the Verdict split, name every `STG-ONLY` blocker, and state which Specs you wrote.
Then stop — executing them is `CAPTURE.md`.
