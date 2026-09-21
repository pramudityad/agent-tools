#!/usr/bin/env node
// Test Evidence Toolkit — deterministic core.
// Vocabulary is defined in ./CONTEXT.md. Architecture rationale in ./docs/adr/.
// Single file, zero npm dependencies, by ADR-0001.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

const CREDENTIAL_KEYS = /^(authorization|cookie|set-cookie|x-api-key|api[-_]?key|apikey|password|passwd|token|access[-_]?token|refresh[-_]?token|secret|client[-_]?secret|signature|private[-_]?key)$/i
// Person-name keys are listed explicitly rather than matched as `.*name` — masking
// `product_name` or `item_name` would destroy the evidence rather than protect anyone.
const PII_KEYS = new RegExp('^(' + [
  'email', 'e-mail', 'primary_email', 'sender_email', 'recipient_email',
  'phone', 'phone_number', 'msisdn', 'primary_phone', 'sender_phone', 'recipient_phone',
  'nik', 'ktp', 'passport', 'passport_number', 'account_number', 'card_number', 'dob', 'date_of_birth', 'address',
  'name', 'full_name', 'first_name', 'last_name', 'contact_name', 'primary_contact_name',
  'customer_name', 'beneficiary_name', 'sender_name', 'recipient_name', 'account_holder_name',
].join('|') + ')$', 'i')
const PII_PATTERNS = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, '****@****'],
  [/\+?62[\d-]{7,}/g, '+62**********'],
]
const MASK = '****'
const GATEWAY_STATUSES = new Set([502, 503, 504])
const DEFAULT_READY_TIMEOUT_SEC = 90
const CARD_WIDTH = 960
const LINE_HEIGHT = 22
// Chromium's --screenshot captures the window viewport, not the full page (ADR-0003 was
// declined, so this stays an implementation note): the window must be sized to the content
// up front. Over-estimating is harmless because the page background matches the card's
// surround, so surplus height reads as intentional padding. Under-estimating clips the
// footer, so every constant here is deliberately generous.
const CARD_CHROME_HEIGHT = 560

// ── args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const [command, ...rest] = argv
  const positional = []
  const flags = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg.startsWith('--')) { positional.push(arg); continue }
    const [key, inlineValue] = arg.slice(2).split('=')
    const next = rest[i + 1]
    if (inlineValue !== undefined) flags[key] = inlineValue
    else if (next && !next.startsWith('--')) { flags[key] = next; i++ }
    else flags[key] = true
  }
  return { command, positional, flags }
}

// ── config ───────────────────────────────────────────────────────────────────

function findRepoRoot(from = process.cwd()) {
  let dir = resolve(from)
  while (dir !== '/') {
    if (existsSync(join(dir, 'go.mod')) || existsSync(join(dir, '.git')) || existsSync(join(dir, 'package.json'))) return dir
    dir = dirname(dir)
  }
  return resolve(from)
}

function configPath(repoRoot) {
  return join(repoRoot, 'docs', 'evidence', 'config.json')
}

function loadConfig(repoRoot) {
  const path = configPath(repoRoot)
  if (!existsSync(path)) {
    fail(`No config at ${path}\nRun:  node ${process.argv[1]} init`)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

function detectConfig(repoRoot) {
  const service = repoRoot.split('/').pop()
  const tmplPath = ['config.yaml.tmpl', 'config.yaml'].map(f => join(repoRoot, f)).find(existsSync)
  const port = tmplPath ? detectAppPort(readFileSync(tmplPath, 'utf8')) : null

  const makefile = join(repoRoot, 'Makefile')
  const targets = existsSync(makefile)
    ? new Set([...readFileSync(makefile, 'utf8').matchAll(/^([a-zA-Z0-9_.-]+):/gm)].map(m => m[1]))
    : new Set()

  const mockDir = ['mock-providers', 'mock'].map(d => join(repoRoot, d)).find(existsSync)

  return {
    service,
    tester: gitUserName(repoRoot),
    envs: {
      local: { base_url: `http://localhost:${port ?? '8080'}`, health_path: '/health' },
      stg: { base_url: 'https://REPLACE-ME.stg.internal', health_path: '/health' },
    },
    stub_server_url: mockDir ? 'http://localhost:1081' : null,
    boot: {
      deps_up: targets.has('deps-up') ? 'make deps-up' : null,
      migrate: targets.has('migrate-up') ? 'make migrate-up' : null,
      app: targets.has('run-app') ? 'make run-app' : null,
      ready_timeout_sec: DEFAULT_READY_TIMEOUT_SEC,
    },
    clickup: { team_id: null },
  }
}

// These configs list several ports — database, legacy DB, redis, and the HTTP server. Two
// signals separate them: the app port sits under a `server:`/`app:`/`http:` block, and it is
// written colon-prefixed (`port: :8787`) while infrastructure ports are bare (`port: 54321`).
// Prefer the section, fall back to the colon form, and only then to the first port seen.
function detectAppPort(yaml) {
  const candidates = []
  let section = null
  for (const line of yaml.split('\n')) {
    const sectionMatch = line.match(/^([a-zA-Z_][\w-]*):/)
    if (sectionMatch) { section = sectionMatch[1].toLowerCase(); continue }
    const portMatch = line.match(/^\s+port:\s*"?(:?)(\d{2,5})"?/)
    if (portMatch) candidates.push({ section, colonPrefixed: portMatch[1] === ':', port: portMatch[2] })
  }
  const inServerBlock = candidates.find(c => ['server', 'app', 'http'].includes(c.section))
  return (inServerBlock ?? candidates.find(c => c.colonPrefixed) ?? candidates[0])?.port ?? null
}

function gitUserName(cwd) {
  const result = spawnSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8' })
  return result.stdout?.trim() || process.env.USER || 'unknown'
}

// ── redaction (render-time only — assertions always see raw values) ───────────

function redact(value, { maskPii }) {
  if (Array.isArray(value)) return value.map(v => redact(v, { maskPii }))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => {
      if (CREDENTIAL_KEYS.test(key)) return [key, MASK]
      if (maskPii && PII_KEYS.test(key)) return [key, MASK]
      return [key, redact(val, { maskPii })]
    }))
  }
  if (maskPii && typeof value === 'string') {
    return PII_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value)
  }
  return value
}

// ── assertions ───────────────────────────────────────────────────────────────

// Deep subset: every key in `expected` must be present in `actual` and match.
// The literal string "*" asserts only that the key exists with a non-null value.
function matchSubset(expected, actual, path = '') {
  const misses = []
  if (expected === '*') {
    if (actual === undefined || actual === null) misses.push(`${path || 'body'}: expected any value, got ${actual}`)
    return misses
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: expected array, got ${typeName(actual)}`]
    expected.forEach((item, i) => misses.push(...matchSubset(item, actual[i], `${path}[${i}]`)))
    return misses
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return [`${path || 'body'}: expected object, got ${typeName(actual)}`]
    for (const [key, val] of Object.entries(expected)) {
      misses.push(...matchSubset(val, actual[key], path ? `${path}.${key}` : key))
    }
    return misses
  }
  if (expected !== actual) misses.push(`${path || 'body'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  return misses
}

function typeName(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

// ── stubs (our term; MockServer calls these expectations on the wire) ─────────

async function applyStubs(stubs, stubServerUrl) {
  if (!stubs?.length) return { applied: [], error: null }
  if (!stubServerUrl) return { applied: [], error: 'Check declares stubs but config has no stub_server_url' }
  const applied = []
  for (const stub of stubs) {
    try {
      const response = await fetch(`${stubServerUrl}/mockserver/expectation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stub.expectation),
      })
      if (!response.ok) return { applied, error: `Stub for "${stub.dep}" rejected: HTTP ${response.status}` }
      applied.push(stub.dep)
    } catch (err) {
      return { applied, error: `Stub server unreachable at ${stubServerUrl}: ${err.message}` }
    }
  }
  return { applied, error: null }
}

async function clearStubs(stubServerUrl) {
  if (!stubServerUrl) return
  try {
    await fetch(`${stubServerUrl}/mockserver/reset`, { method: 'PUT' })
  } catch { /* the stub server being gone is not worth failing a Run over */ }
}

// ── execution ────────────────────────────────────────────────────────────────

async function executeCheck(check, spec, config) {
  const url = `${spec.base_url}${check.path}`
  const stubResult = await applyStubs(check.stubs, config.stub_server_url)
  if (stubResult.error) {
    // Report only the Stubs that actually applied — the Mode column states how the Check
    // ran, not what it intended, so a failed Stub must never read as STUBBED.
    return { outcome: 'BLOCKED', reason: stubResult.error, url, stubbed: stubResult.applied, durationMs: 0 }
  }

  const startedAt = Date.now()
  let response
  try {
    response = await fetch(url, {
      method: check.method,
      headers: check.headers ?? {},
      body: check.body === undefined ? undefined : JSON.stringify(check.body),
    })
  } catch (err) {
    return {
      outcome: 'BLOCKED',
      reason: `Request never completed: ${err.cause?.code ?? err.message}`,
      url, stubbed: stubResult.applied, durationMs: Date.now() - startedAt,
    }
  }
  const durationMs = Date.now() - startedAt

  const rawText = await response.text()
  let parsedBody
  try { parsedBody = rawText ? JSON.parse(rawText) : null } catch { parsedBody = rawText }

  const responseHeaders = Object.fromEntries(response.headers.entries())
  const base = {
    url, durationMs, stubbed: stubResult.applied,
    status: response.status, statusText: response.statusText,
    responseHeaders, responseBody: parsedBody,
  }

  // A gateway-class status means the request died before the handler ran: the Verdict
  // is what's wrong, not the service. See CONTEXT.md — Outcome.
  if (GATEWAY_STATUSES.has(response.status) && response.status !== check.expected_status) {
    return { ...base, outcome: 'BLOCKED', reason: `Gateway-class ${response.status} — request did not reach the handler` }
  }

  const misses = []
  if (response.status !== check.expected_status) {
    misses.push(`status: expected ${check.expected_status}, got ${response.status}`)
  }
  if (check.expect_body) misses.push(...matchSubset(check.expect_body, parsedBody))

  return { ...base, outcome: misses.length ? 'FAIL' : 'PASS', reason: misses.join('; ') || null, misses }
}

// ── preflight ────────────────────────────────────────────────────────────────

async function isHealthy(baseUrl, healthPath) {
  try {
    const response = await fetch(`${baseUrl}${healthPath ?? '/'}`, { signal: AbortSignal.timeout(3000) })
    return response.status < 500
  } catch { return false }
}

function run(command, cwd, { background = false, logFile = null } = {}) {
  if (!background) {
    const result = spawnSync('sh', ['-c', command], { cwd, stdio: 'inherit' })
    return result.status === 0
  }
  const fd = openSync(logFile, 'a')
  const child = spawn('sh', ['-c', command], { cwd, detached: true, stdio: ['ignore', fd, fd] })
  child.unref()
  return true
}

async function preflight(config, spec, repoRoot, { noBoot }) {
  const envConfig = config.envs[spec.env] ?? {}
  if (await isHealthy(spec.base_url, envConfig.health_path)) {
    log(`✓ ${spec.env} healthy at ${spec.base_url}`)
    return true
  }
  if (spec.env !== 'local') {
    fail(`${spec.env} is not reachable at ${spec.base_url}. Non-local environments are never booted by this tool.`)
  }
  if (noBoot) fail(`Service not healthy at ${spec.base_url} and --no-boot was set.`)

  log(`✗ not healthy at ${spec.base_url} — booting`)

  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    fail('Docker daemon is not running. Start Docker Desktop, then re-run.')
  }

  const { deps_up, migrate, app, ready_timeout_sec } = config.boot
  if (deps_up) { log(`  → ${deps_up}`); if (!run(deps_up, repoRoot)) fail(`\`${deps_up}\` failed`) }

  if (config.stub_server_url) {
    log('  → waiting for stub server')
    const ready = await waitFor(() => isHealthy(config.stub_server_url, '/mockserver/status'), 30)
    if (!ready) log('  ! stub server did not report ready — Checks declaring stubs will be BLOCKED')
  }

  if (migrate) { log(`  → ${migrate}`); run(migrate, repoRoot) }

  if (app) {
    const logFile = join(repoRoot, 'docs', 'evidence', 'app.log')
    mkdirSync(dirname(logFile), { recursive: true })
    log(`  → ${app}  (logs: ${logFile})`)
    run(app, repoRoot, { background: true, logFile })
  }

  const timeout = ready_timeout_sec ?? DEFAULT_READY_TIMEOUT_SEC
  log(`  → polling ${spec.base_url} for up to ${timeout}s`)
  const healthy = await waitFor(() => isHealthy(spec.base_url, envConfig.health_path), timeout)
  if (!healthy) fail(`Service did not become healthy within ${timeout}s. Check docs/evidence/app.log`)
  log('✓ healthy')
  return true
}

async function waitFor(predicate, seconds) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

// ── rendering ────────────────────────────────────────────────────────────────

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function highlightJson(value) {
  if (value === null || value === undefined) return '<span class="muted">(empty)</span>'
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return escapeHtml(text)
    .replace(/&quot;([^&]*?)&quot;(\s*:)/g, '<span class="k">&quot;$1&quot;</span>$2')
    .replace(/:\s*&quot;([^&]*?)&quot;/g, ': <span class="s">&quot;$1&quot;</span>')
    .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="n">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="b">$1</span>')
}

function headerBlock(headers) {
  const entries = Object.entries(headers ?? {})
  if (!entries.length) return '<span class="muted">(none)</span>'
  return entries.map(([k, v]) => `<span class="k">${escapeHtml(k)}</span>: ${escapeHtml(v)}`).join('\n')
}

function countLines(value) {
  if (value === null || value === undefined) return 1
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.split('\n').length
}

// Headers render one line per entry, not as pretty-printed JSON — count them that way or
// the estimate drifts and the footer gets cut.
const headerLines = headers => Math.max(1, Object.keys(headers ?? {}).length)

function estimateHeight(check, result, maskPii) {
  const lines = headerLines(check.headers)
    + (check.body === undefined ? 0 : countLines(redact(check.body, { maskPii })))
    + headerLines(result.responseHeaders)
    + countLines(redact(result.responseBody, { maskPii }))
  const reasonAllowance = result.reason ? 60 : 0
  return Math.max(560, CARD_CHROME_HEIGHT + lines * LINE_HEIGHT + reasonAllowance)
}

function renderCard(check, result, spec, config, index, maskPii) {
  const tone = { PASS: 'pass', FAIL: 'fail', BLOCKED: 'blocked' }[result.outcome]
  const badge = { PASS: '✅', FAIL: '❌', BLOCKED: '⚠️' }[result.outcome]
  const statusLine = result.status
    ? `${badge} ${result.status} ${escapeHtml(result.statusText ?? '')}`
    : `${badge} no response`
  const stubChip = result.stubbed?.length
    ? `<span class="chip">STUBBED: ${escapeHtml(result.stubbed.join(', '))}</span>` : ''
  const reason = result.reason ? `<div class="reason">${escapeHtml(result.reason)}</div>` : ''

  return `<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body { margin:0; padding:16px; background:#0b0f1a; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif }
  .card { max-width:${CARD_WIDTH - 32}px; margin:0 auto; background:#131a2a; border-radius:12px; overflow:hidden }
  .bar { background:#1a2942; padding:14px 20px; display:flex; justify-content:space-between; align-items:center }
  .bar h1 { margin:0; font-size:15px; color:#e8eefc } .bar .meta { font-size:12px; color:#8fa3c8 }
  .name { background:#16203a; padding:11px 20px; color:#7fd1ff; font-size:14px; display:flex; gap:10px; align-items:center }
  .chip { background:#5a3a00; color:#ffc46b; font-size:10px; font-weight:700; padding:3px 8px; border-radius:10px; letter-spacing:.4px }
  .sec { padding:14px 20px 4px }
  .lab { font-size:11px; font-weight:700; letter-spacing:1px; margin-bottom:8px }
  .lab.req { color:#ff5f6d } .lab.res { color:#4da6ff }
  .url { font-size:14px; color:#e8eefc; margin-bottom:12px; word-break:break-all }
  .url .m { color:#ff5f6d; font-weight:700 }
  .sub { font-size:10px; color:#7b8db0; letter-spacing:.8px; margin:10px 0 5px }
  pre { background:#0d1424; border:1px solid #1e2a42; border-radius:7px; padding:12px 14px; margin:0;
        font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; line-height:${LINE_HEIGHT}px;
        color:#cdd9ef; white-space:pre-wrap; word-break:break-word }
  .k{color:#8ab4f8} .s{color:#7ee787} .n{color:#ffab70} .b{color:#d2a8ff} .muted{color:#5f7194}
  .status { font-size:15px; font-weight:700; margin-bottom:10px }
  .status.pass{color:#3fb950} .status.fail{color:#f85149} .status.blocked{color:#e3b341}
  .ms { color:#7b8db0; font-weight:400; font-size:12px }
  .reason { margin:10px 20px 0; padding:9px 12px; border-radius:7px; font-size:12px;
            background:#2a1416; border:1px solid #5c2226; color:#ffb4ab }
  .blocked .reason { background:#2a2410; border-color:#5c4a22; color:#ffd98a }
  .foot { background:#1a2942; padding:11px 20px; display:flex; justify-content:space-between; font-size:11.5px; color:#8fa3c8; margin-top:16px }
</style>
<div class="card ${tone}">
  <div class="bar">
    <h1>📋 API Test Evidence</h1>
    <div class="meta">Ticket: <b>${escapeHtml(spec.ticket)}</b> | ${escapeHtml(result.renderedAt)}</div>
  </div>
  <div class="name">📝 ${escapeHtml(check.name)} ${stubChip}</div>
  <div class="sec">
    <div class="lab req">▶ REQUEST</div>
    <div class="url"><span class="m">${escapeHtml(check.method)}</span> ${escapeHtml(result.url)}</div>
    <div class="sub">HEADERS</div>
    <pre>${headerBlock(redact(check.headers, { maskPii }))}</pre>
    ${check.body === undefined ? '' : `<div class="sub">BODY</div><pre>${highlightJson(redact(check.body, { maskPii }))}</pre>`}
  </div>
  <div class="sec">
    <div class="lab res">◀ RESPONSE</div>
    <div class="status ${tone}">${statusLine} <span class="ms">(${result.durationMs}ms)</span></div>
    <div class="sub">HEADERS</div>
    <pre>${headerBlock(redact(result.responseHeaders, { maskPii }))}</pre>
    <div class="sub">BODY</div>
    <pre>${highlightJson(redact(result.responseBody, { maskPii }))}</pre>
  </div>
  ${reason}
  <div class="foot">
    <span>Environment: <b>${escapeHtml(spec.env.toUpperCase())}</b></span>
    <span>Tester: <b>${escapeHtml(config.tester)}</b></span>
  </div>
</div>`
}

function findBrowser() {
  const candidates = [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    process.env.EVIDENCE_BROWSER,
  ]
  return candidates.find(path => path && existsSync(path)) ?? null
}

function screenshot(browser, htmlPath, pngPath, height) {
  const result = spawnSync(browser, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--screenshot=${pngPath}`,
    `--window-size=${CARD_WIDTH},${height}`,
    '--force-device-scale-factor=2',
    htmlPath,
  ], { stdio: 'ignore', timeout: 30000 })
  return result.status === 0 && existsSync(pngPath)
}

// ── outputs ──────────────────────────────────────────────────────────────────

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

function writeSummary(setDir, spec, config, rows, startedAt) {
  const tally = { PASS: 0, FAIL: 0, BLOCKED: 0 }
  rows.forEach(r => tally[r.result.outcome]++)
  const icon = { PASS: '✅ PASS', FAIL: '❌ FAIL', BLOCKED: '⚠️ BLOCKED' }

  const table = rows.map(r => {
    const mode = r.result.stubbed?.length ? `STUBBED (${r.result.stubbed.join(', ')})` : 'REAL'
    const actual = r.result.status ?? '—'
    return `| ${r.number} | ${r.check.name} | ${r.check.test_case ?? '—'} | ${r.check.method} | ${r.check.path} | ${r.check.expected_status} | ${actual} | ${icon[r.result.outcome]} | ${mode} | ${r.pngName ?? r.htmlName} |`
  }).join('\n')

  const blocked = rows.filter(r => r.result.outcome === 'BLOCKED')
  const blockedNote = blocked.length ? `
> ⚠️ ${blocked.length} Check(s) were **BLOCKED** — they never reached a verdictable state, so this
> indicts the Verdict rather than the service. Re-triage these Test Cases; they are likely \`STG-ONLY\`.
${blocked.map(r => `> - **${r.check.name}** — ${r.result.reason}`).join('\n')}
` : ''

  const content = `# API Test Evidence — ${spec.ticket}

**Environment:** ${spec.env} | **Tester:** ${config.tester} | **Run:** ${startedAt}
**Base URL:** ${spec.base_url}
**Result:** ${tally.PASS} passed, ${tally.FAIL} failed, ${tally.BLOCKED} blocked
${blockedNote}
| # | Check | Test Case | Method | Endpoint | Expected | Actual | Outcome | Mode | Card |
|---|-------|-----------|--------|----------|----------|--------|---------|------|------|
${table}
`
  writeFileSync(join(setDir, 'summary.md'), content)
  return tally
}

function writeClickupComment(setDir, spec, config, rows, tally, startedAt) {
  const icon = { PASS: '✅', FAIL: '❌', BLOCKED: '⚠️' }
  const lines = rows.map(r =>
    `| ${r.number} | ${r.check.name} | ${r.check.expected_status} | ${r.result.status ?? '—'} | ${icon[r.result.outcome]} ${r.result.outcome} | ${r.result.stubbed?.length ? 'STUBBED' : 'REAL'} |`
  ).join('\n')

  const content = `**Test evidence — ${spec.ticket} (${spec.env})**
Run ${startedAt} by ${config.tester} against ${spec.base_url}
**${tally.PASS} passed, ${tally.FAIL} failed, ${tally.BLOCKED} blocked**

| # | Check | Expected | Actual | Outcome | Mode |
|---|-------|----------|--------|---------|------|
${lines}

${rows.some(r => r.result.stubbed?.length) ? '> Checks marked STUBBED were proven against a stubbed provider, not the real downstream service.\n' : ''}${tally.BLOCKED ? '> BLOCKED Checks could not be evaluated locally and need re-triage for STG.\n' : ''}
Evidence Cards attached: ${rows.map(r => r.pngName ?? r.htmlName).join(', ')}
`
  writeFileSync(join(setDir, 'clickup-comment.md'), content)
  return content
}

// ── clickup (opt-in, --post) ─────────────────────────────────────────────────

async function postToClickup(spec, config, comment, setDir, rows) {
  const token = process.env.CLICKUP_API_TOKEN
  if (!token) fail('--post needs CLICKUP_API_TOKEN in the environment.')
  const teamId = config.clickup?.team_id ?? process.env.CLICKUP_TEAM_ID
  if (!teamId) fail('--post needs clickup.team_id in config.json (or CLICKUP_TEAM_ID).')

  const query = `custom_task_ids=true&team_id=${teamId}`
  const taskResponse = await fetch(`https://api.clickup.com/api/v2/task/${spec.ticket}?${query}`, {
    headers: { Authorization: token },
  })
  if (!taskResponse.ok) fail(`Could not resolve ${spec.ticket} in ClickUp: HTTP ${taskResponse.status}`)
  const taskId = (await taskResponse.json()).id

  const commentResponse = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text: comment, notify_all: false }),
  })
  if (!commentResponse.ok) fail(`Comment failed: HTTP ${commentResponse.status}`)
  log(`✓ commented on ${spec.ticket}`)

  for (const row of rows) {
    if (!row.pngName) continue
    const form = new FormData()
    form.append('attachment', new Blob([readFileSync(join(setDir, row.pngName))]), row.pngName)
    const attachResponse = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/attachment`, {
      method: 'POST', headers: { Authorization: token }, body: form,
    })
    log(attachResponse.ok ? `✓ attached ${row.pngName}` : `✗ attach failed for ${row.pngName}: HTTP ${attachResponse.status}`)
  }
}

// ── commands ─────────────────────────────────────────────────────────────────

function cmdInit(repoRoot, flags) {
  const path = configPath(repoRoot)
  if (existsSync(path) && !flags.force) fail(`${path} already exists. Pass --force to overwrite.`)
  const detected = detectConfig(repoRoot)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(detected, null, 2) + '\n')

  const exclude = join(repoRoot, '.git', 'info', 'exclude')
  if (existsSync(dirname(exclude))) {
    const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
    const entries = ['docs/evidence/config.json', 'docs/evidence/app.log']
      .filter(entry => !current.includes(entry))
    if (entries.length) appendFileSync(exclude, `\n# test-evidence toolkit (local only)\n${entries.join('\n')}\n`)
    log(`✓ ignored locally via .git/info/exclude (the repo's own .gitignore is untouched)`)
  }

  log(`\n✓ wrote ${path}\n`)
  log(readFileSync(path, 'utf8'))
  log('Detection is a best guess — confirm base_url, health_path and boot commands before running.')
  if (detected.boot.migrate === 'make migrate-up') {
    log('Note: some repos need arguments, e.g. `make migrate-up user=... password=... dbname=...`.')
  }
}

async function cmdRun(repoRoot, specPath, flags) {
  const config = loadConfig(repoRoot)
  const spec = JSON.parse(readFileSync(specPath, 'utf8'))
  const maskPii = Boolean(flags['mask-pii'])
  if (!spec.checks?.length) fail(`${specPath} has no checks[]`)

  const selected = flags.only
    ? String(flags.only).split(',').map(n => parseInt(n.trim(), 10))
    : null
  const numbered = spec.checks
    .map((check, i) => ({ check, number: i + 1 }))
    .filter(({ number }) => !selected || selected.includes(number))
  if (!numbered.length) fail(`--only ${flags.only} selected no Checks (spec has ${spec.checks.length}).`)

  await preflight(config, spec, repoRoot, { noBoot: Boolean(flags['no-boot']) })

  const setDir = join(repoRoot, 'docs', 'evidence', spec.ticket, spec.env)
  mkdirSync(setDir, { recursive: true })

  const browser = findBrowser()
  if (!browser) log('! No Chromium-family browser found — writing HTML Evidence Cards only.')

  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const rows = []

  for (const { check, number } of numbered) {
    const result = await executeCheck(check, spec, config)
    result.renderedAt = startedAt
    await clearStubs(config.stub_server_url)

    const prefix = `${String(number).padStart(3, '0')}-${slug(check.name)}-${check.method}-${result.status ?? 'noresp'}`
    const htmlName = `${prefix}.html`
    const pngName = `${prefix}.png`
    writeFileSync(join(setDir, htmlName), renderCard(check, result, spec, config, number, maskPii))

    let rendered = false
    if (browser) {
      rendered = screenshot(browser, join(setDir, htmlName), join(setDir, pngName), estimateHeight(check, result, maskPii))
    }

    const mark = { PASS: '✅', FAIL: '❌', BLOCKED: '⚠️' }[result.outcome]
    log(`${mark} [${number}] ${check.name} — ${result.outcome}${result.reason ? ` (${result.reason})` : ''}`)
    rows.push({ number, check, result, htmlName, pngName: rendered ? pngName : null })
  }

  const tally = writeSummary(setDir, spec, config, rows, startedAt)
  const comment = writeClickupComment(setDir, spec, config, rows, tally, startedAt)

  log(`\n${tally.PASS} passed, ${tally.FAIL} failed, ${tally.BLOCKED} blocked`)
  log(`Evidence Set: ${setDir}`)

  if (flags.post) await postToClickup(spec, config, comment, setDir, rows)
  else log(`Paste-ready comment: ${join(setDir, 'clickup-comment.md')}  (use --post to publish it)`)

  process.exit(tally.FAIL || tally.BLOCKED ? 1 : 0)
}

async function cmdPreflight(repoRoot, flags) {
  const config = loadConfig(repoRoot)
  const env = flags.env ?? 'local'
  const envConfig = config.envs[env]
  if (!envConfig) fail(`No env "${env}" in config.json`)
  await preflight(config, { env, base_url: envConfig.base_url }, repoRoot, { noBoot: Boolean(flags['no-boot']) })
}

// ── entry ────────────────────────────────────────────────────────────────────

const log = msg => console.log(msg)
function fail(msg) { console.error(`\n✗ ${msg}\n`); process.exit(2) }

const USAGE = `test-evidence — capture reproducible API test evidence

  node evidence.mjs init [--force]
      Detect this repo's ports and make targets, write docs/evidence/config.json
      (ignored locally via .git/info/exclude), and print it for you to confirm.

  node evidence.mjs preflight [--env local] [--no-boot]
      Probe the service; boot Docker deps, migrations and the app if it is down.

  node evidence.mjs run <spec.json> [--only 1,3] [--mask-pii] [--no-boot] [--post]
      Execute every Check in a Spec, render an Evidence Card each, and write the
      Evidence Set (summary.md + clickup-comment.md) to docs/evidence/<TICKET>/<env>/.
      Exits non-zero if any Check is FAIL or BLOCKED.

Vocabulary: see CONTEXT.md next to this file.`

const { command, positional, flags } = parseArgs(process.argv.slice(2))
const repoRoot = flags.repo ? resolve(flags.repo) : findRepoRoot()

switch (command) {
  case 'init': cmdInit(repoRoot, flags); break
  case 'detect': log(JSON.stringify(detectConfig(repoRoot), null, 2)); break
  case 'preflight': await cmdPreflight(repoRoot, flags); break
  case 'run':
    if (!positional[0]) fail('run needs a path to a Spec JSON file.')
    await cmdRun(repoRoot, resolve(positional[0]), flags)
    break
  default: log(USAGE); process.exit(command ? 2 : 0)
}
