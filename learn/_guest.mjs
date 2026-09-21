// Pure module for the testable half of the learn toolkit: registry lookup, Probe
// grading, and the derive function. Zero-dep, no I/O, no network. Everything is
// exported so test.mjs can exercise it directly.
//
// The seam this module turns on is CONTEXT.md's central constraint: what was *observed*
// of the learner is a fact, what a model *claims* is a namespaced claim, and the Ledger
// is derived — never stored, always rebuildable from observations.jsonl alone.

const DAY_MS = 86400000;

/** Grade a Probe deterministically. The core computes `correct`; callers never assert it.
 * @param {string} key
 * @param {string} chosen
 * @returns {boolean}
 */
export function gradeProbe(key, chosen) {
  return key === chosen;
}

/** Pure input validation for a Probe record.
 * @param {string[]} options
 * @param {string} key
 * @param {string} chosen
 * @returns {string|null} an error message, or null when the record is gradeable
 */
export function validateProbeInput(options, key, chosen) {
  if (!Array.isArray(options) || options.length === 0) return 'options must be a non-empty list';
  if (!options.includes(key)) return `key "${key}" is not among the options`;
  if (!options.includes(chosen)) return `chosen "${chosen}" is not among the options`;
  return null;
}

/** The verdict that counts for a Recall after Overrides. Latest Override wins — the
 * derive function prefers the Override, per CONTEXT.md. Placeholder for open item 1's
 * "how an Override is weighted": full replacement (overrideWeight 1.0 in policy).
 * @param {object} recall a recall observation
 * @param {object[]} overrides override observations (any concept scope)
 * @returns {string|null} 'demonstrated' | 'partial' | 'missed' | null
 */
export function effectiveVerdict(recall, overrides) {
  const mine = overrides.filter((o) => o.observation === recall.id);
  if (mine.length === 0) return recall.judged ? recall.judged.verdict : null;
  const latest = [...mine].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  return latest.learnerVerdict;
}

/** A Closing is a Recall whose effective verdict is `demonstrated`. Only a Recall can
 * close — no quantity of Probes can.
 * @param {object} obs
 * @param {object[]} overrides
 * @returns {boolean}
 */
export function isClosing(obs, overrides) {
  return obs.kind === 'recall' && effectiveVerdict(obs, overrides) === 'demonstrated';
}

function byAt(a, b) {
  return Date.parse(a.at) - Date.parse(b.at);
}

/** Internal stats shared by the Ledger row and the `why` explanation.
 * @param {object[]} observations concept-scoped observations
 * @param {object} policy
 * @param {string} now ISO timestamp
 */
function stats(observations, policy, now) {
  const P = policy.params;
  const overrides = observations.filter((o) => o.kind === 'override');
  const recalls = observations.filter((o) => o.kind === 'recall');
  const probes = observations.filter((o) => o.kind === 'probe');

  const demonstrated = recalls.filter((r) => effectiveVerdict(r, overrides) === 'demonstrated').sort(byAt);
  const demos = demonstrated.length;
  const probesSeen = probes.length;
  const probesCorrect = probes.filter((p) => gradeProbe(p.key, p.chosen)).length;
  const lastEvidence = observations.length ? observations.map((o) => o.at).sort().at(-1) : null;
  const disputed = overrides.length > 0;

  let spacingDays = [];
  if (demos > 0) {
    spacingDays = demonstrated.map((r, i) =>
      i === 0 ? 0 : Math.max(0, Math.round((Date.parse(r.at) - Date.parse(demonstrated[i - 1].at)) / DAY_MS)),
    );
  }

  let grounding = null;
  if (demos > 0) {
    const kinds = new Set(demonstrated.map((r) => r.grounding));
    grounding = kinds.size > 1 ? 'mixed' : [...kinds][0];
  }

  let standing = 'unknown';
  let strength = null;
  let halfLife = null;
  let elapsedDays = null;
  if (demos > 0) {
    const lastAt = demonstrated.at(-1).at;
    elapsedDays = Math.max(0, (Date.parse(now) - Date.parse(lastAt)) / DAY_MS);
    const avgSpacing =
      spacingDays.length > 1 ? spacingDays.slice(1).reduce((a, b) => a + b, 0) / (spacingDays.length - 1) : 0;
    // Placeholder mechanism (open item 1): exponential decay on a half-life lengthened
    // by repetition count and by spacing between demonstrations. Values live in policy.
    halfLife = P.baseHalfLifeDays * Math.pow(P.repetitionMultiplier, demos - 1) * (1 + P.spacingBonusPerDay * avgSpacing);
    strength = Math.pow(0.5, elapsedDays / halfLife);
    standing = strength < P.decayThreshold ? 'stale' : 'demonstrated';
  }

  return { overrides, demonstrated, demos, probesSeen, probesCorrect, spacingDays, grounding, standing, lastEvidence, disputed, strength, halfLife, elapsedDays };
}

/** Derive the Ledger row for one Concept from its Observations and the Policy.
 * @param {string} slug
 * @param {object[]} observations concept-scoped observations (merged-in included)
 * @param {object} policy
 * @param {string} now ISO timestamp (injected — the derive half never reads a clock)
 * @returns {object} the ledger row, exactly the CONTRACT.md shape
 */
export function deriveLedger(slug, observations, policy, now) {
  const s = stats(observations, policy, now);
  return {
    slug,
    standing: s.standing,
    lastEvidence: s.lastEvidence,
    demonstrations: s.demos,
    spacingDays: s.spacingDays,
    probes: { seen: s.probesSeen, correct: s.probesCorrect },
    grounding: s.grounding,
    policy: policy.name,
    disputed: s.disputed,
  };
}

/** The human rule behind a Standing, for `why`. Mirrors the derivation — if this and the
 * row disagree, the row is right.
 * @returns {{rule: string, details: object}}
 */
export function explainStanding(slug, observations, policy, now) {
  const s = stats(observations, policy, now);
  let rule;
  if (s.demos === 0) {
    rule = 'no demonstrated Recall (effective verdict after Overrides); Probes cannot demonstrate';
  } else if (s.strength < policy.params.decayThreshold) {
    rule = `decayed below the policy threshold: strength ${s.strength.toFixed(3)} < ${policy.params.decayThreshold} after ${s.elapsedDays.toFixed(1)} days (effective half-life ${s.halfLife.toFixed(1)} days)`;
  } else {
    rule = `demonstrated by ${s.demos} Recall(s); strength ${s.strength.toFixed(3)} >= ${policy.params.decayThreshold}`;
  }
  return {
    rule,
    details: {
      demonstrations: s.demos,
      spacingDays: s.spacingDays,
      effectiveHalfLifeDays: s.halfLife === null ? null : +s.halfLife.toFixed(1),
      strength: s.strength === null ? null : +s.strength.toFixed(3),
      elapsedDays: s.elapsedDays === null ? null : +s.elapsedDays.toFixed(1),
      policy: policy.name,
    },
  };
}

/** Candidate Concepts for `concept lookup`: exact slug (tier 0), exact alias (tier 1),
 * slug prefix (tier 2), definition text (tier 3), slug substring (tier 4). Two or more
 * exact-tier hits means the query is genuinely ambiguous — the caller must qualify.
 * @param {object[]} registry raw registry.jsonl rows
 * @param {string} query
 * @returns {{candidates: object[], ambiguous: boolean}}
 */
export function lookupConcepts(registry, query) {
  const q = String(query).toLowerCase();
  const candidates = [];
  for (const row of registry) {
    if (row.mergedInto) continue; // merge tombstones are not candidates
    const isAlias = Boolean(row.aliasOf);
    const def = row.definition ?? '';
    let tier = null;
    let match = null;
    if (isAlias) {
      if (row.slug.toLowerCase() === q) {
        tier = 1;
        match = 'alias';
      } else if (row.slug.toLowerCase().includes(q)) {
        tier = 4;
        match = 'slug-partial';
      }
    } else if (row.slug.toLowerCase() === q) {
      tier = 0;
      match = 'slug';
    } else if (row.slug.toLowerCase().startsWith(q)) {
      tier = 2;
      match = 'slug-prefix';
    } else if (def.toLowerCase().includes(q)) {
      tier = 3;
      match = 'definition';
    } else if (row.slug.toLowerCase().includes(q)) {
      tier = 4;
      match = 'slug-partial';
    }
    if (tier !== null) {
      candidates.push({
        slug: row.slug,
        resolvesTo: row.aliasOf ?? null,
        definition: def,
        domains: row.domains ?? [],
        aliases: row.aliases ?? [],
        note: row.note ?? null,
        tier,
        match,
      });
    }
  }
  candidates.sort((a, b) => a.tier - b.tier);
  const exact = candidates.filter((c) => c.tier <= 1);
  return { candidates, ambiguous: exact.length >= 2 };
}

/** The Concepts on a Path whose Standing is `unknown` or `stale` — where probing happens.
 * @param {string[]} walk
 * @param {Record<string, {standing: string}>} ledger slug -> ledger row
 * @returns {string[]}
 */
export function computeFrontier(walk, ledger) {
  return walk.filter((slug) => {
    const st = ledger[slug] && ledger[slug].standing;
    return st === 'unknown' || st === 'stale';
  });
}
