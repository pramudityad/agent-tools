#!/usr/bin/env node
// @ts-check
// rise-ops — run and record a Cakrawala sesi against the RISE portal.
//
// RISE is the LMS. It is NOT the academic record: nilai akhir lives in SEVIMA SIAKAD
// (siakad.cakrawala.ac.id → sso.sevima.com), a separate system with separate auth, and
// RISE exposes no final-grade surface at all (ADR 0001). Everything here is attendance,
// berita acara, and a local gradebook — never a final grade.
//
// Two rules this tool will not bend:
//   · No roll, no write. Unmarked attendance is never guessed (ADR 0003).
//   · Exact matching only. Zoom names match the roster on full-string equality or not at
//     all; the residue is written to a file, never resolved by similarity (ADR 0004).
//
// Output contract: CONTRACT.md (same directory). Exit 0 on success; on failure one compact
// JSON object on stderr: {"error": "...", "code": "..."} where code is one of
// not_configured | auth_expired | not_found | bad_input | no_roll | no_naskah |
// unapproved_naskah | http_error | io_error.

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, realpathSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// ── constants ─────────────────────────────────────────────────────────────────

const API = 'https://api-pmb.cakrawala.ac.id/api';
const ORIGIN = 'https://rise.cakrawala.ac.id';
const CONFIG_DIR = join(homedir(), '.config', 'cakrawala');
const SESSION_FILE = join(CONFIG_DIR, 'session');
const CACHE_FILE = join(CONFIG_DIR, 'cache.json');
const AUDIT_FILE = join(CONFIG_DIR, 'audit.jsonl');
const REGISTER_DIR = join(CONFIG_DIR, 'registers');
/** Never the vault (ADR 0006) — submissions are private and the vault auto-commits. */
const SUBMISSION_DIR = join(CONFIG_DIR, 'submissions');
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const VAULT = join(homedir(), 'Documents', 'Obsidian Vault', '02-Projects', 'Cakrawala');

/** RPS governs assessment, so the at-risk gate is 75%. The Kontrak Kuliah says 80% and is
 *  what students signed — a student between the two reads as clear here but is failing
 *  their contract. Unresolved with prodi; `brief` prints both numbers for that reason. */
const AT_RISK_PCT = 75;
const KONTRAK_PCT = 80;

const STATUSES = ['HADIR', 'IZIN', 'SAKIT', 'ALPA', 'TERLAMBAT'];

/** Short alias → the course folder in the vault and the subject name RISE reports. */
const COURSES = {
  BI: { dir: 'Business Intelligence Systems', subject: 'Business Intelligence Systems', slot: 105 },
  SDLC: { dir: 'Software Development Life Cycle', subject: 'Software Development Life Cycle', slot: 105 },
  WAD: { dir: 'Web Application Development', subject: 'Web Application Development', slot: 120 },
};

/** RISE's own limits, mirrored from the portal bundle — anything else it rejects. */
const MAX_FILE_SIZES = [5 * 1024 * 1024, 10 * 1024 * 1024, 20 * 1024 * 1024];
const TUGAS_TYPES = ['personal', 'group'];
const ON_CLOSE = ['close', 'lock'];
const MAX_SUBMIT_ATTEMPT = 5;

/**
 * `due` must be an ISO UTC instant, matched by shape rather than by `Date.parse`.
 * `Date.parse` is far too lenient here: it reads `"Sesi 5"` as 2001-04-30 rather than NaN,
 * so a typo would have been published as a deadline from 2001.
 */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// ── errors ────────────────────────────────────────────────────────────────────

class OpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new OpsError(code, message);
};

// ── frontmatter ───────────────────────────────────────────────────────────────

/** Minimal YAML: `key: value`, quoted strings, integers. Enough for Naskah params. */
export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const value = kv[2].trim().replace(/^["'](.*)["']$/, '$1');
    frontmatter[kv[1]] = /^-?\d+$/.test(value) ? Number(value) : value;
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

/**
 * A Tugas file (`Sesi NN - Tugas.md`) declares one RISE task. It sits beside the Naskah
 * rather than inside it: the Naskah's approval digest covers the whole file, so a tugas
 * edit there would mark an approved Naskah stale and force a re-review (ADR 0005).
 *
 * Flat frontmatter only, so no second YAML dialect enters the tool and the file stays
 * readable in Obsidian. `due` is an ISO instant; RISE refuses a `start_date` before today,
 * so the opening time is always "now" and only the deadline is authored.
 */
export function parseTugasFile(text) {
  const { frontmatter, body } = parseFrontmatter(text);
  const description = body.trim();

  const missing = [];
  if (!frontmatter.title) missing.push('title');
  if (!frontmatter.due) missing.push('due');
  if (!description) missing.push('body (the task text)');
  if (missing.length) return { error: `nothing to publish — no ${missing.join(', no ')}` };

  const type = frontmatter['tugas-type'] ?? 'personal';
  if (!TUGAS_TYPES.includes(type)) {
    return { error: `tugas-type must be ${TUGAS_TYPES.join(' or ')}, got "${type}"` };
  }
  const onClose = frontmatter['on-close'] ?? 'lock';
  if (!ON_CLOSE.includes(onClose)) {
    return { error: `on-close must be ${ON_CLOSE.join(' or ')}, got "${onClose}"` };
  }
  const attempt = frontmatter['submit-attempt'] ?? 1;
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_SUBMIT_ATTEMPT) {
    return { error: `submit-attempt must be a whole number 1–${MAX_SUBMIT_ATTEMPT}, got "${frontmatter['submit-attempt']}"` };
  }
  const maxFileSize = frontmatter['max-file-size'] ?? 10 * 1024 * 1024;
  if (!MAX_FILE_SIZES.includes(maxFileSize)) {
    return { error: `max-file-size must be one of ${MAX_FILE_SIZES.join(', ')} bytes (5, 10 or 20 MB), got "${frontmatter['max-file-size']}"` };
  }
  const due = String(frontmatter.due);
  if (!ISO_UTC.test(due)) {
    return { error: `due must be an ISO UTC instant like 2026-09-24T11:30:00Z, got "${due}"` };
  }

  return { title: String(frontmatter.title), type, description, due, onClose, attempt, maxFileSize };
}

// ── name normalisation (ADR 0004) ─────────────────────────────────────────────

/**
 * Fold a display name to its comparable form: strip diacritics, drop everything that is
 * not a letter, digit or space, collapse runs of space, uppercase.
 *
 * Deliberately lossy in one direction only. Two names that normalise alike are treated as
 * the same person; two that do not are never merged by similarity.
 */
export function normaliseName(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** RFC4180-ish reader: quoted fields, embedded commas, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text).replace(/^﻿/, '');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Zoom usage exports carry a meeting-info preamble before the participant table, and the
 * header wording drifts between plans. Find the first row that names a participant column
 * and treat that as the header rather than assuming row 0.
 */
export function parseZoomCsv(text) {
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex((r) => {
    const cells = r.map((c) => c.toLowerCase());
    return cells.some((c) => c.includes('name')) && cells.some((c) => c.includes('join') || c.includes('email'));
  });
  if (headerIdx === -1) fail('bad_input', 'no participant header row found — is this a Zoom usage export?');

  const header = rows[headerIdx].map((c) => c.trim().toLowerCase());
  const col = (...needles) => header.findIndex((h) => needles.some((n) => h.includes(n)));
  const iName = col('name');
  const iEmail = col('email');
  const iJoin = col('join time', 'join');
  const iDur = col('duration');

  return rows.slice(headerIdx + 1).map((r) => ({
    name: (r[iName] ?? '').trim(),
    email: iEmail >= 0 ? (r[iEmail] ?? '').trim() : '',
    join: iJoin >= 0 ? (r[iJoin] ?? '').trim() : '',
    minutes: iDur >= 0 ? Number(String(r[iDur] ?? '').trim()) || 0 : 0,
  })).filter((p) => p.name !== '');
}

// ── matching (ADR 0004) ───────────────────────────────────────────────────────

/**
 * Bind Zoom participants to roster students by exact normalised name.
 *
 * Returns matched pairs plus both residues. The caller must surface the residues: a 60%
 * match rate and a 100% one look identical if only the matches are reported.
 */
export function matchZoom(participants, roster) {
  const byName = new Map();
  for (const s of roster) {
    const key = normaliseName(s.user_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(s);
  }

  const matched = [];
  const unmatchedZoom = [];
  const claimed = new Set();

  for (const p of participants) {
    const hits = byName.get(normaliseName(p.name)) ?? [];
    if (hits.length === 1) {
      matched.push({ participant: p, student: hits[0] });
      claimed.add(hits[0].user_data_id);
    } else {
      // Zero hits, or a name shared by two students — both are for a human to settle.
      unmatchedZoom.push({ ...p, reason: hits.length === 0 ? 'no roster match' : 'ambiguous: shares a name' });
    }
  }

  const unmatchedStudents = roster.filter((s) => !claimed.has(s.user_data_id));
  return { matched, unmatchedZoom, unmatchedStudents };
}

/** Kontrak Kuliah: present in the first 15 minutes is full credit, later is a late mark. */
export function lateThreshold(minutesAttended, slotMinutes) {
  if (!slotMinutes) return false;
  return minutesAttended > 0 && minutesAttended < slotMinutes - 15;
}

// ── Naskah → berita acara (ADR 0002) ──────────────────────────────────────────

/** Pull the per-segment interaction table out of the Naskah's section 7. */
export function parseSegments(body) {
  // No `m` flag: with it, `$` matches at every line end and the capture collapses to empty.
  const section = /(?:^|\n)##\s*7\.[^\n]*\n([\s\S]*?)(?=\n##\s|$)/.exec(body);
  if (!section) return [];
  const segments = [];
  for (const line of section[1].split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const [, menit, bentuk] = cells;
    if (!/^\d/.test(menit)) continue; // skips the header and the --- rule
    segments.push({ menit, bentuk });
  }
  return segments;
}

const addMinutes = (hhmm, mins) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!m) return '';
  const total = Number(m[1]) * 60 + Number(m[2]) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Render the berita acara from an approved Naskah.
 *
 * Per the settled decision, realisasi is the plan restated as delivered — the tool does not
 * ask what actually happened, so a sesi that departed from the Naskah will be recorded as
 * having run to plan. That is the known cost of this design, documented in ADR 0002.
 */
export function buildAcara(naskahText) {
  const { frontmatter: fm, body } = parseFrontmatter(naskahText);
  if (String(fm.status ?? '').toLowerCase() !== 'approved') {
    fail('unapproved_naskah', `Naskah status is "${fm.status ?? 'unset'}", expected "approved"`);
  }

  const segments = parseSegments(body);
  if (!segments.length) fail('bad_input', 'no segment table found in Naskah section 7');

  const slot = Number(fm['slot-minutes']) || 0;
  const start = String(fm['slot-start'] ?? '');
  const end = start ? addMinutes(start, slot) : '';
  const window = start && end ? ` (${start}-${end})` : '';
  const head = `${fm.topic ?? fm.title ?? 'Sesi'}${fm.cpmk ? ` (${fm.cpmk})` : ''}. Slot ${slot} menit${window}.`;
  const beats = segments.map((s) => `Menit ${s.menit} ${s.bentuk}.`).join(' ');
  const artifact = fm.artifact ? ` Artefak: ${fm.artifact}.` : '';

  const plans = `${head} ${beats}${artifact}`.replace(/\s+/g, ' ').trim();
  const realizations = `Terlaksana sesuai rencana. ${plans}`.replace(/\s+/g, ' ').trim();
  return { plans, realizations, segments: segments.length };
}

// ── http ──────────────────────────────────────────────────────────────────────

function cookie() {
  if (!existsSync(SESSION_FILE)) {
    fail('not_configured', `no session cookie — write it to ${SESSION_FILE} (chmod 600)`);
  }
  const value = readFileSync(SESSION_FILE, 'utf8').trim();
  if (!value) fail('not_configured', `${SESSION_FILE} is empty`);
  return value;
}

async function api(method, path, body, extraHeaders = {}) {
  const headers = {
    accept: 'application/json',
    'x-client-app': 'rise',
    origin: ORIGIN,
    referer: `${ORIGIN}/`,
    cookie: `cakrawala_session_siakad=${cookie()}`,
    ...extraHeaders,
  };
  const form = body instanceof FormData;
  if (body !== undefined && !form) headers['content-type'] = 'application/json';

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail('http_error', `${method} ${path} → ${res.status}, non-JSON body`);
  }
  if (res.status === 401) fail('auth_expired', 'session cookie rejected — refresh it from the browser');
  if (!res.ok || json.success === false) {
    fail('http_error', `${method} ${path} → ${res.status}: ${json.message ?? 'unknown'}`);
  }
  return json.data;
}

// ── materials ─────────────────────────────────────────────────────────────────

/** RISE's accepted extensions, mirrored from the portal bundle. It rejects the rest. */
const MATERIAL_MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

export function attachKind(name) {
  const ext = String(name).split('.').pop().toLowerCase();
  const mime = MATERIAL_MIME[ext];
  if (!mime) fail('bad_input', `unsupported file type ".${ext}" — RISE accepts ${Object.keys(MATERIAL_MIME).join(', ')}`);
  const kind = mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('audio/')
        ? 'audio'
        : 'document';
  return { mime_type: mime, file_category: kind };
}

/** Title and description come from the Naskah, so the portal reads like the deck students saw. */
export function materialDraft(frontmatter, sesi) {
  const topic = String(frontmatter.topic ?? '').trim() || 'Materi';
  const title = String(frontmatter['title-materi'] ?? '').trim() || `Sesi ${sesi} — ${topic}`;
  const description = String(frontmatter.sub ?? '').trim() || `${topic} — Sesi ${sesi}.`;
  return { title, description };
}

export function materialPayload({ classId, scheduleId, sesi, title, description, startDate, attachment }) {
  return {
    class_id: classId,
    schedules_id: scheduleId,
    schedules_session: sesi,
    title,
    start_date: startDate,
    source_type: 'file',
    attachments: [attachment],
    description,
  };
}

/** RISE wants the chunked handshake even for a one-part file; the plain form endpoint 500s. */
async function uploadMaterialFile(classId, filePath, onPart) {
  const bytes = readFileSync(filePath);
  const name = basename(filePath);
  const init = await api('POST', `/v1/rise/classes/${classId}/files/multipart`, {
    file_name: name,
    file_size: bytes.length,
    category: 'materi',
    is_public: false,
  });

  const parts = [];
  try {
    for (let n = 1; n <= init.total_parts; n += 1) {
      const from = (n - 1) * init.part_size;
      const form = new FormData();
      form.append('file', new Blob([bytes.subarray(from, Math.min(from + init.part_size, bytes.length))]), name);
      form.append('upload_id', init.upload_id);
      form.append('key', init.key);
      form.append('part_number', String(n));
      const { etag } = await api('POST', `/v1/rise/classes/${classId}/files/multipart/upload-part`, form);
      parts.push({ part_number: n, etag });
      onPart?.(n, init.total_parts);
    }
    return await api('POST', `/v1/rise/classes/${classId}/files/multipart/complete`, {
      upload_id: init.upload_id,
      key: init.key,
      is_public: false,
      parts,
    });
  } catch (err) {
    // Leaving a half-written multipart upload behind costs quota and shows in no UI.
    await api('POST', `/v1/rise/classes/${classId}/files/multipart/abort`, {
      upload_id: init.upload_id,
      key: init.key,
    }).catch(() => {});
    throw err;
  }
}

/** schedule_id → the materials already on it, so a re-run can see what is up. */
async function materialIndex(classId) {
  const index = new Map();
  let cursor = '';
  for (let page = 0; page < 10; page += 1) {
    const query = `/v1/dosen/lecture-class/${classId}/material-sessions?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await api('GET', query);
    for (const group of data.data ?? []) {
      index.set(group.schedule_id, (group.materials ?? []).filter((m) => m.material_id));
    }
    if (!data.has_next) break;
    cursor = data.next_cursor ?? '';
  }
  return index;
}

/** schedule_id → the tasks already on it, so a re-run can see what is up (ADR 0004). */
async function taskIndex(classId) {
  const index = new Map();
  let cursor = '';
  for (let page = 0; page < 10; page += 1) {
    const query = `/v1/dosen/lecture-class/${classId}/task-sessions?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await api('GET', query);
    for (const group of data.data ?? []) {
      index.set(group.schedule_id, (group.tasks ?? []).filter((t) => t.task_id));
    }
    if (!data.has_next) break;
    cursor = data.next_cursor ?? '';
  }
  return index;
}

/** Every write lands here with its prior value. This file is the undo record. */
function audit(entry) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  appendFileSync(AUDIT_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

// ── cache ─────────────────────────────────────────────────────────────────────

const readCache = () => {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
};

async function sync() {
  const classes = await api('GET', '/v1/lecturer/lecture-classes?page=1&page_size=50');
  const out = { at: new Date().toISOString(), classes: {} };

  for (const c of classes.data) {
    const alias = Object.keys(COURSES).find((k) => COURSES[k].subject === c.subject_name);
    if (!alias) continue;
    const sessions = await api('GET', `/v1/shared/lecture-class/${c.lecture_class_id}/sessions/accordion`);
    const roster = await api('GET', `/v1/lecture-class/${c.lecture_class_id}/edlink/attendee?page=1&page_size=200`);
    out.classes[alias] = {
      id: c.lecture_class_id,
      name: c.class_name,
      subject: c.subject_name,
      code: c.subject_code,
      sessions: sessions.map((s) => ({
        n: s.session_number,
        id: s.id,
        status: s.status,
        start: s.start_date_time,
        end: s.end_date_time,
        zoom: s.online_class_url ?? '',
        type: s.class_type_name,
      })),
      roster: (roster.data ?? []).map((r) => ({
        user_data_id: r.user_data_id,
        user_nim: r.user_nim,
        user_name: r.user_name,
        krs_status: r.krs_status,
        percentage_attendance: r.percentage_attendance,
      })),
    };
  }

  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(out, null, 2));
  return out;
}

async function cache({ force = false } = {}) {
  const existing = readCache();
  if (!force && existing && Date.now() - Date.parse(existing.at) < CACHE_TTL_MS) return existing;
  return sync();
}

function resolveClass(cached, alias) {
  const key = String(alias ?? '').toUpperCase();
  const entry = cached.classes[key];
  if (!entry) fail('bad_input', `unknown class "${alias}" — one of ${Object.keys(cached.classes).join(', ')}`);
  return { alias: key, ...entry };
}

function resolveSession(klass, sesi) {
  const n = Number(sesi);
  const found = klass.sessions.find((s) => s.n === n);
  if (!found) fail('not_found', `${klass.alias} has no sesi ${sesi}`);
  return found;
}

/**
 * How long the sesi is actually taught, in minutes.
 *
 * Three sources disagree and the order matters, because this feeds the lateness rule:
 *
 *   1. The Naskah's `slot-minutes` — the taught length, and correct for all three courses.
 *   2. RISE's scheduled window — the block booked, which can be longer than what is taught.
 *      BI is booked 18:00–20:00 (120) but taught 18:15–20:00 (105).
 *   3. The fallback constant, for a sesi with neither.
 *
 * Using (2) alone marked an on-time student late: 100 minutes of a 105-minute class is
 * full attendance, but against a 120-minute window it falls under the 15-minute bar.
 */
export function slotMinutes(session, alias, naskahMinutes) {
  const taught = Number(naskahMinutes);
  if (Number.isFinite(taught) && taught > 0) return taught;

  const start = Date.parse(session?.start ?? '');
  const end = Date.parse(session?.end ?? '');
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.round((end - start) / 60000);
  }
  return COURSES[alias]?.slot ?? 0;
}

/** `slot-minutes` from the sesi's Naskah, or null when there is no Naskah to read. */
function naskahSlot(alias, sesi) {
  try {
    const { frontmatter } = parseFrontmatter(readFileSync(naskahPath(alias, sesi), 'utf8'));
    return Number(frontmatter['slot-minutes']) || null;
  } catch {
    return null;
  }
}

// ── roster helpers ────────────────────────────────────────────────────────────

async function attendanceOf(sessionId) {
  return api('GET', `/v1/lecturer/sessions/${sessionId}/attendance?limit=200&sort_by=name&sort_dir=asc`);
}

/** Statuses RISE counts toward the attendance requirement (`is_attendance_counted`). */
const COUNTED = ['HADIR', 'SAKIT', 'TERLAMBAT'];

/**
 * Walk every finished sesi and build the real attendance history.
 *
 * RISE returns a `percentage_attendance` field on the roster, but it is 0 for every student
 * — the portal never populates it. Trusting it flagged the entire class as at risk, so the
 * percentage is computed here from the per-sesi marks instead.
 */
async function attendanceHistory(klass) {
  const done = klass.sessions.filter((s) => s.status === 'SELESAI');
  const perSession = [];
  for (const s of done) {
    const att = await attendanceOf(s.id);
    perSession.push({
      n: s.n,
      byId: Object.fromEntries(att.students.map((x) => [x.user_data_id, x.attendance_status_code ?? ''])),
    });
  }
  const unmarked = perSession.reduce(
    (sum, p) => sum + Object.values(p.byId).filter((v) => !v).length,
    0,
  );
  return { done, perSession, unmarked };
}

/** Running percentage over finished sesi only — not over the full 16. */
export function attendancePercent(perSession, userDataId) {
  if (!perSession.length) return { counted: 0, total: 0, percent: 100 };
  const marks = perSession.map((p) => p.byId[userDataId] ?? '');
  const counted = marks.filter((m) => COUNTED.includes(m)).length;
  return { counted, total: perSession.length, percent: (counted / perSession.length) * 100 };
}

/**
 * NIM → user_data_id. An unrecognised NIM aborts the whole batch: a partial attendance
 * write is worse than none, because the half that landed looks complete.
 */
export function resolveNims(nims, roster) {
  const byNim = new Map(roster.map((s) => [String(s.user_nim).trim(), s]));
  const resolved = [];
  const unknown = [];
  for (const nim of nims) {
    const hit = byNim.get(String(nim).trim());
    if (hit) resolved.push(hit);
    else unknown.push(nim);
  }
  return { resolved, unknown };
}

async function patchAttendance(sessionId, updates, priorByStudent) {
  const key = `lecture-session-attendance-${sessionId}-${randomUUID()}`;
  const data = await api(
    'PATCH',
    `/v1/lecturer/sessions/${sessionId}/attendance`,
    { updates },
    { 'Idempotency-Key': key },
  );
  audit({
    cmd: 'attendance',
    method: 'PATCH',
    path: `/v1/lecturer/sessions/${sessionId}/attendance`,
    idempotency_key: key,
    updates,
    prior: priorByStudent,
    result: data,
  });
  return data;
}

// ── vault ─────────────────────────────────────────────────────────────────────

function naskahPath(alias, sesi) {
  const dir = join(VAULT, COURSES[alias].dir);
  const padded = String(sesi).padStart(2, '0');
  const candidates = [`Sesi ${padded} - Naskah.md`, `Sesi ${sesi} - Naskah.md`];
  for (const name of candidates) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  fail('no_naskah', `no Naskah for ${alias} sesi ${sesi} — looked for ${candidates.join(' / ')} in ${dir}`);
}

/** The Tugas file for a sesi, or null when that sesi carries no homework. */
function tugasPath(alias, sesi) {
  const dir = join(VAULT, COURSES[alias].dir);
  const padded = String(sesi).padStart(2, '0');
  const candidates = [`Sesi ${padded} - Tugas.md`, `Sesi ${sesi} - Tugas.md`];
  for (const name of candidates) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

// ── submissions ───────────────────────────────────────────────────────────────

/** `original_name` is a student-supplied upload filename — never trust it as a path. */
export function sanitizeFilename(name) {
  const base = basename(String(name || 'file')).replace(/[^A-Za-z0-9._-]/g, '_');
  return base || 'file';
}

export function slugify(name) {
  const s = String(name || 'unknown').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'unknown';
}

/** Presigned S3 URL — no RISE cookie/headers needed or wanted. */
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) fail('http_error', `GET ${url} → ${res.status}`);
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

/** One level only (ADR 0006) — a nested zip inside is rare enough to open by hand. */
function unzipInto(zipPath, dir) {
  try {
    mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-o', zipPath, '-d', dir], { stdio: 'ignore' });
  } catch (err) {
    say(`  (couldn't auto-unzip ${basename(zipPath)}: ${err.message})`);
  }
}

// ── output ────────────────────────────────────────────────────────────────────

const say = (...args) => console.log(...args);
const pct = (n) => `${Number(n ?? 0).toFixed(0)}%`;

// ── commands ──────────────────────────────────────────────────────────────────

const commands = {};

commands.auth = async () => {
  const me = await api('GET', '/v1/siakad-auth/profile');
  say(`${me.name} · ${me.role?.name ?? '?'} · ${me.email_campus ?? me.email}`);
};

commands.sync = async () => {
  const data = await sync();
  const names = Object.entries(data.classes).map(([k, v]) => `${k} (${v.name}, ${v.roster.length} mhs)`);
  say(`synced ${names.length} classes: ${names.join(', ')}`);
};

commands.todo = async () => {
  const cached = await cache();
  let open = 0;

  for (const alias of Object.keys(cached.classes)) {
    const klass = resolveClass(cached, alias);
    const done = klass.sessions.filter((s) => s.status === 'SELESAI');
    for (const s of done) {
      const [att, sched] = await Promise.all([
        attendanceOf(s.id),
        api('GET', `/v1/lecture-schedule/${s.id}/edlink`),
      ]);
      const unmarked = att.students.filter((x) => !x.attendance_status_code).length;
      const acaraOk = String(sched.material_plans ?? '').trim() && String(sched.material_realizations ?? '').trim();
      if (!unmarked && acaraOk) continue;
      open += 1;
      const needs = [];
      if (unmarked) needs.push(`${unmarked}/${att.students.length} unmarked`);
      if (!acaraOk) needs.push('berita acara EMPTY');
      say(`${alias.padEnd(5)} sesi ${String(s.n).padStart(2)} · ${needs.join(' · ')}`);
    }
  }
  if (!open) say('nothing open — all finished sesi are marked and closed.');
  else say(`\n${open} open. Attendance needs a roll source: rise-ops attendance zoom <class> <sesi> <csv>`);
};

commands.brief = async (alias, ...rest) => {
  const cached = await cache();
  const klass = resolveClass(cached, alias);
  const flagIdx = rest.indexOf('--sesi');
  const sesi = flagIdx >= 0 ? rest[flagIdx + 1] : null;

  const session = sesi
    ? resolveSession(klass, sesi)
    : klass.sessions.find((s) => s.status !== 'SELESAI') ?? klass.sessions[klass.sessions.length - 1];

  // Everything the portal has to answer for is fetched before a single line is printed.
  // Printing as we go emitted a plausible-looking header and then died on a stale cookie,
  // which reads as a half-successful briefing rather than a failed one.
  const slot = slotMinutes(session, klass.alias, naskahSlot(klass.alias, session.n));
  const att = await attendanceOf(session.id);
  const { perSession, unmarked } = await attendanceHistory(klass);
  const prev = klass.sessions.find((s) => s.n === session.n - 1);
  const prevAcara = prev ? await api('GET', `/v1/lecture-schedule/${prev.id}/edlink`) : null;

  say(`${klass.alias} — ${klass.subject} (${klass.name})`);
  say(`Sesi ${session.n} · ${session.status} · ${session.start} · slot ${slot} min`);
  say(`Zoom: ${session.zoom || '(none)'}`);
  say(`Roster: ${att.students.length} · hadir ${att.stats.hadir} · izin ${att.stats.izin} · sakit ${att.stats.sakit} · alpa ${att.stats.absen}`);

  const scored = klass.roster
    .map((r) => ({ ...r, ...attendancePercent(perSession, r.user_data_id) }))
    .sort((a, b) => a.percent - b.percent);
  const risky = scored.filter((r) => r.percent < AT_RISK_PCT);
  const grey = scored.filter((r) => r.percent >= AT_RISK_PCT && r.percent < KONTRAK_PCT);

  say(`\nAttendance over ${perSession.length} finished sesi:`);
  if (unmarked) {
    // Without this line the at-risk list reads as fact when it is mostly missing data.
    say(`  ⚠ ${unmarked} marks still missing — these numbers are a floor, not a verdict.`);
  }
  if (!risky.length) say(`  At risk (<${AT_RISK_PCT}%, RPS): none`);
  else {
    say(`  At risk (<${AT_RISK_PCT}%, RPS): ${risky.length} of ${scored.length}`);
    for (const r of risky.slice(0, 12)) say(`    ${r.user_nim}  ${pct(r.percent).padStart(4)}  ${r.counted}/${r.total}  ${r.user_name}`);
    if (risky.length > 12) say(`    … and ${risky.length - 12} more (see rise-ops register ${klass.alias})`);
  }
  if (grey.length) {
    say(`  Between RPS ${AT_RISK_PCT}% and Kontrak ${KONTRAK_PCT}% (disputed gate): ${grey.map((r) => r.user_nim).join(', ')}`);
  }

  try {
    const { frontmatter } = parseFrontmatter(readFileSync(naskahPath(klass.alias, session.n), 'utf8'));
    if (frontmatter.artifact) say(`\nArtefak due: ${frontmatter.artifact}`);
  } catch {
    say('\nArtefak due: (no Naskah for this sesi)');
  }

  if (prevAcara) {
    const ok = String(prevAcara.material_plans ?? '').trim() && String(prevAcara.material_realizations ?? '').trim();
    if (!ok) say(`\n⚠ Sesi ${prev.n} berita acara still EMPTY — rise-ops acara ${klass.alias} ${prev.n}`);
  }
};

commands.attendance = async (sub, alias, sesi, ...rest) => {
  const cached = await cache();
  const klass = resolveClass(cached, alias);
  const session = resolveSession(klass, sesi);

  if (sub === 'show') {
    const att = await attendanceOf(session.id);
    say(`${klass.alias} sesi ${session.n} · deadline ${att.attendance_deadline}`);
    for (const s of att.students) {
      say(`  ${s.user_nim}  ${(s.attendance_status_code ?? '—').padEnd(10)} ${s.user_name}`);
    }
    const unmarked = att.students.filter((x) => !x.attendance_status_code).length;
    say(`\n${att.students.length} students · ${unmarked} unmarked`);
    return;
  }

  if (sub === 'set') {
    const att = await attendanceOf(session.id);
    const prior = Object.fromEntries(att.students.map((s) => [s.user_data_id, s.attendance_status_code]));
    const updates = [];
    const allUnknown = [];

    for (let i = 0; i < rest.length; i += 2) {
      const flag = String(rest[i] ?? '');
      const status = flag.replace(/^--/, '').toUpperCase();
      if (!STATUSES.includes(status)) fail('bad_input', `unknown flag ${flag} — expected --${STATUSES.join(' / --').toLowerCase()}`);
      const nims = String(rest[i + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const { resolved, unknown } = resolveNims(nims, klass.roster);
      allUnknown.push(...unknown);
      for (const s of resolved) updates.push({ student_id: s.user_data_id, status });
    }

    if (allUnknown.length) fail('bad_input', `NIM not on the ${klass.alias} roster: ${allUnknown.join(', ')} — nothing written`);
    if (!updates.length) fail('bad_input', 'no students named');

    const data = await patchAttendance(session.id, updates, prior);
    say(`${klass.alias} sesi ${session.n}: ${data.updated_count} updated · hadir ${data.stats.hadir} izin ${data.stats.izin} sakit ${data.stats.sakit} alpa ${data.stats.absen}`);
    return;
  }

  if (sub === 'zoom') {
    const csvPath = rest[0];
    if (!csvPath) fail('bad_input', 'usage: rise-ops attendance zoom <class> <sesi> <participants.csv>');
    // A path the user typed that does not exist is bad input, not an I/O fault.
    if (!existsSync(csvPath)) fail('bad_input', `no such file: ${csvPath}`);
    const participants = parseZoomCsv(readFileSync(csvPath, 'utf8'));
    const att = await attendanceOf(session.id);
    const prior = Object.fromEntries(att.students.map((s) => [s.user_data_id, s.attendance_status_code]));

    const { matched, unmatchedZoom, unmatchedStudents } = matchZoom(participants, att.students);
    const slot = slotMinutes(session, klass.alias, naskahSlot(klass.alias, session.n));

    const updates = matched.map(({ participant, student }) => ({
      student_id: student.user_data_id,
      status: lateThreshold(participant.minutes, slot) ? 'TERLAMBAT' : 'HADIR',
    }));

    const residue = [
      `# Unmatched — ${klass.alias} sesi ${session.n}`,
      '',
      `Zoom rows: ${participants.length} · matched: ${matched.length} · unmatched Zoom rows: ${unmatchedZoom.length} · students with no Zoom row: ${unmatchedStudents.length}`,
      '',
      '## Zoom rows with no roster match',
      ...(unmatchedZoom.length ? unmatchedZoom.map((p) => `- ${p.name} <${p.email}> (${p.minutes} min) — ${p.reason}`) : ['- none']),
      '',
      '## Students with no Zoom row (left unmarked — no roll, no write)',
      ...(unmatchedStudents.length ? unmatchedStudents.map((s) => `- ${s.user_nim} ${s.user_name}`) : ['- none']),
      '',
    ].join('\n');
    writeFileSync(`${csvPath}.unmatched.md`, residue);

    if (!updates.length) fail('no_roll', `no Zoom row matched the ${klass.alias} roster — see ${csvPath}.unmatched.md`);

    const data = await patchAttendance(session.id, updates, prior);
    const late = updates.filter((u) => u.status === 'TERLAMBAT').length;
    say(`${klass.alias} sesi ${session.n}: ${data.updated_count} written (${updates.length - late} hadir, ${late} terlambat)`);
    say(`Zoom rows ${participants.length} · matched ${matched.length} · unmatched Zoom ${unmatchedZoom.length} · students with no row ${unmatchedStudents.length}`);
    say(`Residue: ${csvPath}.unmatched.md`);
    if (unmatchedStudents.length) say(`${unmatchedStudents.length} students left unmarked — resolve them, they are not absent by default.`);
    return;
  }

  fail('bad_input', 'usage: rise-ops attendance <show|set|zoom> <class> <sesi> [...]');
};

commands.acara = async (alias, sesi, ...flags) => {
  const cached = await cache();
  const klass = resolveClass(cached, alias);
  const session = resolveSession(klass, sesi);

  const path = naskahPath(klass.alias, session.n);
  const { plans, realizations, segments } = buildAcara(readFileSync(path, 'utf8'));

  const before = await api('GET', `/v1/lecture-schedule/${session.id}/edlink`);
  const data = await api('PUT', `/v1/lecture-schedule/${session.id}/edlink`, {
    material_plans: plans,
    material_realizations: realizations,
  });
  audit({
    cmd: 'acara',
    method: 'PUT',
    path: `/v1/lecture-schedule/${session.id}/edlink`,
    payload: { material_plans: plans, material_realizations: realizations },
    prior: { material_plans: before.material_plans, material_realizations: before.material_realizations },
    result: { id: data?.id },
  });

  say(`${klass.alias} sesi ${session.n}: berita acara written from ${basename(path)} (${segments} segments)`);
  say(`  rencana  : ${plans.slice(0, 110)}…`);
  say(`  realisasi: ${realizations.slice(0, 110)}…`);

  if (flags.includes('--end')) {
    await api('POST', `/v1/lecturer/sessions/${session.id}/end`);
    audit({ cmd: 'session-end', method: 'POST', path: `/v1/lecturer/sessions/${session.id}/end`, prior: { status: session.status } });
    say(`  sesi ${session.n} closed.`);
  }
};

commands.session = async (sub, alias, sesi) => {
  if (!['start', 'end'].includes(sub)) fail('bad_input', 'usage: rise-ops session <start|end> <class> <sesi>');
  const cached = await cache();
  const klass = resolveClass(cached, alias);
  const session = resolveSession(klass, sesi);
  await api('POST', `/v1/lecturer/sessions/${session.id}/${sub}`);
  audit({ cmd: `session-${sub}`, method: 'POST', path: `/v1/lecturer/sessions/${session.id}/${sub}`, prior: { status: session.status } });
  say(`${klass.alias} sesi ${session.n}: ${sub}ed`);
};

commands.qr = async (alias, sesi) => {
  const cached = await cache();
  const klass = resolveClass(cached, alias);
  const session = resolveSession(klass, sesi);
  const data = await api('POST', `/v1/lecturer/sessions/${session.id}/qr/start`);
  audit({ cmd: 'qr-start', method: 'POST', path: `/v1/lecturer/sessions/${session.id}/qr/start`, result: data });
  say(`${klass.alias} sesi ${session.n}: QR started`);
  say(JSON.stringify(data, null, 2));
};

commands.register = async (alias) => {
  const cached = await cache();
  const klass = resolveClass(cached, alias);
  const { done, perSession, unmarked } = await attendanceHistory(klass);

  const header = ['NIM', 'Nama', ...perSession.map((p) => `S${p.n}`), 'Hadir', '%', 'Flag'];
  const rows = klass.roster.map((r) => {
    const marks = perSession.map((p) => p.byId[r.user_data_id] ?? '');
    const { counted, percent } = attendancePercent(perSession, r.user_data_id);
    const flag = percent < AT_RISK_PCT ? '⚠ <RPS' : percent < KONTRAK_PCT ? '· <Kontrak' : '';
    return [r.user_nim, r.user_name, ...marks.map((m) => m || '—'), String(counted), pct(percent), flag];
  });

  const md = [
    `# Register Kehadiran — ${klass.subject} (${klass.name})`,
    '',
    `Generated by rise-ops on ${new Date().toISOString()}. Do not edit by hand — regenerate with \`rise-ops register ${klass.alias}\`.`,
    '',
    `Sesi selesai: ${done.length} · roster: ${klass.roster.length} · gate: ${AT_RISK_PCT}% (RPS) / ${KONTRAK_PCT}% (Kontrak).`,
    '',
    unmarked
      ? `> ⚠ ${unmarked} marks are still missing across these sesi. Percentages are a floor, not a verdict — close them with \`rise-ops attendance zoom\` before acting on this table.`
      : '> All finished sesi are fully marked.',
    '',
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
  ].join('\n');

  mkdirSync(REGISTER_DIR, { recursive: true });
  const out = join(REGISTER_DIR, `${klass.alias}-kehadiran.md`);
  writeFileSync(out, md);
  say(`wrote ${out} (${rows.length} students × ${done.length} sesi)`);
};

const flagValue = (flags, name) => {
  const i = flags.indexOf(name);
  return i >= 0 ? flags[i + 1] : undefined;
};

/** RISE rejects a start_date before today, so "today" is the only safe default. */
const wibToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const TUGAS_USAGE = 'usage: rise-ops tugas <list|publish|rm|review|grade> <class> [sesi | task-id]';

/**
 * Tugas live in RISE as tasks (ADR 0005). Two verbs write: `publish` creates or updates
 * from the sesi's Tugas file, and `rm` deletes. Neither takes free text — the file is the
 * record, so the portal and the vault cannot drift apart.
 */
commands.tugas = async (sub, alias, ...rest) => {
  const cached = await cache();
  const klass = resolveClass(cached, alias);

  if (sub === 'list') {
    const only = flagValue(rest, '--sesi');
    const index = await taskIndex(klass.id);
    const rows = klass.sessions.filter((s) => (only ? s.n === Number(only) : true));
    if (!rows.length) fail('not_found', `${klass.alias} has no sesi ${only}`);
    for (const s of rows) {
      const file = tugasPath(klass.alias, s.n);
      const up = index.get(s.id) ?? [];
      const state = up.length ? up.map((t) => t.title).join(' | ') : '—';
      say(`${klass.alias} sesi ${String(s.n).padStart(2)} · ${file ? 'ada Tugas.md' : 'tanpa Tugas.md'} · ${up.length} di RISE · ${state}`);
    }
    return;
  }

  if (sub === 'rm') {
    const id = rest.find((a) => /^[0-9a-f-]{36}$/i.test(a));
    if (!id) fail('bad_input', 'usage: rise-ops tugas rm <class> <task-id>');
    const before = await api('GET', `/v1/task/${id}`);
    // `/submissions` lists the whole roster, one row per student, submitted or not — its
    // `total_items` is the class size, never a submission count. `task_log_id` is the only
    // field that says a student actually handed something in.
    const subs = await api('GET', `/v1/task/${id}/submissions?page=1&page_size=200`);
    const handedIn = (subs.items ?? []).filter((s) => s.task_log_id);
    if (handedIn.length && !rest.includes('--force')) {
      fail('bad_input', `${handedIn.length} student(s) already submitted to "${before?.title}" — deleting discards their work. Pass --force to delete anyway.`);
    }
    await api('DELETE', `/v1/task/${id}`);
    audit({ cmd: 'tugas-delete', method: 'DELETE', path: `/v1/task/${id}`, prior: { id, title: before?.title, submissions: handedIn.length } });
    say(`${klass.alias}: deleted "${before?.title}" (${id})${handedIn.length ? ` — ${handedIn.length} submission(s) discarded` : ''}`);
    return;
  }

  // review/grade share the id-then-user-id argument shape; review is read-only, grade
  // writes — kept as separate verbs so the same command can never accidentally mutate a
  // grade (ADR 0006).
  if (sub === 'review') {
    const id = rest.find((a) => /^[0-9a-f-]{36}$/i.test(a));
    if (!id) fail('bad_input', 'usage: rise-ops tugas review <class> <task-id> [user-data-id] [--all]');
    const userId = rest.find((a) => a !== id && /^[0-9a-f-]{36}$/i.test(a));

    if (!userId) {
      const subs = await api('GET', `/v1/task/${id}/submissions?page=1&page_size=200`);
      const items = subs.items ?? [];
      const all = rest.includes('--all');
      const rows = all ? items : items.filter((s) => s.submission_status === 'SUBMITTED');
      for (const s of rows) {
        const graded = s.is_graded ? `graded (${s.score})` : 'ungraded';
        const status = s.submission_status === 'SUBMITTED' ? `submitted ${s.submit_date}` : 'belum mengumpulkan';
        say(`${s.user_nim} ${s.user_name} · ${status} · ${graded} · ${s.user_data_id}`);
      }
      const notSubmitted = items.length - items.filter((s) => s.submission_status === 'SUBMITTED').length;
      say(`${rows.length} shown${all ? '' : ` · ${notSubmitted} belum mengumpulkan (--all to include)`}`);
      return;
    }

    const detail = await api('GET', `/v1/task/${id}/user/${userId}/review`);
    const dir = join(SUBMISSION_DIR, id, `${detail.user_nim}-${slugify(detail.user_name)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '_review.json'), JSON.stringify(detail, null, 2));

    for (const f of detail.list_files ?? []) {
      const name = sanitizeFilename(f.original_name || basename(f.file_name ?? ''));
      const dest = join(dir, name);
      await downloadFile(f.file_url, dest);
      if (name.toLowerCase().endsWith('.zip')) unzipInto(dest, join(dir, 'contents'));
    }

    say(`${detail.user_nim} ${detail.user_name} → ${dir}`);
    say(`  tugas: ${detail.task?.title} · tutup ${detail.task?.end_date}`);
    if (detail.task?.description) say(`  deskripsi: ${detail.task.description}`);
    if (!detail.list_files?.length) say('  no files attached — check _review.json for a link (e.g. Google Docs)');
    if (detail.student_note) say(`  catatan mahasiswa: ${detail.student_note}`);
    if (detail.lecturer_feedback) say(`  feedback sebelumnya: ${detail.lecturer_feedback}`);
    say(`  status: ${detail.is_graded ? `graded (${detail.score})` : 'ungraded'}`);
    return;
  }

  if (sub === 'grade') {
    const id = rest.find((a) => /^[0-9a-f-]{36}$/i.test(a));
    const userId = rest.find((a) => a !== id && /^[0-9a-f-]{36}$/i.test(a));
    const scoreRaw = flagValue(rest, '--score');
    if (!id || !userId || scoreRaw === undefined) {
      fail('bad_input', 'usage: rise-ops tugas grade <class> <task-id> <user-data-id> --score N [--feedback "…"] [--force]');
    }
    const score = Number(scoreRaw);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      fail('bad_input', `--score must be a number 0-100, got "${scoreRaw}"`);
    }
    const feedback = flagValue(rest, '--feedback') ?? '';

    const path = `/v1/task/${id}/user/${userId}/review`;
    const before = await api('GET', path);
    if (before.is_graded && !rest.includes('--force')) {
      fail('bad_input', `${before.user_name} is already graded (score ${before.score}) — pass --force to overwrite`);
    }

    const payload = { score, lecturer_feedback: feedback };
    const data = await api('PUT', path, payload);
    audit({ cmd: 'tugas-grade', method: 'PUT', path, payload, prior: { score: before.score, graded_at: before.graded_at }, result: data });
    say(`${before.user_nim} ${before.user_name} · score ${score}${feedback ? ` · "${feedback}"` : ''}`);
    return;
  }

  if (sub === 'publish') {
    const sesi = rest.find((a) => /^\d+$/.test(a));
    if (!sesi) fail('bad_input', 'usage: rise-ops tugas publish <class> <sesi>');
    const session = resolveSession(klass, sesi);
    const path = tugasPath(klass.alias, session.n);
    if (!path) {
      fail('not_found', `${klass.alias} sesi ${session.n} has no Tugas file — looked for Sesi ${String(session.n).padStart(2, '0')} - Tugas.md in ${COURSES[klass.alias].dir}`);
    }
    const parsed = parseTugasFile(readFileSync(path, 'utf8'));
    if (parsed.error) fail('bad_input', `${basename(path)}: ${parsed.error}`);
    if (parsed.type === 'group') {
      fail('bad_input', 'a group tugas needs /v1/task/create-with-groups and a member list, which this tool does not implement — post it in the RISE UI');
    }

    const payload = {
      class_id: klass.id,
      schedules_id: session.id,
      schedules_session: session.n,
      title: parsed.title,
      type: parsed.type,
      description: parsed.description,
      start_date: new Date().toISOString(),
      end_date: parsed.due,
      on_close: parsed.onClose,
      submit_attempt: parsed.attempt,
      max_file_size: parsed.maxFileSize,
    };

    const clash = (await taskIndex(klass.id)).get(session.id)?.find((t) => t.title === parsed.title);
    if (clash) {
      const before = await api('GET', `/v1/task/${clash.task_id}`);
      const data = await api('PUT', `/v1/task/${clash.task_id}`, payload);
      audit({ cmd: 'tugas-update', method: 'PUT', path: `/v1/task/${clash.task_id}`, payload, prior: before, result: { id: data?.id } });
      say(`${klass.alias} sesi ${session.n}: "${parsed.title}" updated (${clash.task_id})`);
    } else {
      const data = await api('POST', '/v1/task/create', payload);
      audit({ cmd: 'tugas-create', method: 'POST', path: '/v1/task/create', payload, prior: null, result: { id: data?.id } });
      say(`${klass.alias} sesi ${session.n}: "${parsed.title}" published (${data?.id})`);
    }
    say(`  dari ${basename(path)} · ${parsed.type} · tutup ${parsed.due} · on-close ${parsed.onClose}`);
    say(`  ${parsed.attempt}x submit · maks ${parsed.maxFileSize} bytes`);
    say(`  ${ORIGIN}/lecture/dashboard/${klass.id}/tasks`);
    return;
  }

  fail('bad_input', TUGAS_USAGE);
};

commands.material = async (alias, sesi, file, ...flags) => {
  if (!file) {
    fail('bad_input', 'usage: rise-ops material <class> <sesi> <file> [--title …] [--description …] [--at YYYY-MM-DD] [--replace]');
  }
  if (!existsSync(file)) fail('bad_input', `no such file: ${file}`);

  const at = flagValue(flags, '--at') ?? wibToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) fail('bad_input', `--at wants YYYY-MM-DD, got "${at}"`);
  if (at < wibToday()) {
    fail('bad_input', `RISE refuses a start_date before today — ${at} is past. Use --at ${wibToday()} to publish now.`);
  }

  const cached = await cache();
  const klass = resolveClass(cached, alias);
  const session = resolveSession(klass, sesi);

  const { frontmatter } = parseFrontmatter(readFileSync(naskahPath(klass.alias, session.n), 'utf8'));
  const draft = materialDraft(frontmatter, session.n);
  const title = (flagValue(flags, '--title') ?? draft.title).trim();
  const description = (flagValue(flags, '--description') ?? draft.description).trim();
  if (!description) fail('bad_input', 'RISE requires a description — pass --description');

  const index = await materialIndex(klass.id);
  const clash = (index.get(session.id) ?? []).find((m) => m.title === title);
  if (clash && !flags.includes('--replace')) {
    fail('bad_input', `${klass.alias} sesi ${session.n} already carries "${title}" (${clash.material_id}) — pass --replace to swap it`);
  }

  const kind = attachKind(file);
  const uploaded = await uploadMaterialFile(klass.id, file, (n, total) => {
    if (total > 1) say(`  part ${n}/${total}`);
  });

  const payload = materialPayload({
    classId: klass.id,
    scheduleId: session.id,
    sesi: session.n,
    title,
    description,
    startDate: new Date(`${at}T00:00:00+07:00`).toISOString(),
    attachment: {
      doc_url: uploaded.file_name,
      original_name: basename(file),
      mime_type: kind.mime_type,
      file_category: kind.file_category,
      file_size: statSync(file).size,
    },
  });

  const data = await api('POST', '/v1/learning-material/create', payload);
  audit({
    cmd: 'material',
    method: 'POST',
    path: '/v1/learning-material/create',
    payload,
    prior: clash ?? null,
    result: { id: data?.id },
  });

  // The replacement goes last: a failed upload must not cost the material that is already up.
  if (clash) {
    await api('DELETE', `/v1/learning-material/${clash.material_id}`);
    audit({
      cmd: 'material-delete',
      method: 'DELETE',
      path: `/v1/learning-material/${clash.material_id}`,
      prior: { id: clash.material_id, title: clash.title },
    });
  }

  say(`${klass.alias} sesi ${session.n}: "${title}" published from ${basename(file)} (${payload.attachments[0].file_size} bytes)`);
  say(`  opens ${at} · material ${data?.id}`);
  say(`  ${ORIGIN}/lecture/dashboard/${klass.id}/materials`);
  if (clash) say(`  replaced ${clash.material_id}`);
};

// ── discussion ────────────────────────────────────────────────────────────────

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Plain text (as typed on the command line, may contain bare URLs and blank-line
 * paragraph breaks) → the minimal HTML the Diskusi Kelas `description_html` field wants.
 * Escapes first so a literal `<`/`>`/`&` in the source text can never be read back as a
 * tag, then linkifies bare `http(s)://` runs, then wraps blank-line-separated paragraphs.
 */
export function descriptionHtml(text) {
  const escaped = escapeHtml(String(text ?? '').trim());
  const linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return linked
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const DISCUSSION_USAGE = 'usage: rise-ops discussion <list|post> <class> [...]';

/**
 * Diskusi Kelas (RISE's class discussion board) — not covered by any ADR here because it
 * is class-wide, not sesi-scoped: the API keys posts on `lecture_class_id`, never on a
 * `schedules_id`, so there is no Naskah/sesi dependency the way `material` has one.
 */
commands.discussion = async (sub, alias, ...rest) => {
  const cached = await cache();
  const klass = resolveClass(cached, alias);

  if (sub === 'list') {
    const limit = Number(flagValue(rest, '--limit') ?? 20);
    const res = await api('GET', `/v1/class-discussion/posts?lecture_class_id=${klass.id}&cursor=&page_size=${limit}`);
    const posts = res?.data ?? [];
    if (!posts.length) {
      say(`${klass.alias}: no discussion posts yet.`);
      return;
    }
    for (const p of posts) say(`${p.id}  ${p.created_at ?? ''}  ${p.title}`);
    return;
  }

  if (sub === 'post') {
    const title = (flagValue(rest, '--title') ?? '').trim();
    const description = (flagValue(rest, '--description') ?? '').trim();
    if (!title) fail('bad_input', DISCUSSION_USAGE + ' --title "…" --description "…"');
    if (!description) fail('bad_input', 'RISE requires a description — pass --description');

    const payload = { lecture_class_id: klass.id, title, description_html: descriptionHtml(description) };
    const res = await api('POST', '/v1/class-discussion/posts', payload);
    const created = res?.data ?? res;
    audit({ cmd: 'discussion-post', method: 'POST', path: '/v1/class-discussion/posts', payload, prior: null, result: { id: created?.id } });

    say(`${klass.alias}: "${title}" posted (${created?.id ?? '?'})`);
    say(`  ${ORIGIN}/lecture/dashboard/${klass.id}/discussion`);
    return;
  }

  fail('bad_input', DISCUSSION_USAGE);
};

// ── entry ─────────────────────────────────────────────────────────────────────

const USAGE = `rise-ops — run and record a Cakrawala sesi

  auth                                  check the session cookie
  sync                                  refresh the local class/sesi/roster cache
  todo                                  what is still open across all classes
  brief <class> [--sesi N]              pre-class briefing

  attendance show <class> <sesi>
  attendance set  <class> <sesi> --hadir NIM,… [--izin …] [--sakit …] [--terlambat …] [--alpa …]
  attendance zoom <class> <sesi> <participants.csv>

  acara <class> <sesi> [--end]          berita acara from the approved Naskah
  material <class> <sesi> <file>        publish a deck to RISE Materi
  discussion list <class> [--limit N]   recent Diskusi Kelas posts
  discussion post <class> --title … --description …
  session <start|end> <class> <sesi>
  qr <class> <sesi>
  register <class>                      regenerate the attendance register

  tugas list <class> [--sesi N]         what RISE carries against each Tugas file
  tugas publish <class> <sesi>          create or update the sesi's task from its Tugas file
  tugas rm <class> <task-id> [--force]   delete a task; refuses while students have submitted
  tugas review <class> <task-id> [--all]              list submissions (submitted-only by default)
  tugas review <class> <task-id> <user-data-id>       fetch + download one submission
  tugas grade <class> <task-id> <user-data-id>
    --score N [--feedback "…"] [--force]              write a grade; refuses to overwrite one without --force

class is one of ${Object.keys(COURSES).join(', ')}; sesi is the sesi number.`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    say(USAGE);
    return;
  }
  const handler = commands[cmd];
  if (!handler) fail('bad_input', `unknown command "${cmd}" — try --help`);
  await handler(...args);
}

// Only run the CLI when invoked directly — test.mjs imports the pure half of this file.
const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err) => {
    const code = err instanceof OpsError ? err.code : 'io_error';
    process.stderr.write(`${JSON.stringify({ error: err.message, code })}\n`);
    process.exit(1);
  });
}
