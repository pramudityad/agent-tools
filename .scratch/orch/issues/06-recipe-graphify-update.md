# 06 — The knowledge graph stays current without being remembered

**What to build:** the owner's knowledge graph is rebuilt incrementally on a schedule. The rebuild
runs outside the agent turn, because it is exactly the kind of long job that an idle limit kills.

**Measure before scheduling.** This has never been run on this vault — there is no output directory
— and the vault carries a large adjacent semantic index. Duration and cost are unknown. The first
build is a measurement, run by hand; the schedule is then set from what was measured. Do not pick a
cron expression first.

**Blocked by:** 03 — schedule and doctor.

**Status:** ready-for-agent

- [ ] A first full build is run by hand against the vault, and its duration recorded
- [ ] The recorded duration is written into the ticket or the recipe as the basis for the schedule
- [ ] A recipe exists for the incremental rebuild, declaring the `script` envelope
- [ ] The schedule is derived from the measurement, not guessed
- [ ] The recipe's Verify confirms the output was refreshed, not merely that the command exited 0
- [ ] If the first build proves too slow or costly to schedule at all, that finding is recorded and the schedule is skipped
