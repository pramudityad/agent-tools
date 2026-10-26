#!/usr/bin/env node
// @ts-check
// rps-deck — build instructor and student session decks from a reviewed spec.
//
// The spec `.md` is the single source of truth (ADR 0001): everything rendered is
// derived from it, never retyped alongside it.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ── spec grammar ──────────────────────────────────────────────────────────────

const SLIDE_RE = /^###\s+SLIDE\s+(\d+)\s+·\s+(.+?)\s*$/;
const FIELD_RE = /^\*\*([A-Z-]+)\*\*\s*(?:—\s*)?(.*)$/;
const STAMP_RE = /^`\[min\s+(\d+)\s+·\s+(\d{1,2}:\d{2})\]`\s*(.*)$/s;

// ── frontmatter ───────────────────────────────────────────────────────────────

/** Minimal YAML: `key: value`, quoted strings, integers. Enough for build params. */
function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim().replace(/^["'](.*)["']$/, '$1');
    frontmatter[kv[1]] = /^-?\d+$/.test(value) ? Number(value) : value;
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

// ── parseSpec ─────────────────────────────────────────────────────────────────

/**
 * Parse a reviewed spec into slides. Never throws on malformed input — a bad slide
 * lands in `errors` with its line, so nothing is silently dropped (ADR 0001).
 */
export function parseSpec(text) {
  const { frontmatter, body } = parseFrontmatter(text);
  const offset = text.slice(0, text.length - body.length).split('\n').length - 1;
  const lines = body.split('\n');
  const slides = [];
  const errors = [];
  let slide = null;
  let field = null;

  const closeField = () => {
    if (slide && field) slide[field.key] = field.lines.join('\n').trim();
    field = null;
  };

  lines.forEach((line, index) => {
    const lineNo = offset + index + 1;
    const slideMatch = SLIDE_RE.exec(line);
    if (slideMatch) {
      closeField();
      slide = {
        n: Number(slideMatch[1]),
        title: slideMatch[2],
        line: lineNo,
        visual: '',
        konten: '',
        kontenMahasiswa: '',
        notes: '',
        hold: false,
        unit: '',
        dur: null,
        flag: '',
        min: null,
        clock: '',
      };
      slides.push(slide);
      return;
    }
    if (!slide) return;

    const fieldMatch = FIELD_RE.exec(line);
    if (fieldMatch) {
      closeField();
      const [, name, inline] = fieldMatch;
      const key = FIELD_KEYS[name];
      if (!key) {
        errors.push({ line: lineNo, slide: slide.n, message: `unknown field **${name}**` });
        return;
      }
      if (key === 'hold') {
        slide.hold = true;
        return;
      }
      field = { key, lines: inline ? [inline] : [] };
      return;
    }
    if (field) field.lines.push(line);
  });
  closeField();

  for (const each of slides) {
    if (typeof each.dur === 'string') {
      const minutes = Number(each.dur.trim());
      if (!Number.isInteger(minutes) || minutes < 0) {
        errors.push({ line: each.line, slide: each.n, message: `slide ${each.n} has DUR "${each.dur}" — expected whole minutes` });
        each.dur = null;
      } else {
        each.dur = minutes;
      }
    }
    for (const required of REQUIRED_FIELDS) {
      if (!each[required.key]) {
        errors.push({
          line: each.line,
          slide: each.n,
          message: `slide ${each.n} has no **${required.name}**`,
        });
      }
    }
    const stamp = STAMP_RE.exec(each.notes);
    if (stamp) {
      each.min = Number(stamp[1]);
      each.clock = stamp[2];
      each.notes = stamp[3].trim();
    }
  }

  return { frontmatter, slides, errors };
}

const REQUIRED_FIELDS = [
  { name: 'VISUAL', key: 'visual' },
  { name: 'KONTEN', key: 'konten' },
  { name: 'NOTES', key: 'notes' },
];

const FIELD_KEYS = {
  VISUAL: 'visual',
  KONTEN: 'konten',
  'KONTEN-MAHASISWA': 'kontenMahasiswa',
  NOTES: 'notes',
  UNIT: 'unit',
  DUR: 'dur',
  FLAG: 'flag',
  HOLD: 'hold',
};

// ── validate ──────────────────────────────────────────────────────────────────

/** Wall-clock for `minutes` past `start` ("18:15"), as "HH:MM". */
function clockAt(start, minutes) {
  const [hh, mm] = start.split(':').map(Number);
  const total = hh * 60 + mm + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Checks the spec against its own frontmatter. The clock rule exists because the
 * Sesi 1 source note drifted 15 minutes mid-table and nobody noticed (ADR 0003).
 */
export function validate(spec) {
  const errors = [...spec.errors];
  const { frontmatter: fm, slides } = spec;
  const start = fm['slot-start'];
  const slotMinutes = fm['slot-minutes'];

  let previous = -1;
  for (const slide of slides) {
    if (slide.min === null) continue;
    if (start) {
      const expected = clockAt(start, slide.min);
      if (slide.clock && slide.clock !== expected) {
        errors.push({
          line: slide.line,
          slide: slide.n,
          message: `slide ${slide.n} stamped ${slide.clock}, but min ${slide.min} after ${start} is ${expected}`,
        });
      }
    }
    if (slide.min < previous) {
      errors.push({
        line: slide.line,
        slide: slide.n,
        message: `slide ${slide.n} runs backwards: min ${slide.min} follows min ${previous} — offsets must be monotonic`,
      });
    }
    previous = slide.min;
  }

  if (slotMinutes && previous > slotMinutes) {
    errors.push({
      line: 0,
      slide: 0,
      message: `last slide sits at min ${previous}, past the ${slotMinutes}-minute slot`,
    });
  }

  const timed = slides.filter((s) => s.dur !== null);
  if (timed.length) {
    if (timed.length !== slides.length) {
      errors.push({ line: 0, slide: 0, message: `${slides.length - timed.length} slide(s) have no DUR — either all slides declare one or none do` });
    }
    const total = timed.reduce((sum, s) => sum + s.dur, 0);
    if (slotMinutes && total !== slotMinutes) {
      const gap = slotMinutes - total;
      errors.push({
        line: 0,
        slide: 0,
        message: `Σ DUR is ${total} min, slot is ${slotMinutes} — ${gap > 0 ? `${gap} short` : `${-gap} over`}`,
      });
    }
  }

  // A logistics-only deck (exam or presentation session) has no teaching content to
  // expand, so the mandate would only invite invented padding.
  if (fm.mandate && fm['deck-type'] !== 'logistics') {
    const [low, high] = String(fm.mandate).split(/[-–]/).map(Number);
    if (slides.length < low || slides.length > high) {
      errors.push({
        line: 0,
        slide: 0,
        message: `${slides.length} slides is outside the ${low}–${high} mandate`,
      });
    }
  }

  return errors;
}

// ── slidev emit ───────────────────────────────────────────────────────────────
//
// ADR 0009: the Deck is a Slidev source derived from the approved naskah, never hand-edited.
// KONTEN passes through untouched; NOTES become the trailing presenter comment; HOLD maps to
// `class: hold`; each UNIT start opens with a section-divider slide; VISUAL is not rendered.

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME_DIR = join(HERE, 'slidev', 'theme-cakrawala');

/** A YAML scalar, quoted only when plain style would misparse. */
function yamlScalar(value) {
  const text = String(value);
  return /^[\s'"#&*!|>%@`\-?[\]{},]|: | #|\s$/.test(text) ? JSON.stringify(text) : text;
}

function yamlBlock(map) {
  return Object.entries(map).map(([key, value]) => `${key}: ${yamlScalar(value)}`).join('\n');
}

export function renderSlidev(spec) {
  if (!spec.slides.length) throw new Error('renderSlidev: naskah has no slides');
  const fm = spec.frontmatter;
  const head = {
    theme: THEME_DIR,
    title: [fm.course, fm.topic].filter(Boolean).join(' · ') || 'Slides',
  };
  const slides = [];
  let unit = '';
  for (const slide of spec.slides) {
    if (slide.unit && slide.unit !== unit) {
      slides.push({ fm: { layout: 'section' }, body: `# ${slide.unit}` });
    }
    if (slide.unit) unit = slide.unit;
    const heading = /^#/.test(slide.konten) ? '' : `## ${slide.title}\n\n`;
    const stamp = slide.clock ? `[min ${String(slide.min).padStart(3, '0')} · ${slide.clock}] ` : '';
    const notes = `${stamp}${slide.notes}`.replaceAll('-->', '--&gt;');
    slides.push({
      fm: slide.hold ? { class: 'hold' } : {},
      body: `${heading}${slide.konten}\n\n<!--\n${notes}\n-->`,
    });
  }
  // Slidev reads the first frontmatter block as both headmatter and slide 1's own.
  const [first, ...rest] = slides;
  const out = [`---\n${yamlBlock({ ...head, ...first.fm })}\n---\n\n${first.body}`];
  for (const slide of rest) {
    const frontmatter = Object.keys(slide.fm).length ? `${yamlBlock(slide.fm)}\n---\n` : '';
    out.push(`---\n${frontmatter}\n${slide.body}`);
  }
  return `${out.join('\n\n')}\n`;
}

// ── slidev export ─────────────────────────────────────────────────────────────
//
// deck.mjs stays zero-dependency: it only spawns the Slidev binary of the pinned workspace
// in `slidev/` (ADR 0009). The workspace is run from its own directory so the entry file
// can live next to the naskah — Slidev resolves the theme by absolute path (see
// references/slidev.md).

const SLIDEV_DIR = process.env.RPS_DECK_SLIDEV_DIR ?? join(HERE, 'slidev');
const EXPORT_TIMEOUT_MS = 180000;

function findSlidev() {
  const bin = join(SLIDEV_DIR, 'node_modules', '.bin', 'slidev');
  if (existsSync(bin)) return { ok: true, bin };
  return {
    ok: false,
    message: `Slidev workspace not installed at ${SLIDEV_DIR}. Fix: cd "${SLIDEV_DIR}" && npm install && npx playwright-chromium install chromium`,
  };
}

/** Exports a Slidev source to `outPath` in the given format. */
function exportSlidev(bin, mdPath, outPath, format) {
  const result = spawnSync(bin, ['export', resolve(mdPath), '--format', format, '--output', resolve(outPath)], {
    cwd: SLIDEV_DIR,
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: EXPORT_TIMEOUT_MS,
  });
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0 || !existsSync(outPath)) {
    const stderr = result.stderr ? result.stderr.toString().trim().split('\n').slice(-3).join(' | ').slice(0, 300) : '';
    return { ok: false, message: `slidev exited ${result.status} — ${stderr || 'no file written'}. If Chromium is missing: cd "${SLIDEV_DIR}" && npx playwright-chromium install chromium` };
  }
  return { ok: true };
}

// ── residual scan ─────────────────────────────────────────────────────────────
//
// Renaming the employer is the easy half. The Sesi 1 run showed the rest hides in
// vendor names, partner codes and product SKUs, so the generic classes below run
// whether or not the map mentions them (see SANITISE.md).

const GENERIC = [
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // Requires a real host label: schema docs elide URLs as `https://...`, which leaks nothing.
  { kind: 'url', re: /https?:\/\/[A-Za-z0-9][^\s)"']*/g },
  { kind: 'phone', re: /\+62[\s-]?\d[\d\s-]{6,}/g },
  { kind: 'credential', re: /\b(?:api[_-]?key|secret|password|bearer|access[_-]?token)\b\s*[:=]/gi },
  { kind: 'work-tag', re: /#work\/[\w-]+/g },
  { kind: 'vault-path', re: /\b0[0-9]-[A-Z][A-Za-z]+\/[^\s)"']+/g },
];

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every remaining trace of `map`'s keys, plus the generic classes. Case-insensitive:
 * the source carried both `BILLFAZZ` and `BillFazz`, and missing either ships the name.
 */
export function scanResiduals(text, map) {
  const hits = [];
  const mapped = Object.keys(map).map((key) => new RegExp(escapeRe(key), 'gi'));
  text.split('\n').forEach((line, index) => {
    for (const re of mapped) {
      re.lastIndex = 0;
      for (const found of line.matchAll(re)) {
        hits.push({ line: index + 1, kind: 'mapped', match: found[0], text: line.trim() });
      }
    }
    for (const { kind, re } of GENERIC) {
      for (const found of line.matchAll(new RegExp(re.source, re.flags))) {
        hits.push({ line: index + 1, kind, match: found[0], text: line.trim() });
      }
    }
  });
  return hits;
}

/** Applies the rename map. Longest keys first, so `BILLFAZZ` cannot be eaten by `BILL`. */
export function applyMap(text, map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = text;
  for (const key of keys) out = out.replace(new RegExp(escapeRe(key), 'g'), map[key]);
  return out;
}

// ── restamp ───────────────────────────────────────────────────────────────────

const STAMP_ANY = /^`\[min \d+ · \d{1,2}:\d{2}\]`\s*/;

/**
 * Rewrites every `[min · clock]` from the DUR budget. Hand-computing these was the
 * single biggest authoring cost, and a stamp that drifts from its segment is invisible
 * until someone is standing in front of the room (ADR 0006).
 */
export function restamp(text) {
  const spec = parseSpec(text);
  const errors = validate(spec).filter((e) => /DUR/.test(e.message));
  if (errors.length) return { text, errors };
  if (!spec.slides.some((s) => s.dur !== null)) return { text, errors: [] };

  const start = spec.frontmatter['slot-start'];
  let minute = 0;
  const wanted = new Map();
  for (const slide of spec.slides) {
    wanted.set(slide.n, `\`[min ${String(minute).padStart(3, '0')} · ${clockAt(start, minute)}]\` `);
    minute += slide.dur ?? 0;
  }

  let current = null;
  const out = text.split('\n').map((line) => {
    const slideMatch = SLIDE_RE.exec(line);
    if (slideMatch) {
      current = Number(slideMatch[1]);
      return line;
    }
    if (current === null || !line.startsWith('**NOTES**')) return line;
    const body = line.slice('**NOTES**'.length).trimStart().replace(STAMP_ANY, '');
    return `**NOTES** ${wanted.get(current)}${body}`;
  });
  return { text: out.join('\n'), errors: [] };
}

// ── materi.md ─────────────────────────────────────────────────────────────────

const GENERATED_BANNER = [
  '> [!warning] Berkas ini dihasilkan — jangan disunting',
  '> Dihasilkan dari naskah dengan `deck.mjs render`. Suntingan di sini akan hilang pada',
  '> render berikutnya. Ubah naskahnya, lalu render ulang.',
].join('\n');

/**
 * The student-facing markdown. Built by re-emitting the slides rather than by deleting
 * lines, so NOTES and VISUAL are never written rather than stripped afterwards (ADR 0002).
 */
export function renderMateri(text) {
  const spec = parseSpec(text);
  const fm = spec.frontmatter;
  const out = [
    '---',
    'type: session-materi',
    `course: ${fm.course ?? ''}`,
    `session: ${fm.session ?? ''}`,
    'generated: true',
    '---',
    '',
    `# ${fm.topic ?? fm.course ?? 'Materi'}`,
    '',
    GENERATED_BANNER,
    '',
  ];
  for (const slide of spec.slides) {
    out.push(`## ${slide.n} · ${slide.title}`, '');
    if (slide.hold) out.push('*Tahan di layar selama blok kerja.*', '');
    out.push(slide.kontenMahasiswa || slide.konten, '');
  }
  return out.join('\n');
}

// ── approval ──────────────────────────────────────────────────────────────────

const APPROVAL_KEYS = ['status', 'approved-sha256', 'approved-on'];

const withoutApproval = (text) => text
  .split('\n')
  .filter((line) => !APPROVAL_KEYS.some((key) => line.startsWith(`${key}:`)))
  .join('\n');

/** Hash of the naskah with its own approval lines removed, so stamping is stable. */
const approvalDigest = (text) => createHash('sha256').update(withoutApproval(text)).digest('hex');

/** Stamps approval into the frontmatter, replacing any previous stamp. */
export function approve(text, today) {
  const stripped = withoutApproval(text);
  const stamp = [
    'status: approved',
    `approved-sha256: ${approvalDigest(stripped)}`,
    `approved-on: ${today}`,
  ].join('\n');
  const end = stripped.indexOf('\n---', 4);
  return `${stripped.slice(0, end)}\n${stamp}${stripped.slice(end)}`;
}

/**
 * Approval is bound to content, because the failure worth stopping is approve → tweak →
 * ship: the thing that reaches the room was never the thing that was reviewed.
 */
export function approvalState(text) {
  const { frontmatter } = parseSpec(text);
  if (frontmatter.status !== 'approved' || !frontmatter['approved-sha256']) {
    return { state: 'unapproved', message: 'not approved — run `deck.mjs approve`' };
  }
  if (approvalDigest(text) !== frontmatter['approved-sha256']) {
    return {
      state: 'stale',
      message: `changed since approval on ${frontmatter['approved-on']} — re-review, then approve again`,
    };
  }
  return { state: 'approved', message: `approved ${frontmatter['approved-on']}` };
}

// ── course status ─────────────────────────────────────────────────────────────

// Matches any per-sesi file, naskah included — the sesi number is what's wanted, not
// which file carries it (a session note may drift in topic wording, never in number).
const SESI_FILE_RE = /^Sesi (\d+) - .+\.md$/i;

/** Every distinct sesi number named by a file in the course dir, sorted ascending. */
function sesiNumbers(files) {
  const numbers = new Set();
  for (const file of files) {
    const match = file.match(SESI_FILE_RE);
    if (match) numbers.add(match[1]);
  }
  return [...numbers].sort((a, b) => Number(a) - Number(b));
}

// Slides is sometimes built with a "<course> - Sesi NN - Slides.*" prefix and sometimes
// without (older sesi in the real vault carry no prefix) — a suffix match covers both
// without guessing which convention a given course folder settled on.
const anyEndsWith = (files, suffix) => files.some((f) => f.endsWith(suffix));

/**
 * One row per sesi number: naskah state (missing | draft | approved | stale, reusing
 * approvalState's own hash check), and whether Slides/Materi were built. Read-only.
 */
export function courseStatus(courseDir) {
  const files = readdirSync(courseDir);
  return sesiNumbers(files).map((n) => {
    const naskahName = `Sesi ${n} - Naskah.md`;
    let naskah = 'missing';
    if (files.includes(naskahName)) {
      const text = readFileSync(join(courseDir, naskahName), 'utf8');
      const state = approvalState(text).state;
      naskah = state === 'unapproved' ? 'draft' : state;
    }
    return {
      n,
      naskah,
      slides: anyEndsWith(files, `Sesi ${n} - Slides.pdf`) || anyEndsWith(files, `Sesi ${n} - Slides.pptx`),
      materi: anyEndsWith(files, `Sesi ${n} - Materi.md`),
    };
  });
}

// ── slot truth (ADR 0008) ───────────────────────────────────────────────────────
//
// The real slot lives in `slots.json`, beside this file, keyed by the naskah's `course`
// frontmatter. A course with one start time per night (BI, WAD) uses `start`/`minutes`.
// SDLC runs two sesi a night at different times, so it uses `oddStart`/`evenStart` (both
// `minutes` long) and parity comes from the naskah's `session` field — the field name
// `build` already reads (see `cmdBuild`). This shape was chosen over one row per sesi
// number because only the parity matters, not the specific sesi.

const SLOTS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'slots.json');

function loadSlots() {
  return JSON.parse(readFileSync(SLOTS_PATH, 'utf8'));
}

/** Resolves one course table entry to the real {start, minutes} for this naskah's sesi. */
function realSlot(entry, session) {
  if (!entry.oddStart) return { start: entry.start, minutes: entry.minutes };
  if (!Number.isInteger(session)) return null;
  return { start: session % 2 === 1 ? entry.oddStart : entry.evenStart, minutes: entry.minutes };
}

/**
 * Compares a naskah's declared `slot-start`/`slot-minutes` against the real slot table.
 * A course missing from the table refuses outright — never guessed or defaulted.
 */
export function checkSlotTruth(fm, table) {
  const course = fm.course;
  const entry = table[course];
  if (!entry) {
    return [{ line: 0, slide: 0, message: `unknown course "${course ?? '(none)'}" — ask the lecturer for the real slot` }];
  }
  const real = realSlot(entry, fm.session);
  if (!real) {
    return [{ line: 0, slide: 0, message: `${course} needs a numeric "session" field to pick its odd/even slot — found session=${fm.session ?? '(none)'}` }];
  }
  const errors = [];
  if (fm['slot-start'] !== real.start) {
    errors.push({ line: 0, slide: 0, message: `slot-start "${fm['slot-start'] ?? '(none)'}" disagrees with the real ${course} slot (${real.start})` });
  }
  if (fm['slot-minutes'] !== real.minutes) {
    errors.push({ line: 0, slide: 0, message: `slot-minutes ${fm['slot-minutes'] ?? '(none)'} disagrees with the real ${course} slot (${real.minutes} min)` });
  }
  return errors;
}

// ── RPS contract ──────────────────────────────────────────────────────────────
//
// Two tables are well-formed enough to parse and vary per session; three prose blocks
// live inside single table cells, change roughly never, and are handed to the agent to
// read instead of parsed (ADR 0005).

// Mapped by header name, never by position: BI carries a CPMK column and the other two
// courses do not, so a fixed 7-column signature silently shifts every field.
const WEEKLY_REQUIRED = ['sesi', 'bobot', 'sub-cpmk', 'penilaian', 'metode', 'materi'];
const WEEKLY_ALL = ['sesi', 'bobot', 'cpmk', 'sub-cpmk', 'penilaian', 'metode', 'materi'];
const PROSE_BLOCKS = {
  bobot: /BOBOT PENILAIAN/i,
  ketentuan: /Ketentuan Penilaian/i,
  pustaka: /PUSTAKA UTAMA/i,
};

const cellsOf = (line) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const plain = (cell) => cell.replace(/\*\*/g, '').trim();

/** Extracts one session's row plus the rubric, and locates the prose blocks. */
export function parseRps(text, session) {
  const lines = text.split('\n');
  let row = null;
  const rubric = [];
  const blocks = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [name, re] of Object.entries(PROSE_BLOCKS)) {
      if (!blocks[name] && re.test(line)) blocks[name] = index + 1;
    }
    if (!line.trim().startsWith('|')) continue;
    const headers = cellsOf(line).map((c) => plain(c).toLowerCase());

    if (!row && WEEKLY_REQUIRED.every((col) => headers.includes(col))) {
      const columns = Object.fromEntries(WEEKLY_ALL.map((c) => {
        const position = headers.indexOf(c);
        return [c, position === -1 ? null : position];
      }));
      for (let scan = index + 2; scan < lines.length && lines[scan].trim().startsWith('|'); scan += 1) {
        const cells = cellsOf(lines[scan]).map(plain);
        const pick = (name) => (columns[name] === null ? '' : cells[columns[name]] ?? '');
        if (Number(pick('sesi')) !== session) continue;
        const materi = pick('materi');
        row = {
          sesi: session,
          bobot: pick('bobot'),
          cpmk: pick('cpmk'),
          subCpmk: pick('sub-cpmk'),
          penilaian: pick('penilaian'),
          metode: pick('metode'),
          materi,
          materiTopics: materi.split(';').map((topic) => topic.trim()).filter(Boolean),
          line: scan + 1,
        };
        break;
      }
    }

    if (headers[0] === 'kriteria' && headers[1] === 'bobot') {
      for (let scan = index + 2; scan < lines.length && lines[scan].trim().startsWith('|'); scan += 1) {
        const cells = cellsOf(lines[scan]).map(plain);
        rubric.push({ kriteria: cells[0], bobot: cells[1] });
      }
    }
  }

  if (!row) throw new Error(`sesi ${session} not found in the RPS weekly table`);
  return { row, rubric, blocks };
}

// ── verbatim sub-CPMK (ticket 10) ───────────────────────────────────────────────
//
// A naskah quoting the RPS row's sub-CPMK must quote it exactly, whitespace aside — a
// line-wrapped copy is still the same sentence, a paraphrase is not. Pure comparison only:
// no naskah currently has one fixed place a quote lives (frontmatter field, marked
// section), so there is nothing yet to extract automatically — see SKILL.md.

const normaliseWhitespace = (text) => text.replace(/\s+/g, ' ').trim();

/** Compares a naskah's quoted sub-CPMK against the RPS row's text, whitespace aside. */
export function checkVerbatimSubCpmk(quoted, official) {
  if (normaliseWhitespace(quoted) === normaliseWhitespace(official)) return [];
  return [{
    line: 0,
    slide: 0,
    message: `sub-CPMK is not verbatim from the RPS — quoted: "${quoted}" — official: "${official}"`,
  }];
}

// ── extraction ────────────────────────────────────────────────────────────────
//
// Sanitising a 989-line implementation plan produces a 989-line file, which is not what
// a one-page classroom handout needs. Which sections to keep is judgement; cutting them
// out once chosen is not (ADR 0004).

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

/** One or more named sections (with their nested subsections), or a 1-indexed line range. */
export function extract(text, { section, lines } = {}) {
  if (lines) {
    const [from, to] = String(lines).split('-').map(Number);
    return text.split('\n').slice(from - 1, to).join('\n');
  }
  if (!section) return text;

  const asked = Array.isArray(section) ? section : [section];
  const wanted = asked.map((s) => s.toLowerCase());
  const all = text.split('\n');
  const kept = [];
  const found = new Set();

  for (let index = 0; index < all.length; index += 1) {
    const heading = HEADING_RE.exec(all[index]);
    if (!heading) continue;
    const name = heading[2].toLowerCase();
    if (!wanted.some((w) => name.includes(w))) continue;
    found.add(wanted.find((w) => name.includes(w)));
    const depth = heading[1].length;
    kept.push(all[index]);
    for (let scan = index + 1; scan < all.length; scan += 1) {
      const next = HEADING_RE.exec(all[scan]);
      // A deeper heading belongs to this section; a same-or-shallower one ends it.
      if (next && next[1].length <= depth) break;
      kept.push(all[scan]);
    }
    kept.push('');
  }

  // Echo what was asked for, not the lowercased form used to match it.
  const missing = asked.filter((s) => !found.has(s.toLowerCase()));
  if (missing.length) throw new Error(`section not found: ${missing.join(', ')}`);
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── cli ───────────────────────────────────────────────────────────────────────

const OPTION_KEYS = new Set(['section', 'lines']);

function parseArgs(argv) {
  const flags = new Set();
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const name = arg.slice(2);
    if (name.includes('=')) {
      const [key, ...rest] = name.split('=');
      options[key] = rest.join('=');
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--') && OPTION_KEYS.has(name)) {
      options[name] = argv[i + 1];
      i += 1;
    } else {
      flags.add(name);
    }
  }
  return { command: positional[0], args: positional.slice(1), flags, options };
}

const USAGE = `rps-deck — build session decks from a naskah you author and review

  session  <n> <rps.md>              read the RPS contract for one session
  restamp  <naskah.md>               recompute every clock stamp from DUR
  check    <naskah.md>               validate the naskah
  render   <naskah.md>               emit the student-facing Materi.md
  approve  <naskah.md>               stamp approval, bound to the content hash
  build    <naskah.md>               requires approval; emits "<course> - Sesi NN - Slides.md/.pdf/.pptx"
  status   <course-dir>              one row per sesi: naskah state, Slides/Materi present
  scan     <file> <map.json>         residual identifier scan
  sanitise <src> <map.json> <dst>    apply the map, then scan the result
             [--section "A|B"]       keep only these sections (with subsections)
             [--lines 20-90]         keep only this line range

The naskah .md is the source of truth; everything else is derived.`;

function reportErrors(errors) {
  for (const error of errors) {
    const where = error.line ? ` (line ${error.line})` : '';
    console.error(`  ✗ ${error.message}${where}`);
  }
}

/** Loads a naskah and refuses to go further while it is invalid. */
function loadNaskah(path) {
  const text = readFileSync(path, 'utf8');
  const spec = parseSpec(text);
  const errors = validate(spec);
  return { text, spec, errors };
}

const cmdSession = ({ args }) => {
  const [number, rpsPath] = [Number(args[0]), args[1]];
  if (!number || !rpsPath) {
    console.error('  ✗ usage: session <n> <rps.md>');
    return 1;
  }
  let parsed;
  try {
    parsed = parseRps(readFileSync(rpsPath, 'utf8'), number);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    return 1;
  }
  const { row, rubric, blocks } = parsed;
  console.log(`✓ sesi ${row.sesi} · bobot ${row.bobot} · CPMK ${row.cpmk}   (line ${row.line})`);
  console.log(`    sub-cpmk : ${row.subCpmk}`);
  console.log(`    penilaian: ${row.penilaian}`);
  console.log(`    metode   : ${row.metode}`);
  console.log(`    materi   : ${row.materiTopics.length} topik`);
  for (const topic of row.materiTopics) console.log(`               · ${topic}`);
  if (rubric.length) {
    console.log(`✓ rubrik   : ${rubric.map((r) => `${r.kriteria} ${r.bobot}`).join(' · ')}`);
  }
  console.log('› blok prosa — baca sendiri, tidak diparse:');
  for (const [name, line] of Object.entries(blocks)) {
    console.log(`    ${name.padEnd(10)} line ${line}`);
  }
  return 0;
};

const cmdRestamp = ({ args }) => {
  const path = args[0];
  const original = readFileSync(path, 'utf8');
  const { text, errors } = restamp(original);
  if (errors.length) {
    console.error(`✗ ${basename(path)}`);
    reportErrors(errors);
    return 1;
  }
  const spec = parseSpec(text);
  const total = spec.slides.reduce((sum, s) => sum + (s.dur ?? 0), 0);
  if (text === original) {
    console.log(`✓ ${basename(path)} — ${spec.slides.length} slides · Σ DUR ${total} · stamps already correct`);
    return 0;
  }
  writeFileSync(path, text);
  console.log(`✓ ${basename(path)} — ${spec.slides.length} slides · Σ DUR ${total} = slot · stamps rewritten`);
  return 0;
};

const cmdCheck = ({ args }) => {
  const path = args[0];
  if (!path) {
    console.error('  ✗ no naskah given');
    return 1;
  }
  const { spec, errors } = loadNaskah(path);
  const allErrors = [...errors, ...checkSlotTruth(spec.frontmatter, loadSlots())];
  if (allErrors.length) {
    console.error(`✗ ${basename(path)} — ${allErrors.length} problem(s)`);
    reportErrors(allErrors);
    return 1;
  }
  console.log(`✓ ${basename(path)} — ${spec.slides.length} slides, clock consistent`);
  const open = spec.slides.filter((s) => s.flag);
  if (open.length) console.log(`  ⚠ ${open.length} open FLAG(s)`);
  return 0;
};

const cmdRender = ({ args }) => {
  const path = args[0];
  const { text, errors } = loadNaskah(path);
  if (errors.length) {
    console.error(`✗ ${basename(path)} — fix the naskah first`);
    reportErrors(errors);
    return 1;
  }
  const target = join(dirname(path), basename(path).replace(/Naskah\.md$/i, 'Materi.md'));
  if (target === path) {
    console.error('  ✗ naskah filename must end in "Naskah.md" so the materi has a name');
    return 1;
  }
  const materi = renderMateri(text);
  if (/\*\*NOTES\*\*|\*\*VISUAL\*\*/.test(materi)) {
    console.error('  ✗ materi leaked an instructor field — refusing to write');
    return 1;
  }
  writeFileSync(target, materi);
  console.log(`  ✓ ${basename(target)} — generated, do not edit`);
  return 0;
};

const cmdApprove = ({ args }) => {
  const path = args[0];
  const { text, errors } = loadNaskah(path);
  if (errors.length) {
    console.error(`✗ ${basename(path)} — cannot approve an invalid naskah`);
    reportErrors(errors);
    return 1;
  }
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(path, approve(text, today));
  console.log(`  ✓ ${basename(path)} approved · ${today}`);
  return 0;
};

/**
 * `build` is the single, unconditional gate: nothing unresolved, then reviewed and
 * approved, only then does a projectable file exist at all. There is no lesser "preview"
 * mode — a tool that can be asked to emit an unapproved deck eventually will be. A stray
 * `--final` is accepted as a no-op so old habit still works.
 */
const cmdBuild = ({ args }) => {
  const path = args[0];
  if (!path) {
    console.error('  ✗ no naskah given');
    return 1;
  }
  const { text, spec, errors } = loadNaskah(path);
  if (errors.length) {
    console.error(`✗ ${basename(path)} — ${errors.length} problem(s)`);
    reportErrors(errors);
    return 1;
  }
  const open = spec.slides.filter((s) => s.flag);
  if (open.length) {
    console.error(`✗ ${open.length} open FLAG blocks release:`);
    reportErrors(open.map((s) => ({ line: s.line, message: `slide ${s.n} — ${s.flag}` })));
    return 1;
  }
  const approval = approvalState(text);
  if (approval.state !== 'approved') {
    console.error(`✗ ${basename(path)} — ${approval.message}`);
    return 1;
  }
  console.log(`  ✓ ${approval.message}`);

  const fm = spec.frontmatter;
  const course = fm.course ?? basename(dirname(path));
  const label = fm.session !== undefined
    ? `${course} - Sesi ${String(fm.session).padStart(2, '0')}`
    : course;
  const dir = fm.out ? join(dirname(path), fm.out) : dirname(path);

  // Check the tooling before writing anything: a missing workspace must never leave a
  // Slides.md behind that looks like a finished build.
  const slidevBin = findSlidev();
  if (!slidevBin.ok) {
    console.error(`✗ ${slidevBin.message}`);
    return 1;
  }

  const mdPath = join(dir, `${label} - Slides.md`);
  writeFileSync(mdPath, renderSlidev(spec));
  console.log(`  ✓ ${basename(mdPath)}`);

  const pdfPath = join(dir, `${label} - Slides.pdf`);
  const pdf = exportSlidev(slidevBin.bin, mdPath, pdfPath, 'pdf');
  if (!pdf.ok) {
    console.error(`✗ ${basename(pdfPath)} — ${pdf.message}`);
    return 1;
  }
  console.log(`  ✓ ${basename(pdfPath)}`);

  // The editable PPTX is a convenience; the PDF is what goes to RISE, so it only warns.
  const pptxPath = join(dir, `${label} - Slides.pptx`);
  const pptx = exportSlidev(slidevBin.bin, mdPath, pptxPath, 'pptx-editable');
  if (pptx.ok) console.log(`  ✓ ${basename(pptxPath)}`);
  else console.log(`  ⚠ ${basename(pptxPath)} skipped — ${pptx.message}`);
  return 0;
};

/** Read-only report, never a gate: it always exits 0, even on a bad path. */
const cmdStatus = ({ args }) => {
  const dir = args[0];
  if (!dir) {
    console.error('  ✗ usage: status <course-dir>');
    return 0;
  }
  let rows;
  try {
    rows = courseStatus(dir);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    return 0;
  }
  if (!rows.length) {
    console.log('  (no Sesi NN files found)');
    return 0;
  }
  for (const row of rows) {
    console.log(
      `  Sesi ${row.n}  naskah: ${row.naskah.padEnd(8)} slides: ${row.slides ? 'yes' : 'no '} materi: ${row.materi ? 'yes' : 'no '}`,
    );
  }
  const next = rows.find((row) => row.naskah !== 'approved');
  console.log(next ? `→ Sesi ${next.n} has no approved naskah` : '→ every sesi has an approved naskah');
  return 0;
};

const cmdScan = ({ command, args, options }) => {
  const [source, mapPath, destination] = args;
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  let text;
  if (command === 'scan') {
    text = readFileSync(source, 'utf8');
  } else {
    const sections = options.section ? options.section.split('|') : null;
    try {
      text = applyMap(extract(readFileSync(source, 'utf8'), { section: sections, lines: options.lines }), map);
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      return 1;
    }
  }
  const hits = scanResiduals(text, map);
  if (hits.length) {
    console.error(`✗ ${hits.length} residual(s):`);
    for (const hit of hits.slice(0, 40)) console.error(`  line ${hit.line} [${hit.kind}] ${hit.match}`);
    return 1;
  }
  if (command === 'sanitise') {
    writeFileSync(destination, text);
    // The map lives beside its output: one source artifact is reused by many sessions,
    // and re-deriving it each time is how identifiers get missed.
    const mapBeside = `${destination.replace(/\.md$/, '')}.map.json`;
    writeFileSync(mapBeside, `${JSON.stringify(map, null, 2)}\n`);
    console.log(`  ✓ ${basename(destination)} — ${text.split('\n').length} lines, scan clean`);
    console.log(`  ✓ ${basename(mapBeside)} — map kept for reuse`);
  } else {
    console.log('  ✓ scan clean');
  }
  return 0;
};

const COMMANDS = {
  session: cmdSession,
  restamp: cmdRestamp,
  check: cmdCheck,
  render: cmdRender,
  approve: cmdApprove,
  build: cmdBuild,
  status: cmdStatus,
  scan: cmdScan,
  sanitise: cmdScan,
};

function main() {
  const context = parseArgs(process.argv.slice(2));
  if (!context.command || context.flags.has('help')) {
    console.log(USAGE);
    return 0;
  }
  const run = COMMANDS[context.command];
  if (!run) {
    console.error(`unknown command: ${context.command}\n\n${USAGE}`);
    return 1;
  }
  return run(context);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
