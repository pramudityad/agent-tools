# 05 — cakrawala router skill

**What to build:** the `cakrawala` context's router skill, ported from Hermes `cakrawala-session-ops` and its references and reshaped in the ask-matt form: the sesi flow (prep → run → close, naming the `rps-deck`/`rise-ops` verb at each step), the on-ramps (susulan Tugas, batch publish, UTS/UAS → `course-assessment-design`), and an out-of-scope line (never nilai akhir). Its description triggers only on whole-sesi and "what's next" requests and says it is not for a single `rise-ops`/`rps-deck` verb. Slot facts are not restated — it points at the slot table. Linked to every agent, replacing the Hermes-only copy.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Uses the `cakrawala/CONTEXT.md` terms (sesi flow, on-ramp) and the vault glossary; no avoided terms
- [ ] No primitive only one agent has
- [ ] Every agent's `cakrawala` skill resolves to `cakrawala/stubs`; Hermes's `cakrawala-session-ops` is moved aside
- [ ] Both Hermes references survive as router references
