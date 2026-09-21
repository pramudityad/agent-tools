## LinkedIn Jobs

When the user shares a LinkedIn JOB POSTING URL — any of `/jobs/view/{id}` (bare or with a
title slug on any country subdomain), `/jobs/collections/?currentJobId={id}`, or
`/comm/jobs/view/{id}` — or asks whether a LinkedIn posting is live, to extract the JD, or
who posted it, use the dedicated toolkit at `~/.agent-tools/linkedin-jobs/` first. It is
the dedicated skill for LinkedIn job postings; agent-reach keeps profiles, companies and
people search.

Read `~/.agent-tools/linkedin-jobs/CONTEXT.md` first — it is the glossary and its terms are
load-bearing: Route closure, Requisition closure, Off-site apply, Declared metadata, Guest
reading, Resolution attempt, Canonical LinkedIn URL.

```bash
node ~/.agent-tools/linkedin-jobs/li.mjs <url> --summary   # human-readable
node ~/.agent-tools/linkedin-jobs/li.mjs <url> --json      # machine-readable (default)
node ~/.agent-tools/linkedin-jobs/li.mjs --help            # usage + output fields
```

The reader is anonymous and one-request-per-posting: never authenticate to LinkedIn, never
reuse a session, never retry on HTTP 429. `liveness` is route-level (`active` | `closed`)
and `applyArrangement` is `unknown` for any closed posting — a closed LinkedIn posting says
nothing about whether the employer is still hiring.
