# 11 — naskah-review and cross-agent smoke

**What to build:** the router's naskah-review section — a checker prompt ("not finding problems is your failure") covering topic vs sesi-order drift, pedagogy for the slot, assessment numbers vs the approved RPS, and sanitisation calls `scan` cannot see; RED/AMBER output, RED blocks approval, at most two rework rounds, the lecturer runs `approve`. Then the whole harness is smoke-tested in each installed agent.

**Blocked by:** 05, 07, 09, 10

**Status:** ready-for-agent

- [ ] naskah-review flags RED on a copy of an approved naskah edited to 150 minutes, and no RED on the original
- [ ] In fresh Claude, Hermes and pi sessions, "siapkan sesi berikutnya BI" loads `cakrawala` and runs `rps-deck status` + `rise-ops todo`
- [ ] "brief kelas besok BI" still loads `rise-ops`, not the router
- [ ] Codex recorded as unverified until installed
