# LinkedIn Jobs Toolkit

Reads one LinkedIn job posting anonymously — no login, no session cookie, one request per
posting — and returns it as structured facts. Agent-agnostic: works from Claude Code, pi,
Codex and Hermes.

```
CONTEXT.md      the glossary. Read this first; its terms are load-bearing
CONTRACT.md     the exact CLI + output contract shared by every ~/.agent-tools/*-jobs toolkit
_guest.mjs      the pure parser — parseLinkedInJobId, canonicalLinkedInUrl,
                parseGuestPosting, classifyGuestLiveness, renderSummary (no I/O, exported)
li.mjs          the CLI — anonymous guest fetch of the jobs-guest API, SSRF-guarded
test.mjs        hermetic test suite (no network); run with `node test.mjs`
fixtures/       synthetic, scrubbed posting HTML (placeholders only — never real captures)
fixtures-real/  your own live captures for spot-checking (gitignored, never committed)
stubs/          the per-agent pointer files (SKILL.md, AGENTS.md)
install.sh      lays down thin per-agent pointers
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
node ~/.agent-tools/linkedin-jobs/li.mjs <url> --summary   # human-readable
node ~/.agent-tools/linkedin-jobs/li.mjs <url> --json      # machine-readable (default)
node ~/.agent-tools/linkedin-jobs/li.mjs --help            # usage + full output field list
node ~/.agent-tools/linkedin-jobs/test.mjs                 # hermetic tests
```

Recognized URL shapes (all reduce to one canonical URL, `https://www.linkedin.com/jobs/view/{id}`):

- `/jobs/view/{id}`
- `/jobs/view/{title-slug}-{id}` on any country subdomain
- `/jobs/collections/?currentJobId={id}`
- `/comm/jobs/view/{id}` (email alerts)

## Requirements

- **Node 18+** (uses built-in `fetch`; developed on 24) — zero npm dependencies
- **No LinkedIn account, ever.** Anonymous guest reading only: one request per posting,
  abort on HTTP 429, never retry.

## The three things people get wrong

1. **"Expired" is not the word.** A closed posting is a Route closure (`liveness:
   "closed"`), never Requisition closure. The tool never emits `expired`.
2. **`applyArrangement: "unknown"` means unobservable**, which includes every closed
   posting — never guess `onsite` from a missing off-site marker.
3. **`declared.*` are claims, not evidence.** The advertiser's seniority tag is never a
   level score; derive the level from the JD text and treat a contradiction as a signal.
