# 09 — Slot truth

**What to build:** the slot table (ADR `rps-deck/0008`) keyed by the naskah's `course` — BI 18:15/105, WAD 20:00/120, SDLC 90 with odd sesi 18:30 and even 20:00, each with its `confirmed` source. `check` refuses a naskah whose `slot-start`/`slot-minutes` disagree, and refuses an unknown course with "ask the lecturer for the real slot". The vault's slot table becomes a pointer to it.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Tests: a 150-minute BI naskah fails; a correct one passes; SDLC odd/even starts each checked; unknown course fails
- [ ] Every existing approved naskah in the vault still passes `check` (or the failures are listed for the lecturer)
- [ ] The vault Cakrawala CONTEXT.md slot table is replaced by a pointer
