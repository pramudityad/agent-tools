# 05 — The benchmark job starts succeeding on its schedule

**What to build:** the daily model-combo benchmark, which currently fails every morning while
passing whenever run by hand, runs to completion on its own schedule. The expensive script moves
outside the agent turn so the idle limit is never reached; the agent is left only to summarise.

The shape already works elsewhere in the owner's jobs — copy it rather than invent one.

**Verification note:** a manual dispatch already passes today and therefore proves nothing. Only a
**scheduled** dispatch confirms the fix, which means this ticket needs one real overnight run to
close.

**Blocked by:** 03 — schedule and doctor.

**Status:** ready-for-agent

- [ ] A recipe exists for the benchmark, declaring the `script` envelope
- [ ] The expensive script runs outside the agent turn, with its stdout injected as context
- [ ] The agent's only job is to summarise; it does not run the benchmark itself
- [ ] The job never auto-applies routing changes — it only reports and recommends
- [ ] `hermes cron doctor` reports no issues after the change
- [ ] A **scheduled** dispatch lands `completed` — confirmed in run history, not by a manual run
- [ ] `orch doctor` no longer flags this job
