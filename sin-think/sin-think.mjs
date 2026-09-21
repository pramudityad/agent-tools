#!/usr/bin/env node
// sin-think — scaffold and lint Design Docs. Zero deps. See CONTRACT.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const REQUIRED_SECTIONS = [
  'problem', 'shapes', 'graph', 'cardinality', 'breaks', 'needs',
  'boundaries', 'pipe', 'lifecycle', 'layer scoping', 'verification',
];
const COVERAGE_SECTIONS = ['cardinality', 'breaks', 'needs'];
const TITLE_OF = { problem: 'Problem', shapes: 'Shapes', graph: 'Graph', cardinality: 'Cardinality', breaks: 'Breaks', needs: 'Needs', boundaries: 'Boundaries', pipe: 'Pipe', lifecycle: 'Lifecycle', 'layer scoping': 'Layer Scoping', verification: 'Verification' };

export const slugify = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '');

// "## 2. Graph (A)" -> "graph". Returns canonical-name -> body.
export function extractSections(doc) {
  const sections = new Map();
  let current = null;
  for (const line of doc.split('\n')) {
    const m = line.match(/^##\s+(?:\d+\.?\s*)?(.+?)\s*$/);
    if (m) {
      const name = m[1].replace(/\s*\([^)]*\)\s*/g, ' ').trim().toLowerCase();
      current = name;
      if (!sections.has(name)) sections.set(name, '');
    } else if (current) {
      sections.set(current, sections.get(current) + line + '\n');
    }
  }
  return sections;
}

export function extractNodes(doc) {
  const graph = extractSections(doc).get('graph') ?? '';
  const nodes = [];
  for (const line of graph.split('\n')) {
    if (!/->|→/.test(line)) continue;
    for (const side of line.split(/->|→/)) {
      const token = side.trim();
      if (/^[AER]\s*=/.test(token)) continue; // bare channel annotation, not a node
      const m = token.match(/[A-Za-z_][A-Za-z0-9_]*/);
      if (m && !nodes.includes(m[0])) nodes.push(m[0]);
    }
  }
  return nodes;
}

export function checkDoc(doc) {
  const sections = extractSections(doc);
  const failures = [];
  for (const name of REQUIRED_SECTIONS) {
    const title = TITLE_OF[name];
    if (!sections.has(name)) { failures.push(`missing required section: ${title}`); continue; }
    if (!stripComments(sections.get(name)).trim()) failures.push(`section is placeholder-only: ${title}`);
  }
  const graph = sections.get('graph') ?? '';
  if (sections.has('graph') && !/->|→/.test(stripComments(graph))) failures.push('Graph has no edges (-> or →)');
  for (const node of extractNodes(doc)) {
    for (const name of COVERAGE_SECTIONS) {
      const body = stripComments(sections.get(name) ?? '');
      if (!new RegExp(`\\b${node}\\b`).test(body)) failures.push(`node '${node}' not covered in ${TITLE_OF[name]}`);
    }
  }
  return failures;
}

export function cmdNew({ title, dir = 'docs/design', date = localDate() }) {
  const file = join(dir, `${date}-${slugify(title)}.md`);
  if (existsSync(file)) throw new Error(`already exists: ${file}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, readFileSync(join(HERE, 'TEMPLATE.md'), 'utf8').replace('{{TITLE}}', title));
  return file;
}

const localDate = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const USAGE = `sin-think — Design Doc scaffolding and lint
  sin-think.mjs new "<title>" [--dir docs/design] [--date YYYY-MM-DD]
  sin-think.mjs check <file>
  sin-think.mjs nodes <file>
Output is JSON unless --summary. Exit 0 ok · 1 check failed · 2 usage error.`;

function main(argv) {
  const [cmd, ...rest] = argv;
  const positional = rest.filter((a) => !a.startsWith('--'));
  const flag = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i === -1 ? undefined : rest[i + 1];
  };
  const summary = rest.includes('--summary');
  const emit = (payload, text) => { console.log(summary ? text : JSON.stringify(payload, null, 2)); };

  if (cmd === 'new') {
    const [title] = positional;
    if (!title) { console.error(USAGE); return 2; }
    try {
      const file = cmdNew({ title, dir: flag('dir'), date: flag('date') });
      emit({ ok: true, file }, `created ${file}\nFill every section, then: sin-think.mjs check ${file}`);
      return 0;
    } catch (err) { console.error(`error: ${err.message}`); return 2; }
  }

  if (cmd === 'check' || cmd === 'nodes') {
    const [file] = positional;
    if (!file || !existsSync(file)) { console.error(USAGE); return 2; }
    const doc = readFileSync(file, 'utf8');
    if (cmd === 'nodes') {
      const nodes = extractNodes(doc);
      emit({ ok: true, nodes }, nodes.join('\n') || '(no nodes found)');
      return 0;
    }
    const failures = checkDoc(doc);
    emit({ ok: failures.length === 0, failures }, failures.length ? failures.map((f) => `✗ ${f}`).join('\n') : '✓ check passed');
    return failures.length ? 1 : 0;
  }

  console.error(USAGE);
  return cmd === '--help' || cmd === undefined ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
