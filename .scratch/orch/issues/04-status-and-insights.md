# 04 — One command answers "what is in flight, and what is it costing"

**What to build:** the owner runs one command and sees open runs alongside scheduled jobs, instead
of checking two tools. Adding a flag also shows what the layer is costing to operate.

Operating cost is read from the existing insights facility rather than computed here.

**Blocked by:** 01 — scaffold and runner.

**Status:** ready-for-agent

- [ ] `orch status` lists open runs from the audit log
- [ ] `orch status` lists scheduled jobs beside them
- [ ] `orch status --insights` shows token burn and cost
- [ ] Insights come from the existing facility; orch does not compute its own metrics
- [ ] `orch status` is read-only and mutates nothing
- [ ] A failing or slow underlying tool degrades the output gracefully rather than failing the command
- [ ] Numeric columns align — digits are tabular
