#!/usr/bin/env node
// @ts-check
// rps-deck — build instructor and student session decks from a reviewed spec.
//
// The spec `.md` is the single source of truth (ADR 0001): everything rendered is
// derived from it, never retyped alongside it.

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
const MARKERS = new Set(['LEAD', 'FINE', 'SPLIT', 'STRUCK', 'PANEL', 'NUM', 'LABEL', 'VEIL', 'TODO', 'HI', 'MARK']);
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

/** KONTEN → HTML. Markers become structure; everything else is Markdown. */
export function renderKonten(konten) {
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

// ── page ──────────────────────────────────────────────────────────────────────

const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{
  --ground:#F6F7F9; --surface:#FFFFFF; --surface-2:#EEF1F5;
  --ink:#16202B; --ink-2:#5A6675; --ink-3:#8B95A1;
  --rule:#DDE2E8; --rule-2:#C6CED7;
  --accent:#0E6E6E; --accent-soft:#DCEDEC;
  --flag:#8A5A00; --flag-soft:#F7EBD4;
  --note:#3B4B8C; --note-soft:#E8EBF6;
  --bad:#8C2F2F; --good:#1F6B3B;
  --serif:Charter,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#10151B; --surface:#171E26; --surface-2:#1E2731;
    --ink:#E6EBF0; --ink-2:#A3AEBA; --ink-3:#78838F;
    --rule:#2A333D; --rule-2:#3A4552;
    --accent:#4FC4C0; --accent-soft:#12312F;
    --flag:#D9A441; --flag-soft:#33270F;
    --note:#8FA0E8; --note-soft:#1B2138;
    --bad:#E08585; --good:#6FC28E;
  }
}
:root[data-theme="dark"]{
  --ground:#10151B; --surface:#171E26; --surface-2:#1E2731;
  --ink:#E6EBF0; --ink-2:#A3AEBA; --ink-3:#78838F;
  --rule:#2A333D; --rule-2:#3A4552;
  --accent:#4FC4C0; --accent-soft:#12312F;
  --flag:#D9A441; --flag-soft:#33270F;
  --note:#8FA0E8; --note-soft:#1B2138;
  --bad:#E08585; --good:#6FC28E;
}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
  font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:940px;margin:0 auto;padding:0 24px 96px}
header.top{padding:56px 0 32px;border-bottom:2px solid var(--ink)}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--accent);margin:0 0 14px}
h1{font-family:var(--serif);font-size:clamp(30px,5vw,46px);line-height:1.12;margin:0 0 10px;
  font-weight:600;text-wrap:balance;letter-spacing:-.01em}
.sub{color:var(--ink-2);margin:0 0 26px;max-width:62ch}
.facts{display:flex;flex-wrap:wrap;gap:0;border-top:1px solid var(--rule)}
.fact{flex:1 1 130px;padding:14px 18px 14px 0;border-right:1px solid var(--rule)}
.fact:last-child{border-right:0}
.fact .k{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-3);display:block;margin-bottom:4px}
.fact .v{font-family:var(--serif);font-size:20px;font-variant-numeric:tabular-nums}
.badge{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;
  letter-spacing:.1em;text-transform:uppercase;padding:6px 11px;border-radius:2px;margin-bottom:16px}
.badge.ins{background:var(--note-soft);color:var(--note);box-shadow:inset 0 0 0 1px currentColor}
.badge.stu{background:var(--accent-soft);color:var(--accent);box-shadow:inset 0 0 0 1px currentColor}
.callout{margin:26px 0 0;padding:16px 18px;border-left:3px solid var(--flag);
  background:var(--flag-soft);color:var(--ink);font-size:14.5px;border-radius:0 3px 3px 0}
.callout b{color:var(--flag)}
.unit{display:flex;align-items:baseline;gap:14px;margin:56px 0 0;padding-bottom:10px;
  border-bottom:1px solid var(--rule-2)}
.unit .u{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--accent);letter-spacing:.08em}
.unit .n{font-family:var(--serif);font-size:20px;font-weight:600}
.unit .m{margin-left:auto;font-family:var(--mono);font-size:11.5px;color:var(--ink-3);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.slide{display:grid;grid-template-columns:74px 1fr;gap:20px;margin-top:22px}
.rail{font-family:var(--mono);font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums;
  padding-top:16px;text-align:right;line-height:1.5}
.rail .num{display:block;font-size:19px;color:var(--ink);font-weight:600}
.rail .clk{display:block;color:var(--accent)}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:4px;padding:20px 24px 22px}
.card h2{font-family:var(--serif);font-size:22px;font-weight:600;margin:0 0 4px;line-height:1.25;
  text-wrap:balance}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
.tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;
  padding:3px 7px;border-radius:2px;background:var(--surface-2);color:var(--ink-2)}
.tag.hold{background:var(--accent-soft);color:var(--accent)}
.tag.flag{background:var(--flag-soft);color:var(--flag)}
.card p{margin:0 0 10px}
.card ul,.card ol{margin:0 0 10px;padding-left:20px}
.card li{margin-bottom:7px}
.card li:last-child{margin-bottom:0}
.lead{font-family:var(--serif);font-size:19px;line-height:1.35;color:var(--ink)}
.fine{font-size:13.5px;color:var(--ink-2)}
.hi{color:var(--accent);font-weight:600}
.struck li{text-decoration:line-through;color:var(--ink-3)}
code{font-family:var(--mono);font-size:.87em;background:var(--surface-2);padding:1px 5px;border-radius:2px}
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0}
.panel{display:flex;flex-direction:column;gap:5px;padding:14px 16px;background:var(--surface-2);
  border-radius:3px;border-left:2px solid var(--rule-2)}
.plabel{font-family:var(--mono);font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-3)}
.pnum{font-family:var(--serif);font-size:26px;font-variant-numeric:tabular-nums;line-height:1.1}
.tw{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-family:var(--mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ink-3);border-bottom:1px solid var(--rule-2);white-space:nowrap}
tr.mark td{background:var(--accent-soft)}
.veil{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3);background:repeating-linear-gradient(-45deg,
  var(--surface-2),var(--surface-2) 4px,var(--rule) 4px,var(--rule) 5px);padding:3px 9px;border-radius:2px}
.todo{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--flag);
  background:var(--flag-soft);padding:2px 8px;border-radius:2px;font-weight:600}
.visual,.notes{margin-top:14px;padding-top:12px;border-top:1px dashed var(--rule)}
.vlabel{font-family:var(--mono);font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;
  color:var(--ink-3);display:block;margin-bottom:5px}
.visual p{font-size:13.5px;color:var(--ink-2);margin:0}
.notes{border-top:1px solid var(--note);background:var(--note-soft);margin:14px -24px -22px;
  padding:12px 24px 16px;border-radius:0 0 3px 3px}
.notes .vlabel{color:var(--note)}
.notes p{font-size:14px;color:var(--ink);margin:0}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--rule);font-size:13.5px;color:var(--ink-2)}
footer p{margin:0 0 8px}
a{color:var(--accent)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (max-width:620px){
  .slide{grid-template-columns:1fr;gap:6px}
  .rail{text-align:left;padding-top:0;display:flex;gap:10px;align-items:baseline}
  .rail .num{font-size:15px}
  .notes{margin-left:-24px;margin-right:-24px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/**
 * Render one audience. The two audiences take separate paths on purpose: NOTES and
 * VISUAL are never written into the materi, so they are absent from the file rather
 * than hidden by CSS (ADR 0002).
 */
export function renderHtml(spec, { audience }) {
  const naskah = audience === 'naskah';
  const fm = spec.frontmatter;
  const flags = spec.slides.filter((s) => s.flag);
  const out = [];

  out.push(`<title>${escapeHtml(naskah ? fm['title-naskah'] ?? 'Naskah Pengampu' : fm['title-materi'] ?? 'Materi Kuliah')}</title>`);
  out.push(`<style>${CSS}</style>`);
  out.push('<div class="wrap">', '<header class="top">');
  out.push(naskah
    ? '<span class="badge ins">Naskah pengampu · jangan dibagikan</span>'
    : '<span class="badge stu">Pratinjau materi kuliah</span>');
  if (fm.eyebrow) out.push(`<p class="eyebrow">${escapeHtml(fm.eyebrow)}</p>`);
  out.push(`<h1>${inline(fm.topic ?? fm.course ?? '')}</h1>`);
  if (fm.sub) out.push(`<p class="sub">${inline(fm.sub)}</p>`);
  out.push('<div class="facts">');
  for (const [key, value] of [
    ['Sesi', fm.session], ['Slot', `${fm['slot-start']}–${clockAt(fm['slot-start'], fm['slot-minutes'])}`],
    ['Durasi', `${fm['slot-minutes']} menit`], ['Slide', spec.slides.length], ['Artefak', fm.artifact],
  ]) {
    if (value === undefined || value === null || value === '') continue;
    out.push(`<div class="fact"><span class="k">${escapeHtml(key)}</span><span class="v">${escapeHtml(String(value))}</span></div>`);
  }
  out.push('</div>');
  if (naskah && flags.length) {
    out.push(`<div class="callout"><b>Belum siap render.</b> ${flags.length} FLAG terbuka: ${
      flags.map((s) => `slide ${s.n} — ${escapeHtml(s.flag)}`).join('; ')}.</div>`);
  }
  out.push('</header>');

  for (const slide of spec.slides) {
    if (slide.unit) {
      const [code, ...name] = slide.unit.split('·');
      out.push(`<section class="unit"><span class="u">${escapeHtml(code.trim())}</span>` +
        `<span class="n">${escapeHtml(name.join('·').trim())}</span>` +
        (naskah && slide.clock ? `<span class="m">menit ${slide.min} · ${slide.clock}</span>` : '') +
        '</section>');
    }
    let rail = `<span class="num">${String(slide.n).padStart(2, '0')}</span>`;
    if (naskah && slide.clock) {
      rail += `<span>m${String(slide.min).padStart(3, '0')}</span><span class="clk">${slide.clock}</span>`;
    }
    let tags = '';
    if (slide.hold) tags += '<span class="tag hold">Tahan di layar</span>';
    if (naskah && slide.flag) tags += `<span class="tag flag">${escapeHtml(slide.flag)}</span>`;
    const konten = renderKonten(!naskah && slide.kontenMahasiswa ? slide.kontenMahasiswa : slide.konten);
    const extra = naskah
      ? `<div class="visual"><span class="vlabel">Arahan visual</span><p>${inline(slide.visual)}</p></div>` +
        `<div class="notes"><span class="vlabel">Catatan pengampu</span><p>${inline(slide.notes)}</p></div>`
      : '';
    out.push(`<article class="slide"><div class="rail">${rail}</div><div class="card">` +
      `<h2>${inline(slide.title)}</h2>${tags ? `<div class="tags">${tags}</div>` : ''}${konten}${extra}</div></article>`);
  }

  out.push(`<footer><p>${inline(fm.footer ?? '')}</p></footer></div>`);
  return out.join('\n');
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

// ── cli ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = new Set();
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) flags.add(arg.slice(2));
    else positional.push(arg);
  }
  return { command: positional[0], args: positional.slice(1), flags };
}

const USAGE = `rps-deck — build session decks from a reviewed spec

  check <spec.md>                    validate the spec
  build [--final] <spec.md>          emit naskah + materi (--final refuses open FLAGs)
  scan <file> <map.json>             residual identifier scan
  sanitise <src> <map.json> <dst>    apply the map, then scan the result

The spec .md is the source of truth; everything else is derived.`;

function reportErrors(errors) {
  for (const error of errors) {
    const where = error.line ? ` (line ${error.line})` : '';
    console.error(`  ✗ ${error.message}${where}`);
  }
}

async function main() {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { basename, dirname, join } = await import('node:path');
  const { command, args, flags } = parseArgs(process.argv.slice(2));

  if (!command || flags.has('help')) {
    console.log(USAGE);
    return 0;
  }

  if (command === 'check' || command === 'build') {
    const path = args[0];
    if (!path) {
      console.error('  ✗ no spec given');
      return 1;
    }
    const spec = parseSpec(readFileSync(path, 'utf8'));
    const errors = validate(spec);
    if (errors.length) {
      console.error(`✗ ${basename(path)} — ${errors.length} problem(s)`);
      reportErrors(errors);
      return 1;
    }
    const open = spec.slides.filter((s) => s.flag);
    if (command === 'check') {
      console.log(`✓ ${basename(path)} — ${spec.slides.length} slides, clock consistent`);
      if (open.length) console.log(`  ⚠ ${open.length} open FLAG(s)`);
      return 0;
    }

    // Two gates, because previewing with a placeholder is legitimate and teaching from
    // one is not (ADR 0002 companion decision).
    if (open.length && flags.has('final')) {
      console.error(`✗ ${open.length} open FLAG blocks release:`);
      reportErrors(open.map((s) => ({ line: s.line, message: `slide ${s.n} — ${s.flag}` })));
      return 1;
    }
    if (open.length) {
      console.log(`⚠ ${open.length} open FLAG:`);
      for (const slide of open) console.log(`    slide ${slide.n} — ${slide.flag}`);
    }

    // `out-stem` keeps a republished deck on its existing artifact URL.
    const stem = spec.frontmatter['out-stem'] ?? basename(path).replace(/\.md$/, '');
    const dir = spec.frontmatter.out ? join(dirname(path), spec.frontmatter.out) : dirname(path);
    for (const [audience, suffix] of [['naskah', 'pengampu'], ['materi', 'mahasiswa']]) {
      const html = renderHtml(spec, { audience });
      const target = join(dir, `${stem}-${suffix}.html`);
      writeFileSync(target, html);
      if (audience === 'materi') {
        // Structural, not cosmetic: assert the promise the two code paths exist to keep.
        const leaks = [/<div class="notes"/, /<div class="visual"/, /class="clk"/]
          .filter((re) => re.test(html));
        if (leaks.length) {
          console.error(`  ✗ materi leaked instructor content: ${leaks.join(', ')}`);
          return 1;
        }
      }
      console.log(`  ✓ ${basename(target)}`);
    }
    return 0;
  }

  if (command === 'scan' || command === 'sanitise') {
    const [source, mapPath, destination] = args;
    const map = JSON.parse(readFileSync(mapPath, 'utf8'));
    const text = command === 'scan'
      ? readFileSync(source, 'utf8')
      : applyMap(readFileSync(source, 'utf8'), map);
    const hits = scanResiduals(text, map);
    if (hits.length) {
      console.error(`✗ ${hits.length} residual(s):`);
      for (const hit of hits.slice(0, 40)) {
        console.error(`  line ${hit.line} [${hit.kind}] ${hit.match}`);
      }
      return 1;
    }
    if (command === 'sanitise') {
      writeFileSync(destination, text);
      console.log(`  ✓ ${destination} — scan clean`);
    } else {
      console.log('  ✓ scan clean');
    }
    return 0;
  }

  console.error(`unknown command: ${command}\n\n${USAGE}`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => { process.exitCode = code; });
}
