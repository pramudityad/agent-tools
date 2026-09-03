#!/usr/bin/env node
// @ts-check
// Hermetic test suite — no network, no dependencies beyond Node's built-ins.
// Run with: node test.mjs

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'deck.mjs');

/** Runs the CLI, returning status and combined output instead of throwing. */
function run(args, cwd) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, out: stdout };
  } catch (err) {
    return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

import { parseSpec, validate, renderHtml, scanResiduals } from './deck.mjs';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

// ── seam 1: parseSpec ─────────────────────────────────────────────────────────

const MINIMAL = `---
course: Business Intelligence Systems
session: 1
slot-start: "18:15"
slot-minutes: 105
---

## 8. Manifest slide

### SLIDE 1 · Judul
**VISUAL** — slide judul, tanpa gambar.
**KONTEN**
LEAD: Business Intelligence Systems
**NOTES** \`[min 000 · 18:15]\` Biarkan tampil sampai 18:15 tepat.

### SLIDE 2 · Malam ini
**VISUAL** — tabel 3 kolom.
**KONTEN**
- Pembuka
**NOTES** \`[min 008 · 18:23]\` Katakan sesi selesai 20:00.
`;

test('parses frontmatter into typed fields', () => {
  const spec = parseSpec(MINIMAL);
  assert.equal(spec.frontmatter.session, 1);
  assert.equal(spec.frontmatter['slot-start'], '18:15');
  assert.equal(spec.frontmatter['slot-minutes'], 105);
});

test('parses each slide with number, title, visual, konten and notes', () => {
  const spec = parseSpec(MINIMAL);
  assert.equal(spec.errors.length, 0);
  assert.equal(spec.slides.length, 2);
  const [one, two] = spec.slides;
  assert.equal(one.n, 1);
  assert.equal(one.title, 'Judul');
  assert.match(one.visual, /slide judul/);
  assert.match(one.konten, /LEAD: Business Intelligence Systems/);
  assert.equal(one.min, 0);
  assert.equal(one.clock, '18:15');
  assert.match(one.notes, /Biarkan tampil/);
  assert.equal(two.n, 2);
  assert.equal(two.min, 8);
});

test('a slide missing NOTES errors with its slide number and line', () => {
  const spec = parseSpec(MINIMAL.replace(/\*\*NOTES\*\* `\[min 008 · 18:23\]` Katakan sesi selesai 20:00\.\n/, ''));
  assert.equal(spec.slides.length, 2, 'the malformed slide is still parsed, not dropped');
  const [err] = spec.errors;
  assert.ok(err, 'expected an error for the slide with no NOTES');
  assert.equal(err.slide, 2);
  assert.match(err.message, /NOTES/);
  assert.ok(err.line > 0, 'error carries a line number');
});

test('an unknown KONTEN marker errors instead of rendering as literal text', () => {
  const spec = parseSpec(MINIMAL.replace('LEAD: Business Intelligence Systems', 'WOBBLE: Business Intelligence Systems'));
  const err = spec.errors.find((e) => /WOBBLE/.test(e.message));
  assert.ok(err, 'expected an error naming the unknown marker');
  assert.equal(err.slide, 1);
});

test('every documented marker is accepted', () => {
  const konten = ['LEAD: judul', 'FINE: catatan kecil', 'STRUCK:', '- salah', 'SPLIT:', '  PANEL Finance | NUM 4,2 miliar', '    LABEL Pendapatan'].join('\n');
  const spec = parseSpec(MINIMAL.replace('LEAD: Business Intelligence Systems', konten));
  assert.deepEqual(spec.errors, [], 'no marker should be reported unknown');
});

// ── seam 2: validate ──────────────────────────────────────────────────────────

const errorsFor = (text) => validate(parseSpec(text)).map((e) => e.message).join(' | ');

test('a clock stamp that disagrees with slot start + offset is an error', () => {
  // slot starts 18:15, so min 008 must read 18:23 — not 18:40.
  const drifted = MINIMAL.replace('[min 008 · 18:23]', '[min 008 · 18:40]');
  assert.match(errorsFor(drifted), /slide 2.*18:23/);
});

test('a correct spec validates clean', () => {
  assert.equal(errorsFor(MINIMAL), '');
});

test('offsets running backwards are an error', () => {
  // slide 1 at min 020, slide 2 still at min 008 — the deck moves back in time.
  const backwards = MINIMAL.replace('[min 000 · 18:15]', '[min 020 · 18:35]');
  assert.match(errorsFor(backwards), /monotonic|backwards/i);
});

test('slides sharing one minute offset are fine', () => {
  // Sesi 1 legitimately stamps slides 1-3 all at min 000 (the late-arrival window).
  const shared = MINIMAL.replace('[min 008 · 18:23]', '[min 000 · 18:15]');
  assert.equal(errorsFor(shared), '');
});

test('a teaching deck outside its mandate is an error', () => {
  const teaching = MINIMAL.replace('session: 1', 'session: 1\nmandate: 30-40');
  assert.match(errorsFor(teaching), /2 slides.*30–40|30-40/);
});

test('a logistics-only deck is exempt from the mandate', () => {
  const logistics = MINIMAL.replace('session: 1', 'session: 1\nmandate: 30-40\ndeck-type: logistics');
  assert.equal(errorsFor(logistics), '');
});

// ── seam 3: renderHtml ────────────────────────────────────────────────────────

const OVERRIDE = MINIMAL.replace(
  '**NOTES** `[min 008 · 18:23]` Katakan sesi selesai 20:00.',
  '**KONTEN-MAHASISWA**\nTODO ditampilkan di kelas\n**FLAG** butuh dua angka\n**NOTES** `[min 008 · 18:23]` Katakan sesi selesai 20:00.',
).replace('- Pembuka', 'TODO UKUR SEBELUM KELAS');

test('materi carries no speaker notes, visual directives or clock rail', () => {
  const html = renderHtml(parseSpec(MINIMAL), { audience: 'materi' });
  assert.equal(html.match(/<div class="notes"/g), null, 'no notes blocks');
  assert.equal(html.match(/<div class="visual"/g), null, 'no visual directives');
  assert.equal(html.match(/class="clk"/g), null, 'no clock rail');
  assert.ok(!html.includes('Katakan sesi selesai'), 'no note text anywhere in source');
  assert.ok(!html.includes('tabel 3 kolom'), 'no visual text anywhere in source');
});

test('naskah carries notes, visual directives and the clock rail', () => {
  const html = renderHtml(parseSpec(MINIMAL), { audience: 'naskah' });
  assert.equal(html.match(/<div class="notes"/g).length, 2);
  assert.equal(html.match(/<div class="visual"/g).length, 2);
  assert.ok(html.includes('Katakan sesi selesai'));
  assert.ok(html.includes('18:23'), 'clock stamp present');
});

test('KONTEN-MAHASISWA replaces the instructor content for students only', () => {
  const spec = parseSpec(OVERRIDE);
  const materi = renderHtml(spec, { audience: 'materi' });
  const naskah = renderHtml(spec, { audience: 'naskah' });
  assert.ok(!materi.includes('UKUR SEBELUM KELAS'), 'instructor placeholder must not reach students');
  assert.ok(materi.includes('ditampilkan di kelas'), 'student override is used');
  assert.ok(naskah.includes('UKUR SEBELUM KELAS'), 'naskah keeps the real TODO');
});

test('markers render as structure, not literal text', () => {
  const konten = ['LEAD: judul besar', 'SPLIT:', '  PANEL Finance | NUM 4,2 miliar', '| a | VEIL tertutup |'].join('\n');
  const html = renderHtml(parseSpec(MINIMAL.replace('LEAD: Business Intelligence Systems', konten)), { audience: 'materi' });
  assert.match(html, /class="lead"/);
  assert.match(html, /class="split"/);
  assert.match(html, /class="panel"/);
  assert.match(html, /class="pnum"/);
  assert.match(html, /class="veil"/);
  assert.ok(!html.includes('LEAD:'), 'the marker word itself never renders');
  assert.ok(!html.includes('PANEL '), 'the marker word itself never renders');
});

test('a marker applies from wherever it appears to the end of its segment', () => {
  // Sesi 1 slide 23 reads "Jumlah baris: TODO UKUR SEBELUM KELAS" — the label comes first.
  const konten = ['- Jumlah baris: TODO UKUR SEBELUM KELAS', '- row-store: VEIL ditampilkan di kelas'].join('\n');
  const html = renderHtml(parseSpec(MINIMAL.replace('LEAD: Business Intelligence Systems', konten)), { audience: 'materi' });
  assert.match(html, /Jumlah baris: <span class="todo">UKUR SEBELUM KELAS<\/span>/);
  assert.match(html, /row-store: <span class="veil">ditampilkan di kelas<\/span>/);
  assert.ok(!html.includes('TODO UKUR'), 'the marker word never renders');
});

test('a braced marker wraps exactly its word, mid-sentence', () => {
  // Sesi 1 slide 14: "...secara reliably (andal) dan repeatedly (berulang)" — two accents
  // inside one sentence, so end-of-segment would swallow the rest.
  const konten = 'LEAD: mendukung keputusan secara HI{reliably} (andal) dan HI{repeatedly} (berulang).';
  const html = renderHtml(parseSpec(MINIMAL.replace('LEAD: Business Intelligence Systems', konten)), { audience: 'materi' });
  assert.equal((html.match(/<span class="hi">/g) ?? []).length, 2);
  assert.match(html, /<span class="hi">reliably<\/span> \(andal\) dan <span class="hi">repeatedly<\/span> \(berulang\)/);
});

test('a panel can carry a good/bad variant', () => {
  // Sesi 1 slide 31 contrasts a rejected answer with an accepted one; the colour is the point.
  const konten = ['SPLIT:', '  PANEL Ditolak | BAD', '    “Marketing yang memutuskan”', '  PANEL Diterima | GOOD'].join('\n');
  const html = renderHtml(parseSpec(MINIMAL.replace('LEAD: Business Intelligence Systems', konten)), { audience: 'materi' });
  assert.match(html, /class="panel bad"/);
  assert.match(html, /class="panel good"/);
  assert.ok(!html.includes('BAD'), 'the variant word never renders');
});

test('both themes are defined at token level, never colour inside a media block only', () => {
  const html = renderHtml(parseSpec(MINIMAL), { audience: 'materi' });
  assert.match(html, /:root\{/, 'light tokens on bare :root');
  assert.match(html, /:root:not\(\[data-theme="light"\]\)/, 'dark guarded so explicit light wins');
  assert.match(html, /:root\[data-theme="dark"\]/, 'toggle wins in both directions');
  assert.match(html, /body\{[^}]*background:var\(--ground\)/, 'body paints from a token');
});

// ── seam 4: scanResiduals ─────────────────────────────────────────────────────

const MAP = { Flip: 'NusaPay', LAPAK_GAMING: 'PARTNER_A', BillFazz: 'Partner C' };

test('a mapped identifier left in the text is a hit, with its line', () => {
  const hits = scanResiduals('baris satu\nuuid product_id "Flip product ID"\n', MAP);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
  assert.equal(hits[0].match, 'Flip');
});

test('mapped identifiers are matched case-insensitively', () => {
  // The Sesi 1 source carried both `BILLFAZZ` and `BillFazz`; missing either ships the name.
  assert.equal(scanResiduals('code BILLFAZZ here', MAP).length, 1);
});

test('generic classes are caught even when absent from the map', () => {
  const text = [
    'contact bob@example.com',
    'see https://internal.example.com/x',
    'api_key: sk-abc123',
    'tags: [#work/flip]',
    'vault 02-Projects/Flip/notes.md',
  ].join('\n');
  const kinds = new Set(scanResiduals(text, {}).map((h) => h.kind));
  for (const kind of ['email', 'url', 'credential', 'work-tag', 'vault-path']) {
    assert.ok(kinds.has(kind), `expected a ${kind} hit`);
  }
});

test('an elided placeholder URL is not reported as a URL', () => {
  // Schema docs write `"product_img_url": "https://..."` — there is no host to leak, and a
  // scanner that cries wolf gets ignored.
  assert.deepEqual(scanResiduals('"product_img_url": "https://...",', {}), []);
  assert.equal(scanResiduals('see https://internal.example.com/x', {}).length, 1);
});

test('a fully sanitised document scans clean', () => {
  const clean = 'uuid product_id "NusaPay product ID"\ncode PARTNER_A\n';
  assert.deepEqual(scanResiduals(clean, MAP), []);
});

// ── seam 5: CLI ───────────────────────────────────────────────────────────────

const dir = mkdtempSync(join(tmpdir(), 'rps-deck-'));
const FLAGGED = MINIMAL.replace('**NOTES** `[min 008 · 18:23]`', '**FLAG** butuh dua angka\n**NOTES** `[min 008 · 18:23]`');
writeFileSync(join(dir, 'ok.md'), MINIMAL);
writeFileSync(join(dir, 'flagged.md'), FLAGGED);
writeFileSync(join(dir, 'broken.md'), MINIMAL.replace('**VISUAL** — tabel 3 kolom.\n', ''));

test('check passes a clean spec', () => {
  const { status, out } = run(['check', 'ok.md'], dir);
  assert.equal(status, 0, out);
  assert.match(out, /2 slides/);
});

test('check fails a spec with a missing field, naming the slide', () => {
  const { status, out } = run(['check', 'broken.md'], dir);
  assert.equal(status, 1);
  assert.match(out, /slide 2/);
  assert.match(out, /VISUAL/);
});

test('build warns on an open FLAG but still emits', () => {
  const { status, out } = run(['build', 'flagged.md'], dir);
  assert.equal(status, 0, out);
  assert.match(out, /FLAG/);
  assert.ok(existsSync(join(dir, 'flagged-pengampu.html')), 'naskah written');
  assert.ok(existsSync(join(dir, 'flagged-mahasiswa.html')), 'materi written');
});

test('build --final refuses while a FLAG is open', () => {
  const { status, out } = run(['build', '--final', 'flagged.md'], dir);
  assert.equal(status, 1);
  assert.match(out, /FLAG/);
});

test('build --final succeeds when no FLAG is open', () => {
  const { status, out } = run(['build', '--final', 'ok.md'], dir);
  assert.equal(status, 0, out);
});

test('the emitted materi file contains no speaker notes on disk', () => {
  run(['build', 'ok.md'], dir);
  const materi = readFileSync(join(dir, 'ok-mahasiswa.html'), 'utf8');
  assert.ok(!materi.includes('Katakan sesi selesai'), 'note text absent from the written file');
  assert.ok(!/class="notes"/.test(materi));
});

test('out-stem sets the emitted filenames, so a republish keeps its URL', () => {
  writeFileSync(join(dir, 'named.md'), MINIMAL.replace('session: 1', 'session: 1\nout-stem: sesi01-deck'));
  const { status, out } = run(['build', 'named.md'], dir);
  assert.equal(status, 0, out);
  assert.ok(existsSync(join(dir, 'sesi01-deck-pengampu.html')), 'naskah uses out-stem');
  assert.ok(existsSync(join(dir, 'sesi01-deck-mahasiswa.html')), 'materi uses out-stem');
});

console.log(`\n${passed} passed`);
