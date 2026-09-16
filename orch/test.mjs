#!/usr/bin/env node
// @ts-check
// Hermetic test suite — no network, no filesystem, no dependencies beyond Node's built-ins.
// Run with: node test.mjs

import assert from 'node:assert/strict';
import {
  OrchError,
  loadRecipe,
  planSteps,
  runRecipe,
  runVerify,
  auditLine,
  findRunRecipe,
} from './orch.mjs';

let passed = 0;
const failed = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed.push(`${name}: ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    failed.push(`${name}: ${err.message}`);
  }
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const VALID = {
  name: 'smoke-test',
  steps: [
    { id: 'one', command: ['echo', 'one'] },
    { id: 'two', command: ['echo', 'two'] },
    { id: 'three', command: ['echo', 'three'] },
  ],
  verify: { command: ['test', '-f', '/tmp/orch-smoke'] },
};

// A fake exec that scripts specific outcomes by step id, defaulting to success.
function fakeExec(outcomes = {}) {
  const calls = [];
  const fn = (command) => {
    calls.push(command);
    const key = command.join(' ');
    const outcome = outcomes[key];
    if (outcome) return outcome;
    return { code: 0, stdout: '', stderr: '' };
  };
  fn.calls = calls;
  return fn;
}

// ── loadRecipe ────────────────────────────────────────────────────────────────

test('loadRecipe accepts a well-formed recipe', () => {
  const recipe = loadRecipe(VALID);
  assert.equal(recipe.name, 'smoke-test');
  assert.equal(recipe.steps.length, 3);
  assert.deepEqual(recipe.verify.command, ['test', '-f', '/tmp/orch-smoke']);
});

test('loadRecipe rejects a missing verify as no_verify', () => {
  const { verify, ...rest } = VALID;
  assert.throws(() => loadRecipe(rest), (err) => err instanceof OrchError && err.code === 'no_verify');
});

test('loadRecipe rejects an empty verify.command as no_verify', () => {
  const recipe = { ...VALID, verify: { command: [] } };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'no_verify');
});

test('loadRecipe rejects a missing verify.command as no_verify', () => {
  const recipe = { ...VALID, verify: {} };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'no_verify');
});

test('loadRecipe rejects a recipe with no steps as bad_input', () => {
  const recipe = { ...VALID, steps: [] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects a step missing an id as bad_input', () => {
  const recipe = { ...VALID, steps: [{ command: ['echo', 'x'] }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects a step missing a command as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one' }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects a step with an empty command array as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: [] }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects a non-object recipe as bad_input', () => {
  assert.throws(() => loadRecipe(null), (err) => err instanceof OrchError && err.code === 'bad_input');
  assert.throws(() => loadRecipe('nope'), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects a missing name as bad_input', () => {
  const { name, ...rest } = VALID;
  assert.throws(() => loadRecipe(rest), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── planSteps ─────────────────────────────────────────────────────────────────

test('planSteps preserves declared order', () => {
  const recipe = loadRecipe(VALID);
  const steps = planSteps(recipe, []);
  assert.deepEqual(steps.map((s) => s.id), ['one', 'two', 'three']);
});

test('planSteps substitutes {n} placeholders from positional args', () => {
  const recipe = loadRecipe({
    name: 'templated',
    steps: [{ id: 'greet', command: ['echo', '{1}', 'says', '{2}'] }],
    verify: { command: ['true'] },
  });
  const steps = planSteps(recipe, ['BI', 'hello']);
  assert.deepEqual(steps[0].command, ['echo', 'BI', 'says', 'hello']);
});

test('planSteps leaves commands with no placeholders untouched when args are given', () => {
  const recipe = loadRecipe(VALID);
  const steps = planSteps(recipe, ['unused', 'args']);
  assert.deepEqual(steps[1].command, ['echo', 'two']);
});

test('planSteps throws bad_input when a placeholder has no matching arg', () => {
  const recipe = loadRecipe({
    name: 'templated',
    steps: [{ id: 'greet', command: ['echo', '{1}'] }],
    verify: { command: ['true'] },
  });
  assert.throws(() => planSteps(recipe, []), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── runRecipe ─────────────────────────────────────────────────────────────────

await testAsync('runRecipe runs every step in order when all succeed', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec();
  const result = await runRecipe(recipe, [], { exec, runId: 'run-1', now: () => 't0' });
  assert.equal(result.ok, true);
  assert.equal(result.runId, 'run-1');
  assert.equal(exec.calls.length, 3);
  assert.deepEqual(exec.calls, [['echo', 'one'], ['echo', 'two'], ['echo', 'three']]);
  assert.equal(result.lines.length, 3);
});

await testAsync('runRecipe stops at the first non-zero exit', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec({ 'echo two': { code: 1, stdout: '', stderr: 'boom' } });
  const result = await runRecipe(recipe, [], { exec, runId: 'run-2', now: () => 't0' });
  assert.equal(result.ok, false);
  // Only steps one and two ran; three never executed.
  assert.equal(exec.calls.length, 2);
  assert.deepEqual(exec.calls, [['echo', 'one'], ['echo', 'two']]);
});

await testAsync('runRecipe records the failing step before stopping', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec({ 'echo two': { code: 1, stdout: '', stderr: 'boom' } });
  const result = await runRecipe(recipe, [], { exec, runId: 'run-3', now: () => 't0' });
  assert.equal(result.lines.length, 2);
  const last = JSON.parse(result.lines[1]);
  assert.equal(last.step, 'two');
  assert.equal(last.exit, 1);
  assert.equal(last.run, 'run-3');
});

await testAsync('runRecipe generates a runId when none is injected', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec();
  const result = await runRecipe(recipe, [], { exec });
  assert.equal(typeof result.runId, 'string');
  assert.ok(result.runId.length > 0);
});

await testAsync('runRecipe does not lose already-collected lines when exec throws', async () => {
  // Regression: exec throwing (e.g. spawnSync ENOENT for a missing binary) must not abort
  // runRecipe before it returns — that would silently drop the audit lines for every step
  // that already succeeded, contradicting "the failing step is recorded before the run stops".
  const recipe = loadRecipe(VALID);
  const throwingExec = (command) => {
    if (command.join(' ') === 'echo two') throw new Error('spawnSync echo ENOENT');
    return { code: 0, stdout: '', stderr: '' };
  };
  const result = await runRecipe(recipe, [], { exec: throwingExec, runId: 'run-throw', now: () => 't0' });
  assert.equal(result.ok, false);
  assert.equal(result.lines.length, 2);
  const first = JSON.parse(result.lines[0]);
  assert.equal(first.step, 'one');
  assert.equal(first.exit, 0);
  const second = JSON.parse(result.lines[1]);
  assert.equal(second.step, 'two');
  assert.equal(second.exit, null);
});

await testAsync('runVerify reports a thrown exec as a failed check, not an exception', async () => {
  const recipe = loadRecipe(VALID);
  const throwingExec = () => {
    throw new Error('spawnSync test ENOENT');
  };
  const result = await runVerify(recipe, { exec: throwingExec });
  assert.equal(result.ok, false);
  assert.equal(result.exit, null);
  assert.match(result.stderr, /ENOENT/);
});

// ── auditLine ─────────────────────────────────────────────────────────────────

test('auditLine produces one well-formed JSON line', () => {
  const line = auditLine('run-9', 'smoke-test', { id: 'one', command: ['echo', 'one'] }, { code: 0, stdout: 'one\n', stderr: '' }, 't0');
  const parsed = JSON.parse(line);
  assert.deepEqual(parsed, {
    ts: 't0',
    run: 'run-9',
    recipe: 'smoke-test',
    step: 'one',
    cmd: ['echo', 'one'],
    exit: 0,
  });
});

test('auditLine defaults ts to an ISO string when omitted', () => {
  const line = auditLine('run-9', 'smoke-test', { id: 'one', command: ['echo'] }, { code: 0 });
  const parsed = JSON.parse(line);
  assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T/);
});

// ── runVerify ─────────────────────────────────────────────────────────────────

await testAsync('runVerify runs the declared check and reports success', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec();
  const result = await runVerify(recipe, { exec });
  assert.equal(result.ok, true);
  assert.deepEqual(exec.calls, [['test', '-f', '/tmp/orch-smoke']]);
});

await testAsync('runVerify reports failure without throwing', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec({ 'test -f /tmp/orch-smoke': { code: 1, stdout: '', stderr: '' } });
  const result = await runVerify(recipe, { exec });
  assert.equal(result.ok, false);
  assert.equal(result.exit, 1);
});

// ── findRunRecipe ─────────────────────────────────────────────────────────────

test('findRunRecipe recovers the recipe name for a run id from audit entries', () => {
  const entries = [
    { ts: 't0', run: 'run-1', recipe: 'sesi-run', step: 'brief', cmd: ['rise-ops', 'brief'], exit: 0 },
    { ts: 't1', run: 'run-1', recipe: 'sesi-run', step: 'acara', cmd: ['rise-ops', 'acara'], exit: 0 },
    { ts: 't2', run: 'run-2', recipe: 'deck-build', step: 'scan', cmd: ['rps-deck', 'scan'], exit: 0 },
  ];
  assert.equal(findRunRecipe(entries, 'run-1'), 'sesi-run');
  assert.equal(findRunRecipe(entries, 'run-2'), 'deck-build');
});

test('findRunRecipe throws bad_input for an unknown run id', () => {
  assert.throws(() => findRunRecipe([], 'ghost'), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── summary ───────────────────────────────────────────────────────────────────

if (failed.length) {
  console.error(`\n✗ ${failed.length} FAILED, ${passed} passed`);
  for (const name of failed) console.error(`    ✗ ${name}`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} passed`);
}
