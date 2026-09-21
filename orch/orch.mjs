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
// The envelope mismatch is unrepresentable by construction (ADR 0004). A schedule's envelope
// decides which script slot it may fill, so "envelope: agent plus a script" has nowhere to
// live in the schema and is refused in loadSchedule. Scheduling itself goes through
// `hermes cron`, which orch calls and never reimplements.
//
// Output contract: CONTRACT.md (same directory). Exit 0 on success; on failure one compact
// JSON object on stderr: {"error": "...", "code": "..."} where code is one of
// no_verify | bad_input | envelope_mismatch | verify_failed | step_failed | layer_down | io_error.

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, realpathSync } from 'node:fs';
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
const LOGS_DIR = join(CONFIG_DIR, 'logs');

// The scheduler's own job store. orch reads it as data so `doctor` can audit jobs that
// predate this tool; it never writes it — `hermes cron` owns it.
const CRON_JOBS_FILE = join(homedir(), '.hermes', 'cron', 'jobs.json');

// The harnesses orch depends on — see CONTEXT.md's Layer entry. orca, command-code and pi
// joined once the implementation lane's roster entries landed (ADR 0005) — `agents.json`
// naming an entry with one of these harnesses is what makes it a dependency worth probing.
const LAYERS = ['claude', 'hermes', 'orca', 'command-code', 'pi'];

// How long `orch status --insights` will wait on `hermes insights` before giving up on it.
const INSIGHTS_TIMEOUT_MS = 15000;

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

/** A caught value's message, for the places that report a failure rather than throwing one. */
const message = (err) => (err instanceof Error ? err.message : String(err));

// ── recipe ────────────────────────────────────────────────────────────────────

// The step id `orch verify` records its own line under. Reserved: see `loadRecipe`.
const VERIFY_STEP_ID = 'verify';

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
    if (step.id === VERIFY_STEP_ID) {
      // `orch verify` writes its line under this id, and that line is the only thing that
      // closes a run. A step free to write one would close runs it never checked (ADR 0002).
      fail('bad_input', `recipe "${obj.name}" step "${step.id}" uses the reserved id "${VERIFY_STEP_ID}", which the declared check writes`);
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
    if (step.capture !== undefined) {
      if (typeof step.capture !== 'object' || step.capture === null || Array.isArray(step.capture)) {
        fail('bad_input', `recipe "${obj.name}" step "${step.id}" has a "capture" field that must be an object`);
      }
      if (typeof step.capture.as !== 'string' || step.capture.as.length === 0) {
        fail('bad_input', `recipe "${obj.name}" step "${step.id}" declares "capture" with no non-empty "as" name`);
      }
      if (step.capture.json !== undefined && (typeof step.capture.json !== 'string' || step.capture.json.length === 0)) {
        fail('bad_input', `recipe "${obj.name}" step "${step.id}" declares "capture.json" that must be a non-empty string`);
      }
    }
    const normalized = { id: step.id, command: step.command };
    if (step.agent !== undefined) normalized.agent = step.agent;
    if (step.settings !== undefined) normalized.settings = step.settings;
    if (step.capture !== undefined) {
      normalized.capture = { as: step.capture.as };
      if (step.capture.json !== undefined) normalized.capture.json = step.capture.json;
    }
    if (step.cwd !== undefined) {
      if (typeof step.cwd !== 'string' || step.cwd.length === 0) {
        fail('bad_input', `recipe "${obj.name}" step "${step.id}" has a "cwd" field that must be a non-empty string`);
      }
      normalized.cwd = step.cwd;
    }
    return normalized;
  });
  if (typeof obj.verify !== 'object' || obj.verify === null || !isCommand(obj.verify.command)) {
    fail('no_verify', `recipe "${obj.name}" declares no Verify — refusing to run unverifiable work`);
  }
  if (obj.verify.cwd !== undefined && (typeof obj.verify.cwd !== 'string' || obj.verify.cwd.length === 0)) {
    fail('bad_input', `recipe "${obj.name}" verify has a "cwd" field that must be a non-empty string`);
  }
  const recipe = { name: obj.name, steps, verify: { command: obj.verify.command } };
  if (obj.verify.cwd !== undefined) recipe.verify.cwd = obj.verify.cwd;
  if (obj.schedule !== undefined) recipe.schedule = loadSchedule(obj.schedule);
  assertSchedulable(recipe);
  return recipe;
}

// ── schedule ──────────────────────────────────────────────────────────────────

const ENVELOPES = ['script', 'monitor', 'agent'];

// Deliberately closed. A machine-local setting — a delivery target, say — lives in
// ~/.config/orch/config.json, where it applies to every registration on this machine, rather
// than in a versioned recipe that would carry one machine's destination to another.
const SCHEDULE_FIELDS = ['cron', 'envelope', 'script', 'monitorScript', 'workdir'];

/**
 * Validates a schedule — where a recipe's expensive work runs, relative to the agent turn
 * that reports it. Throws `bad_input` for a malformed shape and `envelope_mismatch` for the
 * pairing that has been killing the combo-benchmark job every morning since 2026-09-13.
 *
 * The envelope decides which script slot the schedule may fill, which is what makes the
 * mismatch unrepresentable rather than merely discouraged (ADR 0004): `script` requires a
 * `script`, `monitor` requires a `monitorScript`, and `agent` declares neither — a script
 * named under `agent` is work placed inside the turn, where an idle limit kills it.
 */
export function loadSchedule(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    fail('bad_input', 'schedule must be an object');
  }
  for (const key of Object.keys(obj)) {
    if (!SCHEDULE_FIELDS.includes(key)) {
      fail(
        'bad_input',
        `schedule has an unknown field "${key}" — it accepts ${SCHEDULE_FIELDS.join(', ')}; a machine-local setting such as a delivery target belongs in ~/.config/orch/config.json instead`,
      );
    }
  }
  if (typeof obj.cron !== 'string' || obj.cron.trim().length === 0) {
    fail('bad_input', 'schedule.cron must be a non-empty cron expression');
  }
  if (!ENVELOPES.includes(obj.envelope)) {
    fail('bad_input', `schedule.envelope must be one of ${ENVELOPES.join(' | ')} — got ${JSON.stringify(obj.envelope)}`);
  }
  for (const key of ['script', 'monitorScript', 'workdir']) {
    if (obj[key] !== undefined && (typeof obj[key] !== 'string' || obj[key].length === 0)) {
      fail('bad_input', `schedule.${key} must be a non-empty string`);
    }
  }
  if (obj.envelope === 'agent' && obj.script !== undefined) {
    fail(
      'envelope_mismatch',
      `schedule declares envelope "agent" together with script "${obj.script}" — that places the work inside the agent turn, where an idle limit kills it; declare envelope "script" so the work runs outside the turn and only its stdout enters`,
    );
  }
  if (obj.envelope === 'agent' && obj.monitorScript !== undefined) {
    fail(
      'envelope_mismatch',
      `schedule declares envelope "agent" together with monitorScript "${obj.monitorScript}" — a gate outside the turn IS the "monitor" envelope; a plain turn has no gate`,
    );
  }
  if (obj.envelope === 'script' && obj.script === undefined) {
    fail('bad_input', 'schedule declares envelope "script" but names no script');
  }
  if (obj.envelope === 'monitor' && obj.monitorScript === undefined) {
    fail('bad_input', 'schedule declares envelope "monitor" but names no monitorScript');
  }
  const schedule = { cron: obj.cron.trim(), envelope: obj.envelope };
  for (const key of ['script', 'monitorScript', 'workdir']) {
    if (obj[key] !== undefined) schedule[key] = obj[key];
  }
  return schedule;
}

/**
 * Refuses a scheduled recipe whose own steps would do the work its envelope places elsewhere.
 *
 * This is the half of the envelope rule the schedule's shape cannot see (ADR 0004): a job's
 * prompt runs `orch run <recipe>`, so a step that shells out to a hermes script puts exactly
 * the work an envelope exists to hoist back inside the turn — and no scheduler flag can stop
 * it, because the scheduler never sees the recipe. A hermes script is the mechanism for work
 * that must run outside the turn; work cheap enough to be a step does not belong behind one.
 *
 * A scheduled recipe also may not use positional `{n}` placeholders: a scheduled dispatch
 * passes no args, so such a job would fail every single time it ran.
 */
function assertSchedulable(recipe) {
  if (!recipe.schedule) return;
  for (const step of recipe.steps) {
    const scripts = stepScripts(step.command);
    if (scripts.length > 0) {
      const fix =
        recipe.schedule.envelope === 'agent'
          ? `declare envelope "script" naming ${scripts.join(', ')} instead`
          : `the schedule's own "${recipe.schedule.envelope}" script already covers work outside the turn — remove this step, or drop the schedule and run the recipe by hand`;
      fail(
        'envelope_mismatch',
        `recipe "${recipe.name}" declares a schedule but step "${step.id}" runs ${scripts.join(', ')} inside the turn — that is the combo-benchmark defect; ${fix}`,
      );
    }
    const tokens = step.cwd === undefined ? step.command : [...step.command, step.cwd];
    if (tokens.some((token) => /\{\d+\}/.test(token))) {
      fail(
        'bad_input',
        `recipe "${recipe.name}" declares a schedule but step "${step.id}" references a positional {n} argument, which a scheduled dispatch never passes — the job would fail on every run`,
      );
    }
  }
}

/** The name orch registers a recipe's scheduled job under, so `doctor` can find it again. */
export function scheduledJobName(recipeName) {
  return `orch-${recipeName}`;
}

/**
 * The prompt a scheduled dispatch wakes up with. The envelope decides what the turn is for:
 * under `script` the expensive work has already run and only its stdout arrived, so the turn
 * must not run it again — that is the whole point of the envelope.
 */
const ENVELOPE_INSTRUCTION = {
  script:
    'Its expensive work has already run outside this turn and its output is in your context — summarise that output; do not run that work yourself.',
  monitor:
    'A monitor gate already confirmed something changed before this turn started; an unchanged result would have suppressed the run entirely.',
  agent: 'This is a plain turn — no external script runs before it.',
};

function schedulePrompt(recipe) {
  return `Run the orch recipe "${recipe.name}": orch run ${recipe.name}. ${ENVELOPE_INSTRUCTION[recipe.schedule.envelope]}`;
}

/**
 * The argv for `hermes cron create`, derived from a recipe's declared schedule. Pure and
 * asserted in tests without invoking hermes. Each envelope maps to its own scheduler flag —
 * `script` to `--script` (its stdout is injected into the turn), `monitor` to
 * `--monitor-script` (unchanged bytes suppress the run), `agent` to neither. A recipe with
 * no declared schedule cannot be registered at all.
 *
 * `registration` carries this machine's settings for the job — `{deliver}` — which come from
 * the CLI or `config.json` and are deliberately not part of the recipe: a destination belongs
 * to a machine, not to versioned behaviour.
 */
export function cronArgs(recipe, registration = {}) {
  if (!recipe.schedule) {
    fail('bad_input', `recipe "${recipe.name}" declares no schedule — nothing to register`);
  }
  const { deliver } = registration;
  if (deliver !== undefined && (typeof deliver !== 'string' || deliver.length === 0)) {
    fail('bad_input', 'a delivery target must be a non-empty string');
  }
  const { cron, envelope, script, monitorScript, workdir } = recipe.schedule;
  const argv = [
    'hermes',
    'cron',
    'create',
    cron,
    schedulePrompt(recipe),
    '--name',
    scheduledJobName(recipe.name),
  ];
  if (envelope === 'script') argv.push('--script', script);
  if (envelope === 'monitor') argv.push('--monitor-script', monitorScript);
  if (workdir !== undefined) argv.push('--workdir', workdir);
  if (deliver !== undefined) argv.push('--deliver', deliver);
  return argv;
}

/**
 * Extracts the hermes scripts a prompt tells the agent to shell out to. Matching an
 * interpreter invocation of a `~/.hermes/scripts/` path — never a bare mention of one — is
 * what keeps this a statement about the job's shape rather than about its prose: `job.prompt`
 * is free text, and a prompt can *discuss* a path (a warning, an example) without running it.
 */
const SCRIPT_INVOCATION = /\b(?:python3?|bash|sh|zsh|node|uv)\s+(?:run\s+)?(\S*\.hermes\/scripts\/[^\s`'")\]]+)/g;

function embeddedScripts(prompt) {
  if (typeof prompt !== 'string') return [];
  return [...prompt.matchAll(SCRIPT_INVOCATION)].map((match) => match[1]);
}

/**
 * A `.hermes/scripts/` path, wherever it appears within a single command token.
 *
 * Deliberately *not* the interpreter-prefixed `SCRIPT_INVOCATION` above. A step's `command`
 * is argv, never prose — there is no "just mentioning" a path in an array of literal tokens.
 * A hermes script is executable on its own (shebang'd), so a step that names one directly,
 * with no interpreter in front of it, is exactly as much the combo-benchmark defect as an
 * interpreter-prefixed invocation; requiring an interpreter here left that door wide open.
 */
const SCRIPT_PATH = /\.hermes\/scripts\/[^\s`'")\]]+/;

function stepScripts(command) {
  return command.filter((token) => SCRIPT_PATH.test(token));
}

/**
 * Finds the envelope defect in scheduled jobs that already exist — including ones that
 * predate this tool, which is why the rule is inferred from the scheduler's own fields
 * rather than from a schedule orch itself validated. A job that runs an agent turn and tells
 * the agent to shell out to a hermes script has placed expensive work inside the turn, the
 * exact shape that failed combo-benchmark every morning while passing by hand. A job whose
 * `no_agent` is true has no turn to place work in, so it is never a finding.
 *
 * Takes parsed scheduler jobs as data; performs no I/O. Returns findings shaped
 * `{id, name, code, message}`, empty when every job's envelope is sound.
 */
export function envelopeFindings(jobs) {
  const findings = [];
  for (const job of jobs) {
    if (job === null || typeof job !== 'object' || job.no_agent === true) continue;
    const scripts = embeddedScripts(job.prompt);
    if (scripts.length === 0) continue;
    findings.push({
      id: job.id,
      name: job.name,
      code: 'envelope_mismatch',
      message: `job "${job.name}" runs an agent turn that shells out to ${scripts.join(', ')} — expensive work inside the turn, where an idle limit kills it; declare the "script" envelope so it runs outside the turn`,
    });
  }
  return findings;
}

/**
 * Probes the harnesses orch depends on, taking reachability as an injected predicate so the
 * suite stays hermetic. An unreachable harness is `layer_down` — a broken layer, which must
 * be fixed before any recipe failure it causes is worth reading.
 */
export function harnessFindings(layers, reachable) {
  return layers
    .filter((layer) => !reachable(layer))
    .map((layer) => ({
      name: layer,
      code: 'layer_down',
      message: `harness "${layer}" is not reachable on PATH — this is a broken layer, not a broken recipe`,
    }));
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
  return recipe.steps.map((step) => {
    const settings = settingsByStep[step.id] ?? {};
    const planned = {
      id: step.id,
      command: step.command.map((token) => substitute(token, args, settings, recipe.name, step.id)),
    };
    if (step.cwd !== undefined) planned.cwd = substitute(step.cwd, args, settings, recipe.name, step.id);
    return planned;
  });
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
    // Left untouched here on purpose: a captured value cannot exist until the step that
    // captures it has actually run, so planSteps (which substitutes every step up front,
    // before any of them execute) cannot resolve this — substituteCaptured does, per step,
    // immediately before that step runs (see runRecipe).
    if (name.startsWith('captured.')) return placeholder;
    const value = settings[name];
    if (value === undefined) {
      fail('bad_input', `recipe "${recipeName}" step "${stepId}" references {${name}} but no such setting was resolved`);
    }
    return Array.isArray(value) ? value.join(',') : String(value);
  });
}

/**
 * Resolves {captured.<name>} placeholders in an already-planned command, using values other
 * steps in this same run have captured so far. Throws `bad_input` naming the step if a
 * referenced capture was never declared, or belongs to a step that has not run yet — the
 * latter can only mean a recipe references a capture out of order, since `runRecipe` folds
 * each step's capture in immediately after that step succeeds.
 */
export function substituteCaptured(command, captured, stepId) {
  return command.map((token) =>
    token.replace(/\{captured\.([^{}]+)\}/g, (placeholder, name) => {
      if (!(name in captured)) {
        fail('bad_input', `step "${stepId}" references {captured.${name}} but no earlier step captured "${name}"`);
      }
      return captured[name];
    }),
  );
}

/**
 * Extracts a dotted path (e.g. "result.worktree.path") from a parsed JSON value. Throws
 * `bad_input` naming the step if the path does not resolve to a string — a capture exists to
 * feed a later step's command token, and only a string substitutes cleanly there.
 */
function extractJsonPath(value, path, stepId) {
  const resolved = path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), value);
  if (typeof resolved !== 'string') {
    fail('bad_input', `step "${stepId}" capture.json path "${path}" did not resolve to a string`);
  }
  return resolved;
}

/**
 * Computes the value a step's declared `capture` extracts from its own result — `undefined`
 * when the step declares no capture at all. With no `json` path, the capture is the step's
 * trimmed stdout verbatim; with one, stdout is parsed as JSON first. Throws `bad_input` naming
 * the step if `capture.json` is declared but stdout is not valid JSON, or the path does not
 * resolve to a string.
 */
export function capturedValue(step, result) {
  if (!step.capture) return undefined;
  if (step.capture.json === undefined) return result.stdout.trim();
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    fail('bad_input', `step "${step.id}" capture.json expects JSON stdout — ${err.message}`);
  }
  return extractJsonPath(parsed, step.capture.json, step.id);
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

const SCHEDULE_FLAGS = {
  '--envelope': 'envelope',
  '--script': 'script',
  '--monitor-script': 'monitorScript',
  '--deliver': 'deliver',
  '--workdir': 'workdir',
};

/**
 * Splits `orch schedule`'s arguments into named flags and the positional rest (the cron
 * expression). Throws `bad_input` for an unknown flag or a flag with no value, so a typo is
 * refused before any job exists rather than silently registering a job that ignores it.
 */
export function parseScheduleFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const key = SCHEDULE_FLAGS[arg];
    if (!key) fail('bad_input', `unknown flag "${arg}" for orch schedule`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) fail('bad_input', `${arg} requires a value`);
    flags[key] = value;
    i += 1;
  }
  return { flags, rest };
}

// ── status ────────────────────────────────────────────────────────────────────

/**
 * Renders a timestamp from either source as `YYYY-MM-DD HH:MM` with whatever zone that source
 * recorded. The audit log writes UTC and hermes writes a local offset, and truncating the zone
 * away would put two different clocks in one table looking like one. Fractional seconds are
 * dropped on purpose — they are noise at this resolution, and hermes writes six of them.
 */
export function shortTs(ts) {
  if (typeof ts !== 'string') return '—';
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(ts);
  if (!parts) return '—';
  const zone = ts.endsWith('Z') ? 'Z' : (/[+-]\d{2}:\d{2}$/.exec(ts)?.[0] ?? '');
  return `${parts[1]} ${parts[2]}${zone}`;
}

/**
 * The runs that are not yet closed, newest first.
 *
 * A Run is closed by a passing Verify line and by nothing else (ADR 0002): every step exiting
 * zero is a different claim. So "open" is the honest answer to "what is in flight" — it
 * includes both a run still going and one that has already died, and the `state` column is
 * what tells them apart. A run with no recorded exit code died before it could be recorded.
 */
export function openRuns(entries) {
  const byRun = new Map();
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry.run !== 'string') continue;
    if (!byRun.has(entry.run)) byRun.set(entry.run, { run: entry.run, recipe: entry.recipe, lines: [] });
    byRun.get(entry.run).lines.push(entry);
  }
  const open = [];
  for (const { run, recipe, lines } of byRun.values()) {
    if (lines.some((line) => line.step === VERIFY_STEP_ID && line.exit === 0)) continue;
    const steps = lines.filter((line) => line.step !== VERIFY_STEP_ID);
    const last = lines[lines.length - 1];
    open.push({
      run,
      recipe: typeof recipe === 'string' ? recipe : '—',
      started: lines[0].ts,
      steps: steps.length,
      exit: last.exit,
      // A check that ran and failed is a different fact from a step that failed, and from a run
      // nothing has checked yet. Folding them together is the ambiguity this table exists to end.
      state: last.exit === 0 ? 'unverified' : last.step === VERIFY_STEP_ID ? 'verify failed' : 'failed',
    });
  }
  return open.sort((a, b) => Date.parse(b.started) - Date.parse(a.started));
}

/**
 * The scheduler's jobs as table rows, soonest next run first: the owner's question is what is
 * about to happen, and `hermes cron` lists them in creation order.
 *
 * The `state` shown is hermes's own, verbatim — a terminal `completed` or `error` record stays
 * what it is, and orch does not re-derive it (ADR 0001). Collapsing a finished one-shot into
 * "paused" is the confusion hermes's own `effective_job_state` exists to prevent: a paused job
 * is waiting to be resumed, a completed one never runs again.
 */
export function jobRows(jobs) {
  const nextAt = (job) => (job.enabled === false ? null : (job.next_run_at ?? null));
  const when = (job) => {
    const at = nextAt(job);
    const parsed = Date.parse(at);
    return at === null || Number.isNaN(parsed) ? null : parsed;
  };
  return jobs
    .filter((job) => job !== null && typeof job === 'object')
    .sort((a, b) => {
      // Compared as instants, not as strings: hermes writes a local offset, and two offsets
      // in one store would make a lexical sort quietly disagree with the clock.
      const [x, y] = [when(a), when(b)];
      if (x === null) return y === null ? 0 : 1;
      if (y === null) return -1;
      return x - y;
    })
    .map((job) => ({
      job: typeof job.name === 'string' ? job.name : '—',
      schedule: typeof job.schedule_display === 'string' ? job.schedule_display : '—',
      next: job.enabled === false ? '—' : (job.next_run_at ?? '—'),
      last: job.last_run_at,
      result: job.last_status ?? '—',
      state: job.state ?? (job.enabled === false ? 'paused' : 'scheduled'),
    }));
}

/**
 * Renders fixed-width columns. Numeric columns are right-aligned so their right edge is
 * straight whatever the digit count — a column of numbers that does not line up is a column
 * the eye cannot compare.
 */
export function renderTable(columns, rows) {
  const cells = rows.map((row) => columns.map((col) => String(row[col.key] ?? '—')));
  const widths = columns.map((col, i) =>
    Math.max(col.label.length, ...cells.map((row) => row[i].length)),
  );
  const render = (row) =>
    columns
      .map((col, i) => (col.align === 'right' ? row[i].padStart(widths[i]) : row[i].padEnd(widths[i])))
      .join('  ')
      .trimEnd();
  return [render(columns.map((col) => col.label)), ...cells.map(render)].join('\n');
}

const RUN_COLUMNS = [
  { label: 'RUN', key: 'run' },
  { label: 'RECIPE', key: 'recipe' },
  { label: 'STARTED', key: 'started' },
  { label: 'STEPS', key: 'steps', align: 'right' },
  { label: 'EXIT', key: 'exit', align: 'right' },
  { label: 'STATE', key: 'state' },
];

const JOB_COLUMNS = [
  { label: 'JOB', key: 'job' },
  { label: 'SCHEDULE', key: 'schedule' },
  { label: 'NEXT RUN', key: 'next' },
  { label: 'LAST RUN', key: 'last' },
  { label: 'RESULT', key: 'result' },
  { label: 'STATE', key: 'state' },
];

const indent = (block) =>
  block
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

/**
 * The whole `orch status` report, built from data and errors handed in — so the degradation the
 * ticket asks for is testable without a broken machine: a source that could not be read costs
 * its own section, never the command.
 */
export function renderStatus({ runs, runsError, jobs, jobsError, insights, insightsError, withInsights = false }) {
  const open = runs ?? [];
  const jobCount = jobs?.length ?? 0;
  const lines = [
    `orch status — ${runsError ? '?' : open.length} open run(s), ${jobsError ? '?' : jobCount} scheduled job(s)`,
    '',
    'OPEN RUNS — from the audit log; a run closes when its Verify passes',
  ];
  if (runsError) lines.push(`  ✗ unavailable — ${runsError}`);
  else if (open.length === 0) lines.push('  ✓ none open');
  else lines.push(indent(renderTable(RUN_COLUMNS, open.map((run) => ({ ...run, started: shortTs(run.started) })))));

  lines.push('', 'SCHEDULED JOBS — from hermes cron');
  if (jobsError) lines.push(`  ✗ unavailable — ${jobsError}`);
  else if (jobCount === 0) lines.push('  ✓ none scheduled');
  else
    lines.push(
      indent(renderTable(JOB_COLUMNS, jobs.map((job) => ({ ...job, next: shortTs(job.next), last: shortTs(job.last) })))),
    );

  if (withInsights) {
    lines.push('', 'COST — from hermes insights; orch computes no metrics of its own');
    if (insightsError) lines.push(`  ✗ unavailable — ${insightsError}`);
    else lines.push(indent(insights ?? ''));
  }
  return lines.join('\n');
}

// ── audit ─────────────────────────────────────────────────────────────────────

/**
 * One JSON line (no trailing newline) recording a single step's outcome. `args` — the run's
 * positional args — is included only when given, so a run can be recovered well enough for
 * `orch verify` to re-substitute `{n}` into `verify.command` (see `findRunArgs`) without
 * every historical audit line needing the field. `capture` — `{name, value}` — is included
 * only on the step that actually captured something, so `orch verify` (a separate invocation,
 * long after `runRecipe`'s in-memory `captured` map is gone) can recover it too (see
 * `findRunCaptured`).
 */
export function auditLine(
  runId,
  recipeName,
  step,
  result,
  ts = new Date().toISOString(),
  args = undefined,
  capture = undefined,
  stderrPath = undefined,
) {
  const line = {
    ts,
    run: runId,
    recipe: recipeName,
    step: step.id,
    cmd: step.command,
    exit: result.code,
  };
  if (args !== undefined) line.args = args;
  if (capture !== undefined) line.capture = capture;
  if (stderrPath !== undefined) line.stderr = stderrPath;
  return JSON.stringify(line);
}

/**
 * Where a step's stderr is written when it fails — deterministic from runId/stepId alone, so
 * `auditLine` can embed the path with no I/O of its own (see `runRecipe`'s hermetic contract).
 */
export function stderrLogPath(runId, stepId) {
  return join(LOGS_DIR, runId, `${stepId}.stderr`);
}

function appendAudit(lines) {
  if (lines.length === 0) return;
  mkdirSync(CONFIG_DIR, { recursive: true });
  appendFileSync(AUDIT_FILE, lines.join('\n') + '\n');
}

/**
 * Writes each failed step's stderr to the path `auditLine` already recorded for it — the one
 * piece exit-1-with-no-explanation was missing (see the DP-10854 `ticket-implement` postmortem:
 * a step that crashed before command-code's own session transcript was ever written left nothing
 * to diagnose from). A step with empty stderr writes no file; `stderrLogPath` still exists, but
 * an empty log would only be noise.
 */
function writeStderrLogs(logs) {
  for (const { path, content } of logs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

/** Recovers which recipe a run id used, from parsed audit entries. Throws `bad_input` if none match. */
export function findRunRecipe(entries, runId) {
  const entry = entries.find((e) => e.run === runId);
  if (!entry) fail('bad_input', `no audit entries for run "${runId}"`);
  return entry.recipe;
}

/**
 * Recovers the positional args a run was invoked with, from parsed audit entries — the same
 * way `findRunRecipe` recovers the recipe name, so `orch verify` can re-substitute `{n}` into
 * `verify.command` for a recipe whose check is itself parameterized (e.g. "is *this* naskah
 * approved"). Empty array for a run predating this field, or invoked with no args. Throws
 * `bad_input` if no entry matches the run id.
 */
export function findRunArgs(entries, runId) {
  const entry = entries.find((e) => e.run === runId);
  if (!entry) fail('bad_input', `no audit entries for run "${runId}"`);
  return entry.args ?? [];
}

/**
 * Recovers a run's captured values from its audit entries, the same way `findRunArgs`
 * recovers positional args — so `orch verify` can resolve a Verify's own `{captured.*}`
 * placeholders (see `runVerify`) after `runRecipe`'s in-memory `captured` map is long gone.
 * Folded in the run's own line order, matching how `runRecipe` builds it live. A run with no
 * capturing steps returns `{}` — that is not an error, unlike an unrecognized run id, which is
 * `findRunRecipe`'s job to catch before this is ever called.
 */
export function findRunCaptured(entries, runId) {
  const captured = {};
  for (const entry of entries) {
    if (entry.run === runId && entry.capture) captured[entry.capture.name] = entry.capture.value;
  }
  return captured;
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
 *
 * A step that declares `capture` (see `loadRecipe`) has its result fed into `captured`
 * immediately after it succeeds, so any later step's `{captured.<name>}` placeholder — left
 * unresolved by `planSteps`, which runs before any step has executed — is substituted here,
 * per step, right before that step runs. A recipe with no capturing steps is unaffected.
 *
 * A step that declares `cwd` runs with that as its working directory instead of orch's own —
 * necessary the moment a recipe drives a tool against a specific checkout (e.g. a worktree
 * `orca` just created) rather than the directory `orch` happened to be invoked from. `cwd`
 * substitutes the same way `command` does, including `{captured.*}`.
 */
export async function runRecipe(
  recipe,
  args,
  { exec, settingsByStep = {}, runId = randomUUID(), now = () => new Date().toISOString() },
) {
  const steps = planSteps(recipe, args, settingsByStep);
  const lines = [];
  const stderrLogs = [];
  const captured = {};
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const command = substituteCaptured(step.command, captured, step.id);
    const cwd = step.cwd === undefined ? undefined : substituteCaptured([step.cwd], captured, step.id)[0];
    let result = await execOrFailure(exec, command, { cwd });
    let capture;
    if (result.code === 0) {
      // A declared capture that does not match what the step actually produced (bad JSON, a
      // missing path) is treated as this step failing, not as a separate failure mode — it
      // reuses the exact same "record the line, stop the run" path below, so `capturedValue`
      // throwing can never lose the line for a step whose command genuinely did succeed.
      try {
        const value = capturedValue(recipe.steps[i], result);
        if (value !== undefined) {
          captured[recipe.steps[i].capture.as] = value;
          capture = { name: recipe.steps[i].capture.as, value };
        }
      } catch (err) {
        result = { code: 1, stdout: result.stdout, stderr: message(err) };
      }
    }
    // Path computation is pure (see `stderrLogPath`); the actual write is the caller's job
    // (`cmdRun`, via `writeStderrLogs`), same as `appendAudit` already owns writing `lines` —
    // runRecipe stays hermetic (see this function's doc comment).
    let stderrPath;
    if (result.code !== 0 && typeof result.stderr === 'string' && result.stderr.trim().length > 0) {
      stderrPath = stderrLogPath(runId, step.id);
      stderrLogs.push({ path: stderrPath, content: result.stderr });
    }
    lines.push(auditLine(runId, recipe.name, { id: step.id, command }, result, now(), args, capture, stderrPath));
    if (result.code !== 0) {
      return { runId, ok: false, lines, stderrLogs };
    }
  }
  return { runId, ok: true, lines, stderrLogs };
}

/**
 * Calls `exec`, converting a thrown exception (e.g. the command could not be spawned at
 * all — a typo, a missing binary) into a failing result rather than letting it propagate.
 * Without this, an exec that throws mid-recipe would abort the run before any of its
 * already-collected audit lines — including prior *successful* steps — were ever written,
 * silently contradicting the "the failing step is recorded before the run stops" guarantee.
 * `code: null` distinguishes "never got an exit code" from a normal non-zero exit.
 */
async function execOrFailure(exec, command, options = {}) {
  try {
    return await exec(command, options);
  } catch (err) {
    return { code: null, stdout: '', stderr: message(err) };
  }
}

/** Substitutes `{n}`/settings and then `{captured.*}` in one token — the same two-phase order `runRecipe` applies per step, collapsed for a caller (`runVerify`) that has both sources available at once. */
function resolveTemplate(token, args, captured, recipeName, stepId) {
  return substituteCaptured([substitute(token, args, {}, recipeName, stepId)], captured, stepId)[0];
}

/**
 * Runs a recipe's declared Verify via the injected `exec`. `args` re-substitutes `{n}` into
 * `verify.command` exactly as `planSteps` does for a step — a Verify checking "is *this*
 * naskah approved" needs to know which naskah, and the run's own args are the only source of
 * that once the run is over (see `findRunArgs`). `captured` (default `{}`) resolves any
 * `{captured.*}` placeholder the same way, from the run's own audit lines (see
 * `findRunCaptured`) — a Verify checking "does the worktree build" needs to know which
 * worktree, and by the time `orch verify` runs, `runRecipe`'s in-memory `captured` map from
 * the original run is long gone. Reports success or failure — including a check that could
 * not even be spawned — without throwing on the exec, though an unresolved placeholder still
 * throws `bad_input` (there is nothing to execute yet, so that failure is not a `runVerify`
 * result to report).
 */
export async function runVerify(recipe, args, { exec, captured = {} }) {
  const command = recipe.verify.command.map((token) => resolveTemplate(token, args, captured, recipe.name, VERIFY_STEP_ID));
  const cwd =
    recipe.verify.cwd === undefined ? undefined : resolveTemplate(recipe.verify.cwd, args, captured, recipe.name, VERIFY_STEP_ID);
  const result = await execOrFailure(exec, command, { cwd });
  return { ok: result.code === 0, exit: result.code, stdout: result.stdout, stderr: result.stderr, command };
}

// ── real exec ─────────────────────────────────────────────────────────────────

/**
 * The real exec — the single impure boundary. `timeout` bounds a command that may not return,
 * which is the only reason `status` does not hang on a third-party CLI. `cwd` runs the command
 * against a specific directory (a step's declared `cwd`, e.g. a worktree) instead of wherever
 * `orch` itself was invoked from; omitted, `spawnSync` defaults to `process.cwd()` as always.
 */
function realExec(command, { timeout, cwd } = {}) {
  const [cmd, ...rest] = command;
  const options = { encoding: 'utf8' };
  if (timeout !== undefined) options.timeout = timeout;
  if (cwd !== undefined) options.cwd = cwd;
  const proc = spawnSync(cmd, rest, options);
  if (proc.error) fail('io_error', proc.error.message);
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

// ── the scheduler, as data ────────────────────────────────────────────────────

/**
 * Reads the scheduler's job store as parsed jobs. A machine with no scheduler state simply
 * has no jobs — that is not an error — but a store that exists and cannot be read is one,
 * since silently reporting "no findings" over an unreadable store is the blindness this tool
 * exists to remove.
 */
function readCronJobs() {
  if (!existsSync(CRON_JOBS_FILE)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(CRON_JOBS_FILE, 'utf8'));
  } catch (err) {
    fail('io_error', `${CRON_JOBS_FILE} could not be read: ${err.message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.jobs)) {
    fail('io_error', `${CRON_JOBS_FILE} does not carry a "jobs" array`);
  }
  return parsed.jobs;
}

// ── layer reachability ───────────────────────────────────────────────────────

/** Whether a harness binary is reachable on PATH. Injected as a predicate into doctor's check. */
function hasBinary(name) {
  const proc = spawnSync('which', [name], { encoding: 'utf8' });
  return proc.status === 0;
}

// ── loading a recipe file ────────────────────────────────────────────────────

function loadRecipeFile(name) {
  return loadRecipe(loadRecipeObject(name));
}

/** Reads a recipe file as plain JSON, before validation — `schedule` rewrites it back. */
function loadRecipeObject(name) {
  const path = recipePath(name);
  if (!existsSync(path)) fail('bad_input', `no recipe named "${name}" at ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail('bad_input', `recipe "${name}" is not valid JSON: ${err.message}`);
  }
}

function recipePath(name) {
  return join(RECIPES_DIR, `${name}.json`);
}

/**
 * Records a registered schedule in the recipe itself, so the versioned config stays the one
 * source of truth for what a recipe does and when it runs. Written only after the scheduler
 * has accepted the job — a recipe never claims a schedule that does not exist.
 */
function writeSchedule(name, schedule) {
  const obj = { ...loadRecipeObject(name), schedule };
  writeFileSync(recipePath(name), `${JSON.stringify(obj, null, 2)}\n`);
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
  const { runId, ok, lines, stderrLogs } = await runRecipe(recipe, args, { exec: realExec, settingsByStep });
  appendAudit(lines);
  writeStderrLogs(stderrLogs);
  if (!ok) {
    const stderrHint = stderrLogs.length > 0 ? ` — stderr: ${stderrLogs[stderrLogs.length - 1].path}` : '';
    fail('step_failed', `recipe "${name}" failed — run ${runId} — see ${AUDIT_FILE}${stderrHint}`);
  }
  say(`✓ ${name} — run ${runId} — ${lines.length} step(s)`);
}

async function cmdVerify(runId) {
  if (!runId) fail('bad_input', 'usage: orch verify <run-id>');
  const entries = readAuditEntries();
  const recipeName = findRunRecipe(entries, runId);
  const args = findRunArgs(entries, runId);
  const captured = findRunCaptured(entries, runId);
  const recipe = loadRecipeFile(recipeName);
  const result = await runVerify(recipe, args, { exec: realExec, captured });
  let stderrPath;
  if (!result.ok && typeof result.stderr === 'string' && result.stderr.trim().length > 0) {
    stderrPath = stderrLogPath(runId, VERIFY_STEP_ID);
    writeStderrLogs([{ path: stderrPath, content: result.stderr }]);
  }
  const line = auditLine(runId, recipeName, { id: VERIFY_STEP_ID, command: result.command }, { code: result.exit }, undefined, undefined, undefined, stderrPath);
  appendAudit([line]);
  if (!result.ok) {
    const stderrHint = stderrPath ? ` — stderr: ${stderrPath}` : '';
    fail('verify_failed', `verify failed for run "${runId}" (recipe "${recipeName}") — exit ${result.exit}${stderrHint}`);
  }
  say(`✓ verify passed — run ${runId} — recipe "${recipeName}"`);
}

const SCHEDULE_USAGE = `usage: orch schedule <recipe> <cron> --envelope script|monitor|agent [--script <name>] [--monitor-script <name>] [--deliver <target>] [--workdir <path>]`;

/**
 * Registers a recipe on a cron schedule through `hermes cron`. The schedule is validated
 * before the scheduler is touched at all, so a mismatch never becomes a job; the recipe is
 * only told it is scheduled once the scheduler has accepted it.
 */
async function cmdSchedule(name, ...rawArgs) {
  if (!name) fail('bad_input', SCHEDULE_USAGE);
  const { flags, rest } = parseScheduleFlags(rawArgs);
  if (rest.length !== 1) fail('bad_input', SCHEDULE_USAGE);

  const base = loadRecipeObject(name);
  const declared = loadSchedule({
    cron: rest[0],
    envelope: flags.envelope,
    script: flags.script,
    monitorScript: flags.monitorScript,
    workdir: flags.workdir,
  });
  // Where a job delivers is a machine fact, so it comes from the flag or from config.json and
  // is never written into the versioned recipe — the repo holds behaviour, the machine holds
  // destinations. A flag wins for the same reason --set beats config.
  const deliver = flags.deliver ?? loadConfigFile().delivery ?? undefined;

  const recipe = loadRecipe({ ...base, schedule: declared });
  const jobName = scheduledJobName(recipe.name);
  const existing = readCronJobs().find((job) => job.name === jobName);
  if (existing) {
    fail(
      'bad_input',
      `job "${jobName}" already exists (${existing.id}) — remove it with "hermes cron remove ${existing.id}" before re-scheduling, so a stale job cannot linger beside the new one`,
    );
  }

  const result = await execOrFailure(realExec, cronArgs(recipe, { deliver }));
  if (result.code !== 0) {
    if (result.code === null) fail('layer_down', `could not run hermes — ${result.stderr.trim() || 'not on PATH'}`);
    fail('bad_input', `hermes refused the schedule: ${(result.stderr || result.stdout).trim() || `exit ${result.code}`}`);
  }
  writeSchedule(name, declared);
  say(`✓ scheduled ${name} — job "${jobName}" — ${declared.cron} — envelope ${declared.envelope}`);
}

/**
 * Reports two different kinds of brokenness, kept visibly apart because the fix differs: a
 * harness that cannot be reached is a broken layer, and a scheduled job that puts expensive
 * work inside its agent turn is a broken recipe. A layer wins the exit code, because a recipe
 * failure read while a layer is down is a misdiagnosis.
 */
async function cmdDoctor() {
  const layerFindings = harnessFindings(LAYERS, hasBinary);
  const jobs = readCronJobs();
  const jobFindings = envelopeFindings(jobs);
  const down = new Set(layerFindings.map((finding) => finding.name));

  say(`orch doctor — ${LAYERS.length} layer(s), ${jobs.length} scheduled job(s)`);
  say('');
  say('layers — harnesses orch dispatches to');
  for (const layer of LAYERS) {
    say(`  ${down.has(layer) ? '✗' : '✓'} ${layer}${down.has(layer) ? ' — unreachable' : ''}`);
  }
  say('');
  say('scheduled jobs — envelopes found in the scheduler');
  if (jobFindings.length === 0) say('  ✓ no envelope findings');
  for (const finding of jobFindings) {
    say(`  ✗ ${finding.name} (${finding.id})`);
    say(`      ${finding.code} — ${finding.message}`);
  }
  say('');
  say(`${layerFindings.length + jobFindings.length} finding(s) — ${layerFindings.length} layer, ${jobFindings.length} recipe`);

  if (layerFindings.length > 0) {
    fail('layer_down', `layer(s) down: ${layerFindings.map((f) => f.name).join(', ')} — fix the layer before reading any recipe failure`);
  }
  if (jobFindings.length > 0) {
    fail('envelope_mismatch', `${jobFindings.length} scheduled job(s) place expensive work inside an agent turn — see the findings above`);
  }
  say('✓ no findings');
}

/**
 * Reports what is in flight and what is scheduled. Read-only by construction: it writes no
 * file, creates no directory, and never touches the scheduler. Each of its three sources is
 * read behind its own guard, so one unavailable source costs its own section rather than the
 * command — a status that refuses to answer because a third tool is slow would be useless
 * exactly when it is needed.
 */
async function cmdStatus(...rawArgs) {
  const unknown = rawArgs.filter((arg) => arg !== '--insights');
  if (unknown.length > 0) fail('bad_input', `unknown flag "${unknown[0]}" for orch status — try --help`);
  const withInsights = rawArgs.includes('--insights');

  let runs;
  let runsError;
  try {
    runs = openRuns(readAuditEntries());
  } catch (err) {
    runsError = message(err);
  }

  let jobs;
  let jobsError;
  try {
    jobs = jobRows(readCronJobs());
  } catch (err) {
    jobsError = message(err);
  }

  let insights;
  let insightsError;
  if (withInsights) {
    const result = await execOrFailure((command) => realExec(command, { timeout: INSIGHTS_TIMEOUT_MS }), [
      'hermes',
      'insights',
    ]);
    if (result.code === 0) {
      // Leading newlines dropped (not trimmed — the report's first line is centred with real
      // leading spaces), trailing whitespace dropped.
      insights = String(result.stdout).replace(/^\n+/, '').trimEnd();
    } else {
      insightsError = `hermes insights did not answer — ${String(result.stderr).trim() || `exit ${result.code}`}`;
    }
  }

  say(renderStatus({ runs, runsError, jobs, jobsError, insights, insightsError, withInsights }));
}

const commands = { run: cmdRun, verify: cmdVerify, schedule: cmdSchedule, doctor: cmdDoctor, status: cmdStatus };

const USAGE = `orch — a validated recipe runner

  run <recipe> [args...] [--set key=value ...]   run a recipe's steps in order;
                                                  --set overrides an agent-backed
                                                  step's settings for this run only
  verify <run-id>                                run a completed run's declared check
                                                  on its own
  schedule <recipe> <cron> --envelope <envelope> register the recipe on a cron schedule;
                    [--script <name>]             envelope is script | monitor | agent,
                    [--monitor-script <name>]     and decides where the expensive work runs
                    [--deliver <target>]
                    [--workdir <path>]
  doctor                                         probe each harness orch depends on, and
                                                  audit existing scheduled jobs for the
                                                  envelope defect
  status [--insights]                            show open runs beside scheduled jobs;
                                                  --insights adds the operating cost, read
                                                  from hermes insights rather than computed

More commands (new) land in later tickets.`;

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
