# Test Evidence Toolkit

Turns QA-supplied test cases into reproducible, attachable proof that an endpoint behaves as
specified — across Claude Code, pi, Codex and Hermes.

```
CONTEXT.md      the glossary. Read this first; its terms are load-bearing
TRIAGE.md       playbook: decide what runs locally vs STG (judgement, runs nothing)
CAPTURE.md      playbook: boot, execute, render evidence
evidence.mjs    the deterministic core — zero dependencies, any agent can shell out to it
install.sh      lays down thin per-agent pointers
stubs/          the pointer files themselves
docs/adr/       why it is shaped this way
```

## Install

```bash
./install.sh
```

Installs a `SKILL.md` for Claude Code and pi, and appends a section to `AGENTS.md` for Codex
and Hermes — only for agents present on the machine. Re-run after installing a new agent.

## Use

```bash
node ~/.agent-tools/test-evidence/evidence.mjs init        # once per repo
node ~/.agent-tools/test-evidence/evidence.mjs run docs/evidence/DP-8413.local.json
```

Produces `docs/evidence/<TICKET>/<env>/` containing an Evidence Card (HTML + PNG) per Check,
a `summary.md`, and a paste-ready `clickup-comment.md`. Exits non-zero if any Check is
`FAIL` or `BLOCKED`.

## Requirements

- **Node 18+** (uses built-in `fetch`; developed on 24) — see `docs/adr/0001`
- **A Chromium-family browser** for PNGs: Brave, Chrome, Chromium or Edge, or set
  `EVIDENCE_BROWSER`. Without one, Cards are still written as HTML.
- **Docker** only if you want local booting.
- `CLICKUP_API_TOKEN` and `clickup.team_id` only for `--post`.

## The three things people get wrong

1. **"Mock" is not the word.** In these repos a mock is a mockgen-generated Go interface
   double. An injected HTTP response is a **Stub**.
2. **`BLOCKED` is not a bug.** It means the Check never reached a verdictable state, so the
   Verdict was wrong. Re-triage; do not report it to QA as a defect.
3. **Never strip the `STUBBED` disclosure.** Evidence that hides a stub overstates what was
   proven.
