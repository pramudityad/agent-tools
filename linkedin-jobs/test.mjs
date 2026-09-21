#!/usr/bin/env node
// @ts-check
// Hermetic test suite — no network, no dependencies beyond Node's built-ins. Fixtures
// in fixtures/ are synthetic and scrubbed (placeholders only; see the comment at the
// top of each). Run with: node test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  parseLinkedInJobId,
  canonicalLinkedInUrl,
  parseGuestPosting,
  classifyGuestLiveness,
  renderSummary,
} from './_guest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const fixtureFor = (name, ctx) => parseGuestPosting(fixture(name), ctx);

// --- URL shapes ----------------------------------------------------------------

const SHAPE_URLS = {
  plain: 'https://www.linkedin.com/jobs/view/4448969691',
  slug: 'https://au.linkedin.com/jobs/view/full-stack-developer-at-single-o-4448969691',
  collection: 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4448969691',
  email: 'https://www.linkedin.com/comm/jobs/view/4448969691',
};

test('parseLinkedInJobId: all four URL shapes yield the same numeric id', () => {
  for (const shape of Object.values(SHAPE_URLS)) {
    assert.equal(parseLinkedInJobId(shape), 4448969691, shape);
  }
});

test('canonicalLinkedInUrl: all four URL shapes reduce to one canonical URL', () => {
  for (const shape of Object.values(SHAPE_URLS)) {
    assert.equal(canonicalLinkedInUrl(shape), 'https://www.linkedin.com/jobs/view/4448969691', shape);
  }
});

test('parseLinkedInJobId: trailing-slash and extra-query variants still parse', () => {
  assert.equal(parseLinkedInJobId('https://www.linkedin.com/jobs/view/4448969691/'), 4448969691);
  assert.equal(parseLinkedInJobId('https://www.linkedin.com/jobs/view/4448969691?trackingId=abc'), 4448969691);
  assert.equal(parseLinkedInJobId('https://de.linkedin.com/jobs/view/backend-ingenieur-4448969691?lang=en'), 4448969691);
});

test('parseLinkedInJobId: rejects non-LinkedIn hosts, non-postings and junk', () => {
  const bad = [
    'https://example.com/jobs/view/4448969691',
    'https://www.linkedin.com/jobs/view/',
    'https://www.linkedin.com/jobs/view/abc',
    'https://www.linkedin.com/jobs/view/4448969691x',
    'https://www.linkedin.com/jobs/collections/recommended/',
    'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=notanumber',
    'https://www.linkedin.com/company/acme-widgets',
    'not a url',
    '',
    'https://www.linkedin.cn/jobs/view/4448969691',
  ];
  for (const u of bad) {
    assert.equal(parseLinkedInJobId(u), null, u);
    assert.equal(canonicalLinkedInUrl(u), null, u);
  }
});

// --- Liveness ------------------------------------------------------------------

test('classifyGuestLiveness: active fixture is active, never "expired"', () => {
  assert.equal(classifyGuestLiveness(fixture('active.html')), 'active');
});

test('classifyGuestLiveness: closed fixture is closed via both markers', () => {
  assert.equal(classifyGuestLiveness(fixture('closed.html')), 'closed');
  // The marker can appear through either signal alone.
  assert.equal(classifyGuestLiveness('<div class="closed-job"></div>'), 'closed');
  assert.equal(classifyGuestLiveness('<p>No longer accepting applications</p>'), 'closed');
});

test('classifyGuestLiveness: only ever emits "active" or "closed"', () => {
  const samples = [
    fixture('active.html'),
    fixture('closed.html'),
    fixture('onsite.html'),
    fixture('sparse.html'),
    '<div>this job has expired</div>', // the word "expired" must not be observed
  ];
  for (const s of samples) {
    const v = classifyGuestLiveness(s);
    assert.ok(v === 'active' || v === 'closed', `unexpected liveness value ${JSON.stringify(v)}`);
  }
});

// --- Active posting ------------------------------------------------------------

test('parseGuestPosting: active fixture — all fields', () => {
  const p = fixtureFor('active.html', { jobId: '4452912188', sourceUrl: SHAPE_URLS.plain });
  assert.equal(p.jobId, '4452912188');
  assert.equal(p.canonicalUrl, 'https://www.linkedin.com/jobs/view/4452912188');
  assert.equal(p.sourceUrl, SHAPE_URLS.plain);
  assert.equal(p.title, 'Backend Engineer - Card Issuing Team');
  assert.equal(p.company, 'Acme Widgets');
  assert.equal(p.location, 'Jakarta, Jakarta, Indonesia');
  assert.equal(p.postedAgo, '6 hours ago');
  assert.equal(p.applicants, '25');
  assert.deepEqual(p.declared, {
    seniority: 'Not Applicable',
    employmentType: 'Full-time',
    jobFunction: 'Engineering and Information Technology',
    industries: 'Financial Services',
  });
  assert.equal(p.applyArrangement, 'offsite');
  assert.equal(p.liveness, 'active');
  assert.deepEqual(p.poster, {
    name: 'Jane Recruiter',
    profileUrl: 'https://www.linkedin.com/in/jane-recruiter',
  });
  assert.ok(p.text.includes('Backend Engineer'));
  assert.ok(p.text.includes('Node.js'), 'HTML entities must be decoded (&amp; -> &)');
  assert.ok(p.text.includes('TypeScript'));
});

test('parseGuestPosting: active fixture — absent ctx stays null, never empty string', () => {
  const p = parseGuestPosting(fixture('active.html'));
  assert.equal(p.jobId, null);
  assert.equal(p.canonicalUrl, null);
  assert.equal(p.sourceUrl, null);
});

// --- Closed posting (acceptance: closed + unknown) -----------------------------

test('parseGuestPosting: closed fixture — liveness "closed", applyArrangement "unknown"', () => {
  const p = fixtureFor('closed.html', { jobId: '4434793441' });
  assert.equal(p.liveness, 'closed');
  assert.equal(p.applyArrangement, 'unknown'); // never guessed "onsite"
  assert.equal(p.declared.seniority, 'Entry level');
  assert.equal(p.title, 'Gameplay Engineer');
  assert.equal(p.company, 'Nebula Games');
  assert.equal(p.poster.name, 'Hiring Manager');
});

// --- Onsite (live, no off-site marker) -----------------------------------------

test('parseGuestPosting: live posting without an off-site marker is "onsite"', () => {
  const p = fixtureFor('onsite.html', { jobId: '8888888888' });
  assert.equal(p.liveness, 'active');
  assert.equal(p.applyArrangement, 'onsite');
  // Balanced extraction: nested <div>s must not truncate the body.
  assert.ok(p.text.includes('About the role'), p.text);
  assert.ok(p.text.includes('Closing paragraph'), 'nested divs must not truncate the body');
  assert.ok(p.text.includes('Design internal services'));
  assert.ok(p.text.includes('reliability bar'));
});

// --- Sparse (absent fields) ----------------------------------------------------

test('parseGuestPosting: absent fields are null, never empty string', () => {
  const p = fixtureFor('sparse.html', { jobId: '7777777777' });
  assert.equal(p.title, 'API Engineer'); // old topcard__title landmark still works
  assert.equal(p.company, 'Example Corp');
  assert.equal(p.location, 'Remote');
  assert.equal(p.postedAgo, null);
  assert.equal(p.applicants, null);
  assert.deepEqual(p.declared, { seniority: null, employmentType: null, jobFunction: null, industries: null });
  assert.equal(p.poster, null);
  assert.equal(p.applyArrangement, 'onsite'); // active, no off-site marker
  assert.equal(p.liveness, 'active');
});

// --- Text cap ------------------------------------------------------------------

test('parseGuestPosting: text is capped by maxChars (default 12000)', () => {
  const p = fixtureFor('active.html', { jobId: '1' });
  assert.ok(p.text.length <= 12000);
  const short = fixtureFor('active.html', { jobId: '1', maxChars: 20 });
  assert.ok(short.text.length <= 20, `expected <= 20 chars, got ${short.text.length}`);
});

// --- Summary -------------------------------------------------------------------

test('renderSummary: includes id, title, canonical url, liveness', () => {
  const p = fixtureFor('active.html', { jobId: '4452912188', sourceUrl: SHAPE_URLS.plain });
  const s = renderSummary(p);
  assert.ok(s.includes('4452912188'), s);
  assert.ok(s.includes('Backend Engineer'), s);
  assert.ok(s.includes('https://www.linkedin.com/jobs/view/4452912188'), s);
  assert.ok(s.includes('liveness: active'), s);
});

// --- CLI help (acceptance: every CONTRACT.md field listed) ---------------------

test('li.mjs --help lists every output field from CONTRACT.md', () => {
  const out = execFileSync(process.execPath, [join(here, 'li.mjs'), '--help'], { encoding: 'utf8' });
  for (const field of [
    'jobId', 'canonicalUrl', 'sourceUrl',
    'title', 'company', 'location', 'postedAgo', 'applicants',
    'declared.seniority', 'declared.employmentType', 'declared.jobFunction', 'declared.industries',
    'applyArrangement', 'liveness', 'poster.name', 'poster.profileUrl', 'text',
  ]) {
    assert.ok(out.includes(field), `--help must mention "${field}"`);
  }
  for (const code of ['not_found', 'rate_limited', 'bad_url', 'blocked_host', 'network_error']) {
    assert.ok(out.includes(code), `--help must mention error code "${code}"`);
  }
});

// --- Runner --------------------------------------------------------------------

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(err instanceof Error ? `  ${err.message}` : `  ${String(err)}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
