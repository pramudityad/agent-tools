#!/usr/bin/env node
// @ts-check
// rps-deck — build instructor and student session decks from a reviewed spec.
//
// The spec `.md` is the single source of truth (ADR 0001): everything rendered is
// derived from it, never retyped alongside it.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

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

// ── page ─────────────────────────────────────────────────────────────────────
//
// A projectable deck, not a review page: review happens on naskah.md and materi.md, so
// the HTML is the thing that goes on the projector (ADR 0006).

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
html,body{height:100%}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
  font-size:clamp(16px,1.35vw,22px);line-height:1.5;-webkit-font-smoothing:antialiased;
  overflow:hidden}
.deck{position:fixed;inset:0}
.slide{position:absolute;inset:0;display:none;padding:clamp(28px,5vh,72px) clamp(24px,6vw,96px)
  calc(clamp(28px,5vh,72px) + 44px);overflow-y:auto}
.slide.live{display:flex;flex-direction:column;justify-content:center}
body.pane-on .slide{padding-bottom:calc(38vh + 44px)}
.inner{width:100%;max-width:1060px;margin:0 auto}
.eyebrow{font-family:var(--mono);font-size:.6em;letter-spacing:.14em;text-transform:uppercase;
  color:var(--accent);margin:0 0 .8em}
h1{font-family:var(--serif);font-size:2.1em;line-height:1.1;margin:0 0 .3em;font-weight:600;
  text-wrap:balance;letter-spacing:-.01em}
h2{font-family:var(--serif);font-size:1.55em;line-height:1.15;margin:0 0 .55em;font-weight:600;
  text-wrap:balance}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 1em}
.tag{font-family:var(--mono);font-size:.5em;letter-spacing:.1em;text-transform:uppercase;
  padding:4px 9px;border-radius:2px;background:var(--surface-2);color:var(--ink-2)}
.tag.hold{background:var(--accent-soft);color:var(--accent)}
.tag.flag{background:var(--flag-soft);color:var(--flag)}
.tag.time{background:var(--note-soft);color:var(--note);font-variant-numeric:tabular-nums}
p{margin:0 0 .7em}
ul,ol{margin:0 0 .7em;padding-left:1.3em}
li{margin-bottom:.42em}
li:last-child{margin-bottom:0}
.lead{font-family:var(--serif);font-size:1.5em;line-height:1.25}
.fine{font-size:.8em;color:var(--ink-2)}
.hi{color:var(--accent);font-weight:600}
.struck li{text-decoration:line-through;color:var(--ink-3)}
code{font-family:var(--mono);font-size:.85em;background:var(--surface-2);padding:.1em .4em;
  border-radius:3px}
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:.9em 0}
.panel{display:flex;flex-direction:column;gap:8px;padding:20px 22px;background:var(--surface);
  border-radius:5px;border-left:3px solid var(--rule-2)}
.panel.bad{border-left-color:var(--bad)} .panel.bad .plabel{color:var(--bad)}
.panel.good{border-left-color:var(--good)} .panel.good .plabel{color:var(--good)}
.plabel{font-family:var(--mono);font-size:.55em;letter-spacing:.11em;text-transform:uppercase;
  color:var(--ink-3)}
.pnum{font-family:var(--serif);font-size:1.9em;font-variant-numeric:tabular-nums;line-height:1.05}
.tw{overflow-x:auto;margin:.9em 0}
table{border-collapse:collapse;width:100%;font-size:.82em}
th,td{text-align:left;padding:.6em .8em;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-family:var(--mono);font-size:.72em;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ink-3);border-bottom:1px solid var(--rule-2);white-space:nowrap}
tr.mark td{background:var(--accent-soft)}
.veil{display:inline-block;font-family:var(--mono);font-size:.62em;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3);background:repeating-linear-gradient(-45deg,
  var(--surface-2),var(--surface-2) 5px,var(--rule) 5px,var(--rule) 6px);padding:.25em .7em;
  border-radius:3px}
.todo{font-family:var(--mono);font-size:.68em;letter-spacing:.08em;color:var(--flag);
  background:var(--flag-soft);padding:.15em .6em;border-radius:3px;font-weight:600}
.hud{position:fixed;left:0;right:0;bottom:0;height:44px;display:flex;align-items:center;
  gap:14px;padding:0 18px;background:var(--surface);border-top:1px solid var(--rule);
  font-family:var(--mono);font-size:12px;color:var(--ink-2);z-index:3}
.hud .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hud .grow{margin-left:auto;display:flex;align-items:center;gap:10px}
.hud button{font:inherit;color:inherit;background:var(--surface-2);border:1px solid var(--rule);
  border-radius:3px;padding:3px 10px;cursor:pointer}
.hud button:hover{border-color:var(--accent);color:var(--accent)}
.hud button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#count{font-variant-numeric:tabular-nums}
.bar{position:fixed;left:0;top:0;height:3px;background:var(--accent);width:0;z-index:4;
  transition:width .18s ease}
#pane{position:fixed;left:0;right:0;bottom:44px;max-height:38vh;overflow-y:auto;
  background:var(--note-soft);border-top:2px solid var(--note);padding:16px 22px;
  display:none;z-index:2}
body.pane-on #pane{display:block}
#pane .plabel{color:var(--note);display:block;margin-bottom:6px}
#pane .body{font-size:.82em;line-height:1.5}
#pane .vis{font-size:.75em;color:var(--ink-2);margin-bottom:.7em;padding-bottom:.6em;
  border-bottom:1px dashed var(--rule-2)}
.notes,.visual{display:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{html,body{height:auto;overflow:visible}.deck{position:static}
  .slide{position:static;display:block;page-break-after:always;
  min-height:auto;overflow:visible}.hud,#pane,.bar{display:none}}
`;

const NAV = `
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  var pane=document.getElementById('pane');
  var count=document.getElementById('count');
  var bar=document.getElementById('bar');
  var i=0;
  function show(n){
    i=Math.max(0,Math.min(slides.length-1,n));
    slides.forEach(function(s,x){s.classList.toggle('live',x===i);});
    count.textContent=(i+1)+' / '+slides.length;
    bar.style.width=((i+1)/slides.length*100)+'%';
    if(pane){
      var src=slides[i].querySelector('.notes');
      var vis=slides[i].querySelector('.visual');
      pane.innerHTML='<span class="plabel">Catatan pengampu — slide '+(i+1)+'</span>'+
        (vis?'<div class="vis">'+vis.innerHTML+'</div>':'')+
        '<div class="body">'+(src?src.innerHTML:'<i>tidak ada catatan</i>')+'</div>';
    }
    if(location.hash!=='#s'+(i+1))history.replaceState(null,'','#s'+(i+1));
  }
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')  {show(i+1);e.preventDefault();}
    else if(e.key==='ArrowLeft'||e.key==='PageUp')             {show(i-1);e.preventDefault();}
    else if(e.key==='Home')                                    {show(0);e.preventDefault();}
    else if(e.key==='End')                                     {show(slides.length-1);e.preventDefault();}
    else if(e.key==='n'||e.key==='N'){document.body.classList.toggle('pane-on');}
  });
  var prev=document.getElementById('prev'),next=document.getElementById('next'),
      toggle=document.getElementById('notes-toggle');
  if(prev)prev.addEventListener('click',function(){show(i-1);});
  if(next)next.addEventListener('click',function(){show(i+1);});
  if(toggle)toggle.addEventListener('click',function(){document.body.classList.toggle('pane-on');});
  var start=parseInt((location.hash||'').replace('#s',''),10);
  show(isNaN(start)?0:start-1);
})();
`;

/**
 * Render one audience. The two audiences take separate paths on purpose: NOTES and
 * VISUAL are never written into the materi, so they are absent from the file rather
 * than hidden by CSS (ADR 0002).
 */
export function renderHtml(spec, { audience }) {
  const naskah = audience === 'naskah';
  const fm = spec.frontmatter;
  const title = naskah ? fm['title-naskah'] ?? 'Naskah Pengampu' : fm['title-materi'] ?? 'Materi Kuliah';
  const out = [];

  out.push(`<title>${escapeHtml(title)}</title>`);
  out.push(`<style>${CSS}</style>`);
  out.push('<div class="bar" id="bar"></div>');
  out.push('<div class="deck">');

  spec.slides.forEach((slide, index) => {
    const unit = slide.unit ? `<p class="eyebrow">${escapeHtml(slide.unit)}</p>` : '';
    let tags = '';
    if (naskah && slide.clock) {
      tags += `<span class="tag time">min ${String(slide.min).padStart(3, '0')} · ${slide.clock}` +
        `${slide.dur === null ? '' : ` · ${slide.dur}m`}</span>`;
    }
    if (slide.hold) tags += '<span class="tag hold">Tahan di layar</span>';
    if (naskah && slide.flag) tags += `<span class="tag flag">${escapeHtml(slide.flag)}</span>`;
    const konten = renderKonten(!naskah && slide.kontenMahasiswa ? slide.kontenMahasiswa : slide.konten);
    const hidden = naskah
      ? `<div class="notes">${inline(slide.notes)}</div>` +
        `<div class="visual">${inline(slide.visual)}</div>`
      : '';
    out.push(
      `<section class="slide${index === 0 ? ' live' : ''}" id="s${slide.n}">` +
      `<div class="inner">${unit}` +
      `<${index === 0 ? 'h1' : 'h2'}>${inline(slide.title)}</${index === 0 ? 'h1' : 'h2'}>` +
      `${tags ? `<div class="tags">${tags}</div>` : ''}${konten}${hidden}</div></section>`,
    );
  });

  out.push('</div>');
  if (naskah) out.push('<div id="pane"></div>');
  out.push(
    '<div class="hud">' +
    `<span class="name">${escapeHtml(fm.topic ?? fm.course ?? '')}</span>` +
    '<span class="grow">' +
    (naskah ? '<button id="notes-toggle" type="button">Catatan (N)</button>' : '') +
    '<button id="prev" type="button">←</button>' +
    '<button id="next" type="button">→</button>' +
    '<span id="count">1 / 1</span></span></div>',
  );
  out.push(`<script>${NAV}</script>`);
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
  build    [--final] <naskah.md>     emit both projectable decks
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
  if (errors.length) {
    console.error(`✗ ${basename(path)} — ${errors.length} problem(s)`);
    reportErrors(errors);
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

const cmdBuild = ({ args, flags }) => {
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

  // --final is the day-you-teach gate: nothing unresolved, then reviewed and approved.
  // Content first, because approving a deck that still has an open FLAG just costs a
  // second round trip.
  if (flags.has('final')) {
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
  } else if (open.length) {
    // Previewing with a placeholder is legitimate; teaching from one is not.
    console.log(`⚠ ${open.length} open FLAG:`);
    for (const slide of open) console.log(`    slide ${slide.n} — ${slide.flag}`);
  }

  const stem = spec.frontmatter['out-stem'] ?? basename(path).replace(/\.md$/, '');
  const dir = spec.frontmatter.out ? join(dirname(path), spec.frontmatter.out) : dirname(path);
  for (const [audience, suffix] of [['naskah', 'pengampu'], ['materi', 'mahasiswa']]) {
    const html = renderHtml(spec, { audience });
    if (audience === 'materi') {
      // Structural, not cosmetic: assert the promise the two code paths exist to keep.
      const leaks = [/class="notes"/, /class="visual"/, /id="pane"/].filter((re) => re.test(html));
      if (leaks.length) {
        console.error(`  ✗ materi leaked instructor content: ${leaks.join(', ')}`);
        return 1;
      }
    }
    const target = join(dir, `${stem}-${suffix}.html`);
    writeFileSync(target, html);
    console.log(`  ✓ ${basename(target)}`);
  }
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
