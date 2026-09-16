#!/usr/bin/env node
// @ts-check
// orch — a validated recipe runner over the owner's existing agent tools.
//
// orch owns no engine of its own (ADR 0001). Every step of a recipe is a call to a tool
// that already works — rise-ops, rps-deck, graphify, hermes. Their CLIs are invoked, never
// wrapped or re-implemented.
//
// No Verify, no Run (ADR 0002). A recipe that does not declare a check is refused before
// anything executes. A Run has no opinion on whether work is done, only on what the
// declared check returned.
//
// The ledger is a JSONL file, not a task board (ADR 0003), until review states exist to
// justify one. Every step of every run appends one line to ~/.config/orch/audit.jsonl.
//
// Output contract: CONTRACT.md (same directory). Exit 0 on success; on failure one compact
// JSON object on stderr: {"error": "...", "code": "..."} where code is one of
// no_verify | bad_input | envelope_mismatch | verify_failed | step_failed | layer_down | io_error.

import { readFileSync, mkdirSync, appendFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// ── constants ─────────────────────────────────────────────────────────────────

const ROOT = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(ROOT, 'recipes');
const CONFIG_DIR = join(homedir(), '.config', 'orch');
const AUDIT_FILE = join(CONFIG_DIR, 'audit.jsonl');

// ── errors ────────────────────────────────────────────────────────────────────

export class OrchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new OrchError(code, message);
};

// ── recipe ────────────────────────────────────────────────────────────────────

/** A non-empty array of non-empty strings. */
function isCommand(value) {
  return Array.isArray(value) && value.length > 0 && value.every((t) => typeof t === 'string' && t.length > 0);
}

/**
 * Validates a recipe object. Throws `bad_input` for a malformed shape, `no_verify` when no
 * check is declared. Returns a normalized `{ name, steps: [{id, command}], verify: {command} }`.
 */
export function loadRecipe(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    fail('bad_input', 'recipe must be an object');
  }
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    fail('bad_input', 'recipe.name must be a non-empty string');
  }
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    fail('bad_input', `recipe "${obj.name}" must declare at least one step`);
  }
  const steps = obj.steps.map((step, i) => {
    if (typeof step !== 'object' || step === null) {
      fail('bad_input', `recipe "${obj.name}" step ${i} must be an object`);
    }
    if (typeof step.id !== 'string' || step.id.length === 0) {
      fail('bad_input', `recipe "${obj.name}" step ${i} is missing a non-empty id`);
    }
    if (!isCommand(step.command)) {
      fail('bad_input', `recipe "${obj.name}" step "${step.id}" must declare a non-empty command array`);
    }
    return { id: step.id, command: step.command };
  });
  if (typeof obj.verify !== 'object' || obj.verify === null || !isCommand(obj.verify.command)) {
    fail('no_verify', `recipe "${obj.name}" declares no Verify — refusing to run unverifiable work`);
  }
  return { name: obj.name, steps, verify: { command: obj.verify.command } };
}

/**
 * Returns the ordered command list for a recipe, substituting `{n}` placeholders (1-indexed)
 * with positional args. Throws `bad_input` if a placeholder has no matching arg.
 */
export function planSteps(recipe, args) {
  return recipe.steps.map((step) => ({
    id: step.id,
    command: step.command.map((token) => substitute(token, args, recipe.name, step.id)),
  }));
}

function substitute(token, args, recipeName, stepId) {
  return token.replace(/\{(\d+)\}/g, (_, n) => {
    const value = args[Number(n) - 1];
    if (value === undefined) {
      fail('bad_input', `recipe "${recipeName}" step "${stepId}" references {${n}} but only ${args.length} arg(s) were given`);
    }
    return value;
  });
}

// ── audit ─────────────────────────────────────────────────────────────────────

/** One JSON line (no trailing newline) recording a single step's outcome. */
export function auditLine(runId, recipeName, step, result, ts = new Date().toISOString()) {
  return JSON.stringify({
    ts,
    run: runId,
    recipe: recipeName,
    step: step.id,
    cmd: step.command,
    exit: result.code,
  });
}

function appendAudit(lines) {
  if (lines.length === 0) return;
  mkdirSync(CONFIG_DIR, { recursive: true });
  appendFileSync(AUDIT_FILE, lines.join('\n') + '\n');
}

/** Recovers which recipe a run id used, from parsed audit entries. Throws `bad_input` if none match. */
export function findRunRecipe(entries, runId) {
  const entry = entries.find((e) => e.run === runId);
  if (!entry) fail('bad_input', `no audit entries for run "${runId}"`);
  return entry.recipe;
}

function readAuditEntries() {
  if (!existsSync(AUDIT_FILE)) return [];
  return readFileSync(AUDIT_FILE, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

// ── run ───────────────────────────────────────────────────────────────────────

/**
 * Runs every planned step in order via the injected `exec`, stopping at the first non-zero
 * exit. Returns `{ runId, ok, lines }` — `lines` are audit-log strings the caller appends;
 * this function performs no filesystem or process I/O of its own, so it stays hermetic.
 */
export async function runRecipe(recipe, args, { exec, runId = randomUUID(), now = () => new Date().toISOString() }) {
  const steps = planSteps(recipe, args);
  const lines = [];
  for (const step of steps) {
    const result = await execOrFailure(exec, step.command);
    lines.push(auditLine(runId, recipe.name, step, result, now()));
    if (result.code !== 0) {
      return { runId, ok: false, lines };
    }
  }
  return { runId, ok: true, lines };
}

/**
 * Calls `exec`, converting a thrown exception (e.g. the command could not be spawned at
 * all — a typo, a missing binary) into a failing result rather than letting it propagate.
 * Without this, an exec that throws mid-recipe would abort the run before any of its
 * already-collected audit lines — including prior *successful* steps — were ever written,
 * silently contradicting the "the failing step is recorded before the run stops" guarantee.
 * `code: null` distinguishes "never got an exit code" from a normal non-zero exit.
 */
async function execOrFailure(exec, command) {
  try {
    return await exec(command);
  } catch (err) {
    return { code: null, stdout: '', stderr: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Runs a recipe's declared Verify via the injected `exec`. Reports success or failure —
 * including a check that could not even be spawned — without throwing.
 */
export async function runVerify(recipe, { exec }) {
  const result = await execOrFailure(exec, recipe.verify.command);
  return { ok: result.code === 0, exit: result.code, stdout: result.stdout, stderr: result.stderr };
}

// ── real exec ─────────────────────────────────────────────────────────────────

function realExec(command) {
  const [cmd, ...rest] = command;
  const proc = spawnSync(cmd, rest, { encoding: 'utf8' });
  if (proc.error) fail('io_error', proc.error.message);
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

// ── loading a recipe file ────────────────────────────────────────────────────

function loadRecipeFile(name) {
  const path = join(RECIPES_DIR, `${name}.json`);
  if (!existsSync(path)) fail('bad_input', `no recipe named "${name}" at ${path}`);
  let obj;
  try {
    obj = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail('bad_input', `recipe "${name}" is not valid JSON: ${err.message}`);
  }
  return loadRecipe(obj);
}

// ── say ───────────────────────────────────────────────────────────────────────

const say = (msg) => process.stdout.write(`${msg}\n`);

// ── commands ──────────────────────────────────────────────────────────────────

async function cmdRun(name, ...args) {
  if (!name) fail('bad_input', 'usage: orch run <recipe> [args...]');
  const recipe = loadRecipeFile(name);
  const { runId, ok, lines } = await runRecipe(recipe, args, { exec: realExec });
  appendAudit(lines);
  if (!ok) {
    fail('step_failed', `recipe "${name}" failed — run ${runId} — see ${AUDIT_FILE}`);
  }
  say(`✓ ${name} — run ${runId} — ${lines.length} step(s)`);
}

async function cmdVerify(runId) {
  if (!runId) fail('bad_input', 'usage: orch verify <run-id>');
  const entries = readAuditEntries();
  const recipeName = findRunRecipe(entries, runId);
  const recipe = loadRecipeFile(recipeName);
  const result = await runVerify(recipe, { exec: realExec });
  const line = auditLine(runId, recipeName, { id: 'verify', command: recipe.verify.command }, { code: result.exit });
  appendAudit([line]);
  if (!result.ok) {
    fail('verify_failed', `verify failed for run "${runId}" (recipe "${recipeName}") — exit ${result.exit}`);
  }
  say(`✓ verify passed — run ${runId} — recipe "${recipeName}"`);
}

const commands = { run: cmdRun, verify: cmdVerify };

const USAGE = `orch — a validated recipe runner

  run <recipe> [args...]     run a recipe's steps in order
  verify <run-id>            run a completed run's declared check on its own

More commands (new, status, schedule, doctor) land in later tickets.`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    say(USAGE);
    return;
  }
  const handler = commands[cmd];
  if (!handler) fail('bad_input', `unknown command "${cmd}" — try --help`);
  await handler(...args);
}

// Only run the CLI when invoked directly — test.mjs imports the pure half of this file.
const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err) => {
    const code = err instanceof OrchError ? err.code : 'io_error';
    process.stderr.write(`${JSON.stringify({ error: err.message, code })}\n`);
    process.exit(1);
  });
}
