#!/usr/bin/env node
// @ts-check
// learn.mjs — the referee for the learning toolkit. It owns the registry, grading of
// Probes, the derive function, the append-only stores, and exactly one piece of control
// flow: `next` withholds the following node until the current one has a Closing.
//
// It has no opinion about pedagogy, holds no lesson content, generates no items, renders
// no prose, and never writes a vault note. Those belong to the markdown playbooks and the
// agent driving them. The testable half (registry lookup, Probe grading, derive) lives in
// _guest.mjs; anything pure stays there, everything here does I/O and wiring.
//
// Output contract: CONTRACT.md (same directory). Exit 0 on success; on failure one compact
// JSON object on stderr: {"error": "...", "code": "..."} where code is one of
// not_configured | not_found | ambiguous_concept | duplicate_slug | path_unapproved |
// no_closing | wrong_shape | bad_input | io_error.

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

import {
  gradeProbe,
  validateProbeInput,
  effectiveVerdict,
  isClosing,
  deriveLedger,
  lookupConcepts,
  computeFrontier,
  explainStanding,
} from './_guest.mjs';

const CONFIG_DIR = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
const CONFIG_FILE = join(CONFIG_DIR, 'learn', 'vault');

const USAGE = `learn.mjs <command> [args] [--json] [--summary] [--home PATH] [--help]

The referee for the learning toolkit. Holds the registry, grades Probes, derives the
Ledger, and gates \`next\` on Closing. It never teaches — pedagogy lives in the playbooks.
Read CONTEXT.md and CONTRACT.md in this directory before use.

Options:
  --json          One compact JSON object on stdout (default)
  --summary       Short human-readable rendering on stdout
  --home PATH     Vault directory (overrides $LEARN_HOME and the recorded path)
  --help          This usage text and the full record field list

Commands:
  init --vault PATH              Record the vault; create .learn/; idempotent
  concept lookup <query>         Candidate Concepts by slug, alias, definition text
                                 (required before any create)
  concept add --slug S --definition D [--domains a,b] [--note "[[X]]"]
                                 Append a registry row
  concept alias <slug> <alias>   Append an alias as a registry row {slug: alias, aliasOf: slug}
  concept merge <from> <into>    Fold one slug into another; append-only, never rewrites
                                 Observations (tombstone {slug: from, mergedInto: into})
  session start --goal TEXT --shape hierarchical
                                 Open a Session; returns its id
  session get <id>               Session state
  path propose <session> <path.json>   Store the expanded Path, unapproved
  path approve <session>         The Q7 approval gate; until this, \`next\` refuses
  path amend <session> <path.json>     Material change -> returns the Path to unapproved
  observe probe --session S --concept C --item --options --key --chosen
                                 Append a Probe; the core computes correct
  observe recall --session S --concept C --prompt --answer --verdict --by --rubric --grounding [--sources]
                                 Append a Recall; grounding is required, no default
  observe infer --session S --concept C --claim --because obs1,obs2 --by
                                 Append an Inference
  observe override --observation OBS --learner-verdict V --note
                                 Append an Override
  close <session> <concept>      Assert a Closing exists; fails no_closing if not
  next <session>                 The next unclosed node, or refusal
  standing <slug>                Derived Standing (Ledger row)
  why <slug>                     The Observations and the Policy rule behind a Standing
  frontier <session>             Concepts on the Path whose Standing is unknown or stale
  decline --goal TEXT --shape SHAPE --because TEXT
                                 Log a Goal refused on Shape grounds
  ledger rebuild                 Re-derive every Standing from Observations

Record shapes (JSON):

  Concept (registry.jsonl):
    slug, definition, domains, aliases, note, at

  Observation (observations.jsonl) — common: id, at, session, concept, kind
    kind is one of: probe | recall | inference | override
    probe:     item, options, key, chosen, correct   (correct is computed by the core)
    recall:    prompt, answer, judged: { verdict, by, rubric }, grounding, sources
    inference: claim, because, by
    override:  observation, learnerVerdict, note

  Ledger row (derived, never stored):
    slug, standing, lastEvidence, demonstrations, spacingDays,
    probes: { seen, correct }, grounding, policy, disputed

Exit codes:
  0   success
  1   failure; one compact JSON object on stderr:
      {"error": "<message>", "code": "<code>"}
      code is one of: not_configured | not_found | ambiguous_concept | duplicate_slug |
      path_unapproved | no_closing | wrong_shape | bad_input | io_error
`;

const SUBCOMMAND_COMMANDS = new Set(['concept', 'session', 'path', 'observe', 'ledger']);

/** @param {string} code @param {string} message */
function fail(code, message) {
  process.stderr.write(JSON.stringify({ error: message, code }) + '\n');
  process.exit(1);
}

// --- arg parsing ---------------------------------------------------------------

/** @param {string[]} argv */
function parseArgs(argv) {
  const positionals = [];
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--summary' || a === '--help') {
      flags.set(a.slice(2), '');
      continue;
    }
    if (a.startsWith('--')) {
      flags.set(a.slice(2), argv[i + 1] ?? '');
      i += 1;
      continue;
    }
    positionals.push(a);
  }
  return { positionals, flags };
}

/** @param {string|null} raw */
function parseList(raw) {
  if (raw == null || raw === '') return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.map(String);
  } catch {
    /* fall through to comma split */
  }
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

const VERDICTS = ['demonstrated', 'partial', 'missed'];

// --- storage -------------------------------------------------------------------

const storeDir = (vault) => join(vault, '.learn');
const registryFile = (vault) => join(storeDir(vault), 'registry.jsonl');
const obsFile = (vault) => join(storeDir(vault), 'observations.jsonl');
const policyFile = (vault) => join(storeDir(vault), 'policy.json');
const declinesFile = (vault) => join(storeDir(vault), 'declines.jsonl');
const sessionFile = (vault, id) => join(storeDir(vault), 'sessions', `${id}.json`);

function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '');
}

function readJsonl(file) {
  return readLines(file).map((l) => JSON.parse(l));
}

function appendJsonl(file, record) {
  appendFileSync(file, JSON.stringify(record) + '\n');
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const now = () => new Date().toISOString();

const needed = (flags, name) => {
  const v = flags.get(name);
  if (v == null || v === '') fail('bad_input', `missing --${name}`);
  return v;
};

/** Vault resolution: --home, then $LEARN_HOME, then the recorded path. */
function requireVault(home) {
  const v = home || process.env.LEARN_HOME || (existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, 'utf8').trim() : null);
  if (!v) fail('not_configured', 'no vault recorded — run "learn.mjs init --vault <path>", or pass --home or $LEARN_HOME');
  if (!existsSync(storeDir(v))) fail('io_error', `vault not initialized — run "learn.mjs init --vault ${v}"`);
  return v;
}

/** @param {string} slug @param {object[]} registry */
function resolveCanonical(slug, registry) {
  let s = slug;
  for (let i = 0; i < 5; i++) {
    const row = registry.find((r) => r.slug === s);
    if (!row) return null;
    if (row.aliasOf) {
      s = row.aliasOf;
      continue;
    }
    if (row.mergedInto) {
      s = row.mergedInto;
      continue;
    }
    return s;
  }
  return s;
}

/** Observations that count for a canonical Concept: its own plus anything merged into it. */
function observationsFor(vault, canonical, registry) {
  const all = readJsonl(obsFile(vault));
  const merged = registry.filter((r) => r.mergedInto === canonical).map((r) => r.slug);
  return all.filter((o) => o.concept === canonical || merged.includes(o.concept));
}

function readSession(vault, id) {
  const f = sessionFile(vault, id);
  if (!existsSync(f)) fail('not_found', `no such Session: ${id}`);
  return JSON.parse(readFileSync(f, 'utf8'));
}

function writeSession(vault, session) {
  writeFileSync(sessionFile(vault, session.id), JSON.stringify(session, null, 2));
}

function loadPolicy(vault) {
  const f = policyFile(vault);
  if (!existsSync(f)) fail('io_error', 'policy.json missing — re-run init');
  return JSON.parse(readFileSync(f, 'utf8'));
}

/** @param {string} slug @param {object[]} registry */
function canonicalOrFail(slug, registry) {
  if (slug == null || slug === '') fail('bad_input', 'missing concept slug');
  const c = resolveCanonical(slug, registry);
  if (!c) fail('not_found', `no such Concept: ${slug}`);
  return c;
}

// --- handlers ------------------------------------------------------------------

function hInit(pos, flags) {
  const vault = needed(flags, 'vault');
  const dir = storeDir(vault);
  let created = false;
  if (!existsSync(dir)) {
    created = true;
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, 'sessions'), { recursive: true });
    mkdirSync(join(dir, 'transcripts'), { recursive: true });
    writeFileSync(join(dir, 'registry.jsonl'), '');
    writeFileSync(join(dir, 'observations.jsonl'), '');
    writeFileSync(join(dir, 'declines.jsonl'), '');
    writeFileSync(
      join(dir, 'policy.json'),
      JSON.stringify(
        {
          name: 'v1',
          note: 'PLACEHOLDER — open item 1 pending. Values must come from spaced-repetition literature and must never be described as learned from this learner\'s data. The mechanism (exponential decay on a lengthening half-life) is a placeholder too.',
          params: {
            baseHalfLifeDays: 30,
            decayThreshold: 0.5,
            repetitionMultiplier: 1.6,
            spacingBonusPerDay: 0.5,
            overrideWeight: 1.0,
          },
        },
        null,
        2,
      ),
    );
  }
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, vault);
  return { vault, learnDir: dir, created };
}

function hConcept(pos, flags, vault) {
  const registry = readJsonl(registryFile(vault));
  const sub = pos[0];
  if (sub === 'lookup') {
    const query = pos[1];
    if (!query) fail('bad_input', 'concept lookup requires a <query>');
    const r = lookupConcepts(registry, query);
    return { query, candidates: r.candidates, ambiguous: r.ambiguous };
  }
  if (sub === 'add') {
    const slug = flags.get('slug') ?? pos[1];
    const definition = flags.get('definition');
    if (!slug || !definition) fail('bad_input', 'concept add requires --slug and --definition');
    if (/\s/.test(slug)) fail('bad_input', `slug must be flat, got "${slug}"`);
    if (registry.some((r) => r.slug === slug)) fail('duplicate_slug', `slug already exists (look it up first): ${slug}`);
    const record = {
      slug,
      definition,
      domains: parseList(flags.get('domains')),
      aliases: [],
      note: flags.get('note') ?? null,
      at: now(),
    };
    appendJsonl(registryFile(vault), record);
    return record;
  }
  if (sub === 'alias') {
    const [slug, alias] = [pos[1], pos[2]];
    if (!slug || !alias) fail('bad_input', 'concept alias requires <slug> and <alias>');
    const canonical = resolveCanonical(slug, registry);
    if (!canonical || canonical !== slug) fail('not_found', `no such canonical Concept: ${slug}`);
    if (registry.some((r) => r.slug === alias)) fail('duplicate_slug', `alias already exists: ${alias}`);
    const record = { slug: alias, aliasOf: slug, at: now() };
    appendJsonl(registryFile(vault), record);
    return record;
  }
  if (sub === 'merge') {
    const [from, into] = [pos[1], pos[2]];
    if (!from || !into) fail('bad_input', 'concept merge requires <from> and <into>');
    if (from === into) fail('bad_input', 'cannot merge a Concept into itself');
    const cFrom = resolveCanonical(from, registry);
    const cInto = resolveCanonical(into, registry);
    if (!cFrom || cFrom !== from) fail('not_found', `no such canonical Concept: ${from}`);
    if (!cInto || cInto !== into) fail('not_found', `no such canonical Concept: ${into}`);
    const record = { slug: from, mergedInto: into, at: now() };
    appendJsonl(registryFile(vault), record);
    return record;
  }
  fail('bad_input', `unknown concept subcommand: ${sub}`);
}

function hSession(pos, flags, vault) {
  const sub = pos[0];
  if (sub === 'start') {
    const goal = needed(flags, 'goal');
    const shape = needed(flags, 'shape');
    if (shape !== 'hierarchical') fail('wrong_shape', `only hierarchical Goals are accepted, got "${shape}" — decline it or reframe`);
    const session = { id: genId('ses'), goal, shape, path: null, current: null, at: now() };
    writeSession(vault, session);
    return { id: session.id, goal, shape, at: session.at };
  }
  if (sub === 'get') {
    if (!pos[1]) fail('bad_input', 'session get requires an <id>');
    return readSession(vault, pos[1]);
  }
  fail('bad_input', `unknown session subcommand: ${sub}`);
}

function hPath(pos, flags, vault) {
  const [sesId, pathArg] = [pos[1], pos[2]];
  const session = sesId ? readSession(vault, sesId) : fail('bad_input', 'path <command> requires a <session>');
  const registry = readJsonl(registryFile(vault));

  const applyPath = (sub) => {
    if (!pathArg) fail('bad_input', `path ${sub} requires a path file`);
    if (sub !== 'propose' && !session.path) fail('bad_input', 'no path proposed yet — use path propose first');
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(pathArg, 'utf8'));
    } catch {
      fail('bad_input', `unreadable or invalid path file: ${pathArg}`);
    }
    const walk = Array.isArray(parsed) ? parsed : parsed && parsed.walk;
    if (!Array.isArray(walk) || walk.length === 0 || walk.some((w) => typeof w !== 'string'))
      fail('bad_input', 'path file must be a non-empty {"walk": ["slug", ...]} or ["slug", ...]');
    for (const slug of walk) {
      if (!resolveCanonical(slug, registry)) fail('not_found', `no such Concept on the Path: ${slug}`);
    }
    session.path = { walk, approved: false };
    session.current = null;
    writeSession(vault, session);
    return { session: session.id, walk, approved: false };
  };

  if (pos[0] === 'propose') return applyPath('propose');
  if (pos[0] === 'amend') return applyPath('amend');
  if (pos[0] === 'approve') {
    if (!session.path) fail('bad_input', 'no path proposed yet — use path propose first');
    session.path.approved = true;
    writeSession(vault, session);
    return { session: session.id, approved: true };
  }
  fail('bad_input', `unknown path subcommand: ${pos[0]}`);
}

function collectObsArgs(vault, flags) {
  const registry = readJsonl(registryFile(vault));
  const sesId = needed(flags, 'session');
  const session = readSession(vault, sesId);
  const concept = canonicalOrFail(needed(flags, 'concept'), registry);
  return { session, concept };
}

function hObserve(pos, flags, vault) {
  const sub = pos[0];
  if (sub === 'probe') {
    const { session, concept } = collectObsArgs(vault, flags);
    const item = needed(flags, 'item');
    const options = parseList(flags.get('options'));
    const key = needed(flags, 'key');
    const chosen = needed(flags, 'chosen');
    const err = validateProbeInput(options, key, chosen);
    if (err) fail('bad_input', err);
    const record = {
      id: genId('obs'), at: now(), session: session.id, concept, kind: 'probe',
      item, options, key, chosen, correct: gradeProbe(key, chosen),
    };
    appendJsonl(obsFile(vault), record);
    return record;
  }
  if (sub === 'recall') {
    const { session, concept } = collectObsArgs(vault, flags);
    const verdict = needed(flags, 'verdict');
    const grounding = flags.get('grounding');
    if (!VERDICTS.includes(verdict)) fail('bad_input', `verdict must be one of ${VERDICTS.join(' | ')}, got "${verdict}"`);
    if (grounding !== 'sourced' && grounding !== 'model-recall')
      fail('bad_input', 'grounding is required and must be "sourced" or "model-recall" — there is no default');
    let sources = parseList(flags.get('sources'));
    if (grounding === 'model-recall') sources = [];
    if (grounding === 'sourced' && sources.length === 0) fail('bad_input', 'grounding="sourced" requires --sources');
    const record = {
      id: genId('obs'), at: now(), session: session.id, concept, kind: 'recall',
      prompt: needed(flags, 'prompt'), answer: needed(flags, 'answer'),
      judged: { verdict, by: needed(flags, 'by'), rubric: needed(flags, 'rubric') },
      grounding, sources,
    };
    appendJsonl(obsFile(vault), record);
    return record;
  }
  if (sub === 'infer') {
    const { session, concept } = collectObsArgs(vault, flags);
    const because = parseList(flags.get('because'));
    if (because.length === 0) fail('bad_input', 'observe infer requires --because obs1,obs2 with at least one observation');
    const all = readJsonl(obsFile(vault));
    const ids = new Set(all.map((o) => o.id));
    for (const id of because) if (!ids.has(id)) fail('not_found', `no such Observation in --because: ${id}`);
    const record = {
      id: genId('obs'), at: now(), session: session.id, concept, kind: 'inference',
      claim: needed(flags, 'claim'), because, by: needed(flags, 'by'),
    };
    appendJsonl(obsFile(vault), record);
    return record;
  }
  if (sub === 'override') {
    const targetId = needed(flags, 'observation');
    const all = readJsonl(obsFile(vault));
    const target = all.find((o) => o.id === targetId);
    if (!target) fail('not_found', `no such Observation: ${targetId}`);
    if (target.kind !== 'recall') fail('bad_input', `cannot override a ${target.kind} — only Recalls are judged`);
    const learnerVerdict = needed(flags, 'learner-verdict');
    if (!VERDICTS.includes(learnerVerdict)) fail('bad_input', `learner-verdict must be one of ${VERDICTS.join(' | ')}, got "${learnerVerdict}"`);
    const record = {
      id: genId('obs'), at: now(), session: target.session, concept: target.concept, kind: 'override',
      observation: targetId, learnerVerdict, note: flags.get('note') ?? null,
    };
    appendJsonl(obsFile(vault), record);
    return record;
  }
  fail('bad_input', `unknown observe subcommand: ${sub}`);
}

function hClose(pos, vault) {
  const [sesId, concept] = [pos[0], pos[1]];
  if (!sesId || !concept) fail('bad_input', 'close requires <session> and <concept>');
  const session = readSession(vault, sesId);
  const registry = readJsonl(registryFile(vault));
  canonicalOrFail(concept, registry);
  const overrides = readJsonl(obsFile(vault)).filter((o) => o.kind === 'override');
  const closings = readJsonl(obsFile(vault)).filter((o) => o.session === sesId && o.concept === concept && isClosing(o, overrides));
  if (closings.length === 0)
    fail('no_closing', `no Closing for ${concept} in ${sesId} — a Recall verdicted demonstrated (after Overrides) is required before this node can be released`);
  return { closed: true, session: session.id, concept };
}

function hNext(pos, vault) {
  const sesId = pos[0];
  if (!sesId) fail('bad_input', 'next requires a <session>');
  const session = readSession(vault, sesId);
  if (!session.path) fail('path_unapproved', 'no Path proposed — run path propose first');
  if (!session.path.approved) fail('path_unapproved', 'Path not approved — run path approve before next');
  const walk = session.path.walk;
  const registry = readJsonl(registryFile(vault));
  const overrides = readJsonl(obsFile(vault)).filter((o) => o.kind === 'override');
  const closingFor = (c) => readJsonl(obsFile(vault)).some((o) => o.session === sesId && o.concept === c && isClosing(o, overrides));
  const c = session.current;

  if (c === null) {
    const first = resolveCanonical(walk[0], registry);
    session.current = 0;
    writeSession(vault, session);
    return { session: session.id, node: first };
  }
  const current = resolveCanonical(walk[c], registry);
  if (!closingFor(current))
    fail('no_closing', `node ${current} has no Closing — a demonstrated Recall is required before the next node is released`);
  if (c + 1 >= walk.length) return { session: session.id, done: true };
  session.current = c + 1;
  writeSession(vault, session);
  return { session: session.id, node: resolveCanonical(walk[c + 1], registry) };
}

function hStanding(pos, flags, vault, wantJson) {
  const slug = pos[0];
  if (!slug) fail('bad_input', 'standing requires a <slug>');
  const registry = readJsonl(registryFile(vault));
  const canonical = canonicalOrFail(slug, registry);
  const obs = observationsFor(vault, canonical, registry);
  const policy = loadPolicy(vault);
  const row = deriveLedger(canonical, obs, policy, now());
  return wantJson ? row : `${canonical}: ${row.standing}`;
}

function hWhy(pos, vault) {
  const slug = pos[0];
  if (!slug) fail('bad_input', 'why requires a <slug>');
  const registry = readJsonl(registryFile(vault));
  const canonical = canonicalOrFail(slug, registry);
  const obs = observationsFor(vault, canonical, registry);
  const policy = loadPolicy(vault);
  const row = deriveLedger(canonical, obs, policy, now());
  const exp = explainStanding(canonical, obs, policy, now());
  return { slug: canonical, standing: row.standing, rule: exp.rule, details: exp.details, observations: obs };
}

function hFrontier(pos, vault) {
  const sesId = pos[0];
  if (!sesId) fail('bad_input', 'frontier requires a <session>');
  const session = readSession(vault, sesId);
  if (!session.path) fail('bad_input', 'no Path proposed yet — use path propose first');
  const registry = readJsonl(registryFile(vault));
  const policy = loadPolicy(vault);
  const ledger = {};
  for (const slug of session.path.walk) {
    const c = resolveCanonical(slug, registry);
    ledger[c] = deriveLedger(c, observationsFor(vault, c, registry), policy, now());
  }
  return { session: session.id, frontier: computeFrontier(session.path.walk, ledger) };
}

function hDecline(pos, flags, vault) {
  const record = {
    id: genId('dec'), at: now(),
    goal: needed(flags, 'goal'), shape: needed(flags, 'shape'), because: needed(flags, 'because'),
  };
  appendJsonl(declinesFile(vault), record);
  return record;
}

function hRebuild(vault) {
  const registry = readJsonl(registryFile(vault));
  const policy = loadPolicy(vault);
  const ledger = registry
    .filter((r) => !r.aliasOf && !r.mergedInto)
    .map((r) => deriveLedger(r.slug, observationsFor(vault, r.slug, registry), policy, now()));
  ledger.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { ledger };
}

// --- summaries -----------------------------------------------------------------

const summarize = (cmd, sub, out) => {
  const key = sub ? `${cmd} ${sub}` : cmd;
  switch (key) {
    case 'init':
      return out.created ? `Initialized .learn at ${out.learnDir}` : `Already initialized at ${out.learnDir}`;
    case 'concept lookup':
      return (out.ambiguous ? '(ambiguous — qualify the query) ' : '') + out.candidates.map((c) => `${c.tier ? '  ' : ''}${c.slug}${c.resolvesTo ? ` -> ${c.resolvesTo}` : ''}: ${c.definition}`).join('\n') || 'no candidates';
    case 'concept add':
      return `added ${out.slug}: ${out.definition}`;
    case 'concept alias':
      return `aliased ${out.slug} -> ${out.aliasOf}`;
    case 'concept merge':
      return `merged ${out.slug} into ${out.mergedInto}`;
    case 'session start':
      return `session ${out.id} started: ${out.goal}`;
    case 'session get':
      return `${out.id}: ${out.goal} (${out.shape})${out.path ? (out.path.approved ? ', path approved' : ', path unapproved') : ''}`;
    case 'path propose':
    case 'path amend':
      return `path stored for ${out.session}: ${out.walk.length} concept(s), unapproved`;
    case 'path approve':
      return `path approved for ${out.session}`;
    case 'observe probe':
      return `probe on ${out.concept}: ${out.correct ? 'correct' : 'incorrect'}`;
    case 'observe recall':
      return `recall on ${out.concept}: judged ${out.judged.verdict} by ${out.judged.by} (${out.grounding})`;
    case 'observe infer':
      return `inference on ${out.concept}: ${out.claim}`;
    case 'observe override':
      return `override on ${out.observation}: ${out.learnerVerdict}`;
    case 'close':
      return `closed ${out.concept} in ${out.session}`;
    case 'next':
      return out.done ? 'all nodes closed — done' : `next: ${out.node}`;
    case 'standing':
      return out;
    case 'why':
      return `${out.slug}: ${out.standing}\n  ${out.rule}`;
    case 'frontier':
      return out.frontier.length ? out.frontier.join(', ') : 'no frontier — all Standing is current';
    case 'decline':
      return `declined: ${out.goal} (${out.shape}) — ${out.because}`;
    case 'ledger rebuild':
      return `${out.ledger.length} ledger row(s) derived from observations.jsonl`;
    default:
      return JSON.stringify(out);
  }
};

function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  if (flags.has('help') || positionals.length === 0) {
    process.stdout.write(USAGE);
    return;
  }
  const home = flags.get('home');
  const wantJson = !flags.has('summary');
  const cmd = positionals.shift();

  let out;
  try {
    switch (cmd) {
      case 'init':
        out = hInit(positionals, flags);
        break;
      case 'concept':
        out = hConcept(positionals, flags, requireVault(home));
        break;
      case 'session':
        out = hSession(positionals, flags, requireVault(home));
        break;
      case 'path':
        out = hPath(positionals, flags, requireVault(home));
        break;
      case 'observe':
        out = hObserve(positionals, flags, requireVault(home));
        break;
      case 'close':
        out = hClose(positionals, requireVault(home));
        break;
      case 'next':
        out = hNext(positionals, requireVault(home));
        break;
      case 'standing':
        out = hStanding(positionals, flags, requireVault(home), wantJson);
        break;
      case 'why':
        out = hWhy(positionals, requireVault(home));
        break;
      case 'frontier':
        out = hFrontier(positionals, requireVault(home));
        break;
      case 'decline':
        out = hDecline(positionals, flags, requireVault(home));
        break;
      case 'ledger':
        if (positionals[0] === 'rebuild') out = hRebuild(requireVault(home));
        else fail('bad_input', `unknown ledger subcommand: ${positionals[0]}`);
        break;
      default:
        fail('bad_input', `unknown command: ${cmd} — run with --help`);
    }
  } catch (err) {
    fail('io_error', err instanceof Error ? err.message : String(err));
  }
  const sub = SUBCOMMAND_COMMANDS.has(cmd) ? positionals[0] : null;
  process.stdout.write((wantJson ? JSON.stringify(out) : summarize(cmd, sub, out)) + '\n');
}

main();