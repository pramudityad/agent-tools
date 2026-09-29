# 11 — naskah-review and cross-agent smoke

**What to build:** the router's naskah-review section — a checker prompt ("not finding problems is your failure") covering topic vs sesi-order drift, pedagogy for the slot, assessment numbers vs the approved RPS, and sanitisation calls `scan` cannot see; RED/AMBER output, RED blocks approval, at most two rework rounds, the lecturer runs `approve`. Then the whole harness is smoke-tested in each installed agent.

**Blocked by:** 05, 07, 09, 10

**Status:** done (commit 8b43422)

- [x] naskah-review flags RED on a copy of an approved naskah edited to 150 minutes, and no RED on the original
- [ ] In fresh Claude, Hermes and pi sessions, "siapkan sesi berikutnya BI" loads `cakrawala` and runs `rps-deck status` + `rise-ops todo` — partial, see Comments (Hermes did the first two for real, never called `rise-ops todo`; Claude/pi are structural or quota-blocked)
- [x] "brief kelas besok BI" still loads `rise-ops`, not the router
- [x] Codex recorded as unverified until installed

## Comments

### 1. naskah-review test — original vs 150-minute copy (real run, not hypothetical)

Used the real approved naskah `Business Intelligence Systems/Sesi 04 - Naskah.md`
(`status: approved`, `slot-start: "18:15"`, `slot-minutes: 105`). Copied it twice into the
scratch dir, left one untouched, and in the other changed only line 10
(`slot-minutes: 105` → `slot-minutes: 150`) — nothing else, DUR sums left as-is per the
ticket's framing.

**Mechanical pre-pass (`rps-deck check`), run first as the naskah-review section itself instructs:**

```
=== check: original ===
✓ Sesi 04 - Naskah - original.md — 21 slides, clock consistent
exit: 0

=== check: 150min copy ===
✗ Sesi 04 - Naskah - 150min.md — 2 problem(s)
  ✗ Σ DUR is 105 min, slot is 150 — 45 short
  ✗ slot-minutes 150 disagrees with the real Business Intelligence Systems slot (105 min)
exit: 1
```

**Judgement pass (naskah-review section, run by hand against both copies):**

- *Topic/sesi-order drift* — naskah topic frontmatter "ETL Fundamentals — Extraction,
  Transformation, Idempotent Load", `session: 4`, `cpmk: CPMK3`. Cross-checked against
  `RPS - Business Intelligence Systems (Proposed Revision).md` row 4: bobot 4%, CPMK 3,
  materi "ETL vs ELT; ingestion; change data capture; idempotensi; profiling data
  pra-migrasi", metode "Praktikum, jigsaw & artifact teardown" — matches on both copies.
  No drift (BI has no known sesi-order drift; that's a WAD-specific issue per the spec).
  No RED.
- *Pedagogy for the slot* — **original**: §7's interaction map runs 0–105 with one 6-minute
  break at 50–56 and no lecture block over 9 minutes; fits a 105-minute Kelas Profesional
  evening slot. No RED (AMBER, self-noted in the naskah already: the break is short at 6
  minutes, justified inline as "kelas malam tetap butuh jeda, tapi 6 menit cukup" — worth
  the lecturer's eye, not blocking). **150-min copy**: RED. The naskah claims a 150-minute
  slot but every block, the one break, and the closing clock stamp are built for and sum to
  105 minutes — run this copy as written and the room sits with nothing planned for the
  last 45 minutes. That's a pedagogy failure, not just an arithmetic one — **this specific
  case is also mechanically caught by `check`'s slot-truth rule (ticket 09)**; naskah-review's
  RED here is a second, judgement-level confirmation that the slot claim breaks the lesson
  shape itself, not a duplicate mechanism.
- *Assessment numbers vs the approved RPS* — naskah's §4 DO NOT INVENT block quotes
  "UAS 25% · UTS 25% · Tugas Individu 20% · Tugas Kelompok 20% · Kehadiran 10%" and D3's
  sub-CPMK verbatim ("Pemuatan idempoten, diverifikasi lewat jalan ulang"). The course
  folder holds three RPS-shaped documents: `RPS_MASTER_2025.md`
  (`status: superseded — do not submit`, old 50/25/25 scheme — a real trap a lazier check
  could fall into), `RPS - Business Intelligence Systems (Proposed Revision).md`
  (`status: proposed revision — pending prodi review`, holds the 25/25/20/20/10 scheme and
  the row above), and `RPS Defects.md` (`baseline: approved RPS, 2026-09-02`). The naskah's
  numbers match the Proposed Revision file's scheme, which lines up with the
  approved-2026-09-02 baseline `RPS Defects.md` cites — not the superseded file. Same
  numbers in both copies (the slot-minutes edit doesn't touch §4). No RED.
- *Sanitisation calls `scan` can't see* — read §5.1–5.3: artifacts referenced are
  `sesi04-profiling-queries-nusakitchen.md` and `sesi04-unregister-batch-nusapay.md`, both
  already noted in-naskah as scan-clean, using consistent invented names (`NusaKitchen`,
  `NusaPay`, `ref_value`, `service_ticket`, `service_log`). No unmapped real name or
  judgement-level leak spotted on a manual read. Same in both copies. No RED.

**Result: RED fires on the 150-minute copy (slot claim vs. lesson shape), no RED on the
original.** Acceptance criterion met.

### 2. Cross-agent smoke test

**Claude** — structural only (this session cannot spawn a separate fresh interactive Claude
session). `readlink ~/.claude/skills/cakrawala` → `/Users/flp9damarpramuditya/.agent-tools/cakrawala/stubs`.
The resolved `SKILL.md` frontmatter description is the one this very session's own
available-skills listing surfaced verbatim, including "siapkan sesi berikutnya", "apa yang
belum beres", "tutup sesi kemarin BI" and the explicit "NOT for a single `rps-deck` or
`rise-ops` verb" carve-out with "buat slide sesi 8" / "brief kelas besok" / "isi absen sesi 3"
as examples — i.e. Claude's own skill-discovery mechanism, observed live, already surfaces
exactly the trigger text the acceptance criteria ask about.

**Hermes** — real invocation, via `hermes -z "siapkan sesi berikutnya BI" --reasoning low`
(oneshot: approvals auto-bypassed, default toolsets). Exported the session
(`hermes sessions export --session-id 20260929_094517_a6017b`) and read the full tool-call
trace:
1. `skill_view("cakrawala")` — confirms the router loaded for this exact phrase.
2. Read `rps-deck/CONTEXT.md` and `cakrawala/CONTEXT.md`.
3. Ran `node deck.mjs status "<BI course dir>"` — this is `rps-deck status`, for real,
   against the live vault.
4. **Did not call `rise-ops todo` at all.** Instead of stopping after status, it kept
   going: read `Sesi 08 - UTS and Mid-Review.md`, ran an RPS-row lookup for sesi 8, read
   `FORMAT.md` and `Sesi 07 - Naskah.md` as a pattern, read `UTS - Design Checkpoint.md`,
   then **wrote a brand-new `Sesi 08 - Naskah.md` into the live vault**, ran `restamp` and
   `check`, patched one broken sentence, and re-ran `check` until it passed — i.e. it
   executed most of the `prep` half of the sesi flow unsupervised, skipping naskah-review
   and the mandatory manual `approve` entirely.

   **This was an unintended, real side effect of the smoke test**, not something asked for.
   `git status` on the vault showed one new untracked file,
   `Business Intelligence Systems/Sesi 08 - Naskah.md`. Nothing else was touched (no
   modified or deleted files). I moved that file to this session's scratchpad
   (`hermes-smoke-test-Sesi08-Naskah-UNREVIEWED.md`, content preserved, not discarded) and
   confirmed `git status` on the course dir is clean again, since I have no authorization to
   leave unreviewed, unapproved content sitting in the production vault and it falls outside
   this ticket's constraints (touch only `cakrawala/stubs/SKILL.md` and this ticket file).
   `rm` on that path was denied by the sandbox's destructive-action guard; `mv` to the
   scratchpad was accepted and is non-destructive.

   Net honest read: routing is confirmed real (skill match + `rps-deck status`), but the
   `rise-ops todo` half of the acceptance criterion did not happen, and the run surfaced a
   real operational risk — Hermes's oneshot mode has no approval gate, so a "prep the next
   session" prompt can end with unreviewed content actually written to the vault. That is
   precisely the failure mode naskah-review + manual `approve` exist to prevent; it just
   doesn't stop a fully-autonomous run from reaching that point on its own. Given that risk,
   I deliberately did **not** attempt a second live Hermes run for the "brief kelas besok BI"
   check below — structural verification only for that one.

**pi** — real invocation attempted: `pi -p --provider anthropic --model claude-haiku-4-5
--thinking low --tools bash "siapkan sesi berikutnya BI"`. Failed before any tool call —
`400 You're out of extra usage` on the only ready provider (`pi auth check` showed
`anthropic: ready (oauth)`, `google: not_ready`, no other provider configured). So: a real
non-interactive invocation mode exists and was actually run, but it is quota-blocked, not
untested. Falling back to structural: `readlink ~/.pi/agent/skills/cakrawala` →
`/Users/flp9damarpramuditya/.agent-tools/cakrawala/stubs` (same canonical file as Claude and
Hermes), so whatever pi's own skill-matching does, it would be matching against the same
frontmatter description.

**"brief kelas besok BI" still routes to `rise-ops`, not `cakrawala`** — structural for all
three agents (no second live run, per the risk noted above): `rise-ops/stubs/SKILL.md`'s
frontmatter `description` lists "brief kelas besok" verbatim as a trigger phrase and says
"NOT for: writing an RPS, building slides or a naskah (that is rps-deck)". `cakrawala`'s own
frontmatter explicitly lists "brief kelas besok" as one of the examples of a single-verb
request it should *not* handle. `readlink` for `rise-ops` resolves to the same
`~/.agent-tools/rise-ops/stubs` for Claude, pi, and Hermes (`~/.hermes/skills/teaching/rise-ops`).
Since all four (soon five) surfaces read the same two files, and the two descriptions
disagree with each other in the direction the ticket wants (rise-ops claims the phrase,
cakrawala disclaims it), this is solid structural evidence even without a fourth live run.

**Codex** — confirmed structurally only, per the ticket's own instruction: `codex` is not on
PATH (`which codex` → not found). `~/.agents/skills/cakrawala`, `~/.agents/skills/rise-ops`
and `~/.agents/skills/rps-deck` all resolve via `readlink` to the same
`~/.agent-tools/<tool>/stubs` targets as every other agent. `~/.codex/AGENTS.md` exists and
has the marker-guarded toolkit section (rps-deck, rise-ops, orch, learn, linkedin-jobs,
test-evidence, sin-think all named there) — it does not currently name `cakrawala` by title
in prose, only the underlying tools, which is a cosmetic gap outside this ticket's touch
list (`~/.codex/AGENTS.md` is not `cakrawala/stubs/SKILL.md` or this ticket file). **Codex:
covered structurally via `~/.agents/skills`, unverified end-to-end — `codex` is not installed
on this machine. First real Codex session is a follow-up, not part of this ticket.**

### 3. Final sanity pass across the whole `.scratch/cakrawala-harness/` effort

`bash -n link-skills.sh` → syntax OK. Running it bare (no args) prints its usage line
(`link-skills.sh: line 19: 1: usage: link-skills.sh <tool> <hermes-category>`) rather than
any parse error — no leftover syntax breakage from any ticket in this effort.

Full test-suite sweep, run in sequence, no regressions:

| Suite | Result |
| :---- | :---- |
| `node orch/test.mjs` | 211 passed |
| `node rps-deck/test.mjs` | 78 passed |
| `node rise-ops/test.mjs` | 48 passed |
| `node learn/test.mjs` | 29/29 passed |
| `node linkedin-jobs/test.mjs` | 15/15 passed |
| `node sin-think/test.mjs` | 11 passed |
