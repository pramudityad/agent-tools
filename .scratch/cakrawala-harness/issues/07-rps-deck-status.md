# 07 — rps-deck status

**What to build:** `rps-deck status <course-dir>` prints one row per session note — naskah `missing | draft | approved | stale`, Slides present, Materi present — and a final line naming the lowest-numbered sesi with no approved naskah. Read-only, exit 0.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Tested through the CLI against a temp course directory holding one sesi in each state
- [ ] `stale` reuses the existing approval-hash logic, not a new one
- [ ] Rows are keyed by session note number (no pertemuan inference)
- [ ] Documented in the rps-deck stub SKILL.md and `--help`
- [ ] On the real BI folder, output matches what is on disk
