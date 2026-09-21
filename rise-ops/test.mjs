#!/usr/bin/env node
// @ts-check
// Hermetic test suite — no network, no dependencies beyond Node's built-ins.
// Run with: node test.mjs

import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  parseTugasFile,
  normaliseName,
  parseCsv,
  parseZoomCsv,
  matchZoom,
  lateThreshold,
  parseSegments,
  buildAcara,
  resolveNims,
  slotMinutes,
  attachKind,
  materialDraft,
  materialPayload,
  descriptionHtml,
  sanitizeFilename,
  slugify,
} from './ops.mjs';

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

// ── fixtures ──────────────────────────────────────────────────────────────────

const ROSTER = [
  { user_data_id: 'u1', user_nim: '24120500011', user_name: 'TITA NOVIANA' },
  { user_data_id: 'u2', user_nim: '24110500029', user_name: 'WILDAN RIZKY WIJAYA' },
  { user_data_id: 'u3', user_nim: '24120500022', user_name: 'ZAINUDDIN' },
  { user_data_id: 'u4', user_nim: '24130500009', user_name: "ZAKI KHAIRI ZIWAR" },
];

const NASKAH = `---
course: Business Intelligence Systems
session: 2
topic: Arsitektur BI dan Requirements Gathering
cpmk: CPMK-1, CPMK-5
artifact: D1 — delapan pertanyaan bisnis (2%)
slot-start: "18:15"
slot-minutes: 105
status: approved
---

# Naskah

## 6. Potongan sesi

Tidak relevan untuk berita acara.

## 7. Pedoman interaksi per segmen

| Menit | Bentuk interaksi | Yang tidak boleh |
| :---- | :---- | :---- |
| 0–7 | Soft start dan catch-up | Tidak ada assessment |
| 7–13 | Workplace hook dan poll | Jangan ungkap jawaban |
| 66–105 | Lab trio role-play dan penutup | Jangan biarkan satu orang mendominasi |

---

## 8. Manifest slide
`;

// ── frontmatter ───────────────────────────────────────────────────────────────

test('parseFrontmatter reads strings, ints and quoted values', () => {
  const { frontmatter } = parseFrontmatter(NASKAH);
  assert.equal(frontmatter.session, 2);
  assert.equal(frontmatter['slot-minutes'], 105);
  assert.equal(frontmatter['slot-start'], '18:15');
  assert.equal(frontmatter.status, 'approved');
});

test('parseFrontmatter returns body untouched when there is no frontmatter', () => {
  const { frontmatter, body } = parseFrontmatter('# plain\n');
  assert.deepEqual(frontmatter, {});
  assert.equal(body, '# plain\n');
});

// ── name normalisation ────────────────────────────────────────────────────────

test('normaliseName uppercases, strips punctuation and collapses spaces', () => {
  assert.equal(normaliseName('  tita   noviana '), 'TITA NOVIANA');
  assert.equal(normaliseName('Zaki, Khairi. Ziwar'), 'ZAKI KHAIRI ZIWAR');
});

test('normaliseName folds diacritics', () => {
  assert.equal(normaliseName('José Ábðel'), normaliseName('Jose Abðel'.replace('ð', 'ð')));
  assert.equal(normaliseName('Café'), 'CAFE');
});

test('normaliseName is total — null and undefined fold to empty', () => {
  assert.equal(normaliseName(null), '');
  assert.equal(normaliseName(undefined), '');
});

// ── CSV ───────────────────────────────────────────────────────────────────────

test('parseCsv handles quoted fields, embedded commas and doubled quotes', () => {
  const rows = parseCsv('a,b\n"x,1","say ""hi"""\n');
  assert.deepEqual(rows, [['a', 'b'], ['x,1', 'say "hi"']]);
});

test('parseCsv tolerates CRLF and drops blank rows', () => {
  assert.deepEqual(parseCsv('a,b\r\n\r\nc,d\r\n'), [['a', 'b'], ['c', 'd']]);
});

test('parseZoomCsv skips the meeting-info preamble', () => {
  const csv = [
    'Meeting ID,Topic,Start Time',
    '973 0329 0176,BsIn2 Sesi 2,Sep 11 2026',
    '',
    'Name (original name),User Email,Join Time,Leave Time,Duration (Minutes),Guest',
    'TITA NOVIANA,tita@example.ac.id,18:14,20:00,106,No',
    'Wildan Rizky Wijaya,wildan@example.ac.id,18:50,20:00,70,No',
  ].join('\n');
  const rows = parseZoomCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'TITA NOVIANA');
  assert.equal(rows[0].minutes, 106);
  assert.equal(rows[1].minutes, 70);
});

test('parseZoomCsv rejects a file with no participant header', () => {
  assert.throws(() => parseZoomCsv('foo,bar\n1,2\n'), /participant header/);
});

// ── matching (ADR 0004) ───────────────────────────────────────────────────────

test('matchZoom binds on exact normalised name regardless of case and spacing', () => {
  const { matched, unmatchedZoom, unmatchedStudents } = matchZoom(
    [{ name: 'tita  noviana', minutes: 100 }, { name: 'WILDAN RIZKY WIJAYA', minutes: 90 }],
    ROSTER,
  );
  assert.equal(matched.length, 2);
  assert.equal(unmatchedZoom.length, 0);
  assert.equal(unmatchedStudents.length, 2);
  assert.deepEqual(unmatchedStudents.map((s) => s.user_nim).sort(), ['24120500022', '24130500009']);
});

test('matchZoom never merges a partial name — a nickname stays unmatched', () => {
  const { matched, unmatchedZoom } = matchZoom([{ name: 'Tita', minutes: 100 }], ROSTER);
  assert.equal(matched.length, 0);
  assert.equal(unmatchedZoom.length, 1);
  assert.match(unmatchedZoom[0].reason, /no roster match/);
});

test('matchZoom refuses a name shared by two students rather than picking one', () => {
  const twins = [
    { user_data_id: 'a', user_nim: '1', user_name: 'BUDI SANTOSO' },
    { user_data_id: 'b', user_nim: '2', user_name: 'Budi  Santoso' },
  ];
  const { matched, unmatchedZoom } = matchZoom([{ name: 'BUDI SANTOSO', minutes: 90 }], twins);
  assert.equal(matched.length, 0);
  assert.match(unmatchedZoom[0].reason, /ambiguous/);
});

test('matchZoom claims each student at most once', () => {
  const { matched, unmatchedStudents } = matchZoom(
    [{ name: 'TITA NOVIANA', minutes: 50 }, { name: 'TITA NOVIANA', minutes: 60 }],
    ROSTER,
  );
  assert.equal(matched.length, 2);
  assert.equal(unmatchedStudents.length, 3);
});

// ── lateness ──────────────────────────────────────────────────────────────────

test('lateThreshold marks a short attendance late and a full one on time', () => {
  assert.equal(lateThreshold(105, 105), false);
  assert.equal(lateThreshold(95, 105), false);
  assert.equal(lateThreshold(60, 105), true);
});

test('lateThreshold ignores a zero-minute row rather than calling it late', () => {
  assert.equal(lateThreshold(0, 105), false);
});

// ── Naskah → berita acara (ADR 0002) ──────────────────────────────────────────

test('parseSegments reads the section 7 table and skips its header rule', () => {
  const { body } = parseFrontmatter(NASKAH);
  const segments = parseSegments(body);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].menit, '0–7');
  assert.match(segments[2].bentuk, /Lab trio/);
});

test('buildAcara renders both fields from an approved Naskah', () => {
  const { plans, realizations, segments } = buildAcara(NASKAH);
  assert.equal(segments, 3);
  assert.match(plans, /Slot 105 menit \(18:15-20:00\)/);
  assert.match(plans, /CPMK-1, CPMK-5/);
  assert.match(plans, /Menit 0–7 Soft start dan catch-up\./);
  assert.match(plans, /Artefak: D1/);
  assert.ok(realizations.startsWith('Terlaksana sesuai rencana.'));
});

test('buildAcara refuses a Naskah that is not approved', () => {
  assert.throws(() => buildAcara(NASKAH.replace('status: approved', 'status: draft')), /expected "approved"/);
});

test('buildAcara refuses a Naskah with no segment table', () => {
  const stripped = NASKAH.replace(/## 7\.[\s\S]*?\n---\n/, '');
  assert.throws(() => buildAcara(stripped), /section 7/);
});

// ── NIM resolution (ADR 0003) ─────────────────────────────────────────────────

test('resolveNims maps known NIMs to user_data_id', () => {
  const { resolved, unknown } = resolveNims(['24120500011', '24120500022'], ROSTER);
  assert.deepEqual(resolved.map((r) => r.user_data_id), ['u1', 'u3']);
  assert.equal(unknown.length, 0);
});

test('resolveNims reports an unknown NIM instead of dropping it', () => {
  const { resolved, unknown } = resolveNims(['24120500011', '99999999999'], ROSTER);
  assert.equal(resolved.length, 1);
  assert.deepEqual(unknown, ['99999999999']);
});

test('resolveNims tolerates surrounding whitespace', () => {
  const { resolved, unknown } = resolveNims([' 24120500011 '], ROSTER);
  assert.equal(resolved.length, 1);
  assert.equal(unknown.length, 0);
});

// ── slot derivation ───────────────────────────────────────────────────────────

// BI is booked 18:00-20:00 (120) but taught 18:15-20:00 (105). Trusting the booked window
// marked a student who attended 100 of 105 minutes as TERLAMBAT.
const BI_BOOKED = { start: '2026-09-14T18:00:00+07:00', end: '2026-09-14T20:00:00+07:00' };

test('slotMinutes prefers the Naskah taught length over the booked window', () => {
  assert.equal(slotMinutes(BI_BOOKED, 'BI', 105), 105);
});

test('slotMinutes falls back to the booked window when there is no Naskah', () => {
  // SDLC sesi 1 is booked 18:30-20:00 = 90, which the vault CONTEXT.md gets wrong as 105.
  const sdlc = { start: '2026-09-11T18:30:00+07:00', end: '2026-09-11T20:00:00+07:00' };
  assert.equal(slotMinutes(sdlc, 'SDLC', null), 90);
  assert.equal(slotMinutes(BI_BOOKED, 'BI', null), 120);
});

test('slotMinutes falls back to the constant when the session carries no times', () => {
  assert.equal(slotMinutes({}, 'WAD', null), 120);
  assert.equal(slotMinutes({ start: 'nonsense', end: '' }, 'BI', null), 105);
});

test('slotMinutes ignores an end that precedes its start', () => {
  const bad = { start: '2026-09-11T20:00:00+07:00', end: '2026-09-11T18:30:00+07:00' };
  assert.equal(slotMinutes(bad, 'BI', null), 105);
});

test('slotMinutes ignores a zero or malformed Naskah slot', () => {
  assert.equal(slotMinutes(BI_BOOKED, 'BI', 0), 120);
  assert.equal(slotMinutes(BI_BOOKED, 'BI', NaN), 120);
});

test('a full-attendance student is on time against the taught slot, late against the booked one', () => {
  // The regression that prompted the fix, stated as the behaviour it protects.
  assert.equal(lateThreshold(100, slotMinutes(BI_BOOKED, 'BI', 105)), false);
  assert.equal(lateThreshold(100, slotMinutes(BI_BOOKED, 'BI', null)), true);
});

// ── material upload ───────────────────────────────────────────────────────────

test('attachKind maps a deck to the type RISE stores', () => {
  assert.deepEqual(attachKind('Sesi 03 - Slides.pdf'), { mime_type: 'application/pdf', file_category: 'document' });
  assert.deepEqual(attachKind('a.PPTX'), {
    mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    file_category: 'document',
  });
  assert.deepEqual(attachKind('clip.mp4'), { mime_type: 'video/mp4', file_category: 'video' });
});

test('attachKind refuses an extension RISE will not take, before uploading it', () => {
  assert.throws(() => attachKind('deck.key'), (err) => err.code === 'bad_input');
  assert.throws(() => attachKind('noextension'), (err) => err.code === 'bad_input');
});

test('materialDraft takes the title and description the Naskah already carries', () => {
  const draft = materialDraft(
    { topic: 'Data Warehousing and Dimensional Modeling', 'title-materi': 'Data Warehousing dan Dimensional Modeling Sesi 3', sub: '21 slide dimensional modeling' },
    3,
  );
  assert.equal(draft.title, 'Data Warehousing dan Dimensional Modeling Sesi 3');
  assert.equal(draft.description, '21 slide dimensional modeling');
});

test('materialDraft falls back to the topic when the Naskah has no title-materi', () => {
  const draft = materialDraft({ topic: 'Agile' }, 7);
  assert.equal(draft.title, 'Sesi 7 — Agile');
  assert.equal(draft.description, 'Agile — Sesi 7.');
});

test('materialPayload states the portal fields the create endpoint reads', () => {
  const payload = materialPayload({
    classId: 'class-1',
    scheduleId: 'sched-3',
    sesi: 3,
    title: 'Deck',
    description: 'desc',
    startDate: '2026-09-14T00:00:00.000Z',
    attachment: { doc_url: 'stored.pdf', original_name: 'Sesi 03 - Slides.pdf', mime_type: 'application/pdf', file_category: 'document', file_size: 42 },
  });
  assert.deepEqual(payload, {
    class_id: 'class-1',
    schedules_id: 'sched-3',
    schedules_session: 3,
    title: 'Deck',
    start_date: '2026-09-14T00:00:00.000Z',
    source_type: 'file',
    attachments: [{ doc_url: 'stored.pdf', original_name: 'Sesi 03 - Slides.pdf', mime_type: 'application/pdf', file_category: 'document', file_size: 42 }],
    description: 'desc',
  });
});

// ── discussion ────────────────────────────────────────────────────────────────

test('descriptionHtml wraps a single paragraph and linkifies a bare URL', () => {
  const html = descriptionHtml('Lihat https://example.com/path untuk detail.');
  assert.equal(html, '<p>Lihat <a href="https://example.com/path">https://example.com/path</a> untuk detail.</p>');
});

test('descriptionHtml escapes HTML-special characters before linkifying', () => {
  const html = descriptionHtml('<script>alert(1)</script> & lanjut');
  assert.equal(html, '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; lanjut</p>');
});

test('descriptionHtml splits on blank lines into separate paragraphs', () => {
  const html = descriptionHtml('Satu.\n\nDua.\n\nTiga.');
  assert.equal(html, '<p>Satu.</p><p>Dua.</p><p>Tiga.</p>');
});

test('descriptionHtml turns a single newline within a paragraph into <br>', () => {
  const html = descriptionHtml('Baris satu.\nBaris dua.');
  assert.equal(html, '<p>Baris satu.<br>Baris dua.</p>');
});

test('descriptionHtml drops empty paragraphs from extra blank lines', () => {
  const html = descriptionHtml('A.\n\n\n\nB.');
  assert.equal(html, '<p>A.</p><p>B.</p>');
});

test('descriptionHtml is total — empty and whitespace-only input yield no paragraphs', () => {
  assert.equal(descriptionHtml(''), '');
  assert.equal(descriptionHtml('   \n\n  '), '');
});

// ── tugas files (ADR 0005) ────────────────────────────────────────────────────

const tugasFile = (fm, body = 'Kerjakan.\n') => `---\n${fm}\n---\n\n${body}`;
const DUE = 'due: 2026-09-24T11:30:00Z';

test('parseTugasFile reads a complete file', () => {
  const t = parseTugasFile(tugasFile([
    'title: Tugas Sesi 3 — Scrum',
    'tugas-type: personal',
    DUE,
    'on-close: lock',
    'submit-attempt: 1',
    'max-file-size: 10485760',
  ].join('\n')));
  assert.equal(t.error, undefined);
  assert.equal(t.title, 'Tugas Sesi 3 — Scrum');
  assert.equal(t.type, 'personal');
  assert.equal(t.due, DUE.slice(5));
  assert.equal(t.onClose, 'lock');
  assert.equal(t.attempt, 1);
  assert.equal(t.maxFileSize, 10485760);
  assert.equal(t.description, 'Kerjakan.');
});

test('parseTugasFile defaults to personal / lock / 1x / 10 MB', () => {
  const t = parseTugasFile(tugasFile(`title: T\n${DUE}`));
  assert.deepEqual([t.type, t.onClose, t.attempt, t.maxFileSize], ['personal', 'lock', 1, 10485760]);
});

test('parseTugasFile refuses a file with no title, no due or no body', () => {
  assert.match(parseTugasFile(tugasFile(DUE)).error, /no title/);
  assert.match(parseTugasFile(tugasFile('title: T')).error, /no due/);
  assert.match(parseTugasFile(tugasFile(`title: T\n${DUE}`, '')).error, /no body/);
});

test('parseTugasFile rejects values RISE itself would refuse', () => {
  const base = `title: T\n${DUE}\n`;
  assert.match(parseTugasFile(tugasFile(`${base}tugas-type: kelompok`)).error, /personal or group/);
  assert.match(parseTugasFile(tugasFile(`${base}on-close: maybe`)).error, /close or lock/);
  assert.match(parseTugasFile(tugasFile(`${base}submit-attempt: 0`)).error, /1–5/);
  assert.match(parseTugasFile(tugasFile(`${base}submit-attempt: 6`)).error, /1–5/);
  assert.match(parseTugasFile(tugasFile(`${base}max-file-size: 1024`)).error, /max-file-size must be one of/);
  assert.match(parseTugasFile(tugasFile(`${base}due: sebelum Sesi 5`)).error, /ISO UTC instant/);
});

test('parseTugasFile refuses a due that Date.parse would silently accept', () => {
  // The trap this guards: Date.parse('Sesi 5') is 2001-04-30, not NaN. A truthiness check
  // on the parse result would publish a deadline from 2001.
  assert.ok(!Number.isNaN(Date.parse('Sesi 5')));
  assert.match(parseTugasFile(tugasFile('title: T\ndue: Sesi 5')).error, /ISO UTC instant/);
});

test('parseTugasFile accepts 20 MB and 5x, the far edge of both dropdowns', () => {
  const t = parseTugasFile(tugasFile(`title: T\n${DUE}\nsubmit-attempt: 5\nmax-file-size: 20971520`));
  assert.equal(t.error, undefined);
  assert.equal(t.attempt, 5);
  assert.equal(t.maxFileSize, 20971520);
});

test('parseTugasFile keeps frontmatter out of the description', () => {
  const t = parseTugasFile(tugasFile(`title: T\n${DUE}`, '  Baris satu.\n\nBaris dua.  '));
  assert.equal(t.description, 'Baris satu.\n\nBaris dua.');
  assert.ok(!t.description.includes('title:'));
});

// ── submissions (ADR 0006) ────────────────────────────────────────────────────

test('sanitizeFilename strips path separators from a student-controlled filename', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('Achmad Reza Subkhan-Sesi3.pdf'), 'Achmad_Reza_Subkhan-Sesi3.pdf');
  assert.equal(sanitizeFilename(''), 'file');
  assert.equal(sanitizeFilename(null), 'file');
});

test('slugify makes a filesystem-safe folder name from a student name', () => {
  assert.equal(slugify('Achmad Reza Subkhan'), 'achmad-reza-subkhan');
  assert.equal(slugify('  Ahmad Rafa Fahrezi  '), 'ahmad-rafa-fahrezi');
  assert.equal(slugify(''), 'unknown');
  assert.equal(slugify(undefined), 'unknown');
});

// ── summary ───────────────────────────────────────────────────────────────────

if (failed.length) {
  // The summary has to be unmissable: a bare pass count printed alongside failures once
  // let a red suite be reported as green.
  console.error(`\n✗ ${failed.length} FAILED, ${passed} passed`);
  for (const name of failed) console.error(`    ✗ ${name}`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} passed`);
}
