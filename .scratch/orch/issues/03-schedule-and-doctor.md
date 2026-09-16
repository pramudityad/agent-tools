# 03 — Make the scheduling defect impossible to express, and find it where it already exists

**What to build:** the owner can put a recipe on a schedule, and cannot create the mistake that has
broken the benchmark job every morning since 2026-09-13 — expensive work placed inside an agent
turn, where an idle limit kills it. Attempting it is refused. A separate check audits jobs that
already exist, including ones predating this tool.

Three envelopes: `script` runs the expensive work outside the agent turn and injects its stdout;
`monitor` gates on byte-stable output so an unchanged result suppresses the run entirely; `agent` is
a plain turn. The healthy `vault-health` and `vault-consolidate` jobs are the reference shapes.

**Blocked by:** 02 — config model.

**Status:** ready-for-agent

- [ ] `orch schedule <recipe> <cron> --envelope script|monitor|agent` registers a scheduled job
- [ ] `cronArgs(recipe)` returns the argv for the scheduler; asserted in tests without invoking it
- [ ] Each envelope maps to the correct scheduler flags
- [ ] `envelope: "agent"` together with a `script` field is refused as `envelope_mismatch`
- [ ] The refusal happens at validation time, before any job is created
- [ ] `envelopeFindings(jobs)` takes parsed scheduler jobs as data and returns findings
- [ ] `orch doctor` reports the known-bad benchmark job as a finding
- [ ] `orch doctor` probes each harness v1 depends on and reports an unreachable one as `layer_down`
- [ ] `orch doctor` distinguishes a broken layer from a broken recipe in its output
- [ ] ADR 0004 records that the envelope mismatch is unrepresentable by construction
