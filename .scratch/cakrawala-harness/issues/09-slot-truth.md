# 09 — Slot truth

**What to build:** the slot table (ADR `rps-deck/0008`) keyed by the naskah's `course` — BI 18:15/105, WAD 20:00/120, SDLC 90 with odd sesi 18:30 and even 20:00, each with its `confirmed` source. `check` refuses a naskah whose `slot-start`/`slot-minutes` disagree, and refuses an unknown course with "ask the lecturer for the real slot". The vault's slot table becomes a pointer to it.

**Blocked by:** 01

**Status:** done (commit fd0a8b7)

- [x] Tests: a 150-minute BI naskah fails; a correct one passes; SDLC odd/even starts each checked; unknown course fails
- [x] Every existing approved naskah in the vault still passes `check` (or the failures are listed for the lecturer)
- [x] The vault Cakrawala CONTEXT.md slot table is replaced by a pointer

## Comments

`rps-deck/test.mjs`: 75/75 passed (was 63 before this ticket; +12 new: 6 unit tests on
`checkSlotTruth` plus 6 pre-existing `check`-command tests re-verified green, of which 1 is
new — the 150-minute BI CLI integration test).

`rps-deck/slots.json` (course frontmatter string is the exact key):

```json
{
  "Business Intelligence Systems": { "start": "18:15", "minutes": 105, "confirmed": "2026-09-03" },
  "Web Application Development": { "start": "20:00", "minutes": 120, "confirmed": "logged as D1 in its register" },
  "Software Development Life Cycle": { "oddStart": "18:30", "evenStart": "20:00", "minutes": 90, "confirmed": "SDLC D1 2026-09-04" }
}
```

`node rps-deck/deck.mjs check <naskah>` against every real naskah found with
`find ~/Documents/Obsidian\ Vault/02-Projects/Cakrawala -iname 'Sesi * - Naskah.md'` (21
files, no naskah files edited to force a pass):

**Business Intelligence Systems** — 7/7 pass (all: `slot-start: "18:15"`, `slot-minutes: 105`, matches real slot)
- Sesi 01 — pass (25 slides)
- Sesi 02 — pass (20 slides)
- Sesi 03 — pass (21 slides)
- Sesi 04 — pass (21 slides)
- Sesi 05 — pass (23 slides)
- Sesi 06 — pass (23 slides)
- Sesi 07 — pass (24 slides)

**Web Application Development** — 7/7 pass (all: `slot-start: "20:00"`, `slot-minutes: 120`, matches real slot)
- Sesi 01 — pass (25 slides)
- Sesi 02 — pass (27 slides)
- Sesi 03 — pass (26 slides)
- Sesi 04 — pass (29 slides)
- Sesi 05 — pass (24 slides)
- Sesi 06 — pass (30 slides)
- Sesi 07 — pass (33 slides)

**Software Development Life Cycle** — 6/7 pass
- Sesi 01 (`session: 1`, odd) — pass, 18:30/90 (25 slides)
- Sesi 02 (`session: 2`, even) — pass, 20:00/90 (27 slides)
- Sesi 03 (`session: 3`, odd) — pass, 18:30/90 (21 slides)
- Sesi 04 (`session: 4`, even) — pass, 20:00/90 (22 slides)
- Sesi 05 (`session: 5`, odd) — pass, 18:30/90 (22 slides)
- Sesi 06 (`session: 6`, even) — pass, 20:00/90 (22 slides)
- Sesi 08 — **FAIL**: `Software Development Life Cycle needs a numeric "session" field to
  pick its odd/even slot — found session=(none)`. This is the UTS logistics naskah; its
  frontmatter uses `sesi: 8` (not `session`) and a prose `slot: 20:00–21:30 (90 min) — …`
  field instead of `slot-start`. It has no SLIDE blocks (0 slides) so it passed every other
  check trivially before this ticket. Not edited to force a pass, per the ticket's
  constraint — the lecturer should add a numeric `session` field and a proper `slot-start`
  frontmatter key, or this naskah stays flagged.
- Also found `Software Development Life Cycle/Sesi 2 - Naskah.md` (no leading zero,
  apparently a stray duplicate of Sesi 02 — same frontmatter, same content) — pass,
  20:00/90 (27 slides). Not touched; flagging its existence for the lecturer to decide
  whether it should be deleted.

Overall: 20/21 real naskah pass `check` with the new slot-truth gate; 1 genuine gap found
(SDLC Sesi 08) that predates this ticket and was invisible until now.
