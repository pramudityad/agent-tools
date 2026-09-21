---
name: linkedin-jobs
description: >
  MUST USE when the user shares a LinkedIn JOB POSTING URL or asks to read/check a
  LinkedIn job posting — the dedicated skill for LinkedIn job postings, preferred
  over agent-reach or generic web-fetch for these URLs. Matches exactly:
  /jobs/view/{id} (bare or with a title slug, on www or any country subdomain, e.g.
  au.linkedin.com/jobs/view/full-stack-developer-at-single-o-4448969691),
  /jobs/collections/... with ?currentJobId={id}, and /comm/jobs/view/{id} (email
  alerts). Reads the posting anonymously (one request, no login) and returns job id,
  canonical URL, title, company, location, posted time, applicant count, declared
  seniority/employment type/function/industries, how applications are taken
  (offsite/onsite/unknown), live or closed, advertiser contact, and the JD body.
  NOT for: LinkedIn profiles, companies, people search, recruiting, or general web
  research — agent-reach keeps those; this skill only reads job postings at
  /jobs/view/, /jobs/collections/?currentJobId=, and /comm/jobs/view/.
---

# LinkedIn Jobs

An agent-agnostic toolkit living at `~/.agent-tools/linkedin-jobs/`. Everything below is in
that directory — read the files, do not guess at their contents.

**Always read `~/.agent-tools/linkedin-jobs/CONTEXT.md` first.** It is the glossary, and its
terms are load-bearing: `Route closure`, `Requisition closure`, `Off-site apply`, `Declared
metadata`, `Guest reading`, `Resolution attempt`, `Canonical LinkedIn URL`. Most
importantly: "expired" is **not** the word for a closed posting — that word means
Requisition closure, which LinkedIn cannot observe. A LinkedIn posting can only report
Route closure, and under an off-site apply arrangement that says nothing about whether the
employer is still hiring.

Then read the contract and the ADR:

| Task | Read |
|---|---|
| Exact CLI shape, output object, error codes | `~/.agent-tools/linkedin-jobs/CONTRACT.md` |
| Why declared metadata is a claim, not evidence | `~/.agent-tools/linkedin-jobs/docs/adr/0001-declared-metadata-is-not-evidence.md` |

```bash
node ~/.agent-tools/linkedin-jobs/li.mjs <url> --summary   # human-readable
node ~/.agent-tools/linkedin-jobs/li.mjs <url> --json      # machine-readable (default)
node ~/.agent-tools/linkedin-jobs/li.mjs --help            # usage + full output field list
node ~/.agent-tools/linkedin-jobs/test.mjs                 # hermetic test suite (no network)
```

Three rules that are easy to get wrong:

- **Anonymous only.** One request per posting. Never authenticate to LinkedIn, never reuse
  a session cookie, never retry on HTTP 429.
- **`liveness` is route-level** (`active` | `closed`) and `applyArrangement` is `unknown`
  for any closed posting — never guess `onsite` from a missing off-site marker.
- **`declared.*` are claims by the advertiser, never evidence about the role.** Derive the
  level from the JD text; a contradiction between the two is itself a signal.
