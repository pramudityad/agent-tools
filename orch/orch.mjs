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
const AGENTS_FILE = join(ROOT, 'agents.json');
const CONFIG_DIR = join(homedir(), '.config', 'orch');
const AUDIT_FILE = join(CONFIG_DIR, 'audit.jsonl');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

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
 * check is declared. Returns a normalized `{ name, steps: [{id, command, agent?, settings?}],
 * verify: {command} }` — `agent` names a roster entry from `agents.json` and `settings` is
 * that step's own declared overrides, both optional (see `resolveConfig`).
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
    if (step.agent !== undefined && (typeof step.agent !== 'string' || step.agent.length === 0)) {
      fail('bad_input', `recipe "${obj.name}" step "${step.id}" has an "agent" field that must be a non-empty string`);
    }
    if (
      step.settings !== undefined &&
      (typeof step.settings !== 'object' || step.settings === null || Array.isArray(step.settings))
    ) {
      fail('bad_input', `recipe "${obj.name}" step "${step.id}" has a "settings" field that must be an object`);
    }
    const normalized = { id: step.id, command: step.command };
    if (step.agent !== undefined) normalized.agent = step.agent;
    if (step.settings !== undefined) normalized.settings = step.settings;
    return normalized;
  });
  if (typeof obj.verify !== 'object' || obj.verify === null || !isCommand(obj.verify.command)) {
    fail('no_verify', `recipe "${obj.name}" declares no Verify — refusing to run unverifiable work`);
  }
  return { name: obj.name, steps, verify: { command: obj.verify.command } };
}

/**
 * Returns the ordered command list for a recipe, substituting each step's command tokens.
 * `{n}` (1-indexed) pulls from the positional `args`. Any other `{name}` pulls from that
 * step's own resolved settings in `settingsByStep` (see `resolveConfig`) — the mechanism an
 * agent-backed step uses to put its effective `model` or `capabilities` into its command, so
 * a `--set` flag genuinely changes what runs rather than only what gets logged. Throws
 * `bad_input` if a placeholder has no matching arg or setting. `settingsByStep` defaults to
 * `{}`, so a recipe with no agent-backed steps is unaffected.
 */
export function planSteps(recipe, args, settingsByStep = {}) {
  return recipe.steps.map((step) => ({
    id: step.id,
    command: step.command.map((token) =>
      substitute(token, args, settingsByStep[step.id] ?? {}, recipe.name, step.id),
    ),
  }));
}

function substitute(token, args, settings, recipeName, stepId) {
  return token.replace(/\{([^{}]+)\}/g, (placeholder, name) => {
    if (/^\d+$/.test(name)) {
      const value = args[Number(name) - 1];
      if (value === undefined) {
        fail(
          'bad_input',
          `recipe "${recipeName}" step "${stepId}" references {${name}} but only ${args.length} arg(s) were given`,
        );
      }
      return value;
    }
    const value = settings[name];
    if (value === undefined) {
      fail('bad_input', `recipe "${recipeName}" step "${stepId}" references {${name}} but no such setting was resolved`);
    }
    return Array.isArray(value) ? value.join(',') : String(value);
  });
}

// ── agents & config ───────────────────────────────────────────────────────────

/**
 * Validates the agents.json roster. Throws `bad_input` naming what was wrong. Returns
 * `{ agents: [{id, harness, model?, capabilities?}] }` — `model` and `capabilities` are
 * present together, only on model-backed entries. In v1 only `claude-planner` carries them;
 * every other entry is a deterministic CLI with nothing to grant.
 */
export function loadAgents(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    fail('bad_input', 'agents.json must be an object');
  }
  if (!Array.isArray(obj.agents) || obj.agents.length === 0) {
    fail('bad_input', 'agents.json must declare a non-empty "agents" array');
  }
  const seen = new Set();
  const agents = obj.agents.map((agent, i) => {
    if (typeof agent !== 'object' || agent === null) {
      fail('bad_input', `agents.json entry ${i} must be an object`);
    }
    if (typeof agent.id !== 'string' || agent.id.length === 0) {
      fail('bad_input', `agents.json entry ${i} is missing a non-empty id`);
    }
    if (seen.has(agent.id)) {
      fail('bad_input', `agents.json declares "${agent.id}" more than once`);
    }
    seen.add(agent.id);
    if (typeof agent.harness !== 'string' || agent.harness.length === 0) {
      fail('bad_input', `agents.json entry "${agent.id}" is missing a non-empty harness`);
    }
    const isModelBacked = 'model' in agent;
    if (!isModelBacked) {
      if ('capabilities' in agent) {
        fail(
          'bad_input',
          `agents.json entry "${agent.id}" declares capabilities but no model — capabilities require a model-backed entry`,
        );
      }
      return { id: agent.id, harness: agent.harness };
    }
    if (typeof agent.model !== 'string' || agent.model.length === 0) {
      fail('bad_input', `agents.json entry "${agent.id}" has a "model" field that must be a non-empty string`);
    }
    if (!Array.isArray(agent.capabilities) || !agent.capabilities.every((c) => typeof c === 'string' && c.length > 0)) {
      fail('bad_input', `agents.json entry "${agent.id}" is model-backed but declares no valid "capabilities" array`);
    }
    return { id: agent.id, harness: agent.harness, model: agent.model, capabilities: agent.capabilities };
  });
  return { agents };
}

/** Looks up one agent's roster entry by id. Throws `bad_input` if no such agent is declared. */
export function findAgent(agents, id) {
  const agent = agents.agents.find((a) => a.id === id);
  if (!agent) fail('bad_input', `no agent named "${id}" in agents.json`);
  return agent;
}

/**
 * Validates `~/.config/orch/config.json` — machine-local settings only: paths and a
 * delivery target. Throws `bad_input` naming what was wrong. Absent fields default to `{}`
 * / `null`, since the file itself is optional on a fresh machine.
 */
export function loadOrchConfig(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    fail('bad_input', 'config.json must be an object');
  }
  if ('paths' in obj) {
    if (typeof obj.paths !== 'object' || obj.paths === null || Array.isArray(obj.paths)) {
      fail('bad_input', 'config.json "paths" must be an object');
    }
    for (const [key, value] of Object.entries(obj.paths)) {
      if (typeof value !== 'string' || value.length === 0) {
        fail('bad_input', `config.json "paths.${key}" must be a non-empty string`);
      }
    }
  }
  if ('delivery' in obj && (typeof obj.delivery !== 'string' || obj.delivery.length === 0)) {
    fail('bad_input', 'config.json "delivery" must be a non-empty string');
  }
  return { paths: obj.paths ?? {}, delivery: obj.delivery ?? null };
}

/**
 * Merges settings across the four precedence levels, most specific first: a CLI flag beats
 * what the recipe step itself declares, which beats the named agent's `agents.json` entry,
 * which beats machine-local `config.json`. Each argument is a plain settings object (or
 * `undefined`); a key missing at one level falls through to the next. Pure — returns a new
 * object, mutates none of its inputs.
 */
export function resolveConfig(flag, step, agent, config) {
  const resolved = {};
  for (const layer of [config, agent, step, flag]) {
    for (const [key, value] of Object.entries(layer ?? {})) {
      if (value !== undefined) resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Extracts repeatable `--set key=value` flags from a CLI args array, in the order they were
 * given — later repeats of the same key win, matching how object spread resolves duplicate
 * keys elsewhere in this file. Returns `{ flag, rest }`: `rest` is every other arg, in its
 * original order, ready to pass on as positional `{n}` substitution args. Throws `bad_input`
 * for a `--set` with no `key=value` pair following it.
 */
export function parseSetFlags(args) {
  const flag = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg !== '--set') {
      rest.push(arg);
      continue;
    }
    const pair = args[i + 1];
    const eq = typeof pair === 'string' ? pair.indexOf('=') : -1;
    if (eq <= 0) {
      fail('bad_input', '--set requires a "key=value" argument');
    }
    flag[pair.slice(0, eq)] = pair.slice(eq + 1);
    i += 1;
  }
  return { flag, rest };
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
 * exit. `settingsByStep` (see `planSteps`) carries each agent-backed step's resolved
 * settings into its command; omit it for a recipe with no agent-backed steps. Returns
 * `{ runId, ok, lines }` — `lines` are audit-log strings the caller appends; this function
 * performs no filesystem or process I/O of its own, so it stays hermetic.
 */
export async function runRecipe(
  recipe,
  args,
  { exec, settingsByStep = {}, runId = randomUUID(), now = () => new Date().toISOString() },
) {
  const steps = planSteps(recipe, args, settingsByStep);
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

// ── loading the roster and machine-local config ─────────────────────────────

function loadAgentsFile() {
  if (!existsSync(AGENTS_FILE)) fail('bad_input', `no agents.json at ${AGENTS_FILE}`);
  let obj;
  try {
    obj = JSON.parse(readFileSync(AGENTS_FILE, 'utf8'));
  } catch (err) {
    fail('bad_input', `agents.json is not valid JSON: ${err.message}`);
  }
  return loadAgents(obj);
}

function loadConfigFile() {
  if (!existsSync(CONFIG_FILE)) return loadOrchConfig({});
  let obj;
  try {
    obj = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    fail('bad_input', `config.json is not valid JSON: ${err.message}`);
  }
  return loadOrchConfig(obj);
}

// ── say ───────────────────────────────────────────────────────────────────────

const say = (msg) => process.stdout.write(`${msg}\n`);

// ── commands ──────────────────────────────────────────────────────────────────

async function cmdRun(name, ...rawArgs) {
  if (!name) fail('bad_input', 'usage: orch run <recipe> [args...] [--set key=value ...]');
  const recipe = loadRecipeFile(name);
  const { flag, rest: args } = parseSetFlags(rawArgs);
  const agentSteps = recipe.steps.filter((step) => step.agent);
  const settingsByStep = {};
  if (agentSteps.length > 0) {
    // Loaded — and therefore validated — whenever a recipe has an agent-backed step, not
    // only when this run happens to pass --set, so a malformed agents.json or config.json
    // is never silently skipped on an ordinary run.
    const agents = loadAgentsFile();
    const config = loadConfigFile();
    for (const step of agentSteps) {
      const { model, capabilities } = findAgent(agents, step.agent);
      settingsByStep[step.id] = resolveConfig(flag, step.settings, { model, capabilities }, config);
      say(`▸ step "${step.id}" (agent "${step.agent}") resolved settings: ${JSON.stringify(settingsByStep[step.id])}`);
    }
  }
  const { runId, ok, lines } = await runRecipe(recipe, args, { exec: realExec, settingsByStep });
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

  run <recipe> [args...] [--set key=value ...]   run a recipe's steps in order;
                                                  --set overrides an agent-backed
                                                  step's settings for this run only
  verify <run-id>                                run a completed run's declared check
                                                  on its own

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
