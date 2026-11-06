# 05 — Retire ppt-master and its stray workspaces

**What to build:** Nothing on disk suggests a second deck pipeline. First, md5-verify that
every ppt-master project's deliverable is already in the vault, and list anything that
isn't. Then delete the following, but only after the pengampu explicitly confirms the
deletion list:
- the ppt-master clone (including its venv and `.env`)
- the ppt-master reference and the dead-pipeline guides (visual-deck, print-batch,
  intro-deck-print, parallel-visual-build, the visual-deck probe script)
- the stray vault workspaces (`04-Extras/ppt-build`, the BI `artifacts` ppt-master project,
  the vault-root SDLC sesi-14 projects, the WAD `ppt-build`)

Fold any lesson that still applies into the Slidev reference.

**Blocked by:** 03

**Status:** done

- [ ] The md5 report is shown to the pengampu before any deletion
- [ ] The deletion runs only on explicit confirmation
- [ ] `grep -ri ppt-master` across rps-deck, cakrawala, orch and rise-ops finds only ADR 0009
- [ ] The `OPENAI_API_KEY` that was in ppt-master's `.env` is flagged to the pengampu for rotation if it is a real key
