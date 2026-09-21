---
name: test-evidence
description: Turn QA-supplied test cases into reproducible, attachable API test evidence. Use when QA hands over test cases and you must work out which are runnable locally versus STG-only, boot a service locally via docker or make, execute the requests, and produce screenshots plus a summary to attach to a ClickUp ticket. Triggered by phrases such as test evidence, QA test cases, can we test this locally, capture evidence, verify these test cases, or a DP-numbered ticket accompanied by test cases.
---

# Test Evidence

An agent-agnostic toolkit living at `~/.agent-tools/test-evidence/`. Everything below is in
that directory — read the files, do not guess at their contents.

**Always read `~/.agent-tools/test-evidence/CONTEXT.md` first.** It is the glossary, and its
terms are load-bearing: `Test Case`, `Check`, `Stub`, `Verdict`, `Outcome`, `Spec`, `Run`,
`Evidence Card`, `Evidence Set`. Most importantly, "mock" is **not** the word for an HTTP
stub in these repos — it means a mockgen-generated Go interface double.

Then pick the phase:

| Task | Read |
|---|---|
| QA gave you test cases; work out what can run locally vs STG | `~/.agent-tools/test-evidence/TRIAGE.md` |
| A Spec exists; boot the service, execute it, produce evidence | `~/.agent-tools/test-evidence/CAPTURE.md` |

Triage is judgement and produces `<TICKET>-triage.md` plus one Spec per environment. It
never runs anything. Capture executes a Spec via `evidence.mjs` and produces an Evidence Set.

```bash
node ~/.agent-tools/test-evidence/evidence.mjs            # usage
node ~/.agent-tools/test-evidence/evidence.mjs init       # configure a repo (once)
node ~/.agent-tools/test-evidence/evidence.mjs run <spec> # execute + render
```

Two rules that are easy to get wrong:

- A `BLOCKED` Outcome means the Verdict was wrong, not that the service has a bug. Re-triage;
  never report it to QA as a defect.
- Never remove the `STUBBED` disclosure from a Card or summary.
