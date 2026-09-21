#!/usr/bin/env node
// @ts-check
// li.mjs — read ONE LinkedIn job posting anonymously (guest reading) and print it as
// structured facts. No login, no session cookie, no credential, no authenticated
// endpoint. One request per posting. Aborts on HTTP 429, never retries.
//
// Output contract: CONTRACT.md (same directory). Exit 0 on success; on failure one
// compact JSON object on stderr: {"error": "...", "code": "..."} where code is one of
// not_found | rate_limited | bad_url | blocked_host | network_error.

import { parseLinkedInJobId, canonicalLinkedInUrl, parseGuestPosting, renderSummary } from './_guest.mjs';

// --- Vendored from career-ops user-agent.mjs (origin: https://github.com/santifer/career-ops)
// Browser-like UA required to clear WAF/bot management on boards that block plain tool UAs.
// Copied verbatim to keep this zero-dependency toolkit in sync.
const BROWSER_LIKE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const GUEST_ENDPOINT = (jobId) => `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
// SSRF guard — the guest fetch may only ever target www.linkedin.com over https.
const ALLOWED_GUEST_HOSTS = new Set(['www.linkedin.com']);

const DEFAULT_MAX_CHARS = 12000;
const TIMEOUT_MS = 15000;

// Mirrors assertGreenhouseUrl in career-ops providers/greenhouse.mjs (host allowlist +
// https-only) — shape copied, not imported.
/** @param {string} url */
function assertGuestEndpoint(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`linkedin: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`linkedin: URL must use HTTPS: ${url}`);
  if (!ALLOWED_GUEST_HOSTS.has(parsed.hostname))
    throw new Error(`linkedin: untrusted hostname "${parsed.hostname}" — must be one of: ${[...ALLOWED_GUEST_HOSTS].join(', ')}`);
  return url;
}

const USAGE = `li.mjs — read one LinkedIn job posting anonymously (guest reading)

Usage:
  node li.mjs <url|id> [--json] [--summary] [--max-chars N] [--help]

Arguments:
  <url|id>    A LinkedIn job URL in any of the four recognized shapes, or a bare
              numeric job id:
                https://www.linkedin.com/jobs/view/{id}
                https://{cc}.linkedin.com/jobs/view/{title-slug}-{id}
                https://www.linkedin.com/jobs/collections/...?currentJobId={id}
                https://www.linkedin.com/comm/jobs/view/{id}
              Anything else exits 1 with code "bad_url".

Options:
  --json          One compact JSON object on stdout (default)
  --summary       Short human-readable rendering on stdout
  --max-chars N   Cap the "text" field at N characters (default 12000)
  --help          This usage text and the full output field list

Output fields (JSON):
  jobId            numeric posting id, string, e.g. "4452912188"
  canonicalUrl     https://www.linkedin.com/jobs/view/{jobId}
  sourceUrl        exactly what the caller passed in
  title            posting title (DOM: top-card-layout__title / topcard__title)
  company          posting company (topcard__org-name-link)
  location         posting location (topcard__flavor)
  postedAgo        verbatim "6 hours ago" text (posted-time-ago__text) — never parsed
  applicants       verbatim applicant figure (num-applicants__figure) — boards report
                   it inconsistently, so it stays verbatim
  declared.seniority        advertiser claim (description__job-criteria-subheader/text)
  declared.employmentType   advertiser claim — structural, trusted as a filter input
  declared.jobFunction      advertiser claim
  declared.industries       advertiser claim
  applyArrangement  "offsite" | "onsite" | "unknown" — "unknown" for any closed posting
  liveness          "active" | "closed" — ROUTE level only; never "expired"
  poster.name       advertiser contact name (base-main-card__title) — surfaced, never
                    persisted by this tool
  poster.profileUrl advertiser profile (message-the-recruiter-cta session_redirect)
  text              main posting body (description__text--rich), whitespace-collapsed,
                    capped by --max-chars (default 12000)

Exit codes:
  0   success
  1   failure; one compact JSON object on stderr:
      {"error": "<message>", "code": "<code>"}
      code is one of: not_found | rate_limited | bad_url | blocked_host | network_error

Rules:
  Anonymous only — one request per posting, no login, no session cookie, no credential.
  Aborts on HTTP 429, never retries. Declared metadata is a claim, never a scoring input.
`;

/** @param {string} code @param {string} message */
function fail(code, message) {
  process.stderr.write(JSON.stringify({ error: message, code }) + '\n');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write(USAGE);
    return;
  }

  let summary = false;
  let maxChars = DEFAULT_MAX_CHARS;
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') {
      summary = false;
    } else if (a === '--summary') {
      summary = true;
    } else if (a === '--max-chars') {
      const raw = args[++i];
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) fail('bad_url', `--max-chars expects a non-negative integer, got "${raw}"`);
      maxChars = n;
    } else if (a.startsWith('-')) {
      fail('bad_url', `unknown option: ${a} — run with --help`);
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length === 0) fail('bad_url', 'missing <url|id> — run with --help');

  const input = positionals[0].trim();
  // A bare numeric id is a posting URL in disguise.
  const url = /^\d+$/.test(input) ? `https://www.linkedin.com/jobs/view/${input}` : input;

  const jobId = parseLinkedInJobId(url);
  if (jobId === null) fail('bad_url', `not a LinkedIn job posting URL: ${input}`);
  const sourceUrl = input; // exactly what the caller passed in
  const canonicalUrl = canonicalLinkedInUrl(url);

  const endpoint = assertGuestEndpoint(GUEST_ENDPOINT(jobId));

  let res;
  try {
    res = await fetch(endpoint, {
      redirect: 'error', // never follow a redirect off the allowlisted host
      headers: {
        'user-agent': BROWSER_LIKE_USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    fail('network_error', `could not reach ${endpoint}: ${detail}`);
  }

  if (res.status === 404) fail('not_found', `LinkedIn returned 404 for posting ${jobId}`);
  if (res.status === 429) fail('rate_limited', 'HTTP 429 from LinkedIn — aborting, never retrying (anonymous one-shot policy)');
  if (res.status !== 200) fail('network_error', `unexpected HTTP ${res.status} from ${endpoint}`);

  const html = await res.text();

  const posting = parseGuestPosting(html, { jobId: String(jobId), canonicalUrl, sourceUrl, maxChars });
  if (summary) {
    process.stdout.write(renderSummary(posting) + '\n');
  } else {
    process.stdout.write(JSON.stringify(posting) + '\n');
  }
}

main().catch((err) => fail('network_error', err instanceof Error ? err.message : String(err)));
