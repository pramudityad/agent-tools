// @ts-check
// Guest reading of LinkedIn job postings — pure functions only. No I/O, no network, no
// dependencies. Everything exported so test.mjs can exercise it directly.
//
// The DOM landmarks here were verified against live LinkedIn guest responses. The
// distinction this module turns on is the one from CONTEXT.md: what LinkedIn *claims*
// about a posting (declared.*) is not evidence about the role (see
// docs/adr/0001-declared-metadata-is-not-evidence.md), and `liveness` is route-level
// only — `closed` means Route closure, never Requisition closure, so this module never
// emits the word "expired".

// --- Vendored verbatim from career-ops providers/_html-entities.mjs (origin:
// https://github.com/santifer/career-ops). This toolkit has zero dependencies and never
// imports from career-ops, so the decoder is copied here to keep the two in sync.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** @param {string} s */
export function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      // A lone surrogate half (0xD800-0xDFFF) is a valid codepoint per spec —
      // fromCodePoint won't throw for it — but it's not a valid Unicode scalar
      // value, so we still reject it defensively rather than emit an
      // ill-formed string.
      const valid = Number.isFinite(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

/**
 * Extract the numeric job id from any recognized LinkedIn job URL, or null. All four
 * shapes below are the *same posting* and must reduce to one id:
 *   https://www.linkedin.com/jobs/view/4448969691
 *   https://au.linkedin.com/jobs/view/full-stack-developer-at-single-o-4448969691
 *   https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4448969691
 *   https://www.linkedin.com/comm/jobs/view/4448969691
 * @param {string} url
 * @returns {number|null}
 */
export function parseLinkedInJobId(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null;
  let id = null;
  // /jobs/view/{id} and /comm/jobs/view/{id} — bare id, or {title-slug}-{id} on any
  // country subdomain; the id is always the trailing -{digits} segment.
  const m = u.pathname.match(/\/(?:jobs|comm\/jobs)\/view\/([^/]+)\/?$/i);
  if (m) {
    const last = m[1];
    if (/^\d+$/.test(last)) {
      id = last;
    } else {
      const trail = last.match(/-(\d+)$/);
      if (trail) id = trail[1];
    }
  }
  // /jobs/collections/...?currentJobId={id} (LinkedIn's collection views).
  if (id === null) {
    const q = u.searchParams.get('currentJobId');
    if (q && /^\d+$/.test(q)) id = q;
  }
  return id === null ? null : Number(id);
}

/**
 * The single normalized form of a posting link, derived from its numeric job id —
 * https://www.linkedin.com/jobs/view/{jobId}. Returns null for anything
 * parseLinkedInJobId does not recognize.
 * @param {string} url
 * @returns {string|null}
 */
export function canonicalLinkedInUrl(url) {
  const id = parseLinkedInJobId(url);
  return id === null ? null : `https://www.linkedin.com/jobs/view/${id}`;
}

// --- DOM helpers ---------------------------------------------------------------

/** Strip tags, decode entities, collapse whitespace. */
function clean(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Balanced inner HTML of the first element whose class list contains `classToken`
 * exactly (so `topcard__flavor` never matches `topcard__flavor--bullet`). `tagName`
 * optionally constrains the element type; null matches any. Returns null when no such
 * element exists or its markup is unbalanced.
 * @param {string} html
 * @param {string} classToken
 * @param {string|null} tagName
 */
function extractByClass(html, classToken, tagName = null) {
  const all = collectByClass(html, classToken, tagName);
  return all.length ? all[0] : null;
}

/**
 * Every element whose class list contains `classToken` exactly, in document order,
 * as their balanced inner HTML.
 * @param {string} html @param {string} classToken @param {string|null} tagName
 */
function collectByClass(html, classToken, tagName = null) {
  const tag = tagName ? tagName : '[a-z0-9]+';
  const openRe = new RegExp(`<(${tag})\\b[^>]*class="([^"]*)"[^>]*>`, 'gi');
  const out = [];
  let m;
  while ((m = openRe.exec(html)) !== null) {
    if (!m[2].split(/\s+/).includes(classToken)) continue;
    const name = m[1].toLowerCase();
    const inner = balancedInner(html, name, openRe.lastIndex);
    if (inner !== null) out.push(inner);
  }
  return out;
}

/**
 * The location is the topcard__flavor element that is NOT the org-name link (the
 * org link itself lives inside a topcard__flavor span on the unified top card).
 */
function extractLocation(html) {
  const flavors = collectByClass(html, 'topcard__flavor');
  for (const inner of flavors) {
    if (/topcard__org-name-link/.test(inner)) continue;
    const loc = clean(inner);
    if (loc) return loc;
  }
  for (const inner of flavors) {
    const loc = clean(inner);
    if (loc) return loc;
  }
  return null;
}

/** @param {string} html @param {string} name @param {number} start */
function balancedInner(html, name, start) {
  const scanRe = new RegExp(`<${name}\\b[^>]*>|</${name}\\s*>`, 'gi');
  scanRe.lastIndex = start;
  let depth = 1;
  for (;;) {
    const t = scanRe.exec(html);
    if (!t) return null; // unbalanced / truncated — treat as absent
    if (t[0][1] === '/') {
      depth -= 1;
      if (depth === 0) return html.slice(start, t.index);
    } else {
      depth += 1;
    }
  }
}

/** Text content of the first element carrying `classToken` exactly, or null. */
function textByClass(html, classToken, tagName = null) {
  const inner = extractByClass(html, classToken, tagName);
  return inner === null ? null : clean(inner);
}

// --- Posting parsing -----------------------------------------------------------

/**
 * 'active' | 'closed' — ROUTE level only. `closed` means Route closure (the posting
 * disappeared from the channel it was discovered through); Requisition closure is not
 * observable by any board, so this function NEVER returns "expired". The two verified
 * signals are the `closed-job` class and the "No longer accepting applications" banner.
 * @param {string} html
 * @returns {'active' | 'closed'}
 */
export function classifyGuestLiveness(html) {
  if (typeof html !== 'string') return 'active';
  if (/\bclosed-job\b/.test(html)) return 'closed';
  const norm = html.replace(/\s+/g, ' ').toLowerCase();
  if (norm.includes('no longer accepting applications')) return 'closed';
  return 'active';
}

const DECLARED_LABEL_KEYS = {
  senioritylevel: 'seniority',
  employmenttype: 'employmentType',
  jobfunction: 'jobFunction',
  industries: 'industries',
};

/**
 * The jobId/canonicalUrl/sourceUrl are not present in the HTML — the caller supplies
 * them via ctx (li.mjs passes them through; tests may omit them, in which case they
 * stay null per the "absent field → null" rule).
 * @param {string} html
 * @param {{jobId?: string|null, canonicalUrl?: string|null, sourceUrl?: string|null, maxChars?: number}} [ctx]
 */
export function parseGuestPosting(html, ctx = {}) {
  if (typeof html !== 'string') throw new TypeError('parseGuestPosting: html must be a string');
  const { jobId = null, canonicalUrl = null, sourceUrl = null, maxChars = 12000 } = ctx;
  // canonicalUrl is a pure function of jobId (CONTRACT.md) — derive it when only the
  // id was supplied so the two can never disagree.
  const resolvedCanonicalUrl = canonicalUrl ?? (jobId === null ? null : `https://www.linkedin.com/jobs/view/${jobId}`);

  const liveness = classifyGuestLiveness(html);

  // applyArrangement is observable only while the posting is live — the off-site
  // marker lives on the apply control, which is absent once the posting closes. A
  // closed posting therefore always yields "unknown", never "onsite". On live
  // responses the marker appears as data-tracking-control-name="public_jobs_
  // apply-link-offsite_..." / data-svg-class-name="apply-button__
  // offsite-apply-icon-svg" — substring presence is the verified signal.
  let applyArrangement = 'unknown';
  const offsiteMarker =
    html.includes('apply-link-offsite') || html.includes('offsite-apply-icon-svg');
  if (offsiteMarker) {
    applyArrangement = 'offsite';
  } else if (liveness === 'active') {
    applyArrangement = 'onsite';
  }

  // Title: the guest card uses the newer top-card-layout__title; the older
  // topcard__title appears on full pages / other variants.
  const title =
    textByClass(html, 'top-card-layout__title') ??
    textByClass(html, 'topcard__title');

  // declared.* — the advertiser's claims, namespaced so no caller mistakes them for
  // derived fact. Each criteria item pairs a subheader (label) with the following
  // criteria text (value); both landmark classes are verified.
  const declared = { seniority: null, employmentType: null, jobFunction: null, industries: null };
  const criteriaRe = /<([a-z0-9]+)\b[^>]*class="([^"]*description__job-criteria-(?:subheader|text)[^"]*)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let pendingLabel = null;
  let cm;
  while ((cm = criteriaRe.exec(html)) !== null) {
    const classes = cm[2].split(/\s+/);
    if (classes.includes('description__job-criteria-subheader')) {
      pendingLabel = clean(cm[3]);
    } else if (classes.includes('description__job-criteria-text') && pendingLabel !== null) {
      const key = DECLARED_LABEL_KEYS[pendingLabel.toLowerCase().replace(/[^a-z0-9]/g, '')];
      if (key) {
        const value = clean(cm[3]);
        declared[key] = value.length > 0 ? value : null;
      }
      pendingLabel = null;
    }
  }

  // poster — the advertiser contact. Surfaced here, never persisted by this tool.
  let poster = null;
  const posterName = textByClass(html, 'base-main-card__title');
  const posterProfileUrl = extractPosterProfileUrl(html);
  if (posterName !== null || posterProfileUrl !== null) {
    poster = { name: posterName, profileUrl: posterProfileUrl };
  }

  // body — main posting text, whitespace-collapsed and capped.
  const bodyInner = extractByClass(html, 'description__text--rich', 'div');
  const text = bodyInner === null ? null : clean(bodyInner).slice(0, maxChars);

  return {
    jobId: jobId === null ? null : String(jobId),
    canonicalUrl: resolvedCanonicalUrl,
    sourceUrl,
    title,
    company: textByClass(html, 'topcard__org-name-link', 'a'),
    location: extractLocation(html),
    postedAgo: textByClass(html, 'posted-time-ago__text'),
    // The applicant figure class varies across responses (__figure / __caption).
    applicants: textByClass(html, 'num-applicants__figure') ?? textByClass(html, 'num-applicants__caption'),
    declared,
    applyArrangement,
    liveness,
    poster,
    text,
  };
}

/**
 * The recruiter CTA link carries the poster's profile as a session_redirect query
 * param decoding to https://{cc}.linkedin.com/in/{handle}.
 * @param {string} html
 * @returns {string|null}
 */
function extractPosterProfileUrl(html) {
  // find the element whose class list contains message-the-recruiter-cta
  const re = /<a\b[^>]*class="([^"]*)"[^>]*href="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (!match[1].split(/\s+/).includes('message-the-recruiter-cta')) continue;
    const href = decodeEntities(match[2]);
    // Fall back: some variants link the profile directly.
    if (/^https:\/\/[a-z0-9-]+\.linkedin\.com\/in\//i.test(href)) return href;
    let u;
    try {
      u = new URL(href, 'https://www.linkedin.com');
    } catch {
      return null;
    }
    const raw = u.searchParams.get('session_redirect');
    if (!raw) return null;
    let decoded = raw;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (!/^https:\/\/[a-z0-9-]+\.linkedin\.com\/in\/[A-Za-z0-9._-]+$/i.test(decoded)) return null;
    return decoded;
  }
  return null;
}

// --- Rendering -----------------------------------------------------------------

/**
 * Short human-readable rendering for --summary. Null fields are skipped.
 * @param {ReturnType<typeof parseGuestPosting>} obj
 * @returns {string}
 */
export function renderSummary(obj) {
  const lines = [];
  const head = [obj.jobId, obj.title].filter(Boolean).join(' — ');
  lines.push(`LinkedIn Job ${head || '(no title)'}`);
  const who = [obj.company, obj.location].filter(Boolean).join(' · ');
  if (who) lines.push(`  ${who}`);
  if (obj.canonicalUrl) lines.push(`  ${obj.canonicalUrl}`);
  const meta = [];
  if (obj.postedAgo) meta.push(`posted ${obj.postedAgo}`);
  if (obj.applicants) meta.push(obj.applicants); // verbatim — may already read "25 applicants"
  if (meta.length) lines.push(`  ${meta.join(' · ')}`);
  lines.push(`  liveness: ${obj.liveness} · apply arrangement: ${obj.applyArrangement}`);
  const d = obj.declared || {};
  const decl = [d.seniority, d.employmentType, d.jobFunction, d.industries].filter(Boolean);
  if (decl.length) lines.push(`  declared: ${decl.join(' · ')}`);
  if (obj.poster) {
    const p = [obj.poster.name, obj.poster.profileUrl].filter(Boolean).join(' ');
    if (p) lines.push(`  poster: ${p}`);
  }
  return lines.join('\n');
}
