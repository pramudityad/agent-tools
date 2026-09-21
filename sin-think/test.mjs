// Hermetic test suite: node ~/.agent-tools/sin-think/test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  slugify, extractSections, extractNodes, checkDoc, cmdNew, REQUIRED_SECTIONS,
} from './sin-think.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CLI = join(HERE, 'sin-think.mjs');

const GOOD_DOC = `# Webhook Receiver
Status: designed

## 1. Problem
Receive payment webhooks, persist them, acknowledge only after durable storage.

## 2. Shapes
- Record: WebhookEvent. ID: EventId (branded). Variant: Status = Received | Stored | Acked.
- Errors: ParseError, StoreError, AckError — all tagged.

## 3. Graph (A)
\`\`\`
parse(raw) -> validate(event) -> store(event) -> ack(id)
\`\`\`

## 4. Cardinality
- parse: one-shot. validate: one-shot. store: one-shot. ack: one-shot.

## 5. Breaks (E)
- parse: ParseError, escape to dead-letter. validate: ParseError, propagate.
- store: StoreError, retry with backoff then propagate. ack: AckError, retry.

## 6. Needs (R)
- parse: nothing. validate: nothing. store: Database. ack: HttpClient.
- Layers provide Database and HttpClient; R = never at the edge.

## 7. Boundaries
- raw body enters at parse; Schema turns unknown into WebhookEvent.

## 8. Pipe
- store is wrapped with tracing and retry; the node does not know.

## 9. Lifecycle
- Database connection acquired at boot, released by scope on shutdown.

## 10. Layer Scoping
- Services emit StoreError; Handlers catch StoreError and emit AckError upward.

## 11. Verification
- Test layers: in-memory Database, stub HttpClient; graph runs end to end.
`;

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'sin-think-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('slugify collapses and trims', () => {
  assert.equal(slugify('Webhook Receiver!'), 'webhook-receiver');
  assert.equal(slugify('  --Pay™  Callback-- '), 'pay-callback');
});

test('sections match leniently: numbers and parentheticals ignored', () => {
  const sections = extractSections(GOOD_DOC);
  for (const name of REQUIRED_SECTIONS) assert.ok(sections.has(name), `missing ${name}`);
});

test('nodes come only from edge lines, identifiers only, deduped in order', () => {
  const nodes = extractNodes(GOOD_DOC);
  assert.deepEqual(nodes, ['parse', 'validate', 'store', 'ack']);
  const unicode = extractNodes('## 3. Graph (A)\nServices → Auth → Handlers\n\nE=SqlError\n');
  assert.deepEqual(unicode, ['Services', 'Auth', 'Handlers']);
});

test('fresh template draft does NOT pass check', () => {
  const template = readFileSync(join(HERE, 'TEMPLATE.md'), 'utf8');
  const failures = checkDoc(template.replace('{{TITLE}}', 'Draft'));
  assert.ok(failures.length > 0);
});

test('complete doc passes', () => {
  assert.deepEqual(checkDoc(GOOD_DOC), []);
});

test('missing required section fails', () => {
  const doc = GOOD_DOC.replace(/## 8\. Pipe[\s\S]*?(?=## 9\.)/, '');
  assert.ok(checkDoc(doc).some((f) => f.includes('Pipe')));
});

test('graph without edges fails', () => {
  const doc = GOOD_DOC.replace('parse(raw) -> validate(event) -> store(event) -> ack(id)', 'no edges here');
  assert.ok(checkDoc(doc).some((f) => f.includes('edge')));
});

test('node missing from a coverage section fails once per pair', () => {
  const doc = GOOD_DOC.replace('- parse: ParseError, escape to dead-letter. validate: ParseError, propagate.\n', '');
  const failures = checkDoc(doc);
  assert.ok(failures.some((f) => f.includes('parse') && f.includes('Breaks')));
  assert.ok(failures.some((f) => f.includes('validate') && f.includes('Breaks')));
});

test('new creates dated slug file and refuses overwrite', () => withTemp((dir) => {
  const created = cmdNew({ title: 'Webhook Receiver', dir, date: '2026-08-27' });
  const file = join(dir, '2026-08-27-webhook-receiver.md');
  assert.equal(created, file);
  assert.ok(existsSync(file));
  assert.match(readFileSync(file, 'utf8'), /^# Webhook Receiver/);
  assert.throws(() => cmdNew({ title: 'Webhook Receiver', dir, date: '2026-08-27' }), /exists/);
}));

test('CLI: check exit codes and json shape', () => withTemp((dir) => {
  const good = join(dir, 'good.md');
  writeFileSync(good, GOOD_DOC);
  const out = execFileSync('node', [CLI, 'check', good], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.failures, []);

  const bad = join(dir, 'bad.md');
  writeFileSync(bad, '# Nothing\n');
  let code = 0;
  try { execFileSync('node', [CLI, 'check', bad], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (err) { code = err.status; }
  assert.equal(code, 1);

  let usage = 0;
  try { execFileSync('node', [CLI, 'check'], { stdio: 'pipe' }); }
  catch (err) { usage = err.status; }
  assert.equal(usage, 2);
}));

test('CLI: nodes subcommand prints extraction', () => withTemp((dir) => {
  const good = join(dir, 'good.md');
  writeFileSync(good, GOOD_DOC);
  const out = execFileSync('node', [CLI, 'nodes', good], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out).nodes, ['parse', 'validate', 'store', 'ack']);
}));
