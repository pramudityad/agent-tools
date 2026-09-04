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

import { parseSpec, validate, renderHtml, scanResiduals, restamp, renderMateri, approve, approvalState, parseRps, extract, applyMap } from './deck.mjs';

let passed = 0;
const failed = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed.push(name);
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

test('materi carries no speaker notes, visual directives or notes pane', () => {
  const html = renderHtml(parseSpec(MINIMAL), { audience: 'materi' });
  assert.equal(html.match(/class="notes"/g), null, 'no notes markup');
  assert.equal(html.match(/class="visual"/g), null, 'no visual directives');
  assert.equal(html.match(/id="pane"/g), null, 'no notes pane');
  assert.ok(!html.includes('Katakan sesi selesai'), 'no note text anywhere in source');
  assert.ok(!html.includes('tabel 3 kolom'), 'no visual text anywhere in source');
});

test('naskah carries notes, visual directives and a notes pane', () => {
  const html = renderHtml(parseSpec(MINIMAL), { audience: 'naskah' });
  assert.equal(html.match(/class="notes"/g).length, 2);
  assert.equal(html.match(/class="visual"/g).length, 2);
  assert.match(html, /id="pane"/);
  assert.ok(html.includes('Katakan sesi selesai'));
  assert.ok(html.includes('18:23'), 'clock stamp present');
});

// \u2500\u2500 projectable deck \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

test('every slide becomes one section, and only the first is live', () => {
  const html = renderHtml(parseSpec(MINIMAL), { audience: 'materi' });
  assert.equal((html.match(/<section class="slide/g) ?? []).length, 2);
  assert.equal((html.match(/class="slide live"/g) ?? []).length, 1, 'exactly one starts live');
  assert.match(html, /id="s1"/);
  assert.match(html, /id="s2"/);
});

test('the deck is navigable and self-contained', () => {
  const html = renderHtml(parseSpec(MINIMAL), { audience: 'materi' });
  assert.match(html, /ArrowRight/, 'keyboard nav');
  assert.match(html, /ArrowLeft/);
  assert.match(html, /id="count"/, 'slide counter');
  assert.equal(html.match(/src="https?:/g), null, 'no external scripts');
  assert.equal(html.match(/href="https?:\/\/[^"]*\.css/g), null, 'no external stylesheets');
});

test('reduced motion is respected', () => {
  assert.match(renderHtml(parseSpec(MINIMAL), { audience: 'materi' }), /prefers-reduced-motion/);
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

test('applyMap replaces longest keys first, so a short key cannot eat a long one', () => {
  // Both `GrabFood` and `Grab` are in the real Sesi 2 map. Shortest-first would turn
  // GrabFoodMenuSyncLog into PlatformAFoodMenuSyncLog and ship the partner name.
  const map = { GrabFoodMenuSyncLog: 'PlatformASyncLog', GrabFood: 'PlatformA', Grab: 'PlatformA' };
  const out = applyMap('table GrabFoodMenuSyncLog joins GrabFood via Grab', map);
  assert.equal(out, 'table PlatformASyncLog joins PlatformA via PlatformA');
  assert.ok(!out.includes('Grab'), 'no fragment of the original name survives');
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

test('build --final refuses a stale approval', () => {
  writeFileSync(join(dir, 'appr.md'), approve(MINIMAL, '2026-09-04'));
  assert.equal(run(['build', '--final', 'appr.md'], dir).status, 0, 'approved build works');
  // one character of note text changes, and the approval no longer describes the file
  writeFileSync(join(dir, 'appr.md'), approve(MINIMAL, '2026-09-04').replace('20:00.', '20:05.'));
  const { status, out } = run(['build', '--final', 'appr.md'], dir);
  assert.equal(status, 1, out);
  assert.match(out, /changed since approval|stale/i);
});

test('build --final on an unapproved naskah says so', () => {
  const { status, out } = run(['build', '--final', 'ok.md'], dir);
  assert.equal(status, 1, out);
  assert.match(out, /not approved/i);
});

test('build without --final ignores approval entirely', () => {
  assert.equal(run(['build', 'ok.md'], dir).status, 0);
});



test('the emitted materi file contains no speaker notes on disk', () => {
  run(['build', 'ok.md'], dir);
  const materi = readFileSync(join(dir, 'ok-mahasiswa.html'), 'utf8');
  assert.ok(!materi.includes('Katakan sesi selesai'), 'note text absent from the written file');
  assert.ok(!/class="notes"/.test(materi));
  assert.ok(!/id="pane"/.test(materi), 'no notes pane in the written file');
});

test('out-stem sets the emitted filenames, so a republish keeps its URL', () => {
  writeFileSync(join(dir, 'named.md'), MINIMAL.replace('session: 1', 'session: 1\nout-stem: sesi01-deck'));
  const { status, out } = run(['build', 'named.md'], dir);
  assert.equal(status, 0, out);
  assert.ok(existsSync(join(dir, 'sesi01-deck-pengampu.html')), 'naskah uses out-stem');
  assert.ok(existsSync(join(dir, 'sesi01-deck-mahasiswa.html')), 'materi uses out-stem');
});

// \u2500\u2500 DUR + restamp \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const DURSPEC = `---
slot-start: "18:15"
slot-minutes: 20
---

### SLIDE 1 · Satu
**DUR** 0
**VISUAL** — a
**KONTEN**
x
**NOTES** catatan satu

### SLIDE 2 · Dua
**DUR** 8
**VISUAL** — b
**KONTEN**
y
**NOTES** catatan dua

### SLIDE 3 · Tiga
**DUR** 12
**VISUAL** — c
**KONTEN**
z
**NOTES** \`[min 999 · 09:99]\` catatan tiga
`;

test('DUR is parsed as minutes', () => {
  const spec = parseSpec(DURSPEC);
  assert.deepEqual(spec.slides.map((s) => s.dur), [0, 8, 12]);
});

test('restamp computes cumulative offsets and clocks from slot-start', () => {
  const { text, errors } = restamp(DURSPEC);
  assert.deepEqual(errors, []);
  const stamps = [...text.matchAll(/\[min (\d{3}) · (\d{2}:\d{2})\]/g)].map((m) => `${m[1]}·${m[2]}`);
  // 0 \u2192 18:15, then +0 \u2192 18:15, then +8 \u2192 18:23
  assert.deepEqual(stamps, ['000·18:15', '000·18:15', '008·18:23']);
});

test('restamp replaces an existing stamp rather than doubling it', () => {
  const { text } = restamp(DURSPEC);
  assert.ok(!text.includes('999'), 'the stale stamp is gone');
  assert.equal((text.match(/\[min /g) ?? []).length, 3, 'one stamp per slide');
  assert.ok(text.includes('catatan tiga'), 'note text survives');
});

test('restamp is idempotent', () => {
  const once = restamp(DURSPEC).text;
  assert.equal(restamp(once).text, once);
});

test('a DUR total that misses the slot is an error naming the gap', () => {
  const short = DURSPEC.replace('**DUR** 12', '**DUR** 5');
  const { errors } = restamp(short);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /13.*20|kurang|short|7/i);
});

test('validate checks the DUR total when DUR is present', () => {
  const short = DURSPEC.replace('**DUR** 12', '**DUR** 5');
  assert.match(validate(parseSpec(short)).map((e) => e.message).join(' | '), /DUR/);
});

test('a spec with no DUR keeps hand-authored stamp validation', () => {
  // MINIMAL has authored stamps and no DUR \u2014 it must still validate clean.
  assert.deepEqual(validate(parseSpec(MINIMAL)), []);
});

// \u2500\u2500 render \u2192 materi.md \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

test('materi.md carries slide content but no notes or visual directives', () => {
  const md = renderMateri(MINIMAL);
  assert.ok(md.includes('Judul'), 'slide titles survive');
  assert.ok(md.includes('LEAD: Business Intelligence Systems'), 'konten survives');
  assert.ok(!md.includes('**NOTES**'), 'no NOTES field');
  assert.ok(!md.includes('Biarkan tampil'), 'no note text anywhere');
  assert.ok(!md.includes('**VISUAL**'), 'no VISUAL field');
  assert.ok(!md.includes('tabel 3 kolom'), 'no visual text anywhere');
});

test('materi.md says it is generated, so nobody edits the wrong file', () => {
  const md = renderMateri(MINIMAL);
  assert.match(md, /generated|dihasilkan/i);
  assert.match(md, /naskah/i);
});

test('materi.md uses KONTEN-MAHASISWA where the naskah provides one', () => {
  const src = MINIMAL.replace('LEAD: Business Intelligence Systems',
    'TODO UKUR SEBELUM KELAS\n**KONTEN-MAHASISWA**\nVEIL ditampilkan di kelas');
  const md = renderMateri(src);
  assert.ok(!md.includes('UKUR SEBELUM KELAS'), 'instructor placeholder stays out');
  assert.ok(md.includes('ditampilkan di kelas'), 'student override is used');
});

// \u2500\u2500 approval \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

test('approve stamps status and a hash of the content', () => {
  const approved = approve(MINIMAL, '2026-09-04');
  assert.match(approved, /status: approved/);
  assert.match(approved, /approved-sha256: [0-9a-f]{64}/);
  assert.match(approved, /approved-on: 2026-09-04/);
  assert.equal(approvalState(approved).state, 'approved');
});

test('editing after approval revokes it', () => {
  const approved = approve(MINIMAL, '2026-09-04');
  const edited = approved.replace('Katakan sesi selesai 20:00.', 'Katakan sesi selesai 20:05.');
  const after = approvalState(edited);
  assert.equal(after.state, 'stale');
  assert.match(after.message, /changed|berubah|stale/i);
});

test('an unapproved naskah reports as such', () => {
  assert.equal(approvalState(MINIMAL).state, 'unapproved');
});

test('re-approving after an edit restores the match', () => {
  const edited = approve(MINIMAL, '2026-09-04').replace('20:00.', '20:05.');
  assert.equal(approvalState(approve(edited, '2026-09-05')).state, 'approved');
});

// \u2500\u2500 RPS contract \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const RPS = `# RPS

**Rencana Pembelajaran Mingguan**

|  Sesi  |  Bobot  | CPMK | Sub-CPMK | Penilaian | Metode | Materi |
| :----: | :-----: | :--: | :------- | :-------- | :----- | :----- |
| **1**  |   2%    |  1   | Mahasiswa mampu menjelaskan peran BI. | Inventaris keputusan (D0) | Ceramah interaktif | Pengantar BI; OLTP vs OLAP |
| **2**  |   2%    | 1, 5 | Mahasiswa mampu membandingkan arsitektur. | Delapan pertanyaan bisnis (D1) | Fishbowl debate | Arsitektur BI; lakehouse |

**Rubrik Penilaian Artefak Mingguan**

| Kriteria | Bobot | 0 | 1 | 2 |
| :---- | :---: | :---- | :---- | :---- |
| Fungsionalitas / kebenaran | 50% | tidak jalan | jalan sebagian | memenuhi |
| Kualitas & konvensi | 20% | mengabaikan | sebagian | konsisten |

| BOBOT PENILAIAN UAS 25% UTS 25% |
| :---- |

**Ketentuan Penilaian & Kedisiplinan**

| PUSTAKA UTAMA Kimball, R. & Ross, M. (2013). |
| :---- |
`;

test('parseRps finds the weekly row by column signature, not by heading', () => {
  const { row } = parseRps(RPS, 2);
  assert.equal(row.sesi, 2);
  assert.equal(row.bobot, '2%');
  assert.equal(row.cpmk, '1, 5');
  assert.match(row.subCpmk, /membandingkan arsitektur/);
  assert.equal(row.penilaian, 'Delapan pertanyaan bisnis (D1)');
  assert.equal(row.metode, 'Fishbowl debate');
  assert.match(row.materi, /lakehouse/);
});

test('parseRps splits Materi into the topics research would cover', () => {
  assert.deepEqual(parseRps(RPS, 2).row.materiTopics, ['Arsitektur BI', 'lakehouse']);
});

test('a 6-column RPS without a CPMK column still parses', () => {
  // SDLC and WAD omit the CPMK column entirely; only BI has it. Map by header name,
  // never by position.
  const six = RPS
    .replace('|  Sesi  |  Bobot  | CPMK | Sub-CPMK | Penilaian | Metode | Materi |',
             '| Sesi | Bobot | Sub-CPMK | Penilaian | Metode | Materi |')
    .replace('| :----: | :-----: | :--: | :------- | :-------- | :----- | :----- |',
             '| :--- | :--- | :--- | :--- | :--- | :--- |')
    .replace('| **1**  |   2%    |  1   | Mahasiswa mampu menjelaskan peran BI. |',
             '| **1** | 2% | Mahasiswa mampu menjelaskan peran BI. |')
    .replace('| **2**  |   2%    | 1, 5 | Mahasiswa mampu membandingkan arsitektur. |',
             '| **2** | 2% | Mahasiswa mampu membandingkan arsitektur. |');
  const { row } = parseRps(six, 2);
  assert.equal(row.sesi, 2);
  assert.equal(row.bobot, '2%');
  assert.equal(row.cpmk, '', 'no CPMK column means no CPMK, not a shifted column');
  assert.match(row.subCpmk, /membandingkan arsitektur/);
  assert.equal(row.penilaian, 'Delapan pertanyaan bisnis (D1)');
  assert.match(row.materi, /lakehouse/);
});

test('parseRps extracts the rubric', () => {
  const { rubric } = parseRps(RPS, 1);
  assert.equal(rubric.length, 2);
  assert.deepEqual(rubric[0], { kriteria: 'Fungsionalitas / kebenaran', bobot: '50%' });
});

test('parseRps reports where the prose blocks are, for the agent to read', () => {
  const { blocks } = parseRps(RPS, 1);
  assert.ok(blocks.bobot > 0, 'Bobot Penilaian located');
  assert.ok(blocks.ketentuan > 0, 'Ketentuan located');
  assert.ok(blocks.pustaka > 0, 'Pustaka located');
});

test('asking for a session the RPS does not define is an error, not a guess', () => {
  assert.throws(() => parseRps(RPS, 9), /sesi 9/i);
});

// \u2500\u2500 extraction \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

const DOC = ['# Plan', '', 'intro line', '', '## Problem Statement', '',
  'The sync fails silently.', '', '### Detail', 'nested stays', '', '## Business Requirements', '',
  'BR-01 something', '', '## Appendix', 'ignored'].join('\n');

test('extract pulls one section, including its nested subsections', () => {
  const out = extract(DOC, { section: 'Problem Statement' });
  assert.match(out, /## Problem Statement/);
  assert.match(out, /sync fails silently/);
  assert.match(out, /nested stays/, 'a deeper heading belongs to the section');
  assert.ok(!out.includes('BR-01'), 'stops at the next same-level heading');
  assert.ok(!out.includes('ignored'));
});

test('extract can take several sections, in document order', () => {
  const out = extract(DOC, { section: ['Business Requirements', 'Problem Statement'] });
  assert.ok(out.indexOf('Problem Statement') < out.indexOf('Business Requirements'), 'document order, not argument order');
  assert.match(out, /BR-01/);
  assert.ok(!out.includes('ignored'));
});

test('extract can take a line range instead', () => {
  const out = extract(DOC, { lines: '5-7' });
  assert.match(out, /Problem Statement/);
  assert.ok(!out.includes('# Plan'));
});

test('extract on a heading that is not there is an error, not an empty file', () => {
  assert.throws(() => extract(DOC, { section: 'Nonexistent' }), /Nonexistent/);
});

test('extract with no selector returns the document unchanged', () => {
  assert.equal(extract(DOC, {}), DOC);
});

if (failed.length) {
  // The summary has to be unmissable: a bare pass count printed alongside failures once
  // let a red suite be reported as green.
  console.error(`\n✗ ${failed.length} FAILED, ${passed} passed`);
  for (const name of failed) console.error(`    ✗ ${name}`);
} else {
  console.log(`\n✓ ${passed} passed`);
}
