## Test Evidence

When asked to verify QA test cases, work out whether they can run locally, or capture API
test evidence for a ticket, use the toolkit at `~/.agent-tools/test-evidence/`.

Read `~/.agent-tools/test-evidence/CONTEXT.md` first — it is the glossary and its terms are
load-bearing. Note that "mock" means a mockgen-generated Go interface double in these repos;
an HTTP stub is a **Stub**.

- Deciding what runs locally vs STG → `~/.agent-tools/test-evidence/TRIAGE.md`
- Booting the service and capturing evidence → `~/.agent-tools/test-evidence/CAPTURE.md`

```bash
node ~/.agent-tools/test-evidence/evidence.mjs init       # configure a repo (once)
node ~/.agent-tools/test-evidence/evidence.mjs run <spec> # execute + render
```

A `BLOCKED` Outcome indicts the Verdict, not the service — re-triage rather than reporting a
defect. Never strip the `STUBBED` disclosure from evidence.
