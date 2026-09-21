# LinkedIn Job Postings

Reading a LinkedIn job posting honestly, without an account. These terms are load-bearing:
the whole toolkit turns on the difference between what LinkedIn *claims* about a posting
and what is *true* of the role.

## Language

**Canonical LinkedIn URL**:
The single normalized form of a posting link, derived from its numeric job ID:
`https://www.linkedin.com/jobs/view/{jobId}`. LinkedIn serves the same posting under
country subdomains, title slugs, a `currentJobId` query parameter, and its own
email-alert paths. All are the same posting and must reduce to one form before any
comparison.
_Avoid_: normalized URL, cleaned link, deduped URL

**Guest reading**:
Retrieving a posting's public content anonymously — no account, no login, no session
credential. Distinguished from authenticated access, which carries contractual
obligations that anonymous reading does not. This distinction is the toolkit's central
constraint, not a preference.
_Avoid_: scraping, crawling, fetching

**Declared metadata**:
Fields LinkedIn displays about a posting — seniority level, employment type, job
function, industry — authored by whoever placed the advert rather than derived from the
requirement text. A claim *about* the posting, never a property *of* it. Where a claim
contradicts the requirement text, the contradiction is itself the signal.
_Avoid_: job metadata, attributes, tags

## Closure

**Route closure**:
The disappearance of a posting from the channel through which it was discovered. Says
nothing on its own about whether the employer is still hiring. This is the only kind of
closure LinkedIn can report.
_Avoid_: expired, dead link, closed

**Requisition closure**:
The employer ceasing to accept applications for the role itself. The only closure that
justifies abandoning a posting. LinkedIn cannot observe this.
_Avoid_: expired, filled, closed

**Off-site apply**:
An arrangement where LinkedIn advertises the role but the application is taken on the
employer's own system. Under this arrangement a Route closure carries no information
about Requisition closure.

Observable **only while a posting is live** — the marker lives on the apply control,
which is absent once the posting closes. A posting first encountered in a closed state
therefore cannot be classified, and must not be guessed at.
_Avoid_: external apply, redirect apply

**Resolution attempt**:
A single bounded lookup, made after a Route closure, to establish whether the requisition
is still open on the employer's own system. Bounded by construction: it either finds the
employer's posting or concludes nothing. It never escalates into open-ended research.
_Avoid_: verification, re-check, deep search

## Invariants

Anonymous access only. No login, no session cookie, no credential, no authenticated
endpoint — ever. One request per posting. Abort on HTTP 429 rather than retrying.

Declared metadata is never a scoring input. Derive level from the requirement text and
record any contradiction as a signal in its own right.

A Route closure triggers a Resolution attempt, never abandonment. The asymmetry that
drives this: wrongly concluding "closed" silently destroys a role someone cared enough
about to look up, and leaves no trace. The opposite error costs one lookup. Only the
first kind of error is invisible, which is why the default leans away from it.
