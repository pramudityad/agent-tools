# Capture Playbook

Execute a Spec and produce an Evidence Set. Read `CONTEXT.md` in this directory first and
use its terms exactly. The deterministic work belongs to `evidence.mjs` — your job is to
set it up correctly and interpret what comes back. Do not hand-roll curl commands and
screenshot them; the tool exists so evidence is uniform and reproducible.

Requires a Spec from `TRIAGE.md`. If none exists, run triage first.

## 1. Configure the repo (once per repo)

```bash
node ~/.agent-tools/test-evidence/evidence.mjs init
```

Detects the app port from `config.yaml.tmpl` and the boot commands from the `Makefile`,
writes `docs/evidence/config.json`, and ignores it locally via `.git/info/exclude` so the
repo's own `.gitignore` is untouched.

**Detection is a guess — read the printed config and correct it before running.** Known
rough edges:

- `health_path` defaults to `/health`; confirm the service actually serves it.
- Some repos need arguments, e.g. `make migrate-up user=... password=... dbname=... host=... port=...`.
- `stub_server_url` defaults to `http://localhost:1081` when a `mock-providers/` directory
  exists. Set it to `null` for services with no stub server.
- The `stg` entry is a placeholder and must be filled in before any STG Run.

## 2. Run

```bash
node ~/.agent-tools/test-evidence/evidence.mjs run docs/evidence/DP-8413.local.json
```

Preflight probes the service and, if it is down locally, starts Docker dependencies, waits
for the stub server, migrates, launches the app in the background (logging to
`docs/evidence/app.log`), and polls until healthy. **It never tears anything down** — the
service stays up so you can iterate.

Non-local environments are never booted; if STG is unreachable, that is reported and the
Run stops.

Flags:

| Flag | Effect |
|---|---|
| `--only 2,5` | Re-run just those Checks by number, overwriting only their Cards |
| `--mask-pii` | Also mask emails, phone numbers and PII-shaped keys. Use whenever the data is not obviously synthetic |
| `--no-boot` | Fail instead of starting anything |
| `--post` | Publish to ClickUp — see step 5 |

Credential-bearing keys (`Authorization`, `Cookie`, `X-API-Key`, `api_key`, `password`,
`token`, `secret`, `signature`, …) are **always** masked in Evidence Cards. Redaction is
render-time only, so assertions still see real values.

## 3. Read the Outcomes

The Run exits non-zero if anything is `FAIL` or `BLOCKED`.

- **PASS** — expected status matched, and `expect_body` was satisfied.
- **FAIL** — the service misbehaved. This is the only Outcome QA should act on. Attach the
  Card when reporting the defect.
- **BLOCKED** — the Check never reached a verdictable state: connection refused, stub server
  down, or a gateway-class 502/503/504. **This indicts the Verdict, not the service.**

On `BLOCKED`, do not report a bug. Diagnose:

1. Read `docs/evidence/app.log` — the app may have failed to start.
2. Check whether the blocking dependency is genuinely unavailable locally.
3. If it cannot exist locally, go back to `TRIAGE.md`, change that Test Case's Verdict to
   `STG-ONLY` with the observed reason, and move the Check into the `stg` Spec.

Never present a `BLOCKED` Card to QA as evidence of anything except that the Test Case needs
re-triage.

## 4. The Evidence Set

```
docs/evidence/<TICKET>/<env>/
├── NNN-<check>-<METHOD>-<status>.html   # Evidence Card, self-contained
├── NNN-<check>-<METHOD>-<status>.png    # the same Card, rasterised
├── summary.md                           # the record: Outcome + Mode per Check
└── clickup-comment.md                   # paste-ready
```

One Evidence Set per Run per environment — a later STG Run writes to `stg/` and never
overwrites `local/`.

The HTML is always written; the PNG needs a Chromium-family browser (Brave, Chrome,
Chromium, or Edge — or set `EVIDENCE_BROWSER`). If none is found the Run still succeeds with
HTML only, and says so.

Cards for Checks that used a Stub carry a `STUBBED: <dep>` chip, and `summary.md` has a Mode
column. Never strip these — undisclosed Stubs are how false confidence ships.

## 5. Report back

Default: paste `clickup-comment.md` into the ClickUp task and attach the PNGs.

Opt-in publishing:

```bash
CLICKUP_API_TOKEN=… node ~/.agent-tools/test-evidence/evidence.mjs run <spec> --post
```

Also needs `clickup.team_id` in `docs/evidence/config.json` (or `CLICKUP_TEAM_ID`) to
resolve `DP-####` custom IDs. This comments on the task and uploads every Card — it is
outward-facing and visible to the whole team, so only pass `--post` when the person you are
working for has asked for it.

When reporting, always state three things: the Outcome split, whether any Check was
`STUBBED`, and which Test Cases remain deferred to STG.
