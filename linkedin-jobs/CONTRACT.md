# Job-posting reader contract

The output shape and CLI behaviour shared by every `~/.agent-tools/*-jobs` toolkit. One
toolkit per board (`linkedin-jobs`, and later e.g. `itviec-jobs`) — siblings, never a
single multi-board tool, so each stays legibly "the dedicated skill for that platform"
and can be preferred over a generic web-fetch skill.

Only fields verified against a real board appear here. A new board **extends** this
contract with what it can actually observe; it does not emit an empty field to satisfy
the shape, and this document is not a place to anticipate fields nobody has seen.

## CLI

```
<tool>.mjs <url|id> [--json] [--summary] [--max-chars N] [--help]
```

- `--json` (default) — one compact JSON object on stdout, nothing else
- `--summary` — short human-readable rendering on stdout
- `--help` — usage **and the full output field list**, so an agent that has never seen
  this tool can learn the contract without reading source
- Exit `0` on success
- Exit `1` with `{"error": "...", "code": "..."}` on stderr

### Required error codes

| code | meaning |
|---|---|
| `not_found` | the board returned 404 for this posting |
| `rate_limited` | HTTP 429 — abort, never retry |
| `bad_url` | not a recognized posting URL for this board |
| `blocked_host` | host allowlist / non-https rejection |
| `network_error` | transport failure |

A caller must be able to distinguish "this posting is gone" from "we could not look" from
the exit code and `code` alone, without parsing prose.

## Output object

```jsonc
{
  "jobId":        "4452912188",
  "canonicalUrl": "https://www.linkedin.com/jobs/view/4452912188",
  "sourceUrl":    "<exactly what the caller passed in>",

  "title":    "Backend Engineer - Card Issuing Team",
  "company":  "StraitsX",
  "location": "Jakarta, Jakarta, Indonesia",

  "postedAgo":  "6 hours ago",   // verbatim from the board; never parsed into a date
  "applicants": "25",            // verbatim; boards report this inconsistently

  // CLAIMS made by whoever placed the advert. Namespaced so no caller can
  // mistake them for derived fact. See docs/adr/0001.
  "declared": {
    "seniority":      "Not Applicable",
    "employmentType": "Full-time",
    "jobFunction":    "Engineering and Information Technology",
    "industries":     "Financial Services"
  },

  "applyArrangement": "offsite",  // "offsite" | "onsite" | "unknown"
  "liveness":         "active",   // "active" | "closed"  — ROUTE level only

  "poster": { "name": "…", "profileUrl": "https://…" },  // or null

  "text": "<main posting body, whitespace-collapsed, capped>"
}
```

### Field rules

- **`liveness` is route-level.** Values are `active` and `closed` only. The tool must
  never emit `expired` — that word means Requisition closure, which no board can observe
  (see `CONTEXT.md`). Mapping `closed` onto downstream behaviour is the caller's job.
- **`applyArrangement` is `unknown` when unobservable**, which includes every closed
  posting. Never guess `onsite` from the absence of an off-site marker.
- **`declared.*` values are verbatim strings**, never normalized into an enum. Normalizing
  would erase the sloppiness that makes a contradiction detectable.
- **`postedAgo` and `applicants` stay verbatim.** Boards phrase these inconsistently and a
  parsed value invents precision that was never there.
- **`poster` is surfaced, never persisted** by the tool. It is third-party personal data;
  writing it anywhere is a decision for the caller, taken with the person's knowledge.
- **Absent field → `null`.** Never an empty string, never a placeholder like `"N/A"`.
- **`text` is capped** (default 12000 chars), overridable with `--max-chars`.

## Non-goals

No fit scoring, no ranking, no CV comparison. These tools gather facts; the systems that
consume them hold the opinions. A tool that scored fit would need the candidate's profile,
which would recouple it to one consumer and fork scoring logic that consumer already owns.

No writes. No files created, no trackers updated, no contacts saved. stdout only.

No authentication, ever. See the invariants in `CONTEXT.md`.
