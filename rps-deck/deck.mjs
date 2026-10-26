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
    for (const bad of unknownMarkers(each.konten)) {
      errors.push({
        line: each.line,
        slide: each.n,
        message: `unknown marker ${bad} — see FORMAT.md, or lowercase it if it is prose`,
      });
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

// Line-leading ALL-CAPS tokens are structure, not prose. An unrecognised one is a typo
// that would otherwise render as literal text on a slide, so it fails the parse instead.
const MARKERS = new Set(['LEAD', 'FINE', 'SPLIT', 'STRUCK', 'PANEL', 'NUM', 'LABEL', 'VEIL', 'TODO', 'HI', 'MARK', 'DIAGRAM', 'IMAGE']);
const MARKER_RE = /^\s*([A-Z][A-Z-]{2,})\b\s*:?/;

function unknownMarkers(konten) {
  const found = [];
  for (const line of konten.split('\n')) {
    if (line.trimStart().startsWith('|')) continue;
    const match = MARKER_RE.exec(line);
    if (match && !MARKERS.has(match[1])) found.push(match[1]);
  }
  return found;
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

// ── konten rendering ──────────────────────────────────────────────────────────
//
// A marker is a word plus a space, applied to the segment it starts — segments being
// `|`-delimited inside tables and panels, or the whole line otherwise. One rule, so
// the grammar stays small enough to hold in your head while reviewing a spec.

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline Markdown subset: code, bold, italic, strikethrough. */
const CLASS_OF = { NUM: 'pnum', LABEL: 'plabel', FINE: 'fine', VEIL: 'veil', TODO: 'todo', HI: 'hi' };
const BRACED_RE = /\b(NUM|LABEL|FINE|VEIL|TODO|HI)\{([^}]*)\}/g;

function inline(text) {
  return escapeHtml(text)
    .replace(BRACED_RE, (_, marker, body) => `@@${marker}@@${body}@@END@@`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    // Braced markers bound the accent to one word, so a sentence can carry several.
    .replace(/@@([A-Z]+)@@([\s\S]*?)@@END@@/g, (_, marker, body) => `<span class="${CLASS_OF[marker]}">${body}</span>`);
}

// Inline markers run from where they appear to the end of the segment, because that is
// how the content reads: "Jumlah baris: TODO UKUR SEBELUM KELAS" puts the label first.
const INLINE_RE = /\b(NUM|LABEL|FINE|VEIL|TODO|HI)\s+/;

/** Applies a marker to the rest of its segment, or renders ordinary inline text. */
function segment(raw) {
  const text = raw.trim();
  const found = INLINE_RE.exec(text);
  if (!found) return inline(text);
  const prefix = text.slice(0, found.index);
  const marker = found[1];
  const rest = text.slice(found.index + found[0].length);
  const wrap = (cls) => `${prefix ? inline(prefix) : ''}<span class="${cls}">${inline(rest)}</span>`;
  if (marker === 'NUM') return wrap('pnum');
  if (marker === 'LABEL') return wrap('plabel');
  if (marker === 'FINE') return wrap('fine');
  if (marker === 'VEIL') return wrap('veil');
  if (marker === 'TODO') return wrap('todo');
  if (marker === 'HI') return wrap('hi');
  return inline(text);
}

function renderTable(rows) {
  const cells = (row) => row.replace(/^\||\|$/g, '').split('|');
  const head = cells(rows[0]).map((c) => `<th>${segment(c)}</th>`).join('');
  const body = rows.slice(2).map((row) => {
    const raw = cells(row);
    const marked = raw.some((c) => c.trim() === 'MARK');
    const tds = raw
      .filter((c) => c.trim() !== 'MARK')
      .map((c) => `<td>${segment(c)}</td>`)
      .join('');
    return `<tr${marked ? ' class="mark"' : ''}>${tds}</tr>`;
  }).join('');
  return `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderPanels(lines) {
  const panels = [];
  for (const line of lines) {
    const text = line.trim();
    if (text.startsWith('PANEL')) {
      const parts = text.slice(5).split('|').map((p) => p.trim());
      const label = parts[0];
      // A variant carries meaning on slides that contrast a rejected answer with an
      // accepted one, so it is grammar rather than styling.
      const variant = parts.find((p) => p === 'BAD' || p === 'GOOD');
      const rest = parts.slice(1).filter((p) => p !== 'BAD' && p !== 'GOOD').map(segment).join('');
      const head = label ? `<span class="plabel">${inline(label)}</span>` : '';
      panels.push(`<div class="panel${variant ? ` ${variant.toLowerCase()}` : ''}">${head}${rest}`);
    } else if (panels.length) {
      panels[panels.length - 1] += `<span>${segment(text)}</span>`;
    }
  }
  return `<div class="split">${panels.map((p) => `${p}</div>`).join('')}</div>`;
}

// A fixed, hand-drawn library — not a general diagramming feature. Each name is an inline
// SVG built once here rather than a screenshot or external image file, so it stays a plain
// text diff in the naskah and never depends on where a PNG happens to live.
function figure(svg, caption, label) {
  return `<figure class="diagram"><svg viewBox="${svg.viewBox}" role="img" aria-label="${escapeHtml(label)}">${svg.body}</svg>` +
    `<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

/** Filled triangle head at (x2,y2) for a segment from (x1,y1); colour defaults to navy. */
function arrowHead(x1, y1, x2, y2, size = 9, color = 'var(--navy)') {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const ax1 = x2 - size * Math.cos(angle - Math.PI / 6);
  const ay1 = y2 - size * Math.sin(angle - Math.PI / 6);
  const ax2 = x2 - size * Math.cos(angle + Math.PI / 6);
  const ay2 = y2 - size * Math.sin(angle + Math.PI / 6);
  return `<polygon points="${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}" fill="${color}"/>`;
}

/** A labelled horizontal message arrow between lifelines: sync (solid, filled head) or return (dashed) or async (open V). */
function msg(x1, y1, x2, y2, label, kind) {
  const dashed = kind === 'return';
  const line = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--navy)" stroke-width="2"${dashed ? ' stroke-dasharray="6,4"' : ''}/>`;
  let head;
  if (kind === 'sync') {
    head = arrowHead(x1, y1, x2, y2, 10);
  } else if (kind === 'async') {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const a = 9;
    head = `<polyline points="${x2 - a * Math.cos(angle - Math.PI / 5)},${y2 - a * Math.sin(angle - Math.PI / 5)} ${x2},${y2} ${x2 - a * Math.cos(angle + Math.PI / 5)},${y2 - a * Math.sin(angle + Math.PI / 5)}" fill="none" stroke="var(--navy)" stroke-width="2"/>`;
  } else {
    head = arrowHead(x1, y1, x2, y2, 8);
  }
  const midX = (x1 + x2) / 2;
  return line + head +
    `<text x="${midX}" y="${y1 - 7}" text-anchor="middle" font-size="11.5" fill="var(--ink)" font-family="var(--mono)">${label}</text>`;
}

const DIAGRAMS = {
  'class-box': () => figure({
    viewBox: '0 0 320 170',
    body: `<rect x="4" y="4" width="312" height="162" fill="var(--card)" stroke="var(--navy)" stroke-width="2"/>` +
      `<line x1="4" y1="46" x2="316" y2="46" stroke="var(--navy)" stroke-width="2"/>` +
      `<line x1="4" y1="108" x2="316" y2="108" stroke="var(--navy)" stroke-width="2"/>` +
      `<text x="160" y="30" text-anchor="middle" font-weight="700" font-size="17" fill="var(--ink)">PurchaseRequest</text>` +
      `<text x="16" y="66" font-size="13" fill="var(--ink)">- id: int</text>` +
      `<text x="16" y="86" font-size="13" fill="var(--ink)">- status: string</text>` +
      `<text x="16" y="128" font-size="13" fill="var(--ink)">+ submit(): void</text>` +
      `<text x="16" y="148" font-size="13" fill="var(--ink)">+ approve(): void</text>`,
  }, 'name / attribute / operation', 'UML class box with three compartments'),

  'relationships-5': () => {
    const cols = [
      { type: 'assoc', label: 'Association' },
      { type: 'agg', label: 'Aggregation' },
      { type: 'comp', label: 'Composition' },
      { type: 'gen', label: 'Generalisation' },
      { type: 'dep', label: 'Dependency' },
    ];
    const w = 124;
    const body = cols.map((col, i) => {
      const x = i * w;
      const lx1 = x + 26, lx2 = x + 92, ly = 40;
      let parts = `<rect x="${x + 8}" y="30" width="20" height="20" fill="var(--card)" stroke="var(--navy)" stroke-width="1.6"/>` +
        `<rect x="${x + 96}" y="30" width="20" height="20" fill="var(--card)" stroke="var(--navy)" stroke-width="1.6"/>` +
        `<line x1="${lx1}" y1="${ly}" x2="${lx2}" y2="${ly}" stroke="var(--ink)" stroke-width="2"${col.type === 'dep' ? ' stroke-dasharray="5,4"' : ''}/>`;
      if (col.type === 'agg' || col.type === 'comp') {
        const cx = lx2 - 10;
        parts += `<polygon points="${cx - 9},${ly} ${cx},${ly - 6} ${cx + 9},${ly} ${cx},${ly + 6}" ` +
          `fill="${col.type === 'comp' ? 'var(--navy)' : 'var(--card)'}" stroke="var(--navy)" stroke-width="1.6"/>`;
      } else if (col.type === 'gen') {
        parts += `<polygon points="${lx2 - 14},${ly - 7} ${lx2 - 14},${ly + 7} ${lx2},${ly}" ` +
          `fill="var(--card)" stroke="var(--navy)" stroke-width="1.6"/>`;
      } else if (col.type === 'dep') {
        parts += `<polyline points="${lx2 - 10},${ly - 6} ${lx2},${ly} ${lx2 - 10},${ly + 6}" ` +
          `fill="none" stroke="var(--ink)" stroke-width="2"/>`;
      }
      parts += `<text x="${x + w / 2}" y="70" text-anchor="middle" font-size="12" fill="var(--muted)" font-family="var(--mono)">${col.label}</text>`;
      return parts;
    }).join('');
    return figure({ viewBox: `0 0 ${cols.length * w} 84`, body }, 'notation for each of the five relationships', 'Five UML relationship notations side by side');
  },

  'deployment-cutover': () => {
    const service = (x, w, text) => `<rect x="${x}" y="14" width="${w}" height="34" rx="6" fill="var(--card)" stroke="var(--navy)" stroke-width="1.6"/>` +
      `<text x="${x + w / 2}" y="35" text-anchor="middle" font-size="11.5" fill="var(--ink)">${text}</text>`;
    const db = (x, w, text, warn) => `<rect x="${x}" y="150" width="${w}" height="38" rx="6" fill="${warn ? 'var(--amber-soft)' : 'var(--green-soft)'}" stroke="${warn ? 'var(--amber)' : 'var(--green)'}" stroke-width="1.6"/>` +
      `<text x="${x + w / 2}" y="173" text-anchor="middle" font-size="11.5" fill="var(--ink)">${text}</text>`;
    const link = (x1, x2, warn) => `<line x1="${x1}" y1="48" x2="${x2}" y2="150" stroke="${warn ? 'var(--amber)' : 'var(--green)'}" stroke-width="2"/>`;
    const before = service(6, 96, 'NusaPay-service') + service(112, 96, 'billing-service') + service(218, 90, 'OMS') +
      db(6, 302, 'shared-db-instance-01 (shared)', true) +
      link(54, 90, true) + link(160, 150, true) + link(263, 220, true) +
      `<text x="159" y="196" text-anchor="middle" font-size="11" fill="var(--amber)" font-family="var(--mono)">BEFORE — noisy neighbour</text>`;
    const ox = 360;
    const after = service(ox + 6, 110, 'NusaPay-service') + service(ox + 126, 96, 'billing-service') + service(ox + 232, 76, 'OMS') +
      db(ox + 6, 110, 'nusapay-db (NEW)', false) + db(ox + 126, 182, 'shared-db-instance-01', false) +
      link(ox + 61, ox + 61, false) + link(ox + 174, ox + 200, false) + link(ox + 270, ox + 260, false) +
      `<text x="${ox + 159}" y="196" text-anchor="middle" font-size="11" fill="var(--green)" font-family="var(--mono)">AFTER — isolated</text>`;
    return figure({ viewBox: '0 0 720 210', body: before + after }, 'NusaPay database cutover — before (shared instance) / after (dedicated instance)', 'Before and after deployment topology for the NusaPay database cutover');
  },

  'traceability-flow': () => {
    const steps = [
      { label: 'Stakeholder Need', now: true },
      { label: 'Requirement', now: true },
      { label: 'Design', now: false },
      { label: 'Test', now: false },
    ];
    const w = 130, h = 60, gap = 40, y = 30;
    const body = steps.map((s, i) => {
      const x = i * (w + gap) + 10;
      const box = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${s.now ? 'var(--teal-soft)' : 'var(--bg)'}" ` +
        `stroke="var(--navy)" stroke-width="1.8" stroke-dasharray="${s.now ? 'none' : '5,4'}"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)">${s.label}</text>` +
        `<text x="${x + w / 2}" y="${y + h + 20}" text-anchor="middle" font-size="10.5" fill="var(--muted)" font-family="var(--mono)">${s.now ? 'malam ini' : 'Sesi 12'}</text>`;
      const arrow = i < steps.length - 1
        ? `<line x1="${x + w}" y1="${y + h / 2}" x2="${x + w + gap - 6}" y2="${y + h / 2}" stroke="var(--navy)" stroke-width="2"/>` +
          `<polygon points="${x + w + gap - 6},${y + h / 2 - 5} ${x + w + gap + 4},${y + h / 2} ${x + w + gap - 6},${y + h / 2 + 5}" fill="var(--navy)"/>`
        : '';
      return box + arrow;
    }).join('');
    return figure({ viewBox: `0 0 ${steps.length * (w + gap) + 10} 120`, body }, 'need → requirement → design → test', 'Traceability flow from stakeholder need to test');
  },

  'cube-three-axis': () => figure({
    viewBox: '0 0 980 220',
    body: `<line x1="490" y1="190" x2="490" y2="30" stroke="var(--navy)" stroke-width="2.5"/>` +
      `<polygon points="490,30 483,44 497,44" fill="var(--navy)"/>` +
      `<text x="500" y="36" font-size="15" font-weight="700" fill="var(--navy)">Produk</text>` +
      `<text x="500" y="56" font-size="12.5" fill="var(--muted)">Kopi · Snack</text>` +
      `<line x1="490" y1="190" x2="880" y2="190" stroke="var(--navy)" stroke-width="2.5"/>` +
      `<polygon points="880,190 866,183 866,197" fill="var(--navy)"/>` +
      `<text x="770" y="212" font-size="15" font-weight="700" fill="var(--navy)">Waktu</text>` +
      `<text x="742" y="176" font-size="12.5" fill="var(--muted)">Jan · Feb · Mar</text>` +
      `<line x1="490" y1="190" x2="160" y2="80" stroke="var(--navy)" stroke-width="2.5"/>` +
      `<polygon points="160,80 172,82 166,95" fill="var(--navy)"/>` +
      `<text x="70" y="70" font-size="15" font-weight="700" fill="var(--navy)">Wilayah</text>` +
      `<text x="60" y="90" font-size="12.5" fill="var(--muted)">Bandung · Jakarta</text>` +
      `<circle cx="340" cy="130" r="11" fill="var(--teal)"/>` +
      `<circle cx="340" cy="130" r="11" fill="none" stroke="var(--teal)" stroke-width="6" opacity=".25"/>` +
      `<rect x="290" y="150" width="240" height="40" rx="10" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<text x="410" y="175" text-anchor="middle" font-family="var(--mono)" font-size="13" font-weight="600" fill="var(--navy-2)">Kopi × Feb × Bandung = 42</text>`,
  }, 'tiga sumbu bertemu di satu sel contoh', 'Diagram kubus tiga sumbu: Produk, Waktu, Wilayah, dengan satu sel disorot bernilai 42'),

  'hierarchy-tree': () => {
    const col = (cx, title, rows) => {
      let body = `<text x="${cx}" y="18" text-anchor="middle" font-size="13" font-weight="700" fill="var(--teal)">${title}</text>`;
      rows.forEach((r, i) => {
        const y = 28 + i * 48;
        const gap = r.gap
          ? `<line x1="${cx}" y1="${y - 14}" x2="${cx}" y2="${y}" stroke="var(--red)" stroke-width="2" stroke-dasharray="4 4"/>`
          : i > 0 ? `<line x1="${cx}" y1="${y - 14}" x2="${cx}" y2="${y}" stroke="var(--border)"/>` : '';
        body += gap +
          `<rect x="${cx - 90}" y="${y}" width="180" height="34" rx="8" fill="${r.gap ? 'var(--red-soft)' : 'var(--card)'}" ` +
          `stroke="${r.gap ? 'var(--red)' : 'var(--border)'}"${r.gap ? ' stroke-dasharray="4 4"' : ''}/>` +
          `<text x="${cx}" y="${y + 21}" text-anchor="middle" font-size="13" fill="${r.gap ? 'var(--red)' : 'var(--ink)'}">${r.label}</text>`;
      });
      return body;
    };
    const body = col(170, 'TANGGAL', [{ label: 'Tahun' }, { label: 'Kuartal' }, { label: 'Bulan' }, { label: 'Hari' }]) +
      col(490, 'GEOGRAFI', [{ label: 'Negara' }, { label: 'Provinsi (DKI Jakarta)' }, { label: 'Kabupaten — tidak ada', gap: true }, { label: 'Kota' }]) +
      col(810, 'PRODUK', [{ label: 'Kategori' }, { label: 'Subkategori' }, { label: 'SKU' }]);
    return figure({ viewBox: '0 0 980 230', body }, 'geografi punya cabang hilang untuk DKI Jakarta', 'Tiga pohon hierarki: Tanggal, Geografi (dengan cabang Kabupaten hilang untuk DKI Jakarta), dan Produk');
  },

  'molap-rolap-holap': () => figure({
    viewBox: '0 0 980 130',
    body: `<rect x="70" y="15" width="46" height="16" rx="4" fill="var(--teal)"/>` +
      `<rect x="70" y="34" width="46" height="16" rx="4" fill="var(--teal)" opacity=".8"/>` +
      `<rect x="70" y="53" width="46" height="16" rx="4" fill="var(--teal)" opacity=".6"/>` +
      `<circle cx="93" cy="15" r="9" fill="none" stroke="var(--navy)" stroke-width="2.5"/>` +
      `<rect x="88" y="13" width="10" height="9" fill="var(--navy)"/>` +
      `<text x="93" y="92" text-anchor="middle" font-size="13" font-weight="700" fill="var(--navy)">MOLAP</text>` +
      `<text x="93" y="110" text-anchor="middle" font-size="12" fill="var(--muted)">disimpan duluan</text>` +
      `<rect x="440" y="40" width="18" height="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<rect x="460" y="40" width="18" height="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<rect x="440" y="54" width="18" height="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<rect x="460" y="54" width="18" height="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<circle cx="500" cy="30" r="14" fill="none" stroke="var(--navy)" stroke-width="3"/>` +
      `<line x1="510" y1="40" x2="522" y2="52" stroke="var(--navy)" stroke-width="3.5" stroke-linecap="round"/>` +
      `<text x="470" y="92" text-anchor="middle" font-size="13" font-weight="700" fill="var(--navy)">ROLAP</text>` +
      `<text x="470" y="110" text-anchor="middle" font-size="12" fill="var(--muted)">dihitung tiap ditanya</text>` +
      `<rect x="800" y="15" width="46" height="16" rx="4" fill="var(--teal)" opacity=".8"/>` +
      `<rect x="800" y="34" width="46" height="16" rx="4" fill="var(--teal)" opacity=".5"/>` +
      `<rect x="860" y="15" width="18" height="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<rect x="880" y="15" width="18" height="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<rect x="860" y="29" width="18" height="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<rect x="880" y="29" width="18" height="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<line x1="850" y1="10" x2="850" y2="55" stroke="var(--border)" stroke-dasharray="3 3"/>` +
      `<text x="850" y="92" text-anchor="middle" font-size="13" font-weight="700" fill="var(--navy)">HOLAP</text>` +
      `<text x="850" y="110" text-anchor="middle" font-size="12" fill="var(--muted)">sebagian-sebagian</text>`,
  }, 'MOLAP tersegel, ROLAP dihitung ulang, HOLAP campuran', 'Tiga ikon: MOLAP tumpukan tersegel, ROLAP kaca pembesar di atas tabel, HOLAP gabungan keduanya'),

  'semantic-layer-timeline': () => figure({
    viewBox: '0 0 980 110',
    body: `<rect x="20" y="15" width="280" height="70" rx="12" fill="var(--card)" stroke="var(--border)"/>` +
      `<text x="160" y="42" text-anchor="middle" font-size="13" font-weight="700" fill="var(--navy)">Dulu: MOLAP</text>` +
      `<text x="160" y="62" text-anchor="middle" font-size="11.5" fill="var(--muted)">cepat, tapi kaku</text>` +
      `<polygon points="305,50 330,42 330,58" fill="var(--border)"/>` +
      `<rect x="350" y="15" width="280" height="70" rx="12" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<text x="490" y="42" text-anchor="middle" font-size="13" font-weight="700" fill="var(--navy-2)">Sekarang: ROLAP menang</text>` +
      `<text x="490" y="62" text-anchor="middle" font-size="11.5" fill="var(--teal)">warehouse sudah cukup cepat</text>` +
      `<polygon points="635,50 660,42 660,58" fill="var(--border)"/>` +
      `<rect x="680" y="15" width="280" height="70" rx="12" fill="var(--amber-soft)" stroke="var(--amber)"/>` +
      `<text x="820" y="42" text-anchor="middle" font-size="13" font-weight="700" fill="#8a5a00">Yang kembali</text>` +
      `<text x="820" y="62" text-anchor="middle" font-size="11.5" fill="#8a5a00">satu definisi metrik bersama</text>`,
  }, 'MOLAP → ROLAP menang → definisi metrik bersama kembali', 'Garis waktu tiga tahap: dulu MOLAP, sekarang ROLAP menang, yang kembali adalah definisi metrik bersama'),

  'rollup-bars': () => figure({
    viewBox: '0 0 980 230',
    body: `<rect x="90" y="123" width="90" height="67" fill="var(--teal)"/><text x="135" y="118" text-anchor="middle" fill="var(--navy)" font-weight="700" font-size="11.5">120</text><text x="135" y="205" text-anchor="middle" font-family="var(--mono)" font-size="11.5" fill="var(--muted)">Jawa,<tspan x="135" dy="12">Bandung</tspan></text>` +
      `<rect x="210" y="145" width="90" height="45" fill="var(--teal)"/><text x="255" y="140" text-anchor="middle" fill="var(--navy)" font-weight="700" font-size="11.5">80</text><text x="255" y="205" text-anchor="middle" font-family="var(--mono)" font-size="11.5" fill="var(--muted)">Jawa,<tspan x="255" dy="12">Semarang</tspan></text>` +
      `<rect x="330" y="78" width="90" height="112" fill="var(--amber)"/><text x="375" y="73" text-anchor="middle" fill="var(--navy)" font-weight="700" font-size="11.5">200</text><text x="375" y="205" text-anchor="middle" font-family="var(--mono)" font-size="11.5" fill="var(--muted)">Jawa,<tspan x="375" dy="12">subtotal</tspan></text>` +
      `<rect x="470" y="162" width="90" height="28" fill="var(--teal)"/><text x="515" y="157" text-anchor="middle" fill="var(--navy)" font-weight="700" font-size="11.5">50</text><text x="515" y="205" text-anchor="middle" font-family="var(--mono)" font-size="11.5" fill="var(--muted)">Bali,<tspan x="515" dy="12">Denpasar</tspan></text>` +
      `<rect x="590" y="162" width="90" height="28" fill="var(--amber)"/><text x="635" y="157" text-anchor="middle" fill="var(--navy)" font-weight="700" font-size="11.5">50</text><text x="635" y="205" text-anchor="middle" font-family="var(--mono)" font-size="11.5" fill="var(--muted)">Bali,<tspan x="635" dy="12">subtotal</tspan></text>` +
      `<rect x="740" y="50" width="110" height="140" fill="var(--red)"/><text x="795" y="45" text-anchor="middle" fill="var(--navy)" font-weight="700" font-size="11.5">250</text><text x="795" y="205" text-anchor="middle" font-family="var(--mono)" font-size="11.5" fill="var(--muted)">Grand<tspan x="795" dy="12">total</tspan></text>` +
      `<line x1="60" y1="190" x2="920" y2="190" stroke="var(--border)" stroke-width="1.5"/>`,
  }, 'dua baris data, dua subtotal region, satu grand total', 'Grafik batang hasil ROLLUP: dua baris data asli, dua subtotal region, satu grand total'),

  'preagg-scale': () => figure({
    viewBox: '0 0 980 150',
    body: `<polygon points="490,20 460,60 520,60" fill="var(--navy)"/>` +
      `<rect x="484" y="60" width="12" height="55" fill="var(--navy)"/>` +
      `<line x1="220" y1="45" x2="760" y2="45" stroke="var(--navy)" stroke-width="4"/>` +
      `<line x1="220" y1="45" x2="220" y2="85" stroke="var(--muted)" stroke-width="2"/>` +
      `<ellipse cx="220" cy="95" rx="85" ry="14" fill="var(--teal-soft)" stroke="var(--teal)"/>` +
      `<text x="220" y="99" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--navy-2)">Kecepatan</text>` +
      `<line x1="760" y1="45" x2="760" y2="85" stroke="var(--muted)" stroke-width="2"/>` +
      `<ellipse cx="760" cy="95" rx="150" ry="14" fill="var(--amber-soft)" stroke="var(--amber)"/>` +
      `<text x="760" y="99" text-anchor="middle" font-size="12.5" font-weight="700" fill="#8a5a00">Kesegaran data + kerja jaga-jaga</text>` +
      `<text x="490" y="140" text-anchor="middle" font-size="12" fill="var(--muted)">Pra-agregasi menang hanya kalau pola stabil dan tabel dasarnya besar</text>`,
  }, 'kecepatan vs kesegaran data + kerja jaga-jaga', 'Diagram timbangan: kecepatan di satu sisi, kesegaran data dan kerja jaga-jaga di sisi lain'),

  'mvc-architecture': () => {
    const box = (x, y, w, h, label, fill) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="var(--navy)" stroke-width="1.8"/>` +
      `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)">${label}</text>`;
    const arrow = (x1, y1, x2, y2, label, dashed) => {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const ah = 9;
      const ax1 = x2 - ah * Math.cos(angle - Math.PI / 6);
      const ay1 = y2 - ah * Math.sin(angle - Math.PI / 6);
      const ax2 = x2 - ah * Math.cos(angle + Math.PI / 6);
      const ay2 = y2 - ah * Math.sin(angle + Math.PI / 6);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--teal)" stroke-width="2"${dashed ? ' stroke-dasharray="5,4"' : ''}/>` +
        `<polygon points="${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}" fill="var(--teal)"/>` +
        `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="var(--mono)">${label}</text>`;
    };
    const body =
      box(20, 125, 110, 50, 'User', 'var(--card)') +
      box(265, 15, 150, 50, 'Controller', 'var(--teal-soft)') +
      box(90, 215, 150, 50, 'Model', 'var(--card)') +
      box(430, 215, 150, 50, 'View', 'var(--card)') +
      arrow(100, 122, 268, 62, 'request', false) +
      arrow(310, 65, 195, 213, 'manipulates', false) +
      arrow(378, 65, 495, 213, 'selects', false) +
      arrow(240, 240, 428, 240, 'updates', true) +
      arrow(432, 258, 128, 165, 'response', false);
    return figure({ viewBox: '0 0 640 300', body },
      'User mengirim request ke Controller; Controller mengorkestrasi Model dan memilih View; Model memperbarui View; View merespons User',
      'Diagram arsitektur MVC generik: User, Controller, Model, View dengan empat panah alur request/manipulates/selects/updates/response');
  },

  // ── UML behavior diagrams (SDLC Sesi 07) ────────────────────────────────────
  // Same house rules as the rest of the library: hand-drawn inline SVG, course
  // colour vocabulary, real example names from the session's own artifacts.

  // Filled triangle for sync messages, open V for async/return — computed from
  // the segment direction so diagonal arrows keep their head aligned.
  'activity-notation': () => {
    const lbl = (x, y, text) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="10.5" font-family="var(--mono)" fill="var(--muted)">${text}</text>`;
    const hArrow = (x1, y, x2) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="var(--navy)" stroke-width="2"/>${arrowHead(x1, y, x2, y)}`;
    const act = (x, y, w, text) => `<rect x="${x}" y="${y}" width="${w}" height="36" rx="12" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>` +
      `<text x="${x + w / 2}" y="${y + 23}" text-anchor="middle" font-size="12" fill="var(--ink)">${text}</text>`;
    const lane = `<rect x="10" y="16" width="740" height="112" rx="14" fill="var(--teal-soft)" opacity=".4"/>` +
      `<text x="24" y="36" font-size="10.5" font-family="var(--mono)" fill="var(--teal)" font-weight="700">SWIMLANE: STAFF</text>`;
    const body = lane +
      `<circle cx="46" cy="78" r="8" fill="var(--navy)"/>` + lbl(46, 108, 'initial') +
      hArrow(56, 78, 72) +
      act(74, 60, 118, 'Submit request') + lbl(133, 108, 'activity') +
      hArrow(194, 78, 218) +
      `<polygon points="250,48 282,78 250,108 218,78" fill="var(--amber-soft)" stroke="var(--amber)" stroke-width="1.8"/>` + lbl(250, 126, 'decision') +
      `<line x1="280" y1="72" x2="348" y2="58" stroke="var(--navy)" stroke-width="2"/>${arrowHead(280, 72, 350, 58)}` +
      `<text x="302" y="56" font-size="11" font-family="var(--mono)" fill="var(--teal)">[&lt; 5 jt]</text>` +
      `<line x1="280" y1="84" x2="348" y2="98" stroke="var(--navy)" stroke-width="2"/>${arrowHead(280, 84, 350, 98)}` +
      `<text x="296" y="112" font-size="11" font-family="var(--mono)" fill="var(--teal)">[&gt;= 5 jt]</text>` +
      `<polygon points="382,54 410,78 382,102 354,78" fill="var(--card)" stroke="var(--border)" stroke-width="1.8"/>` + lbl(382, 126, 'merge') +
      hArrow(412, 78, 448) +
      `<rect x="450" y="48" width="6" height="60" fill="var(--navy)"/>` + lbl(453, 126, 'fork') +
      hArrow(458, 60, 490) + hArrow(458, 96, 490) +
      act(492, 42, 106, 'Cek budget') + act(492, 78, 106, 'Cek stok') +
      hArrow(600, 60, 626) + hArrow(600, 96, 626) +
      `<rect x="628" y="48" width="6" height="60" fill="var(--navy)"/>` + lbl(631, 126, 'join') +
      hArrow(636, 78, 672) +
      `<circle cx="686" cy="78" r="9" fill="none" stroke="var(--navy)" stroke-width="2"/><circle cx="686" cy="78" r="4" fill="var(--navy)"/>` + lbl(686, 108, 'final');
    return figure({ viewBox: '0 0 760 134', body },
      'initial → activity → decision (guard) → merge → fork/join (paralel) → final, dalam satu swimlane',
      'Activity diagram notation strip: initial node, activity, decision with guards, merge, fork and join bars, final node, inside one swimlane band');
  },

  'guards-bad-good': () => {
    const head = (x, text, color) => `<text x="${x}" y="24" text-anchor="middle" font-size="12" font-family="var(--mono)" font-weight="700" fill="${color}">${text}</text>`;
    const dia = (cx, cy) => `<polygon points="${cx},${cy - 30} ${cx + 32},${cy} ${cx},${cy + 30} ${cx - 32},${cy}" fill="var(--amber-soft)" stroke="var(--amber)" stroke-width="1.8"/>`;
    const box = (x, y, w, text, bad) => `<rect x="${x}" y="${y}" width="${w}" height="34" rx="10" fill="${bad ? 'var(--red-soft)' : 'var(--green-soft)'}" stroke="${bad ? 'var(--red)' : 'var(--green)'}" stroke-width="1.6"${bad ? ' stroke-dasharray="5,4"' : ''}/>` +
      `<text x="${x + w / 2}" y="${y + 21}" text-anchor="middle" font-size="11.5" fill="${bad ? 'var(--red)' : 'var(--ink)'}">${text}</text>`;
    const bad = `<line x1="178" y1="96" x2="292" y2="70" stroke="var(--red)" stroke-width="2"/>${arrowHead(178, 96, 296, 69, 9, 'var(--red)')}` +
      `<text x="228" y="72" font-size="11" font-family="var(--mono)" fill="var(--red)">[kecil]</text>` +
      `<line x1="182" y1="112" x2="292" y2="126" stroke="var(--red)" stroke-width="2"/>${arrowHead(182, 112, 296, 127, 9, 'var(--red)')}` +
      `<text x="226" y="136" font-size="11" font-family="var(--mono)" fill="var(--red)">[besar]</text>` +
      `<line x1="150" y1="140" x2="150" y2="178" stroke="var(--red)" stroke-width="2" stroke-dasharray="5,4"/>` +
      `<line x1="150" y1="178" x2="292" y2="178" stroke="var(--red)" stroke-width="2" stroke-dasharray="5,4"/>${arrowHead(292, 178, 296, 178, 9, 'var(--red)')}` +
      `<text x="196" y="170" font-size="10.5" font-family="var(--mono)" fill="var(--red)">tanpa guard</text>` +
      box(298, 52, 168, 'nilai 1–4 jt?', true) + box(298, 108, 168, 'nilai 8 jt?', true) +
      box(298, 161, 168, 'request menggantung', true);
    const good = dia(660, 110) +
      `<line x1="690" y1="96" x2="794" y2="84" stroke="var(--green)" stroke-width="2"/>${arrowHead(690, 96, 798, 83, 9, 'var(--green)')}` +
      `<text x="712" y="80" font-size="11" font-family="var(--mono)" fill="var(--green)">[&lt; 5 jt]</text>` +
      `<line x1="690" y1="124" x2="794" y2="150" stroke="var(--green)" stroke-width="2"/>${arrowHead(690, 124, 798, 151, 9, 'var(--green)')}` +
      `<text x="716" y="152" font-size="11" font-family="var(--mono)" fill="var(--green)">[&gt;= 5 jt]</text>` +
      box(800, 66, 156, 'Proses A', false) + box(800, 134, 156, 'Proses B', false) +
      `<text x="760" y="192" text-anchor="middle" font-size="10.5" font-family="var(--mono)" fill="var(--muted)">jumlah guard = 100% kasus, tidak ada irisan</text>`;
    const body = head(240, '✗ TIDAK LENGKAP — BISA MACET', 'var(--red)') + bad +
      head(700, '✓ LENGKAP &amp; EKSKLUSIF', 'var(--green)') + good +
      `<line x1="524" y1="34" x2="524" y2="196" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="6,5"/>`;
    return figure({ viewBox: '0 0 980 210', body },
      'kiri: guard tidak terukur — ada nilai yang tidak cocok cabang mana pun; kanan: [< 5 jt] / [>= 5 jt] mencakup semua kasus',
      'Comparison of bad guards (kecil/besar plus a dangling unguarded branch) versus good measurable guards');
  },

  'fork-vs-decision': () => {
    const box = (x, y, w, text, fill, stroke) => `<rect x="${x}" y="${y}" width="${w}" height="36" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>` +
      `<text x="${x + w / 2}" y="${y + 23}" text-anchor="middle" font-size="12" fill="var(--ink)">${text}</text>`;
    const body =
      `<text x="240" y="26" text-anchor="middle" font-size="12.5" font-family="var(--mono)" font-weight="700" fill="var(--teal)">FORK — keduanya terjadi</text>` +
      `<line x1="60" y1="96" x2="104" y2="96" stroke="var(--navy)" stroke-width="2"/>${arrowHead(60, 96, 108, 96)}` +
      `<rect x="110" y="62" width="6" height="70" fill="var(--navy)"/>` +
      `<line x1="116" y1="76" x2="156" y2="76" stroke="var(--navy)" stroke-width="2"/>${arrowHead(116, 76, 160, 76)}` +
      `<line x1="116" y1="118" x2="156" y2="118" stroke="var(--navy)" stroke-width="2"/>${arrowHead(116, 118, 160, 118)}` +
      box(162, 58, 140, 'Aktivitas A', 'var(--teal-soft)', 'var(--teal)') +
      box(162, 100, 140, 'Aktivitas B', 'var(--teal-soft)', 'var(--teal)') +
      `<line x1="302" y1="76" x2="340" y2="76" stroke="var(--navy)" stroke-width="2"/>${arrowHead(302, 76, 344, 76)}` +
      `<line x1="302" y1="118" x2="340" y2="118" stroke="var(--navy)" stroke-width="2"/>${arrowHead(302, 118, 344, 118)}` +
      `<rect x="346" y="62" width="6" height="70" fill="var(--navy)"/>` +
      `<line x1="352" y1="96" x2="396" y2="96" stroke="var(--navy)" stroke-width="2"/>${arrowHead(352, 96, 400, 96)}` +
      `<text x="240" y="170" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--muted)">join menunggu SEMUA cabang</text>` +
      `<line x1="490" y1="34" x2="490" y2="176" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="6,5"/>` +
      `<text x="730" y="26" text-anchor="middle" font-size="12.5" font-family="var(--mono)" font-weight="700" fill="#8a5a00">DECISION — salah satu</text>` +
      `<line x1="550" y1="96" x2="606" y2="96" stroke="var(--navy)" stroke-width="2"/>${arrowHead(550, 96, 610, 96)}` +
      `<polygon points="650,62 684,96 650,130 616,96" fill="var(--amber-soft)" stroke="var(--amber)" stroke-width="1.8"/>` +
      `<line x1="682" y1="84" x2="786" y2="62" stroke="var(--navy)" stroke-width="2"/>${arrowHead(682, 84, 790, 61)}` +
      `<text x="712" y="62" font-size="11" font-family="var(--mono)" fill="#8a5a00">[ya]</text>` +
      `<line x1="682" y1="108" x2="786" y2="132" stroke="var(--navy)" stroke-width="2"/>${arrowHead(682, 108, 790, 133)}` +
      `<text x="716" y="134" font-size="11" font-family="var(--mono)" fill="#8a5a00">[tidak]</text>` +
      box(792, 44, 150, 'Proses A', 'var(--amber-soft)', 'var(--amber)') +
      box(792, 116, 150, 'Proses B', 'var(--amber-soft)', 'var(--amber)') +
      `<text x="730" y="170" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--muted)">bergantian — guards wajib</text>`;
    return figure({ viewBox: '0 0 980 190', body },
      'fork: dua aktivitas paralel dengan join; decision: satu masuk, dua keluar bergantian dengan guard',
      'Side-by-side fork (parallel activities with join bar) versus decision diamond with guarded branches');
  },

  'activity-swimlane-handoff': () => {
    const lane = (i, name) => `<rect x="${i * 245 + 6}" y="6" width="233" height="28" rx="8" fill="var(--navy)"/>` +
      `<text x="${i * 245 + 122}" y="25" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">${name}</text>` +
      (i ? `<line x1="${i * 245}" y1="6" x2="${i * 245}" y2="238" stroke="var(--border)" stroke-width="1.5"/>` : '');
    const act = (x, y, w, text, fill, stroke) => `<rect x="${x}" y="${y}" width="${w}" height="38" rx="10" fill="${fill || 'var(--card)'}" stroke="${stroke || 'var(--navy)'}" stroke-width="1.8"/>` +
      `<text x="${x + w / 2}" y="${y + 23}" text-anchor="middle" font-size="11.5" fill="var(--ink)">${text}</text>`;
    const num = (x, y, n) => `<circle cx="${x}" cy="${y}" r="10" fill="var(--red)"/>` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${n}</text>`;
    const line = (x1, y1, x2, y2, color, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"${dash ? ' stroke-dasharray="6,4"' : ''}/>`;
    const body = [0, 1, 2, 3].map((i) => lane(i, ['Staff', 'Supervisor / BM', 'Finance', 'Procurement'][i])).join('') +
      act(28, 62, 190, 'Submit request') +
      line(218, 81, 330, 81) + arrowHead(218, 81, 334, 81) + num(276, 81, 1) +
      `<polygon points="366,56 398,84 366,112 334,84" fill="var(--amber-soft)" stroke="var(--amber)" stroke-width="1.8"/>` +
      `<text x="366" y="88" text-anchor="middle" font-size="11" fill="var(--ink)">&lt; 5 jt?</text>` +
      line(366, 112, 366, 210, 'var(--red)', true) + line(366, 210, 222, 210, 'var(--red)', true) + arrowHead(222, 210, 218, 210, 9, 'var(--red)') + num(366, 210, 2) +
      act(28, 191, 190, 'Revisi &amp; submit ulang', 'var(--red-soft)', 'var(--red)') +
      line(398, 84, 512, 84) + arrowHead(398, 84, 516, 84) + num(455, 84, 3) +
      `<text x="455" y="70" text-anchor="middle" font-size="10" font-family="var(--mono)" fill="var(--teal)">paralel (fork)</text>` +
      act(518, 62, 190, 'Cek budget') +
      line(708, 81, 748, 81) + arrowHead(708, 81, 752, 81) + num(730, 81, 4) +
      act(754, 62, 204, 'Order + registrasi vendor') +
      line(856, 100, 856, 142, 'var(--green)', true) + line(856, 142, 222, 142, 'var(--green)', true) + arrowHead(222, 142, 218, 142, 9, 'var(--green)') + num(560, 142, 5) +
      act(28, 123, 190, 'Close request', 'var(--green-soft)', 'var(--green)');
    return figure({ viewBox: '0 0 980 244', body },
      'empat lane, lima panah lintas batas lane (angka merah) — tiap lintasan adalah handoff',
      'Swimlane activity diagram with four lanes and five numbered lane-crossing handoff arrows');
  },

  'sequence-notation': () => {
    const part = (x, name) => `<rect x="${x - 75}" y="10" width="150" height="36" rx="8" fill="var(--navy)"/>` +
      `<text x="${x}" y="33" text-anchor="middle" font-size="12.5" font-weight="600" fill="#fff">${name}</text>` +
      `<line x1="${x}" y1="46" x2="${x}" y2="256" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5,5"/>`;
    const body = part(125, 'Actor') + part(490, 'Service') + part(865, 'Database') +
      `<rect x="484" y="94" width="12" height="128" fill="var(--teal-soft)" stroke="var(--teal)" stroke-width="1.5"/>` +
      `<rect x="859" y="146" width="12" height="40" fill="var(--teal-soft)" stroke="var(--teal)" stroke-width="1.5"/>` +
      msg(129, 78, 482, 78, 'request — sync (kepala penuh)', 'sync') +
      `<polyline points="496,102 570,102 570,128 502,128" fill="none" stroke="var(--navy)" stroke-width="2"/>${arrowHead(570, 128, 498, 128)}` +
      `<text x="582" y="119" font-size="11" font-family="var(--mono)" fill="var(--ink)">self-message</text>` +
      msg(498, 156, 857, 156, 'query — sync', 'sync') +
      msg(857, 186, 500, 186, 'return — putus-putus', 'return') +
      msg(482, 218, 129, 218, 'response (return)', 'return') +
      msg(129, 250, 482, 250, 'async — kepala terbuka', 'async');
    return figure({ viewBox: '0 0 980 266', body },
      'participant di atas, lifeline turun, activation bar, sync / return / async / self-message; waktu mengalir ke bawah',
      'Sequence diagram notation: three participants, lifelines, activation bars, sync, return and async arrows and a self-message');
  },

  'sequence-fragments': () => {
    const part = (x, name) => `<rect x="${x - 65}" y="10" width="130" height="32" rx="8" fill="var(--navy)"/>` +
      `<text x="${x}" y="31" text-anchor="middle" font-size="12.5" font-weight="600" fill="#fff">${name}</text>` +
      `<line x1="${x}" y1="42" x2="${x}" y2="278" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5,5"/>`;
    const tag = (x, y, name, guard) => `<polygon points="${x},${y} ${x + 56},${y} ${x + 46},${y + 14} ${x},${y + 14}" fill="var(--teal)"/>` +
      `<text x="${x + 6}" y="${y + 11}" font-size="10.5" font-family="var(--mono)" font-weight="700" fill="#fff">${name}</text>` +
      (guard ? `<text x="${x + 64}" y="${y + 11}" font-size="10.5" font-family="var(--mono)" fill="var(--muted)">${guard}</text>` : '');
    const body = part(165, 'Client') + part(805, 'Service') +
      `<rect x="60" y="58" width="600" height="84" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>` +
      tag(60, 58, 'alt') +
      msg(200, 86, 656, 86, '[stok ada] proses order', 'sync') +
      `<line x1="60" y1="100" x2="660" y2="100" stroke="var(--navy)" stroke-width="1.2" stroke-dasharray="5,4"/>` +
      msg(656, 128, 204, 128, '[stok habis] batalkan', 'return') +
      `<rect x="60" y="156" width="600" height="48" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>` +
      tag(60, 156, 'opt') +
      msg(200, 188, 656, 188, 'kirim notifikasi — boleh tidak terjadi', 'sync') +
      `<rect x="60" y="218" width="600" height="48" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>` +
      tag(60, 218, 'loop', '[x &lt; 3]') +
      msg(200, 250, 656, 250, 'retry', 'sync');
    return figure({ viewBox: '0 0 980 284', body },
      'alt = salah satu kompartemen; opt = terjadi atau tidak sama sekali; loop = pengulangan dengan guard',
      'Combined fragments alt with two compartments, opt, and loop with an iteration guard on one interaction');
  },

  'state-notation': () => {
    const st = (x, w, text) => `<rect x="${x}" y="35" width="${w}" height="40" rx="14" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>` +
      `<text x="${x + w / 2}" y="60" text-anchor="middle" font-size="12.5" fill="var(--ink)">${text}</text>`;
    const lbl = (x, y, text) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="10.5" font-family="var(--mono)" fill="var(--muted)">${text}</text>`;
    const body = `<circle cx="40" cy="55" r="8" fill="var(--navy)"/>` + lbl(40, 95, 'initial') +
      `<line x1="48" y1="55" x2="64" y2="55" stroke="var(--navy)" stroke-width="2"/>${arrowHead(48, 55, 66, 55)}` +
      st(68, 150, 'Menunggu') + lbl(143, 95, 'state (rounded box)') +
      `<line x1="218" y1="55" x2="396" y2="55" stroke="var(--navy)" stroke-width="2"/>${arrowHead(218, 55, 400, 55)}` +
      `<text x="308" y="46" text-anchor="middle" font-size="12" font-family="var(--mono)" fill="var(--teal)" font-weight="600">event [guard] / action</text>` +
      lbl(308, 95, 'transition') +
      st(402, 150, 'Diproses') +
      `<line x1="552" y1="55" x2="620" y2="55" stroke="var(--navy)" stroke-width="2"/>${arrowHead(552, 55, 624, 55)}` +
      `<circle cx="638" cy="55" r="9" fill="none" stroke="var(--navy)" stroke-width="2"/><circle cx="638" cy="55" r="4" fill="var(--navy)"/>` + lbl(638, 95, 'final');
    return figure({ viewBox: '0 0 680 104', body },
      'initial → state → transition berlabel event [guard] / action → final',
      'State machine notation: initial node, rounded state, labelled transition, second state, final node');
  },

  'state-purchase-request': () => {
    const st = (x, y, w, text, fill, stroke) => `<rect x="${x}" y="${y}" width="${w}" height="40" rx="14" fill="${fill || 'var(--card)'}" stroke="${stroke || 'var(--navy)'}" stroke-width="1.8"/>` +
      `<text x="${x + w / 2}" y="${y + 25}" text-anchor="middle" font-size="12" fill="var(--ink)">${text}</text>`;
    const step = (x1, y, x2, label, color) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color || 'var(--navy)'}" stroke-width="2"/>${arrowHead(x1, y, x2, y, 9, color || 'var(--navy)')}` +
      `<text x="${(x1 + x2) / 2}" y="${y - 8}" text-anchor="middle" font-size="10.5" font-family="var(--mono)" fill="${color || 'var(--muted)'}">${label}</text>`;
    const body =
      st(20, 40, 100, 'Draft') + st(180, 40, 118, 'Submitted') + st(358, 40, 172, 'PendingApproval') +
      st(600, 40, 112, 'Approved') + st(782, 40, 108, 'Ordered') +
      step(120, 60, 176, 'submit') + step(300, 60, 354, 'review') + step(532, 60, 596, 'approve') + step(714, 60, 778, 'PO') +
      `<line x1="444" y1="80" x2="474" y2="134" stroke="var(--red)" stroke-width="2"/>${arrowHead(444, 80, 476, 138, 9, 'var(--red)')}` +
      `<text x="432" y="115" font-size="10.5" font-family="var(--mono)" fill="var(--red)">reject</text>` +
      st(424, 140, 112, 'Rejected', 'var(--red-soft)', 'var(--red)') +
      `<line x1="836" y1="80" x2="680" y2="134" stroke="var(--navy)" stroke-width="2"/>${arrowHead(836, 80, 676, 138)}` +
      `<text x="788" y="110" font-size="10.5" font-family="var(--mono)" fill="var(--muted)">terima barang</text>` +
      st(600, 140, 112, 'Received') + st(782, 140, 108, 'Closed', 'var(--green-soft)', 'var(--green)') +
      step(714, 160, 778, 'close') +
      `<text x="30" y="215" font-size="10.5" font-family="var(--mono)" fill="var(--muted)">dua pemeriksaan: semua state reachable? semua state punya transisi keluar?</text>`;
    return figure({ viewBox: '0 0 980 226', body },
      'siklus hidup satu objek: PurchaseRequest — Draft sampai Closed, dengan cabang Rejected',
      'PurchaseRequest state machine from Draft to Closed with a Rejected branch');
  },
};

/** KONTEN → HTML. Markers become structure; everything else is Markdown. */
export function renderKonten(konten, { baseDir } = {}) {
  const lines = konten.split('\n');
  const out = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const text = line.trim();
    if (!text) { index += 1; continue; }

    if (text.startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(lines[index].trim());
        index += 1;
      }
      out.push(renderTable(rows));
      continue;
    }

    if (text === 'SPLIT:') {
      const block = [];
      index += 1;
      while (index < lines.length && /^\s+\S/.test(lines[index])) {
        block.push(lines[index]);
        index += 1;
      }
      out.push(renderPanels(block));
      continue;
    }

    if (text === 'STRUCK:' || text.startsWith('- ') || /^\d+\.\s/.test(text)) {
      const struck = text === 'STRUCK:';
      if (struck) index += 1;
      const ordered = /^\d+\.\s/.test(lines[index]?.trim() ?? '');
      const items = [];
      while (index < lines.length) {
        const item = lines[index].trim();
        if (!/^(-\s|\d+\.\s)/.test(item)) break;
        items.push(`<li>${segment(item.replace(/^(-\s|\d+\.\s)/, ''))}</li>`);
        index += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${struck ? ' class="struck"' : ''}>${items.join('')}</${tag}>`);
      continue;
    }

    if (text.startsWith('DIAGRAM ') || text.startsWith('DIAGRAM:')) {
      const name = text.replace(/^DIAGRAM:?\s*/, '').trim();
      const build = DIAGRAMS[name];
      if (!build) throw new Error(`unknown DIAGRAM "${name}" — add it to DIAGRAMS in deck.mjs or fix the name`);
      out.push(build());
      index += 1;
      continue;
    }

    // A real (raster) image, unlike DIAGRAM's hand-coded SVG library. Path is relative to
    // the naskah's own directory, so the source stays a lightweight pointer — the base64
    // blob only exists in the built HTML, never in the .md diff. `IMAGE path | caption`.
    if (text.startsWith('IMAGE ') || text.startsWith('IMAGE:')) {
      const rest = text.replace(/^IMAGE:?\s*/, '').trim();
      const [relPath, ...capParts] = rest.split('|').map((s) => s.trim());
      const caption = capParts.join('|').trim();
      if (!baseDir) throw new Error(`IMAGE "${relPath}" needs a baseDir — only resolvable during build()`);
      const filePath = resolve(baseDir, relPath);
      if (!existsSync(filePath)) throw new Error(`IMAGE file not found: ${filePath}`);
      const ext = filePath.split('.').pop().toLowerCase();
      const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' }[ext];
      if (!mime) throw new Error(`IMAGE "${relPath}" — unsupported extension .${ext}`);
      const data = readFileSync(filePath).toString('base64');
      const alt = escapeHtml(caption || basename(relPath));
      out.push(`<figure class="diagram"><img src="data:${mime};base64,${data}" alt="${alt}" style="display:block;max-width:100%;height:auto"/>` +
        (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') + `</figure>`);
      index += 1;
      continue;
    }

    if (text.startsWith('LEAD ') || text.startsWith('LEAD:')) {
      out.push(`<p class="lead">${inline(text.replace(/^LEAD:?\s*/, ''))}</p>`);
      index += 1;
      continue;
    }
    if (text.startsWith('FINE:')) {
      out.push(`<p class="fine">${inline(text.replace(/^FINE:\s*/, ''))}</p>`);
      index += 1;
      continue;
    }

    out.push(`<p>${segment(text)}</p>`);
    index += 1;
  }

  return out.join('');
}

// ── page ─────────────────────────────────────────────────────────────────────
//
// A projectable deck, not a review page: review happens on naskah.md and materi.md, so
// the HTML is the thing that goes on the projector (ADR 0006).

const CSS = `
*{box-sizing:border-box}
:root{
  --navy:#0f2a44; --navy-2:#163a5f; --teal:#0e6e6e; --teal-soft:#dcefed;
  --amber:#b45309; --amber-soft:#fdf3e3; --red:#b3392f; --red-soft:#fbeae9;
  --green:#1f6b3b; --green-soft:#e6f2ea;
  --bg:#f6f7f9; --card:#ffffff; --ink:#0f172a; --muted:#5a6675;
  --border:#e2e8f0; --radius:16px;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial}
.topbar{position:sticky;top:0;z-index:50;background:var(--navy);color:#e2e8f0;padding:9px 18px;
  display:flex;align-items:center;justify-content:space-between;gap:14px;
  box-shadow:0 2px 10px rgba(0,0,0,.2)}
.topbar .left{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.topbar .dot{width:9px;height:9px;border-radius:50%;background:var(--teal)}
.topbar h1{font-size:12.5px;font-weight:600;margin:0;letter-spacing:.02em}
.topbar .meta{font-size:11.5px;color:#aebcd0;font-family:var(--mono)}
.topbar .right{display:flex;align-items:center;gap:8px}
.btn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);color:#e2e8f0;
  font-size:11.5px;padding:5px 11px;border-radius:999px;cursor:pointer;font-weight:500}
.btn:hover{background:rgba(255,255,255,.2)}
.btn.on{background:var(--teal);border-color:var(--teal);color:#fff}
main{max-width:1080px;margin:0 auto;padding:0 20px 90px}
.slide{display:none;min-height:88vh;padding:46px 18px 30px}
.slide.on{display:block}
.kicker{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--teal);margin:0 0 10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.kicker .min{color:var(--amber)}
.kicker .hold{color:var(--navy-2);background:var(--teal-soft);border:1px solid #bfdcdb;
  padding:2px 8px;border-radius:999px;font-size:10px;letter-spacing:.1em}
.kicker .flagtag{color:#8a5a00;background:var(--amber-soft);border:1px solid #f0d6ab;
  padding:2px 8px;border-radius:999px;font-size:10px;letter-spacing:.06em}
h1,h2{font-weight:700;letter-spacing:-.01em;text-wrap:balance}
h2{margin:0 0 18px;font-size:clamp(24px,3.2vw,36px);line-height:1.15}
.lead{font-size:clamp(17px,2vw,22px);font-weight:600;margin:14px 0 12px;line-height:1.32}
.fine{font-size:12.5px;color:var(--muted);margin-top:14px;line-height:1.5}
p,li{line-height:1.55;font-size:16px}
p{margin:0 0 .7em}
ul,ol{margin:0 0 .7em;padding-left:1.3em}
li{margin-bottom:.42em}
li:last-child{margin-bottom:0}
code{font-family:var(--mono);background:var(--teal-soft);color:var(--navy-2);padding:1.5px 6px;
  border-radius:6px;font-size:.9em}
ul.struck{list-style:none;padding:0;margin:0 0 16px}
ul.struck li{padding:9px 0;font-size:clamp(17px,2vw,22px);font-weight:600;color:var(--muted);
  text-decoration:line-through;text-decoration-color:var(--red);text-decoration-thickness:3px}
.tw{overflow-x:auto;margin:14px 0}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:var(--radius);
  overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.05)}
th{background:var(--navy);color:#fff;font-size:12.5px;letter-spacing:.04em;padding:10px 14px;
  text-align:left;font-weight:600}
td{padding:10px 14px;border-bottom:1px solid var(--border);font-size:14px;vertical-align:top}
tr:last-child td{border-bottom:none}
tr.mark td{background:var(--amber-soft);font-weight:600}
tr.mark td:first-child{box-shadow:inset 3px 0 0 var(--amber)}
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:16px 0}
.panel{border-radius:var(--radius);padding:18px 20px;background:var(--card);
  border:1px solid var(--border)}
.panel.good{border-color:var(--green);background:var(--green-soft)}
.panel.bad{border-color:var(--red);background:var(--red-soft)}
.panel span{display:block;margin-top:6px}
.plabel{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.12em;
  text-transform:uppercase;font-weight:700;margin-bottom:6px;color:var(--muted)}
.panel.good .plabel{color:var(--green)}
.panel.bad .plabel{color:var(--red)}
.pnum{font-size:clamp(42px,6vw,72px);font-weight:800;color:var(--teal);line-height:1}
.veil{display:inline-block;font-family:var(--mono);font-size:.85em;color:var(--muted);
  background:repeating-linear-gradient(-45deg,#eef1f5,#eef1f5 6px,#dde2e8 6px,#dde2e8 8px);
  padding:.35em .8em;border-radius:8px;border:1.5px dashed #b6c0cc}
.todo{font-family:var(--mono);font-size:.8em;letter-spacing:.06em;color:var(--amber);
  background:var(--amber-soft);padding:.15em .6em;border-radius:6px;font-weight:600}
.hi{color:var(--teal);font-weight:600}
.diagram{margin:16px 0}
.diagram svg{display:block;max-width:100%;height:auto;max-height:320px;margin:0 auto}
.diagram figcaption{font-size:12px;color:var(--muted);margin-top:6px;font-family:var(--mono)}
.notes{display:none;margin-top:24px;background:#fff8ec;border-left:4px solid var(--amber);
  border-radius:0 12px 12px 0;padding:14px 18px;font-size:13px;line-height:1.6;color:#4a3b1e}
.notes .plabel{color:#8a5a00;margin-bottom:8px}
body.show-notes .notes{display:block}
.foot{position:fixed;left:0;right:0;bottom:0;background:rgba(246,247,249,.92);
  backdrop-filter:blur(6px);border-top:1px solid var(--border);padding:7px 18px;
  display:flex;justify-content:space-between;align-items:center;font-size:11.5px;
  color:var(--muted);font-family:var(--mono);z-index:40}
.foot .arrow{color:var(--navy);font-weight:700}
@page{size:338mm 190mm;margin:10mm}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{
  .topbar,.foot,.btn{display:none!important}
  .slide{display:block!important;min-height:auto;page-break-after:always}
  body.show-notes .notes{display:block}
}
@media(max-width:640px){
  main{padding:0 10px 70px}.slide{padding:26px 6px 20px}
}
`;

const NAV = `
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  var pos=document.getElementById('pos');
  var i=0;
  function show(n){
    slides[i].classList.remove('on');
    i=(n+slides.length)%slides.length;
    slides[i].classList.add('on');
    if(pos)pos.textContent=(i+1)+' / '+slides.length;
    window.scrollTo(0,0);
    if(location.hash!=='#s'+(i+1))history.replaceState(null,'','#s'+(i+1));
  }
  function toggleNotes(){
    document.body.classList.toggle('show-notes');
    var b=document.getElementById('btnNotes');
    if(b)b.classList.toggle('on',document.body.classList.contains('show-notes'));
  }
  window.toggleNotes=toggleNotes;
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();show(i+1);}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(i-1);}
    else if(e.key==='Home'){show(0);}
    else if(e.key==='End'){show(slides.length-1);}
    else if(e.key==='n'||e.key==='N'){toggleNotes();}
    else if(e.key==='f'||e.key==='F'){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}
    else if(/^[0-9]$/.test(e.key)){var k=parseInt(e.key,10);if(k>=1&&k<=9)show(k-1);}
  });
  var touchX=null;
  document.addEventListener('touchstart',function(e){touchX=e.touches[0].clientX;});
  document.addEventListener('touchend',function(e){
    if(touchX===null)return;
    var d=e.changedTouches[0].clientX-touchX;
    if(Math.abs(d)>60)show(i+(d<0?1:-1));
    touchX=null;
  });
  var start=parseInt((location.hash||'').replace('#s',''),10);
  show(isNaN(start)?0:start-1);
})();
`;

/**
 * Render one audience. The two audiences take separate paths on purpose: NOTES and
 * VISUAL are never written into the materi, so they are absent from the file rather
 * than hidden by CSS (ADR 0002).
 */
export function renderHtml(spec, { audience, baseDir }) {
  const naskah = audience === 'naskah';
  const fm = spec.frontmatter;
  const title = naskah ? fm['title-naskah'] ?? 'Naskah Pengampu' : fm['title-materi'] ?? 'Materi Kuliah';
  const course = fm.course ?? '';
  const session = fm.session;
  const slotStart = fm['slot-start'];
  const slotMinutes = fm['slot-minutes'];
  const slotEnd = slotStart && slotMinutes ? clockAt(slotStart, slotMinutes) : '';
  const metaBits = [
    slotStart && slotEnd ? `${slotStart}–${slotEnd}` : '',
    slotMinutes ? `${slotMinutes} menit` : '',
    `${spec.slides.length} slide`,
  ].filter(Boolean).join(' · ');
  const heading = [course, fm.topic].filter(Boolean).join(' · ');
  const out = [];

  out.push(`<title>${escapeHtml(title)}</title>`);
  out.push(`<style>${CSS}</style>`);
  out.push('<div class="topbar">');
  out.push(`<div class="left"><span class="dot"></span><h1>${escapeHtml(heading)}</h1>` +
    `<span class="meta">${escapeHtml(metaBits)}</span></div>`);
  out.push('<div class="right">');
  if (naskah) out.push('<button class="btn" id="btnNotes" onclick="toggleNotes()" title="N">Catatan pengampu</button>');
  out.push('<button class="btn" id="btnFull" onclick="document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()" title="F">⛶ Layar penuh</button>');
  out.push('</div></div>');
  out.push('<main>');

  spec.slides.forEach((slide, index) => {
    let kicker = '';
    if (slide.unit) kicker += `<span>${escapeHtml(slide.unit)}</span>`;
    if (naskah && slide.clock) kicker += `<span class="min">menit ${slide.min} · ${slide.clock}</span>`;
    if (slide.hold) kicker += '<span class="hold">TAHAN DI LAYAR</span>';
    if (naskah && slide.flag) kicker += `<span class="flagtag">${escapeHtml(slide.flag)}</span>`;
    const konten = renderKonten(!naskah && slide.kontenMahasiswa ? slide.kontenMahasiswa : slide.konten, { baseDir });
    // VISUAL is instructor-only context (what to project/draw), surfaced beside NOTES —
    // never written into the materi, same guarantee as NOTES itself (ADR 0002).
    const notes = naskah
      ? `<div class="notes"><span class="plabel">Catatan pengampu</span>` +
        (slide.visual ? `<p style="margin:0 0 8px;font-style:italic">Visual: ${inline(slide.visual)}</p>` : '') +
        `${inline(slide.notes)}</div>`
      : '';
    out.push(
      `<section class="slide${index === 0 ? ' on' : ''}" id="s${slide.n}">` +
      (kicker ? `<p class="kicker">${kicker}</p>` : '') +
      `<h2>${inline(slide.title)}</h2>` +
      `${konten}${notes}</section>`,
    );
  });

  out.push('</main>');
  out.push(
    `<div class="foot"><span id="pos">1 / ${spec.slides.length}</span>` +
    '<span>← → navigasi · N catatan pengampu · F layar penuh</span>' +
    `<span class="arrow">${escapeHtml([course, session ? `Sesi ${session}` : ''].filter(Boolean).join(' · '))}</span></div>`,
  );
  out.push(`<script>${NAV}</script>`);
  return out.join('\n');
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
      slides: anyEndsWith(files, `Sesi ${n} - Slides.html`) || anyEndsWith(files, `Sesi ${n} - Slides.pdf`),
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
