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
  loadAgents,
  findAgent,
  loadOrchConfig,
  resolveConfig,
  parseSetFlags,
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

test('planSteps substitutes a named placeholder from that step\'s resolved settings', () => {
  const recipe = loadRecipe({
    name: 'authored',
    steps: [{ id: 'author', command: ['hermes', 'agent', 'run', '--model', '{model}'], agent: 'claude-planner' }],
    verify: { command: ['true'] },
  });
  const steps = planSteps(recipe, [], { author: { model: 'claude-opus-5' } });
  assert.deepEqual(steps[0].command, ['hermes', 'agent', 'run', '--model', 'claude-opus-5']);
});

test('planSteps joins an array-valued resolved setting with commas', () => {
  const recipe = loadRecipe({
    name: 'authored',
    steps: [{ id: 'author', command: ['hermes', 'agent', 'run', '--capabilities', '{capabilities}'] }],
    verify: { command: ['true'] },
  });
  const steps = planSteps(recipe, [], { author: { capabilities: ['read', 'edit'] } });
  assert.deepEqual(steps[0].command, ['hermes', 'agent', 'run', '--capabilities', 'read,edit']);
});

test('planSteps throws bad_input when a named placeholder has no matching resolved setting', () => {
  const recipe = loadRecipe({
    name: 'authored',
    steps: [{ id: 'author', command: ['hermes', '--model', '{model}'] }],
    verify: { command: ['true'] },
  });
  assert.throws(() => planSteps(recipe, []), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('planSteps looks up resolved settings per step id, not shared globally', () => {
  const recipe = loadRecipe({
    name: 'two-agents',
    steps: [
      { id: 'a', command: ['echo', '{model}'] },
      { id: 'b', command: ['echo', '{model}'] },
    ],
    verify: { command: ['true'] },
  });
  const steps = planSteps(recipe, [], { a: { model: 'from-a' }, b: { model: 'from-b' } });
  assert.deepEqual(steps[0].command, ['echo', 'from-a']);
  assert.deepEqual(steps[1].command, ['echo', 'from-b']);
});

// ── loadRecipe: agent-backed steps ──────────────────────────────────────────

test('loadRecipe preserves an optional agent and settings on a step', () => {
  const recipe = loadRecipe({
    name: 'authored',
    steps: [{ id: 'author', command: ['hermes', 'agent', 'run'], agent: 'claude-planner', settings: { model: 'x' } }],
    verify: { command: ['true'] },
  });
  assert.equal(recipe.steps[0].agent, 'claude-planner');
  assert.deepEqual(recipe.steps[0].settings, { model: 'x' });
});

test('loadRecipe leaves agent and settings undefined when a step declares neither', () => {
  const recipe = loadRecipe(VALID);
  assert.equal(recipe.steps[0].agent, undefined);
  assert.equal(recipe.steps[0].settings, undefined);
});

test('loadRecipe rejects a non-string agent as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: ['echo'], agent: 42 }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects a non-object settings as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: ['echo'], settings: 'nope' }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── loadAgents ────────────────────────────────────────────────────────────────

const VALID_AGENTS = {
  agents: [
    { id: 'claude-planner', harness: 'claude', model: 'claude-sonnet-5', capabilities: ['read', 'edit', 'bash'] },
    { id: 'rise-ops', harness: 'cli' },
    { id: 'rps-deck', harness: 'cli' },
  ],
};

test('loadAgents accepts a well-formed roster', () => {
  const { agents } = loadAgents(VALID_AGENTS);
  assert.equal(agents.length, 3);
  assert.deepEqual(agents[0], VALID_AGENTS.agents[0]);
  assert.deepEqual(agents[1], { id: 'rise-ops', harness: 'cli' });
});

test('loadAgents rejects a non-object roster as bad_input', () => {
  assert.throws(() => loadAgents(null), (err) => err instanceof OrchError && err.code === 'bad_input');
  assert.throws(() => loadAgents([]), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadAgents rejects a missing or empty agents array as bad_input', () => {
  assert.throws(() => loadAgents({}), (err) => err instanceof OrchError && err.code === 'bad_input');
  assert.throws(() => loadAgents({ agents: [] }), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadAgents rejects an entry missing an id as bad_input', () => {
  const roster = { agents: [{ harness: 'cli' }] };
  assert.throws(() => loadAgents(roster), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadAgents rejects a duplicate id as bad_input', () => {
  const roster = { agents: [{ id: 'rise-ops', harness: 'cli' }, { id: 'rise-ops', harness: 'cli' }] };
  assert.throws(() => loadAgents(roster), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadAgents rejects an entry missing a harness as bad_input', () => {
  const roster = { agents: [{ id: 'rise-ops' }] };
  assert.throws(() => loadAgents(roster), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadAgents rejects a model-backed entry with no capabilities as bad_input', () => {
  const roster = { agents: [{ id: 'claude-planner', harness: 'claude', model: 'claude-sonnet-5' }] };
  assert.throws(() => loadAgents(roster), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadAgents rejects a model-backed entry with a non-array capabilities as bad_input', () => {
  const roster = {
    agents: [{ id: 'claude-planner', harness: 'claude', model: 'claude-sonnet-5', capabilities: 'read' }],
  };
  assert.throws(() => loadAgents(roster), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadAgents rejects capabilities declared without a model as bad_input', () => {
  const roster = { agents: [{ id: 'rise-ops', harness: 'cli', capabilities: ['read'] }] };
  assert.throws(() => loadAgents(roster), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadAgents rejects an empty model string as bad_input', () => {
  const roster = { agents: [{ id: 'claude-planner', harness: 'claude', model: '', capabilities: ['read'] }] };
  assert.throws(() => loadAgents(roster), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── findAgent ─────────────────────────────────────────────────────────────────

test('findAgent returns the matching roster entry', () => {
  const agents = loadAgents(VALID_AGENTS);
  assert.deepEqual(findAgent(agents, 'rise-ops'), { id: 'rise-ops', harness: 'cli' });
});

test('findAgent throws bad_input for an unknown agent id', () => {
  const agents = loadAgents(VALID_AGENTS);
  assert.throws(() => findAgent(agents, 'ghost'), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── loadOrchConfig ────────────────────────────────────────────────────────────

test('loadOrchConfig accepts a well-formed config', () => {
  const config = loadOrchConfig({ paths: { vault: '/vault' }, delivery: 'local' });
  assert.deepEqual(config, { paths: { vault: '/vault' }, delivery: 'local' });
});

test('loadOrchConfig defaults absent fields to {} and null', () => {
  assert.deepEqual(loadOrchConfig({}), { paths: {}, delivery: null });
});

test('loadOrchConfig rejects a non-object config as bad_input', () => {
  assert.throws(() => loadOrchConfig(null), (err) => err instanceof OrchError && err.code === 'bad_input');
  assert.throws(() => loadOrchConfig([]), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadOrchConfig rejects a non-object paths as bad_input', () => {
  assert.throws(() => loadOrchConfig({ paths: 'nope' }), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadOrchConfig rejects a non-string paths value as bad_input', () => {
  assert.throws(
    () => loadOrchConfig({ paths: { vault: 42 } }),
    (err) => err instanceof OrchError && err.code === 'bad_input',
  );
});

test('loadOrchConfig rejects a non-string delivery as bad_input', () => {
  assert.throws(() => loadOrchConfig({ delivery: 7 }), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── resolveConfig ─────────────────────────────────────────────────────────────

test('resolveConfig: a CLI flag beats a recipe step', () => {
  const resolved = resolveConfig({ model: 'flag' }, { model: 'step' }, undefined, undefined);
  assert.equal(resolved.model, 'flag');
});

test('resolveConfig: a recipe step beats the agent roster entry', () => {
  const resolved = resolveConfig(undefined, { model: 'step' }, { model: 'agent' }, undefined);
  assert.equal(resolved.model, 'step');
});

test('resolveConfig: the agent roster entry beats machine-local config', () => {
  const resolved = resolveConfig(undefined, undefined, { model: 'agent' }, { model: 'config' });
  assert.equal(resolved.model, 'agent');
});

test('resolveConfig: machine-local config applies when nothing else declares the key', () => {
  const resolved = resolveConfig(undefined, undefined, undefined, { model: 'config' });
  assert.equal(resolved.model, 'config');
});

test('resolveConfig: keys absent at a higher level fall through, not overwritten with undefined', () => {
  const resolved = resolveConfig({ capabilities: ['read'] }, {}, { model: 'agent' }, { delivery: 'local' });
  assert.deepEqual(resolved, { model: 'agent', delivery: 'local', capabilities: ['read'] });
});

test('resolveConfig: every layer missing resolves to an empty object', () => {
  assert.deepEqual(resolveConfig(undefined, undefined, undefined, undefined), {});
});

// ── parseSetFlags ─────────────────────────────────────────────────────────────

test('parseSetFlags parses a single --set key=value', () => {
  const { flag, rest } = parseSetFlags(['recipe-arg', '--set', 'model=opus']);
  assert.deepEqual(flag, { model: 'opus' });
  assert.deepEqual(rest, ['recipe-arg']);
});

test('parseSetFlags parses repeated --set flags and preserves rest order', () => {
  const { flag, rest } = parseSetFlags(['a', '--set', 'model=opus', 'b', '--set', 'delivery=local', 'c']);
  assert.deepEqual(flag, { model: 'opus', delivery: 'local' });
  assert.deepEqual(rest, ['a', 'b', 'c']);
});

test('parseSetFlags lets a later --set of the same key win', () => {
  const { flag } = parseSetFlags(['--set', 'model=a', '--set', 'model=b']);
  assert.deepEqual(flag, { model: 'b' });
});

test('parseSetFlags splits only on the first "=" so values may contain one', () => {
  const { flag } = parseSetFlags(['--set', 'query=a=b']);
  assert.deepEqual(flag, { query: 'a=b' });
});

test('parseSetFlags throws bad_input when --set has no following argument', () => {
  assert.throws(() => parseSetFlags(['--set']), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('parseSetFlags throws bad_input when --set is not followed by key=value', () => {
  assert.throws(() => parseSetFlags(['--set', 'novalue']), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('parseSetFlags throws bad_input when --set is followed by a bare "="', () => {
  assert.throws(() => parseSetFlags(['--set', '=value']), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('parseSetFlags returns an empty flag and unchanged rest when no --set is given', () => {
  const { flag, rest } = parseSetFlags(['a', 'b']);
  assert.deepEqual(flag, {});
  assert.deepEqual(rest, ['a', 'b']);
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

await testAsync('runRecipe threads settingsByStep into the executed command', async () => {
  // The whole point of resolveConfig's precedence is that it changes what actually runs,
  // not only what gets logged — this proves settingsByStep reaches the spawned command.
  const recipe = loadRecipe({
    name: 'authored',
    steps: [{ id: 'author', command: ['hermes', 'agent', 'run', '--model', '{model}'], agent: 'claude-planner' }],
    verify: { command: ['true'] },
  });
  const exec = fakeExec();
  await runRecipe(recipe, [], { exec, settingsByStep: { author: { model: 'claude-opus-5' } }, runId: 'run-settings' });
  assert.deepEqual(exec.calls, [['hermes', 'agent', 'run', '--model', 'claude-opus-5']]);
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
