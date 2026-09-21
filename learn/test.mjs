#!/usr/bin/env node
// @ts-check
// Hermetic test suite — no network, no dependencies beyond Node's built-ins. The
// derive half injects time; the CLI half runs against a throwaway vault in the OS
// temp dir via --home. Run with: node test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  gradeProbe,
  validateProbeInput,
  effectiveVerdict,
  isClosing,
  deriveLedger,
  lookupConcepts,
  computeFrontier,
} from './_guest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LEARN = join(here, 'learn.mjs');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// Placeholder policy — mirrors what init writes. Values are open item 1 (pending
// spaced-repetition literature research); the mechanism is what these tests pin down.
const POLICY = {
  name: 'v1',
  params: {
    baseHalfLifeDays: 30,
    decayThreshold: 0.5,
    repetitionMultiplier: 1.6,
    spacingBonusPerDay: 0.5,
    overrideWeight: 1.0,
  },
};

const T0 = '2026-08-16T00:00:00Z';
const day = (n) => new Date(Date.parse(T0) + n * 86400000).toISOString();

const obs = (o) => ({ id: o.id ?? 'obs_x', at: o.at ?? T0, session: o.session ?? 'ses_x', concept: o.concept ?? 'c', ...o });
const recall = (o) =>
  obs({ kind: 'recall', prompt: 'p', answer: 'a', judged: { verdict: 'demonstrated', by: 'model', rubric: 'r' }, grounding: 'sourced', sources: ['S'], ...o });
const probe = (o) => obs({ kind: 'probe', item: 'i', options: ['a', 'b'], key: 'a', chosen: 'b', correct: false, ...o });

// --- Probe grading -----------------------------------------------------------

test('gradeProbe: equality decides correct', () => {
  assert.equal(gradeProbe('a', 'a'), true);
  assert.equal(gradeProbe('a', 'b'), false);
});

test('validateProbeInput: key/chosen must be among options', () => {
  assert.equal(validateProbeInput(['a', 'b'], 'a', 'b'), null);
  assert.ok(validateProbeInput(['a', 'b'], 'z', 'a'));
  assert.ok(validateProbeInput(['a', 'b'], 'a', 'z'));
  assert.ok(validateProbeInput([], 'a', 'a'));
});

// --- Derive: Standing ---------------------------------------------------------

test('deriveLedger: no observations is unknown, zeroed row', () => {
  const row = deriveLedger('c', [], POLICY, T0);
  assert.equal(row.standing, 'unknown');
  assert.equal(row.demonstrations, 0);
  assert.deepEqual(row.spacingDays, []);
  assert.deepEqual(row.probes, { seen: 0, correct: 0 });
  assert.equal(row.grounding, null);
  assert.equal(row.policy, 'v1');
  assert.equal(row.disputed, false);
  assert.equal(row.lastEvidence, null);
});

test('deriveLedger: probes alone can never demonstrate', () => {
  const rows = [probe({ correct: true }), probe({ correct: true }), probe({ correct: true }), probe({ correct: true })];
  assert.equal(deriveLedger('c', rows, POLICY, T0).standing, 'unknown');
});

test('deriveLedger: one demonstrated recall moves to demonstrated', () => {
  const row = deriveLedger('c', [recall({})], POLICY, T0);
  assert.equal(row.standing, 'demonstrated');
  assert.equal(row.demonstrations, 1);
  assert.equal(row.grounding, 'sourced');
});

test('deriveLedger: recall judged missed does not demonstrate', () => {
  const row = deriveLedger('c', [recall({ judged: { verdict: 'missed', by: 'm', rubric: 'r' } })], POLICY, T0);
  assert.equal(row.standing, 'unknown');
});

test('deriveLedger: override to missed revokes a demonstration', () => {
  const r = recall({ id: 'obs_r' });
  const ov = obs({ kind: 'override', observation: 'obs_r', learnerVerdict: 'missed', note: 'guessed' });
  const row = deriveLedger('c', [r, ov], POLICY, T0);
  assert.equal(row.standing, 'unknown');
  assert.equal(row.disputed, true);
});

test('deriveLedger: override to demonstrated grants a demonstration', () => {
  const r = recall({ id: 'obs_r', judged: { verdict: 'missed', by: 'm', rubric: 'r' } });
  const ov = obs({ kind: 'override', observation: 'obs_r', learnerVerdict: 'demonstrated', note: 'could reproduce' });
  const row = deriveLedger('c', [r, ov], POLICY, T0);
  assert.equal(row.standing, 'demonstrated');
  assert.equal(row.disputed, true);
});

test('deriveLedger: demonstrations decay into stale per policy', () => {
  const demonstratedAt = T0;
  const row = deriveLedger('c', [recall({ at: demonstratedAt })], POLICY, day(100));
  assert.equal(row.standing, 'stale');
  const fresh = deriveLedger('c', [recall({ at: demonstratedAt })], POLICY, day(10));
  assert.equal(fresh.standing, 'demonstrated');
});

test('deriveLedger: repetition lengthens the effective half-life', () => {
  const r1 = recall({ at: T0 });
  const r2 = recall({ at: day(14) });
  // Single demonstration would be stale at day 40 (0.5^(40/30) < 0.5).
  assert.equal(deriveLedger('c', [r1], POLICY, day(40)).standing, 'stale');
  // Two demonstrations: half-life 30*1.6 = 48 -> 0.5^(40/48) > 0.5.
  assert.equal(deriveLedger('c', [r1, r2], POLICY, day(40)).standing, 'demonstrated');
});

// --- Derive: counts, spacing, grounding --------------------------------------

test('deriveLedger: spacingDays records gaps between demonstrations', () => {
  const row = deriveLedger('c', [recall({ at: T0 }), recall({ at: day(14) })], POLICY, day(20));
  assert.deepEqual(row.spacingDays, [0, 14]);
  assert.equal(row.demonstrations, 2);
});

test('deriveLedger: grounding is mixed when sources differ', () => {
  const row = deriveLedger(
    'c',
    [recall({ at: T0, grounding: 'sourced', sources: ['S'] }), recall({ at: day(1), grounding: 'model-recall', sources: [] })],
    POLICY,
    day(2),
  );
  assert.equal(row.grounding, 'mixed');
});

test('deriveLedger: probe tallies and lastEvidence span all kinds', () => {
  const r = recall({ id: 'obs_r', at: T0 });
  const p = probe({ id: 'obs_p', at: day(1), chosen: 'a' });
  const row = deriveLedger('c', [r, p], POLICY, day(2));
  assert.deepEqual(row.probes, { seen: 1, correct: 1 });
  assert.equal(row.lastEvidence, day(1));
});

test('effectiveVerdict: latest override wins; none -> judged verdict', () => {
  const r = recall({ id: 'obs_r', judged: { verdict: 'demonstrated', by: 'm', rubric: 'r' } });
  assert.equal(effectiveVerdict(r, []), 'demonstrated');
  const o1 = obs({ kind: 'override', observation: 'obs_r', learnerVerdict: 'missed', at: day(1) });
  const o2 = obs({ kind: 'override', observation: 'obs_r', learnerVerdict: 'demonstrated', at: day(2) });
  assert.equal(effectiveVerdict(r, [o1, o2]), 'demonstrated');
});

test('isClosing: only a demonstrated recall closes', () => {
  assert.equal(isClosing(recall({ id: 'a' }), []), true);
  assert.equal(isClosing(recall({ id: 'a', judged: { verdict: 'partial', by: 'm', rubric: 'r' } }), []), false);
  assert.equal(isClosing(probe({}), []), false);
  const ov = obs({ kind: 'override', observation: 'a', learnerVerdict: 'missed' });
  assert.equal(isClosing(recall({ id: 'a' }), [ov]), false);
});

// --- Registry lookup ----------------------------------------------------------

test('lookupConcepts: empty registry yields no candidates, no ambiguity', () => {
  const r = lookupConcepts([], 'entropy');
  assert.deepEqual(r.candidates, []);
  assert.equal(r.ambiguous, false);
});

test('lookupConcepts: exact slug, alias, and definition hits', () => {
  const registry = [
    { slug: 'entropy', definition: 'Thermodynamic state function of disorder.', at: T0 },
    { slug: 'k-forms', aliasOf: 'differential-forms', at: T0 },
  ];
  const bySlug = lookupConcepts(registry, 'entropy');
  assert.equal(bySlug.candidates[0].slug, 'entropy');
  assert.equal(bySlug.candidates[0].tier, 0);
  const byAlias = lookupConcepts(registry, 'k-forms');
  assert.equal(byAlias.candidates[0].tier, 1);
  assert.equal(byAlias.candidates[0].resolvesTo, 'differential-forms');
  const byDef = lookupConcepts(registry, 'disorder');
  assert.ok(byDef.candidates.some((c) => c.slug === 'entropy'));
});

test('lookupConcepts: slug/alias collision is ambiguous', () => {
  const registry = [
    { slug: 'entropy', definition: 'Thermodynamic state function.', at: T0 },
    { slug: 'entropy-information', definition: 'Information-theoretic entropy.', at: T0 },
    { slug: 'entropy', aliasOf: 'entropy-information', at: T0 },
  ];
  const r = lookupConcepts(registry, 'entropy');
  assert.equal(r.ambiguous, true);
});

// --- Frontier -----------------------------------------------------------------

test('computeFrontier: unknown and stale are on the frontier, demonstrated is not', () => {
  const ledger = {
    a: { slug: 'a', standing: 'unknown' },
    b: { slug: 'b', standing: 'demonstrated' },
    c: { slug: 'c', standing: 'stale' },
  };
  assert.deepEqual(computeFrontier(['a', 'b', 'c'], ledger), ['a', 'c']);
});

// --- CLI: help ----------------------------------------------------------------

const ALL_CODES = [
  'not_configured', 'not_found', 'ambiguous_concept', 'duplicate_slug', 'path_unapproved',
  'no_closing', 'wrong_shape', 'bad_input', 'io_error',
];

test('learn.mjs --help lists commands, error codes, and record fields', () => {
  const out = execFileSync(process.execPath, [LEARN, '--help'], { encoding: 'utf8' });
  for (const cmd of ['init', 'concept lookup', 'concept add', 'concept alias', 'concept merge',
    'session start', 'session get', 'path propose', 'path approve', 'path amend',
    'observe probe', 'observe recall', 'observe infer', 'observe override',
    'close', 'next', 'standing', 'why', 'frontier', 'decline', 'ledger rebuild']) {
    assert.ok(out.includes(cmd), `--help must mention command "${cmd}"`);
  }
  for (const code of ALL_CODES) {
    assert.ok(out.includes(code), `--help must mention error code "${code}"`);
  }
  for (const field of ['slug', 'definition', 'domains', 'aliases', 'note', 'id', 'at', 'session',
    'concept', 'kind', 'item', 'options', 'key', 'chosen', 'correct', 'prompt', 'answer',
    'judged', 'verdict', 'by', 'rubric', 'grounding', 'sources', 'claim', 'because',
    'learnerVerdict', 'standing', 'lastEvidence', 'demonstrations', 'spacingDays', 'probes',
    'policy', 'disputed']) {
    assert.ok(out.includes(field), `--help must mention field "${field}"`);
  }
  for (const opt of ['--home', '--json', '--summary', '--vault', '--slug', '--definition']) {
    assert.ok(out.includes(opt), `--help must mention option "${opt}"`);
  }
});

// --- CLI: one throwaway vault -------------------------------------------------

const vault = mkdtempSync(join(tmpdir(), 'learn-test-'));
const run = (args) => execFileSync(process.execPath, [LEARN, ...args, '--home', vault], { encoding: 'utf8' });
const runErr = (args) => {
  try {
    run(args);
    throw new Error(`expected non-zero exit for: ${args.join(' ')}`);
  } catch (e) {
    return JSON.parse(e.stderr.trim());
  }
};

test('CLI: init creates the store and is idempotent', () => {
  const out = JSON.parse(run(['init', '--vault', vault]));
  assert.ok(out.learnDir.endsWith('.learn'));
  for (const f of ['registry.jsonl', 'observations.jsonl', 'policy.json']) {
    assert.ok(readFileSync(join(vault, '.learn', f)).length >= 0, `expected ${f}`);
  }
  for (const d of ['sessions', 'transcripts']) {
    assert.ok(statSync(join(vault, '.learn', d)).isDirectory(), `expected dir ${d}`);
  }
  const again = JSON.parse(run(['init', '--vault', vault]));
  assert.equal(again.created, false);
});

test('CLI: concept add appends; duplicate_slug on re-add; definition required', () => {
  const add = JSON.parse(run(['concept', 'add', '--slug', 'entropy', '--definition', 'Thermodynamic state function.', '--domains', 'physics']));
  assert.equal(add.slug, 'entropy');
  assert.equal(add.definition, 'Thermodynamic state function.');
  const dup = runErr(['concept', 'add', '--slug', 'entropy', '--definition', 'Again']);
  assert.equal(dup.code, 'duplicate_slug');
  const nodef = runErr(['concept', 'add', '--slug', 'no-def']);
  assert.equal(nodef.code, 'bad_input');
});

test('CLI: concept lookup finds by slug and alias; collision alias is rejected', () => {
  run(['concept', 'add', '--slug', 'entropy-information', '--definition', 'Information-theoretic entropy.']);
  const bySlug = JSON.parse(run(['concept', 'lookup', 'entropy']));
  assert.ok(bySlug.candidates.some((c) => c.slug === 'entropy'));
  run(['concept', 'alias', 'entropy', 'thermo-entropy']);
  const byAlias = JSON.parse(run(['concept', 'lookup', 'thermo-entropy']));
  assert.equal(byAlias.candidates[0].resolvesTo, 'entropy');
  // The homonym collision is handled by slug qualification (entropy-information), never by
  // aliasing onto the other Concept's slug.
  const coll = runErr(['concept', 'alias', 'entropy-information', 'entropy']);
  assert.equal(coll.code, 'duplicate_slug');
});

test('CLI: session start refuses a non-hierarchical shape', () => {
  const err = runErr(['session', 'start', '--goal', 'Learn guitar', '--shape', 'procedural']);
  assert.equal(err.code, 'wrong_shape');
});

test('CLI: path propose rejects unknown slugs', () => {
  const ses = JSON.parse(run(['session', 'start', '--goal', 'Learn entropy', '--shape', 'hierarchical']));
  const pathFile = join(vault, 'path-bad.json');
  writeFileSync(pathFile, JSON.stringify({ walk: ['entropy', 'does-not-exist'] }));
  const err = runErr(['path', 'propose', ses.id, pathFile]);
  assert.equal(err.code, 'not_found');
});

test('CLI: next gates on approval, then on Closing', () => {
  const ses = JSON.parse(run(['session', 'start', '--goal', 'Learn entropy', '--shape', 'hierarchical']));
  const pathFile = join(vault, 'path-good.json');
  writeFileSync(pathFile, JSON.stringify({ walk: ['entropy', 'entropy-information'] }));
  run(['path', 'propose', ses.id, pathFile]);
  const unapproved = runErr(['next', ses.id]);
  assert.equal(unapproved.code, 'path_unapproved');
  run(['path', 'approve', ses.id]);
  const first = JSON.parse(run(['next', ses.id]));
  assert.equal(first.node, 'entropy');
  const noClosing = runErr(['next', ses.id]);
  assert.equal(noClosing.code, 'no_closing');
});

test('CLI: close asserts a Closing, then next releases the following node', () => {
  const ses = JSON.parse(run(['session', 'start', '--goal', 'Learn entropy', '--shape', 'hierarchical']));
  const pathFile = join(vault, 'path-close.json');
  writeFileSync(pathFile, JSON.stringify({ walk: ['entropy', 'entropy-information'] }));
  run(['path', 'propose', ses.id, pathFile]);
  run(['path', 'approve', ses.id]);
  run(['next', ses.id]);
  const unclosed = runErr(['close', ses.id, 'entropy']);
  assert.equal(unclosed.code, 'no_closing');
  run(['observe', 'recall', '--session', ses.id, '--concept', 'entropy', '--prompt', 'What is entropy?',
    '--answer', 'A measure of disorder in a thermodynamic system', '--verdict', 'demonstrated',
    '--by', 'test-model', '--rubric', 'matches the definition', '--grounding', 'sourced', '--sources', 'Textbook ch.2']);
  const closed = JSON.parse(run(['close', ses.id, 'entropy']));
  assert.equal(closed.closed, true);
  const second = JSON.parse(run(['next', ses.id]));
  assert.equal(second.node, 'entropy-information');
  const again = runErr(['next', ses.id]);
  assert.equal(again.code, 'no_closing');
  run(['observe', 'recall', '--session', ses.id, '--concept', 'entropy-information', '--prompt', 'What is information entropy?',
    '--answer', 'Entropy as a measure of information content', '--verdict', 'demonstrated',
    '--by', 'test-model', '--rubric', 'matches the definition', '--grounding', 'model-recall']);
  run(['close', ses.id, 'entropy-information']);
  const done = JSON.parse(run(['next', ses.id]));
  assert.equal(done.done, true);
});

test('CLI: standing derives demonstrated; ledger rebuild is deterministic', () => {
  const st = JSON.parse(run(['standing', 'entropy']));
  assert.equal(st.standing, 'demonstrated');
  run(['concept', 'add', '--slug', 'no-observations-yet', '--definition', 'A concept never probed or recalled.']);
  const first = run(['ledger', 'rebuild']);
  const second = run(['ledger', 'rebuild']);
  assert.equal(first, second);
  const ledger = JSON.parse(first);
  const slugs = ledger.ledger.map((r) => r.slug);
  assert.deepEqual(slugs, [...slugs].sort());
  assert.ok(ledger.ledger.some((r) => r.slug === 'entropy' && r.standing === 'demonstrated'));
  assert.ok(ledger.ledger.some((r) => r.slug === 'entropy-information' && r.standing === 'demonstrated'));
  assert.ok(ledger.ledger.some((r) => r.slug === 'no-observations-yet' && r.standing === 'unknown'));
});

test('CLI: probe correct is computed by the core, never supplied', () => {
  const ses = JSON.parse(run(['session', 'start', '--goal', 'Probe grading', '--shape', 'hierarchical']));
  const wrong = JSON.parse(run(['observe', 'probe', '--session', ses.id, '--concept', 'entropy',
    '--item', 'Which is a measure of disorder?', '--options', 'a,b', '--key', 'a', '--chosen', 'b']));
  assert.equal(wrong.correct, false);
  const right = JSON.parse(run(['observe', 'probe', '--session', ses.id, '--concept', 'entropy',
    '--item', 'Which is a measure of disorder?', '--options', 'a,b', '--key', 'a', '--chosen', 'a']));
  assert.equal(right.correct, true);
  const bad = runErr(['observe', 'probe', '--session', ses.id, '--concept', 'entropy',
    '--item', 'q', '--options', 'a,b', '--key', 'a', '--chosen', 'z']);
  assert.equal(bad.code, 'bad_input');
});

// --- Runner -------------------------------------------------------------------

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
rmSync(vault, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
