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
  substituteCaptured,
  capturedValue,
  auditLine,
  stderrLogPath,
  findRunRecipe,
  findRunArgs,
  findRunCaptured,
  loadAgents,
  findAgent,
  loadOrchConfig,
  resolveConfig,
  parseSetFlags,
  loadSchedule,
  cronArgs,
  scheduledJobName,
  parseScheduleFlags,
  envelopeFindings,
  harnessFindings,
  openRuns,
  jobRows,
  renderTable,
  renderStatus,
  shortTs,
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

test('loadRecipe preserves an optional verify.cwd', () => {
  const recipe = { ...VALID, verify: { ...VALID.verify, cwd: '/tmp/wt' } };
  assert.equal(loadRecipe(recipe).verify.cwd, '/tmp/wt');
});

test('loadRecipe leaves verify.cwd undefined when not declared', () => {
  assert.equal(loadRecipe(VALID).verify.cwd, undefined);
});

test('loadRecipe rejects a non-string verify.cwd as bad_input', () => {
  const recipe = { ...VALID, verify: { ...VALID.verify, cwd: 42 } };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
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

test('planSteps substitutes {n} and named settings inside cwd', () => {
  const recipe = loadRecipe({
    name: 'cwd-plan',
    steps: [{ id: 'one', command: ['echo'], cwd: '/repos/{1}' }],
    verify: { command: ['true'] },
  });
  assert.equal(planSteps(recipe, ['gogogo-service'])[0].cwd, '/repos/gogogo-service');
});

test('planSteps leaves {captured.*} inside cwd untouched — no step has run yet', () => {
  const recipe = loadRecipe({
    name: 'cwd-captured',
    steps: [
      { id: 'one', command: ['echo', 'x'], capture: { as: 'wt' } },
      { id: 'two', command: ['echo'], cwd: '{captured.wt}' },
    ],
    verify: { command: ['true'] },
  });
  assert.equal(planSteps(recipe, [])[1].cwd, '{captured.wt}');
});

test('planSteps leaves cwd undefined on a step that declares none', () => {
  const steps = planSteps(loadRecipe(VALID), []);
  assert.equal(steps[0].cwd, undefined);
});

test('planSteps leaves {captured.*} placeholders untouched — no step has run yet', () => {
  const recipe = loadRecipe({
    name: 'threaded',
    steps: [
      { id: 'one', command: ['echo', 'x'], capture: { as: 'thing' } },
      { id: 'two', command: ['echo', '{captured.thing}'] },
    ],
    verify: { command: ['true'] },
  });
  const steps = planSteps(recipe, []);
  assert.deepEqual(steps[1].command, ['echo', '{captured.thing}']);
});

// ── substituteCaptured ───────────────────────────────────────────────────────

test('substituteCaptured resolves a captured value', () => {
  const command = substituteCaptured(['echo', '{captured.path}'], { path: '/tmp/wt' }, 'two');
  assert.deepEqual(command, ['echo', '/tmp/wt']);
});

test('substituteCaptured leaves a command with no placeholders untouched', () => {
  assert.deepEqual(substituteCaptured(['echo', 'plain'], {}, 'one'), ['echo', 'plain']);
});

test('substituteCaptured throws bad_input for a capture no earlier step produced', () => {
  assert.throws(
    () => substituteCaptured(['echo', '{captured.missing}'], {}, 'two'),
    (err) => err instanceof OrchError && err.code === 'bad_input',
  );
});

// ── capturedValue ────────────────────────────────────────────────────────────

test('capturedValue returns undefined when the step declares no capture', () => {
  assert.equal(capturedValue({ id: 'one' }, { stdout: 'anything', code: 0 }), undefined);
});

test('capturedValue returns trimmed stdout with no "json" path', () => {
  const value = capturedValue({ id: 'one', capture: { as: 'thing' } }, { stdout: '  /tmp/wt  \n', code: 0 });
  assert.equal(value, '/tmp/wt');
});

test('capturedValue extracts a dotted json path', () => {
  const stdout = JSON.stringify({ result: { worktree: { path: '/tmp/wt' } } });
  const value = capturedValue({ id: 'one', capture: { as: 'thing', json: 'result.worktree.path' } }, { stdout, code: 0 });
  assert.equal(value, '/tmp/wt');
});

test('capturedValue throws bad_input when stdout is not valid JSON', () => {
  assert.throws(
    () => capturedValue({ id: 'one', capture: { as: 'thing', json: 'a.b' } }, { stdout: 'not json', code: 0 }),
    (err) => err instanceof OrchError && err.code === 'bad_input',
  );
});

test('capturedValue throws bad_input when the json path does not resolve to a string', () => {
  const stdout = JSON.stringify({ a: { b: 42 } });
  assert.throws(
    () => capturedValue({ id: 'one', capture: { as: 'thing', json: 'a.b' } }, { stdout, code: 0 }),
    (err) => err instanceof OrchError && err.code === 'bad_input',
  );
});

test('capturedValue throws bad_input when the json path does not exist', () => {
  const stdout = JSON.stringify({ a: {} });
  assert.throws(
    () => capturedValue({ id: 'one', capture: { as: 'thing', json: 'a.b.c' } }, { stdout, code: 0 }),
    (err) => err instanceof OrchError && err.code === 'bad_input',
  );
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

test('loadRecipe refuses a step id reserved for the declared check', () => {
  // `orch verify` writes its line under the id "verify", and that line is the only thing that
  // closes a run in `orch status` — a step free to write one would close runs it never checked.
  const recipe = { ...VALID, steps: [{ id: 'verify', command: ['echo', 'sneaky'] }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── loadRecipe: capture ─────────────────────────────────────────────────────

test('loadRecipe preserves a capture with just "as"', () => {
  const recipe = loadRecipe({
    ...VALID,
    steps: [{ id: 'one', command: ['echo', 'x'], capture: { as: 'thing' } }, VALID.steps[1], VALID.steps[2]],
  });
  assert.deepEqual(recipe.steps[0].capture, { as: 'thing' });
});

test('loadRecipe preserves a capture with "as" and "json"', () => {
  const recipe = loadRecipe({
    ...VALID,
    steps: [{ id: 'one', command: ['echo', 'x'], capture: { as: 'thing', json: 'a.b' } }, VALID.steps[1], VALID.steps[2]],
  });
  assert.deepEqual(recipe.steps[0].capture, { as: 'thing', json: 'a.b' });
});

test('loadRecipe leaves capture undefined when a step declares none', () => {
  const recipe = loadRecipe(VALID);
  assert.equal(recipe.steps[0].capture, undefined);
});

test('loadRecipe rejects a non-object capture as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: ['echo'], capture: 'nope' }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects a capture with no "as" as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: ['echo'], capture: {} }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects a non-string capture.json as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: ['echo'], capture: { as: 'x', json: 42 } }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── loadRecipe: cwd ──────────────────────────────────────────────────────────

test('loadRecipe preserves a step\'s cwd', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: ['echo'], cwd: '/tmp/wt' }, VALID.steps[1], VALID.steps[2]] };
  assert.equal(loadRecipe(recipe).steps[0].cwd, '/tmp/wt');
});

test('loadRecipe leaves cwd undefined when a step declares none', () => {
  assert.equal(loadRecipe(VALID).steps[0].cwd, undefined);
});

test('loadRecipe rejects a non-string cwd as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: ['echo'], cwd: 42 }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe rejects an empty-string cwd as bad_input', () => {
  const recipe = { ...VALID, steps: [{ id: 'one', command: ['echo'], cwd: '' }] };
  assert.throws(() => loadRecipe(recipe), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── loadSchedule ──────────────────────────────────────────────────────────────

test('loadSchedule accepts a script envelope naming its script', () => {
  const schedule = loadSchedule({ cron: '40 9 * * 1', envelope: 'script', script: 'vault-health-scan.sh' });
  assert.deepEqual(schedule, { cron: '40 9 * * 1', envelope: 'script', script: 'vault-health-scan.sh' });
});

test('loadSchedule accepts a monitor envelope naming its monitorScript', () => {
  const schedule = loadSchedule({ cron: '20 22 * * *', envelope: 'monitor', monitorScript: 'vault-activity.sh' });
  assert.deepEqual(schedule, { cron: '20 22 * * *', envelope: 'monitor', monitorScript: 'vault-activity.sh' });
});

test('loadSchedule accepts an agent envelope naming neither script', () => {
  const schedule = loadSchedule({ cron: '0 21 * * 0', envelope: 'agent' });
  assert.deepEqual(schedule, { cron: '0 21 * * 0', envelope: 'agent' });
});

test('loadSchedule trims the cron expression', () => {
  assert.equal(loadSchedule({ cron: ' 0 7 * * * ', envelope: 'agent' }).cron, '0 7 * * *');
});

test('loadSchedule carries an optional workdir through', () => {
  const schedule = loadSchedule({ cron: '0 7 * * *', envelope: 'agent', workdir: '/vault' });
  assert.equal(schedule.workdir, '/vault');
});

test('loadSchedule refuses an unknown field as bad_input', () => {
  // A closed schema: a field orch accepts but never reads is a setting that looks configured
  // and does nothing. Delivery in particular is machine-local and has no place in a recipe.
  const obj = { cron: '0 7 * * *', envelope: 'agent', deliver: 'local' };
  assert.throws(() => loadSchedule(obj), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadSchedule refuses an unknown field before anything else about the schedule is used', () => {
  const obj = { cron: '0 7 * * *', envelope: 'agent', scripts: 'x.sh' };
  assert.throws(() => loadSchedule(obj), (err) => /unknown field "scripts"/.test(err.message));
});

test('loadSchedule refuses envelope "agent" together with a script as envelope_mismatch', () => {
  const obj = { cron: '0 7 * * *', envelope: 'agent', script: 'combo-benchmark.py' };
  assert.throws(() => loadSchedule(obj), (err) => err instanceof OrchError && err.code === 'envelope_mismatch');
});

test('loadSchedule names the offending script in the envelope_mismatch message', () => {
  const obj = { cron: '0 7 * * *', envelope: 'agent', script: 'combo-benchmark.py' };
  assert.throws(() => loadSchedule(obj), (err) => /combo-benchmark\.py/.test(err.message));
});

test('loadSchedule refuses envelope "agent" together with a monitorScript as envelope_mismatch', () => {
  const obj = { cron: '0 7 * * *', envelope: 'agent', monitorScript: 'vault-activity.sh' };
  assert.throws(() => loadSchedule(obj), (err) => err instanceof OrchError && err.code === 'envelope_mismatch');
});

test('loadSchedule refuses an unknown envelope as bad_input', () => {
  assert.throws(() => loadSchedule({ cron: '0 7 * * *', envelope: 'turn' }), (err) => err instanceof OrchError && err.code === 'bad_input');
  assert.throws(() => loadSchedule({ cron: '0 7 * * *' }), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadSchedule refuses a script envelope with no script as bad_input', () => {
  assert.throws(() => loadSchedule({ cron: '0 7 * * *', envelope: 'script' }), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadSchedule refuses a monitor envelope with no monitorScript as bad_input', () => {
  assert.throws(() => loadSchedule({ cron: '0 7 * * *', envelope: 'monitor' }), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadSchedule refuses a missing or empty cron as bad_input', () => {
  assert.throws(() => loadSchedule({ envelope: 'agent' }), (err) => err instanceof OrchError && err.code === 'bad_input');
  assert.throws(() => loadSchedule({ cron: '   ', envelope: 'agent' }), (err) => err instanceof OrchError && err.code === 'bad_input');
  assert.throws(() => loadSchedule({ cron: 7, envelope: 'agent' }), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadSchedule refuses a non-object as bad_input', () => {
  assert.throws(() => loadSchedule(null), (err) => err instanceof OrchError && err.code === 'bad_input');
  assert.throws(() => loadSchedule([]), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadSchedule refuses an empty-string script field as bad_input', () => {
  const obj = { cron: '0 7 * * *', envelope: 'script', script: '' };
  assert.throws(() => loadSchedule(obj), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── loadRecipe: schedule ──────────────────────────────────────────────────────

test('loadRecipe carries a validated schedule on the recipe', () => {
  const recipe = loadRecipe({ ...VALID, schedule: { cron: '0 7 * * *', envelope: 'script', script: 'bench.sh' } });
  assert.deepEqual(recipe.schedule, { cron: '0 7 * * *', envelope: 'script', script: 'bench.sh' });
});

test('loadRecipe leaves schedule undefined when a recipe declares none', () => {
  assert.equal(loadRecipe(VALID).schedule, undefined);
});

test('loadRecipe refuses the envelope mismatch at load time, before any job exists', () => {
  // The refusal has to land here — the earliest point a recipe is read — not once a job has
  // already been handed to the scheduler.
  const obj = { ...VALID, schedule: { cron: '0 7 * * *', envelope: 'agent', script: 'bench.sh' } };
  assert.throws(() => loadRecipe(obj), (err) => err instanceof OrchError && err.code === 'envelope_mismatch');
});

// The schedule's shape cannot see a recipe's steps, but the steps are what the dispatched turn
// actually runs — so a step that shells out to a hermes script is the same defect by another
// route, and has to be refused here or not at all.

function scheduledWithSteps(steps, envelope = 'agent') {
  return {
    name: 'combo-benchmark',
    steps,
    verify: { command: ['true'] },
    schedule: { cron: '0 7 * * *', envelope },
  };
}

test('loadRecipe refuses a scheduled recipe whose step runs a hermes script under envelope "agent"', () => {
  const obj = scheduledWithSteps([{ id: 'bench', command: ['python3', '~/.hermes/scripts/combo-benchmark.py'] }]);
  assert.throws(() => loadRecipe(obj), (err) => err instanceof OrchError && err.code === 'envelope_mismatch');
});

test('loadRecipe names the offending script and the fix when refusing a scheduled recipe', () => {
  const obj = scheduledWithSteps([{ id: 'bench', command: ['python3', '~/.hermes/scripts/combo-benchmark.py'] }]);
  assert.throws(() => loadRecipe(obj), (err) => /combo-benchmark\.py/.test(err.message) && /envelope "script"/.test(err.message));
});

test('loadRecipe refuses a scheduled recipe whose step runs a hermes script under a script envelope too', () => {
  // The schedule hoists its script outside the turn; a step that runs it as well puts the
  // same work back inside, and does it twice.
  const obj = scheduledWithSteps([{ id: 'bench', command: ['python3', '~/.hermes/scripts/combo-benchmark.py'] }], 'script');
  obj.schedule.script = 'combo-benchmark.py';
  assert.throws(() => loadRecipe(obj), (err) => err instanceof OrchError && err.code === 'envelope_mismatch');
});

test('loadRecipe leaves a recipe with no schedule free to run a hermes script by hand', () => {
  const recipe = loadRecipe({ ...VALID, steps: [{ id: 'bench', command: ['python3', '~/.hermes/scripts/combo-benchmark.py'] }] });
  assert.equal(recipe.steps[0].id, 'bench');
});

test('loadRecipe refuses a scheduled recipe whose step runs a hermes script with no interpreter prefix', () => {
  // Regression: a hermes script is shebang'd and directly executable, so a step naming one
  // as its own argv[0] — no python3/bash/etc in front of it — is exactly the combo-benchmark
  // defect. The prose-oriented interpreter match used for job prompts must not gate this.
  const obj = scheduledWithSteps([{ id: 'bench', command: ['~/.hermes/scripts/combo-benchmark.py'] }]);
  assert.throws(() => loadRecipe(obj), (err) => err instanceof OrchError && err.code === 'envelope_mismatch');
});

test('loadRecipe refuses a scheduled recipe whose step runs a hermes script via an absolute path with no interpreter', () => {
  const obj = scheduledWithSteps([
    { id: 'bench', command: ['/Users/owner/.hermes/scripts/combo-benchmark.py', '--fast'] },
  ]);
  assert.throws(() => loadRecipe(obj), (err) => err instanceof OrchError && err.code === 'envelope_mismatch');
});

test('loadRecipe accepts a scheduled recipe whose steps are the cheap remainder', () => {
  const obj = scheduledWithSteps([{ id: 'report', command: ['hermes', 'send', '--target', 'local'] }], 'script');
  obj.schedule.script = 'combo-benchmark.py';
  assert.equal(loadRecipe(obj).steps[0].id, 'report');
});

test('loadRecipe refuses a scheduled recipe with a positional placeholder as bad_input', () => {
  // A scheduled dispatch passes no args, so this job would fail on every single run.
  const obj = scheduledWithSteps([{ id: 'brief', command: ['rise-ops', 'brief', '{1}'] }]);
  assert.throws(() => loadRecipe(obj), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('loadRecipe still accepts a positional placeholder in a recipe that is not scheduled', () => {
  const recipe = loadRecipe({ ...VALID, steps: [{ id: 'brief', command: ['rise-ops', 'brief', '{1}'] }] });
  assert.deepEqual(planSteps(recipe, ['BI'])[0].command, ['rise-ops', 'brief', 'BI']);
});

test('loadRecipe refuses a scheduled recipe with a positional placeholder in a step\'s cwd', () => {
  // Regression: a scheduled dispatch passes no args, and cwd substitutes {n} exactly like
  // command does — a placeholder hiding there would fail on every run just the same, but
  // only the command array was ever checked.
  const obj = scheduledWithSteps([{ id: 'build', command: ['go', 'build', './...'], cwd: '{1}' }]);
  assert.throws(() => loadRecipe(obj), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── cronArgs ──────────────────────────────────────────────────────────────────

function scheduled(envelope, fields = {}) {
  return loadRecipe({
    name: 'vault-health',
    steps: [{ id: 'report', command: ['echo', 'report'] }],
    verify: { command: ['true'] },
    schedule: { cron: '40 9 * * 1', envelope, ...fields },
  });
}

test('cronArgs builds a hermes cron create argv named after the recipe', () => {
  const argv = cronArgs(scheduled('agent'));
  assert.deepEqual(argv.slice(0, 4), ['hermes', 'cron', 'create', '40 9 * * 1']);
  assert.match(argv[4], /orch run vault-health/);
  assert.deepEqual(argv.slice(5), ['--name', 'orch-vault-health']);
  assert.equal(scheduledJobName('vault-health'), 'orch-vault-health');
});

test('cronArgs maps the agent envelope to no script flags at all', () => {
  const argv = cronArgs(scheduled('agent'));
  assert.equal(argv.includes('--script'), false);
  assert.equal(argv.includes('--monitor-script'), false);
  assert.equal(argv.length, 7);
});

test('cronArgs maps the script envelope to --script', () => {
  const argv = cronArgs(scheduled('script', { script: 'vault-health-scan.sh' }));
  assert.deepEqual(argv.slice(5), ['--name', 'orch-vault-health', '--script', 'vault-health-scan.sh']);
});

test('cronArgs maps the monitor envelope to --monitor-script', () => {
  const argv = cronArgs(scheduled('monitor', { monitorScript: 'vault-activity.sh' }));
  assert.deepEqual(argv.slice(5), ['--name', 'orch-vault-health', '--monitor-script', 'vault-activity.sh']);
});

test('cronArgs passes a recipe-declared workdir through', () => {
  const argv = cronArgs(scheduled('agent', { workdir: '/vault' }));
  assert.deepEqual(argv.slice(5), ['--name', 'orch-vault-health', '--workdir', '/vault']);
});

test('cronArgs carries a delivery target given at registration, not stored in the recipe', () => {
  const recipe = scheduled('agent');
  assert.equal('deliver' in recipe.schedule, false);
  const argv = cronArgs(recipe, { deliver: 'local' });
  assert.deepEqual(argv.slice(5), ['--name', 'orch-vault-health', '--deliver', 'local']);
});

test('cronArgs omits --deliver when this machine declares no delivery target', () => {
  assert.equal(cronArgs(scheduled('agent')).includes('--deliver'), false);
});

test('cronArgs refuses an empty delivery target as bad_input', () => {
  assert.throws(() => cronArgs(scheduled('agent'), { deliver: '' }), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('cronArgs sends the script envelope a prompt that forbids re-running the work', () => {
  // The whole point of the envelope: the expensive step already ran. A prompt that leaves the
  // turn free to run it again recreates the defect the envelope exists to prevent.
  const argv = cronArgs(scheduled('script', { script: 'bench.sh' }));
  assert.match(argv[4], /do not run that work yourself/);
});

test('cronArgs throws bad_input for a recipe with no declared schedule', () => {
  assert.throws(() => cronArgs(loadRecipe(VALID)), (err) => err instanceof OrchError && err.code === 'bad_input');
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

// ── parseScheduleFlags ────────────────────────────────────────────────────────

test('parseScheduleFlags splits named flags from the positional cron', () => {
  const { flags, rest } = parseScheduleFlags([
    '0 7 * * *',
    '--envelope',
    'script',
    '--script',
    'combo-benchmark.py',
    '--workdir',
    '/vault',
  ]);
  assert.deepEqual(flags, { envelope: 'script', script: 'combo-benchmark.py', workdir: '/vault' });
  assert.deepEqual(rest, ['0 7 * * *']);
});

test('parseScheduleFlags maps --monitor-script onto monitorScript', () => {
  const { flags } = parseScheduleFlags(['--envelope', 'monitor', '--monitor-script', 'vault-activity.sh']);
  assert.deepEqual(flags, { envelope: 'monitor', monitorScript: 'vault-activity.sh' });
});

test('parseScheduleFlags throws bad_input for an unknown flag', () => {
  assert.throws(() => parseScheduleFlags(['--envlope', 'script']), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('parseScheduleFlags throws bad_input when a flag has no value', () => {
  assert.throws(() => parseScheduleFlags(['--envelope']), (err) => err instanceof OrchError && err.code === 'bad_input');
});

test('parseScheduleFlags throws bad_input when a flag runs straight into the next flag', () => {
  assert.throws(() => parseScheduleFlags(['--envelope', '--script', 'x.sh']), (err) => err instanceof OrchError && err.code === 'bad_input');
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

await testAsync('runRecipe collects a failing step\'s stderr for the caller to write', async () => {
  // Regression: the DP-10854 ticket-implement postmortem — exit 9 and exit 1 carried no stderr
  // anywhere in the audit log, so diagnosing them meant combing through command-code's own
  // session store by hand. runRecipe stays hermetic (no I/O of its own): it hands the caller
  // exactly what to write and where, the same division appendAudit already has for `lines`.
  const recipe = loadRecipe(VALID);
  const exec = fakeExec({ 'echo two': { code: 1, stdout: '', stderr: 'boom' } });
  const result = await runRecipe(recipe, [], { exec, runId: 'run-stderr', now: () => 't0' });
  assert.deepEqual(result.stderrLogs, [{ path: stderrLogPath('run-stderr', 'two'), content: 'boom' }]);
  const last = JSON.parse(result.lines[1]);
  assert.equal(last.stderr, stderrLogPath('run-stderr', 'two'));
});

await testAsync('runRecipe records no stderr log for a step with empty stderr', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec({ 'echo two': { code: 1, stdout: '', stderr: '' } });
  const result = await runRecipe(recipe, [], { exec, runId: 'run-nostderr', now: () => 't0' });
  assert.deepEqual(result.stderrLogs, []);
  const last = JSON.parse(result.lines[1]);
  assert.equal('stderr' in last, false);
});

await testAsync('runRecipe records no stderr log for a successful step', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec();
  const result = await runRecipe(recipe, [], { exec, runId: 'run-ok', now: () => 't0' });
  assert.deepEqual(result.stderrLogs, []);
});

await testAsync('runRecipe generates a runId when none is injected', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec();
  const result = await runRecipe(recipe, [], { exec });
  assert.equal(typeof result.runId, 'string');
  assert.ok(result.runId.length > 0);
});

await testAsync('runRecipe threads a captured value from one step into a later step\'s command', async () => {
  const recipe = loadRecipe({
    name: 'worktree-then-use-it',
    steps: [
      { id: 'worktree', command: ['orca', 'worktree', 'create', '--json'], capture: { as: 'wt', json: 'result.worktree.path' } },
      { id: 'implement', command: ['command-code', '-p', 'go', '--add-dir', '{captured.wt}'] },
    ],
    verify: { command: ['true'] },
  });
  const exec = (command) => {
    if (command[0] === 'orca') {
      return { code: 0, stdout: JSON.stringify({ result: { worktree: { path: '/tmp/wt-1' } } }), stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const result = await runRecipe(recipe, [], { exec, runId: 'run-capture' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.lines.map((l) => JSON.parse(l).cmd[JSON.parse(l).cmd.length - 1]), [
    '--json',
    '/tmp/wt-1',
  ]);
});

await testAsync('runRecipe passes a step\'s resolved cwd to exec, including a captured value', async () => {
  const recipe = loadRecipe({
    name: 'cwd-run',
    steps: [
      { id: 'worktree', command: ['orca', 'worktree', 'create', '--json'], capture: { as: 'wt', json: 'result.worktree.path' } },
      { id: 'build', command: ['go', 'build', './...'], cwd: '{captured.wt}' },
    ],
    verify: { command: ['true'] },
  });
  const seenOptions = [];
  const exec = (command, options) => {
    seenOptions.push(options);
    if (command[0] === 'orca') {
      return { code: 0, stdout: JSON.stringify({ result: { worktree: { path: '/tmp/wt-2' } } }), stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  await runRecipe(recipe, [], { exec, runId: 'run-cwd' });
  assert.equal(seenOptions[0].cwd, undefined);
  assert.equal(seenOptions[1].cwd, '/tmp/wt-2');
});

await testAsync('runRecipe writes the captured value onto the capturing step\'s audit line', async () => {
  // Proves the persistence findRunCaptured relies on: a separate `orch verify` invocation has
  // no access to this run's in-memory `captured` map, only what got written to the audit log.
  const recipe = loadRecipe({
    name: 'capture-audit',
    steps: [{ id: 'worktree', command: ['orca', 'worktree', 'create', '--json'], capture: { as: 'wt', json: 'result.worktree.path' } }],
    verify: { command: ['true'] },
  });
  const exec = () => ({ code: 0, stdout: JSON.stringify({ result: { worktree: { path: '/tmp/wt-5' } } }), stderr: '' });
  const result = await runRecipe(recipe, [], { exec, runId: 'run-capture-audit' });
  const line = JSON.parse(result.lines[0]);
  assert.deepEqual(line.capture, { name: 'wt', value: '/tmp/wt-5' });
});

await testAsync('runRecipe treats a failed capture as a step failure, without losing the line', async () => {
  // Regression: capturedValue can throw (e.g. undeclared JSON shape) *after* the command
  // itself already succeeded. Letting that exception propagate out of runRecipe would lose
  // every already-collected line, including this step's own — so it is folded into the exact
  // same "record the line, stop the run" path a non-zero exit already uses, not a separate
  // throw.
  const recipe = loadRecipe({
    name: 'bad-capture',
    steps: [
      { id: 'one', command: ['echo', 'not json'], capture: { as: 'wt', json: 'a.b' } },
      { id: 'two', command: ['echo', 'never runs'] },
    ],
    verify: { command: ['true'] },
  });
  const exec = () => ({ code: 0, stdout: 'not json', stderr: '' });
  const result = await runRecipe(recipe, [], { exec, runId: 'run-bad-capture' });
  assert.equal(result.ok, false);
  assert.equal(result.lines.length, 1);
  const line = JSON.parse(result.lines[0]);
  assert.equal(line.step, 'one');
  assert.notEqual(line.exit, 0);
  assert.equal('capture' in line, false);
});

await testAsync('runRecipe throws bad_input when a step references a capture out of order', async () => {
  const recipe = loadRecipe({
    name: 'out-of-order',
    steps: [{ id: 'one', command: ['echo', '{captured.never}'] }],
    verify: { command: ['true'] },
  });
  await assert.rejects(
    () => runRecipe(recipe, [], { exec: fakeExec(), runId: 'run-oob' }),
    (err) => err instanceof OrchError && err.code === 'bad_input',
  );
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
  const result = await runVerify(recipe, [], { exec: throwingExec });
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

test('auditLine includes args only when given', () => {
  const withArgs = JSON.parse(auditLine('run-9', 'smoke-test', { id: 'one', command: ['echo'] }, { code: 0 }, 't0', ['a', 'b']));
  assert.deepEqual(withArgs.args, ['a', 'b']);
  const withoutArgs = JSON.parse(auditLine('run-9', 'smoke-test', { id: 'one', command: ['echo'] }, { code: 0 }, 't0'));
  assert.equal('args' in withoutArgs, false);
});

test('auditLine includes capture only when given', () => {
  const withCapture = JSON.parse(
    auditLine('run-9', 'smoke-test', { id: 'one', command: ['echo'] }, { code: 0 }, 't0', undefined, { name: 'wt', value: '/tmp/wt' }),
  );
  assert.deepEqual(withCapture.capture, { name: 'wt', value: '/tmp/wt' });
  const withoutCapture = JSON.parse(auditLine('run-9', 'smoke-test', { id: 'one', command: ['echo'] }, { code: 0 }, 't0'));
  assert.equal('capture' in withoutCapture, false);
});

test('auditLine includes stderr path only when given', () => {
  const withStderr = JSON.parse(
    auditLine('run-9', 'smoke-test', { id: 'one', command: ['echo'] }, { code: 1 }, 't0', undefined, undefined, '/tmp/log.stderr'),
  );
  assert.equal(withStderr.stderr, '/tmp/log.stderr');
  const withoutStderr = JSON.parse(auditLine('run-9', 'smoke-test', { id: 'one', command: ['echo'] }, { code: 0 }, 't0'));
  assert.equal('stderr' in withoutStderr, false);
});

test('stderrLogPath is deterministic from runId and stepId alone', () => {
  const path = stderrLogPath('run-9', 'implement');
  assert.match(path, /orch\/logs\/run-9\/implement\.stderr$/);
  assert.equal(path, stderrLogPath('run-9', 'implement'));
});

// ── findRunCaptured ──────────────────────────────────────────────────────────

test('findRunCaptured folds every capture line for a run', () => {
  const entries = [
    { run: 'run-1', capture: { name: 'wt', value: '/tmp/wt' } },
    { run: 'run-1', capture: { name: 'sha', value: 'abc123' } },
    { run: 'run-2', capture: { name: 'wt', value: '/tmp/other' } },
  ];
  assert.deepEqual(findRunCaptured(entries, 'run-1'), { wt: '/tmp/wt', sha: 'abc123' });
});

test('findRunCaptured returns {} for a run with no captures', () => {
  const entries = [{ run: 'run-1', step: 'one' }];
  assert.deepEqual(findRunCaptured(entries, 'run-1'), {});
});

test('findRunCaptured ignores entries from other runs', () => {
  const entries = [{ run: 'run-2', capture: { name: 'wt', value: '/tmp/other' } }];
  assert.deepEqual(findRunCaptured(entries, 'run-1'), {});
});

// ── runVerify ─────────────────────────────────────────────────────────────────

await testAsync('runVerify runs the declared check and reports success', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec();
  const result = await runVerify(recipe, [], { exec });
  assert.equal(result.ok, true);
  assert.deepEqual(exec.calls, [['test', '-f', '/tmp/orch-smoke']]);
});

await testAsync('runVerify reports failure without throwing', async () => {
  const recipe = loadRecipe(VALID);
  const exec = fakeExec({ 'test -f /tmp/orch-smoke': { code: 1, stdout: '', stderr: '' } });
  const result = await runVerify(recipe, [], { exec });
  assert.equal(result.ok, false);
  assert.equal(result.exit, 1);
});

await testAsync("runVerify substitutes {n} into verify.command from the run's own args", async () => {
  // Regression: a Verify checking "is *this* naskah approved" needs to know which naskah.
  // Before this, verify.command was executed completely raw, so a recipe like deck-build's
  // (`["node", "deck.mjs", "build", "--final", "{1}"]`) failed for every naskah, forever.
  const recipe = loadRecipe({
    name: 'deck-build',
    steps: [{ id: 'build', command: ['node', 'deck.mjs', 'build', '{1}'] }],
    verify: { command: ['node', 'deck.mjs', 'build', '--final', '{1}'] },
  });
  const exec = fakeExec();
  const result = await runVerify(recipe, ['/vault/Sesi 02 - Naskah.md'], { exec });
  assert.equal(result.ok, true);
  assert.deepEqual(exec.calls, [['node', 'deck.mjs', 'build', '--final', '/vault/Sesi 02 - Naskah.md']]);
  assert.deepEqual(result.command, ['node', 'deck.mjs', 'build', '--final', '/vault/Sesi 02 - Naskah.md']);
});

await testAsync('runVerify throws bad_input when verify.command references a {n} the run has no arg for', async () => {
  const recipe = loadRecipe({
    name: 'deck-build',
    steps: [{ id: 'build', command: ['echo', 'ok'] }],
    verify: { command: ['node', 'deck.mjs', 'build', '--final', '{1}'] },
  });
  await assert.rejects(
    () => runVerify(recipe, [], { exec: fakeExec() }),
    (err) => err instanceof OrchError && err.code === 'bad_input',
  );
});

await testAsync('runVerify resolves {captured.*} from the captured map it is given', async () => {
  // The whole reason captures are persisted to the audit log: runVerify runs in a separate
  // invocation, long after the run that produced this value, so it cannot recover it any
  // other way (see findRunCaptured).
  const recipe = loadRecipe({
    name: 'build-check',
    steps: [{ id: 'worktree', command: ['orca', 'worktree', 'create'], capture: { as: 'wt' } }],
    verify: { command: ['go', 'build', '{captured.wt}'] },
  });
  const exec = fakeExec();
  const result = await runVerify(recipe, [], { exec, captured: { wt: '/tmp/wt-3' } });
  assert.equal(result.ok, true);
  assert.deepEqual(exec.calls, [['go', 'build', '/tmp/wt-3']]);
});

await testAsync('runVerify passes verify.cwd (including a captured value) to exec', async () => {
  const recipe = loadRecipe({
    name: 'build-check-cwd',
    steps: [{ id: 'worktree', command: ['orca', 'worktree', 'create'], capture: { as: 'wt' } }],
    verify: { command: ['go', 'build', './...'], cwd: '{captured.wt}' },
  });
  let seenOptions;
  const exec = (command, options) => {
    seenOptions = options;
    return { code: 0, stdout: '', stderr: '' };
  };
  await runVerify(recipe, [], { exec, captured: { wt: '/tmp/wt-4' } });
  assert.equal(seenOptions.cwd, '/tmp/wt-4');
});

// ── findRunRecipe / findRunArgs ────────────────────────────────────────────────

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

test('findRunArgs recovers the args a run was invoked with', () => {
  const entries = [
    { ts: 't0', run: 'run-1', recipe: 'deck-build', step: 'build', cmd: ['node'], exit: 0, args: ['/vault/x.md'] },
    { ts: 't1', run: 'run-1', recipe: 'deck-build', step: 'render', cmd: ['node'], exit: 0, args: ['/vault/x.md'] },
  ];
  assert.deepEqual(findRunArgs(entries, 'run-1'), ['/vault/x.md']);
});

test('findRunArgs defaults to an empty array for a run recorded with no args field', () => {
  const entries = [{ ts: 't0', run: 'run-1', recipe: 'smoke-test', step: 'one', cmd: ['echo'], exit: 0 }];
  assert.deepEqual(findRunArgs(entries, 'run-1'), []);
});

test('findRunArgs throws bad_input for an unknown run id', () => {
  assert.throws(() => findRunArgs([], 'ghost'), (err) => err instanceof OrchError && err.code === 'bad_input');
});

// ── envelopeFindings ──────────────────────────────────────────────────────────
//
// The fixtures are the owner's real jobs, copied field-for-field from the scheduler's store:
// the one that has failed every morning since 2026-09-13, and the two shapes that work with a
// turn in them. The no_agent fixture is the exception — its prompt is written to carry the
// defect's shape on purpose, so the guard that ignores it can be pinned rather than assumed.

const BENCHMARK_JOB = {
  id: 'b136dbe36a4d',
  name: 'combo-benchmark-daily-08wib',
  no_agent: false,
  script: null,
  monitor_script: null,
  prompt:
    'You are the OmniRoute Combo Benchmark agent. Run the daily benchmark\n\n' +
    'Steps (keep it simple):\n' +
    '1. Run: python3 ~/.hermes/scripts/combo-benchmark.py  (it researches 3 trusted sources)\n' +
    '2. Read the generated report: ~/.hermes/cron/output/combo-benchmark-latest.md\n',
};

const SCRIPT_ENVELOPE_JOB = {
  id: '9fef2994ce5d',
  name: 'vault-health',
  no_agent: false,
  script: 'vault-health-scan.sh',
  monitor_script: null,
  prompt: 'A deterministic scan has ALREADY been run for you and its output is injected into this prompt as context.',
};

const MONITOR_ENVELOPE_JOB = {
  id: '1b6349f5a61d',
  name: 'vault-consolidate',
  no_agent: false,
  script: null,
  monitor_script: 'vault-activity.sh',
  prompt: 'You are a scheduled vault-automation agent. Consolidate what today produced.',
};

const NO_AGENT_JOB = {
  id: 'dc62889f1a5b',
  name: 'vault-reindex',
  no_agent: true,
  script: 'vault-reindex.sh',
  monitor_script: null,
  // Carries the same shape as the benchmark job on purpose: with no agent turn there is no
  // turn to place work in, so this must stay silent *because of* the no_agent guard.
  prompt: 'Run: python3 ~/.hermes/scripts/reindex.py',
};

test('envelopeFindings reports the known-bad benchmark job as envelope_mismatch', () => {
  const findings = envelopeFindings([BENCHMARK_JOB]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'envelope_mismatch');
  assert.equal(findings[0].id, 'b136dbe36a4d');
  assert.equal(findings[0].name, 'combo-benchmark-daily-08wib');
  assert.match(findings[0].message, /combo-benchmark\.py/);
  assert.match(findings[0].message, /script/);
});

test('envelopeFindings leaves the healthy reference shapes alone', () => {
  // script and monitor envelopes, plus a plain-agent turn with no external work.
  assert.deepEqual(envelopeFindings([SCRIPT_ENVELOPE_JOB, MONITOR_ENVELOPE_JOB]), []);
});

test('envelopeFindings ignores a job with no agent turn even when its prompt runs a script', () => {
  // --no-agent runs the script as the job; there is no turn for the work to sit inside, so a
  // script in the prompt is not the defect.
  assert.equal(NO_AGENT_JOB.prompt.includes('.hermes/scripts/'), true);
  assert.deepEqual(envelopeFindings([NO_AGENT_JOB]), []);
});

test('envelopeFindings reports only the benchmark job out of the whole scheduler store', () => {
  const jobs = [BENCHMARK_JOB, SCRIPT_ENVELOPE_JOB, MONITOR_ENVELOPE_JOB, NO_AGENT_JOB];
  assert.deepEqual(
    envelopeFindings(jobs).map((f) => f.name),
    ['combo-benchmark-daily-08wib'],
  );
});

test('envelopeFindings does not flag a prompt that merely names a script path', () => {
  const job = { id: 'x', name: 'mentions', no_agent: false, prompt: 'Reports are saved next to ~/.hermes/scripts/foo.py for reference.' };
  assert.deepEqual(envelopeFindings([job]), []);
});

test('envelopeFindings does not flag an interpreter running a script outside the scheduler', () => {
  const job = { id: 'x', name: 'elsewhere', no_agent: false, prompt: 'Run: python3 ~/code/bench.py' };
  assert.deepEqual(envelopeFindings([job]), []);
});

test('envelopeFindings flags a turn that shells out to a script in another form', () => {
  const job = { id: 'x', name: 'bash-flavoured', no_agent: false, prompt: 'Run: bash ~/.hermes/scripts/nightly.sh' };
  assert.deepEqual(
    envelopeFindings([job]).map((f) => f.code),
    ['envelope_mismatch'],
  );
});

test('envelopeFindings tolerates jobs with no prompt and no jobs at all', () => {
  assert.deepEqual(envelopeFindings([]), []);
  assert.deepEqual(envelopeFindings([{ id: 'x', name: 'bare' }]), []);
  assert.deepEqual(envelopeFindings([null]), []);
});

// ── harnessFindings ───────────────────────────────────────────────────────────

test('harnessFindings reports an unreachable harness as layer_down', () => {
  const findings = harnessFindings(['claude', 'hermes'], (name) => name === 'claude');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].name, 'hermes');
  assert.equal(findings[0].code, 'layer_down');
});

test('harnessFindings reports nothing when every harness answers', () => {
  assert.deepEqual(harnessFindings(['claude', 'hermes'], () => true), []);
});

test('harnessFindings reports every harness when none answer', () => {
  const findings = harnessFindings(['claude', 'hermes'], () => false);
  assert.deepEqual(
    findings.map((f) => f.name),
    ['claude', 'hermes'],
  );
  assert.ok(findings.every((f) => f.code === 'layer_down'));
});

test('harnessFindings gives a layer finding a code distinct from an envelope finding', () => {
  const layer = harnessFindings(['hermes'], () => false)[0];
  const envelope = envelopeFindings([BENCHMARK_JOB])[0];
  assert.notEqual(layer.code, envelope.code);
});

// ── openRuns ──────────────────────────────────────────────────────────────────
//
// Real shapes from ~/.config/orch/audit.jsonl, which holds one line per step and a `verify`
// line written only by `orch verify`.

const step = (run, ts, id, exit, recipe = 'sesi-run') => ({
  ts,
  run,
  recipe,
  step: id,
  cmd: ['echo', id],
  exit,
});

test('openRuns returns nothing for an empty log', () => {
  assert.deepEqual(openRuns([]), []);
});

test('openRuns lists a run whose steps all passed but which was never verified', () => {
  // The whole point of Verify as a separate claim (ADR 0002): every step exiting 0 is not done.
  const entries = [step('r1', '2026-09-16T10:00:00.000Z', 'one', 0), step('r1', '2026-09-16T10:00:01.000Z', 'two', 0)];
  const open = openRuns(entries);
  assert.equal(open.length, 1);
  assert.equal(open[0].run, 'r1');
  assert.equal(open[0].recipe, 'sesi-run');
  assert.equal(open[0].started, '2026-09-16T10:00:00.000Z');
  assert.equal(open[0].steps, 2);
  assert.equal(open[0].state, 'unverified');
});

test('openRuns closes a run whose Verify passed', () => {
  const entries = [
    step('r1', '2026-09-16T10:00:00.000Z', 'one', 0),
    step('r1', '2026-09-16T10:00:05.000Z', 'verify', 0),
  ];
  assert.deepEqual(openRuns(entries), []);
});

test('openRuns states a run whose Verify ran and failed as verify failed', () => {
  // The steps all passed; the check is what failed. Saying only "failed" would send the owner
  // looking at steps that did their job.
  const entries = [
    step('r1', '2026-09-16T10:00:00.000Z', 'one', 0),
    step('r1', '2026-09-16T10:00:05.000Z', 'verify', 1),
  ];
  const open = openRuns(entries);
  assert.equal(open[0].state, 'verify failed');
  assert.equal(open[0].exit, 1);
});

test('openRuns states a run that stopped on a failing step as failed', () => {
  const entries = [
    step('r1', '2026-09-16T10:00:00.000Z', 'one', 0),
    step('r1', '2026-09-16T10:00:01.000Z', 'two', 1),
  ];
  const open = openRuns(entries);
  assert.equal(open[0].state, 'failed');
  assert.equal(open[0].exit, 1);
  assert.equal(open[0].steps, 2);
});

test('openRuns states a step that never produced an exit code as failed', () => {
  // `exit: null` is a command that could not be spawned at all — dead, not merely unverified.
  const entries = [step('r1', '2026-09-16T10:00:00.000Z', 'one', null)];
  assert.equal(openRuns(entries)[0].state, 'failed');
});

test('openRuns does not count the verify line as a step', () => {
  const entries = [
    step('r1', '2026-09-16T10:00:00.000Z', 'one', 0),
    step('r1', '2026-09-16T10:00:05.000Z', 'verify', 1),
  ];
  assert.equal(openRuns(entries)[0].steps, 1);
});

test('openRuns lists runs newest first, by instant rather than by digits', () => {
  const entries = [
    step('old', '2026-09-15T10:00:00.000Z', 'one', 0),
    step('new', '2026-09-16T10:00:00.000Z', 'one', 0),
    step('mid', '2026-09-16T09:00:00.000Z', 'one', 0),
  ];
  assert.deepEqual(
    openRuns(entries).map((run) => run.run),
    ['new', 'mid', 'old'],
  );
});

test('openRuns separates runs that share a log', () => {
  const entries = [
    step('open', '2026-09-16T10:00:00.000Z', 'one', 0),
    step('closed', '2026-09-16T09:00:00.000Z', 'one', 0),
    step('closed', '2026-09-16T09:00:01.000Z', 'verify', 0, 'deck-build'),
  ];
  const open = openRuns(entries);
  assert.equal(open.length, 1);
  assert.equal(open[0].run, 'open');
});

test('openRuns ignores entries with no run id', () => {
  assert.deepEqual(openRuns([null, 'nope', { ts: 'x' }, { run: 7 }]), []);
});

test('openRuns falls back for a run whose recipe name was lost', () => {
  const entries = [step('r1', '2026-09-16T10:00:00.000Z', 'one', 0), { ...step('r1', '2026-09-16T10:00:01.000Z', 'two', 0) }];
  delete entries[0].recipe;
  assert.equal(openRuns(entries)[0].recipe, '—');
});

// ── shortTs ───────────────────────────────────────────────────────────────────

test('shortTs renders an audit timestamp without its fractional seconds', () => {
  assert.equal(shortTs('2026-09-16T10:59:24.882Z'), '2026-09-16 10:59Z');
});

test('shortTs renders a hermes timestamp without its six fractional digits', () => {
  assert.equal(shortTs('2026-09-16T07:25:54.423018+07:00'), '2026-09-16 07:25+07:00');
});

test('shortTs keeps the zone marker so two clocks are never confused for one', () => {
  assert.equal(shortTs('2026-09-17T07:00:00+07:00'), '2026-09-17 07:00+07:00');
  assert.equal(shortTs('2026-09-17T07:00:00Z'), '2026-09-17 07:00Z');
});

test('shortTs leaves a timestamp with no zone unmarked rather than guessing one', () => {
  assert.equal(shortTs('2026-09-16T10:59'), '2026-09-16 10:59');
});

test('shortTs renders a missing or unusable timestamp as a dash', () => {
  assert.equal(shortTs(null), '—');
  assert.equal(shortTs(undefined), '—');
  assert.equal(shortTs('yesterday'), '—');
});

// ── jobRows ───────────────────────────────────────────────────────────────────

const JOB = (over = {}) => ({
  name: 'vault-health',
  schedule_display: '40 9 * * 1',
  next_run_at: '2026-09-21T09:40:00+07:00',
  last_run_at: '2026-09-16T06:45:38.304953+07:00',
  last_status: 'ok',
  enabled: true,
  state: 'scheduled',
  ...over,
});

test('jobRows maps a scheduler job to its table row', () => {
  assert.deepEqual(jobRows([JOB()]), [
    {
      job: 'vault-health',
      schedule: '40 9 * * 1',
      next: '2026-09-21T09:40:00+07:00',
      last: '2026-09-16T06:45:38.304953+07:00',
      result: 'ok',
      state: 'scheduled',
    },
  ]);
});

test('jobRows reports a job that has never run as having no last run', () => {
  // "never run" is not a state hermes has — the empty LAST RUN column is what says it.
  const row = jobRows([JOB({ last_run_at: null, last_status: null })])[0];
  assert.equal(row.last, null);
  assert.equal(row.result, '—');
  assert.equal(row.state, 'scheduled');
});

test('jobRows keeps a finished one-shot as completed, not as paused', () => {
  // hermes writes enabled:false for a finished one-shot, and refuses to call it paused: a
  // paused job waits to be resumed, a completed one never runs again.
  const row = jobRows([JOB({ enabled: false, state: 'completed', next_run_at: null })])[0];
  assert.equal(row.state, 'completed');
  assert.equal(row.next, '—');
});

test('jobRows keeps a job that errored out as error', () => {
  const row = jobRows([JOB({ enabled: false, state: 'error', last_status: 'error' })])[0];
  assert.equal(row.state, 'error');
  assert.equal(row.result, 'error');
});

test('jobRows shows a paused job with no next run', () => {
  const row = jobRows([JOB({ enabled: false, state: 'paused' })])[0];
  assert.equal(row.state, 'paused');
  assert.equal(row.next, '—');
});

test('jobRows falls back to enabled when a record carries no state at all', () => {
  assert.equal(jobRows([JOB({ state: undefined })])[0].state, 'scheduled');
  assert.equal(jobRows([JOB({ state: undefined, enabled: false })])[0].state, 'paused');
});

test('jobRows sorts soonest next run first, with jobs that have none last', () => {
  const rows = jobRows([
    JOB({ name: 'later', next_run_at: '2026-09-21T09:40:00+07:00' }),
    JOB({ name: 'sooner', next_run_at: '2026-09-16T22:20:00+07:00' }),
    JOB({ name: 'done', enabled: false, state: 'completed' }),
  ]);
  assert.deepEqual(
    rows.map((row) => row.job),
    ['sooner', 'later', 'done'],
  );
});

test('jobRows sorts by the instant, not the digits, when offsets differ', () => {
  // As strings "…T02:00:00Z" sorts before "…T08:00:00+07:00"; as instants the second is 01:00Z
  // and comes first. The two orders differ, and the clock is the one that matters.
  const rows = jobRows([
    JOB({ name: 'utc', next_run_at: '2026-09-17T02:00:00Z' }),
    JOB({ name: 'wib', next_run_at: '2026-09-17T08:00:00+07:00' }),
  ]);
  assert.deepEqual(
    rows.map((row) => row.job),
    ['wib', 'utc'],
  );
});

test('jobRows sorts an unparseable next run last rather than crashing the sort', () => {
  const rows = jobRows([
    JOB({ name: 'junk', next_run_at: 'soonish' }),
    JOB({ name: 'real', next_run_at: '2026-09-16T22:20:00+07:00' }),
  ]);
  assert.deepEqual(
    rows.map((row) => row.job),
    ['real', 'junk'],
  );
});

test('jobRows tolerates junk in the store', () => {
  assert.deepEqual(jobRows([null, 'nope']), []);
});

// ── renderTable ───────────────────────────────────────────────────────────────

const N_COLUMNS = [
  { label: 'NAME', key: 'name' },
  { label: 'N', key: 'n', align: 'right' },
];

test('renderTable right-aligns a numeric column so its right edge is straight', () => {
  const lines = renderTable(N_COLUMNS, [{ name: 'a', n: 7 }, { name: 'bbbb', n: 1234 }]).split('\n');
  // Widest name is 4, widest number is 4, two spaces between: every line is 10 wide, and the
  // digits end at the same column whatever their count.
  assert.deepEqual(lines.map((line) => line.length), [10, 10, 10]);
  assert.equal(lines[1], 'a' + ' '.repeat(8) + '7');
  assert.equal(lines[2], 'bbbb' + ' '.repeat(2) + '1234');
});

test('renderTable pads a text column so the next column starts at the same place', () => {
  const lines = renderTable(N_COLUMNS, [{ name: 'a', n: 7 }, { name: 'bbbb', n: 1234 }]).split('\n');
  // The short name is padded out to the long one, so the numeric column starts at index 6 in
  // every line and the numbers can be compared down the page.
  assert.deepEqual(lines.map((line) => line.length), [10, 10, 10]);
  assert.equal(lines[0].slice(6), '   N');
  assert.equal(lines[1].slice(6), '   7');
  assert.equal(lines[2].slice(6), '1234');
});

test('renderTable widens a column to fit its label', () => {
  const lines = renderTable([{ label: 'TOTAL', key: 'n', align: 'right' }], [{ n: 7 }]).split('\n');
  assert.deepEqual(lines, ['TOTAL', '    7']);
});

test('renderTable renders a missing value as a dash rather than the word undefined', () => {
  const lines = renderTable(N_COLUMNS, [{ name: 'a' }]).split('\n');
  assert.equal(lines[1], 'a' + ' '.repeat(5) + '—');
});

test('renderTable renders a header alone when there are no rows', () => {
  assert.equal(renderTable(N_COLUMNS, []), 'NAME  N');
});

// ── renderStatus ──────────────────────────────────────────────────────────────

const OPEN_RUN = {
  run: '5cdfd83c-c8ab-44f0-be72-a10ee368145a',
  recipe: 'orch-config-smoke',
  started: '2026-09-16T10:59:24.882Z',
  steps: 1,
  exit: 0,
  state: 'unverified',
};

const JOB_ROW = jobRows([JOB()])[0];

test('renderStatus shows open runs and scheduled jobs together', () => {
  const report = renderStatus({ runs: [OPEN_RUN], jobs: [JOB_ROW] });
  assert.match(report, /1 open run\(s\), 1 scheduled job\(s\)/);
  assert.match(report, /OPEN RUNS/);
  assert.match(report, /orch-config-smoke/);
  assert.match(report, /2026-09-16 10:59Z/);
  assert.match(report, /SCHEDULED JOBS/);
  assert.match(report, /vault-health/);
  assert.match(report, /2026-09-21 09:40\+07:00/);
});

test('renderStatus says so plainly when nothing is open and nothing is scheduled', () => {
  const report = renderStatus({ runs: [], jobs: [] });
  assert.match(report, /✓ none open/);
  assert.match(report, /✓ none scheduled/);
});

test('renderStatus still reports jobs when the runs source failed', () => {
  // One unavailable source costs its own section, never the command.
  const report = renderStatus({ runsError: 'audit.jsonl is not valid JSON', jobs: [JOB_ROW] });
  assert.match(report, /✗ unavailable — audit\.jsonl is not valid JSON/);
  assert.match(report, /vault-health/);
  assert.match(report, /OPEN RUNS/);
  assert.match(report, /\? open run\(s\), 1 scheduled job\(s\)/);
});

test('renderStatus still reports runs when the jobs source failed', () => {
  const report = renderStatus({ runs: [OPEN_RUN], jobsError: 'hermes store is damaged' });
  assert.match(report, /orch-config-smoke/);
  assert.match(report, /✗ unavailable — hermes store is damaged/);
  assert.match(report, /1 open run\(s\), \? scheduled job\(s\)/);
});

test('renderStatus reports both counts as unknown when both sources failed', () => {
  const report = renderStatus({ runsError: 'audit log unreadable', jobsError: 'job store unreadable' });
  assert.match(report, /\? open run\(s\), \? scheduled job\(s\)/);
  assert.match(report, /✗ unavailable — audit log unreadable/);
  assert.match(report, /✗ unavailable — job store unreadable/);
});

test('renderStatus omits the cost section unless insights were asked for', () => {
  assert.equal(/COST/.test(renderStatus({ runs: [], jobs: [] })), false);
});

test('renderStatus echoes the insights it was handed, and adds nothing to them', () => {
  const insights = 'Total tokens: 45,945,482\nCost: Unknown';
  const report = renderStatus({ runs: [], jobs: [], withInsights: true, insights });
  assert.match(report, /COST — from hermes insights/);
  // Every line of the handed-in report is present, unaltered apart from the display indent.
  for (const line of insights.split('\n')) assert.ok(report.includes(line), `missing: ${line}`);
});

test('renderStatus degrades to a note when insights are unavailable', () => {
  const report = renderStatus({
    runs: [OPEN_RUN],
    jobs: [JOB_ROW],
    withInsights: true,
    insightsError: 'hermes insights did not answer — spawnSync hermes ETIMEDOUT',
  });
  assert.match(report, /COST/);
  assert.match(report, /✗ unavailable — hermes insights did not answer/);
  // The rest of the report is still there — that is the whole point.
  assert.match(report, /orch-config-smoke/);
  assert.match(report, /vault-health/);
});

// ── summary ───────────────────────────────────────────────────────────────────

if (failed.length) {
  console.error(`\n✗ ${failed.length} FAILED, ${passed} passed`);
  for (const name of failed) console.error(`    ✗ ${name}`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} passed`);
}
