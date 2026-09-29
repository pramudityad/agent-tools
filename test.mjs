#!/usr/bin/env node
// @ts-check
// Hermetic-ish test suite for the shared skill linker (link-skills.sh).
//
// Not fully hermetic like a tool's own test.mjs: this one has to spawn a real bash process
// and touch a real (temporary) filesystem, because the thing under test IS filesystem
// symlinking. Every touched path lives under a per-test tmpdir; nothing outside it is ever
// written. See CONTEXT-MAP.md's house conventions and docs/adr/0001 for the scheme asserted
// here: `~/.agents/skills/<tool>` and every per-agent skill dir link straight to
// `<tool>/stubs/`, so a plain `readlink` on any of them shows `<tool>/stubs` directly.
//
// Run with: node test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readlinkSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const LINKER = join(REPO_ROOT, 'link-skills.sh');
const STUBS = join(REPO_ROOT, 'orch', 'stubs');

let passed = 0;
const failed = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed.push(`${name}: ${err.stack || err.message}`);
  }
}

// $1 a fresh fake HOME with .claude, .pi, .hermes/skills/<category> present (an "everyone
// installed" machine); the caller can delete one of these before running to test skipping.
function fakeHome() {
  const home = mkdtempSync(join(tmpdir(), 'link-skills-test-'));
  mkdirSync(join(home, '.claude', 'skills'), { recursive: true });
  mkdirSync(join(home, '.pi', 'agent', 'skills'), { recursive: true });
  mkdirSync(join(home, '.hermes', 'skills', 'ops'), { recursive: true });
  return home;
}

function run(home, args) {
  return spawnSync('bash', [LINKER, ...args], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
}

// ── every link lands where the ADR says ────────────────────────────────────────

test('links the shared hub and every present agent straight to <tool>/stubs', () => {
  const home = fakeHome();
  const result = run(home, ['orch', 'ops']);
  assert.equal(result.status, 0, result.stderr);

  const targets = [
    join(home, '.agents', 'skills', 'orch'),
    join(home, '.claude', 'skills', 'orch'),
    join(home, '.pi', 'agent', 'skills', 'orch'),
    join(home, '.hermes', 'skills', 'ops', 'orch'),
  ];
  for (const target of targets) {
    assert.equal(readlinkSync(target), STUBS, `${target} should link straight to ${STUBS}`);
  }
});

// ── idempotent ──────────────────────────────────────────────────────────────────

test('re-running is idempotent — same targets, exit 0, no duplication', () => {
  const home = fakeHome();
  run(home, ['orch', 'ops']);
  const second = run(home, ['orch', 'ops']);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already linked/);
  assert.equal(readlinkSync(join(home, '.claude', 'skills', 'orch')), STUBS);
});

// ── absent agent is skipped, not an error ───────────────────────────────────────

test('an absent agent is skipped with a message, and nothing is created for it', () => {
  const home = fakeHome();
  rmSync(join(home, '.pi'), { recursive: true, force: true });
  const result = run(home, ['orch', 'ops']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pi.*not present|skipped/i);
  assert.equal(existsSync(join(home, '.pi')), false);
  // the other three still got linked
  assert.equal(readlinkSync(join(home, '.claude', 'skills', 'orch')), STUBS);
});

// ── a pre-existing real directory is moved aside, never deleted ────────────────

test('a pre-existing real directory at a target is moved aside with a timestamped suffix', () => {
  const home = fakeHome();
  const target = join(home, '.claude', 'skills', 'orch');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'SKILL.md'), 'old copied skill, not a symlink');

  const result = run(home, ['orch', 'ops']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readlinkSync(target), STUBS);

  const siblings = readdirSync(join(home, '.claude', 'skills'));
  const backups = siblings.filter((name) => name.startsWith('orch.bak-'));
  assert.equal(backups.length, 1, `expected one backup dir, found: ${siblings.join(', ')}`);
  const backedUp = join(home, '.claude', 'skills', backups[0], 'SKILL.md');
  assert.equal(existsSync(backedUp), true, 'old content must survive under the backup, not be deleted');
});

// ── summary ───────────────────────────────────────────────────────────────────

if (failed.length) {
  console.error(`\n✗ ${failed.length} FAILED, ${passed} passed`);
  for (const name of failed) console.error(`    ✗ ${name}`);
  process.exit(1);
} else {
  console.log(`\n✓ ${passed} passed`);
}
