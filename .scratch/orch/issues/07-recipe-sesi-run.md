# 07 — A whole teaching session runs and is recorded in one command

**What to build:** the owner runs one command and a sesi is taken through the portal end to end —
the pre-class briefing, attendance from the roll source, the berita acara built from the approved
naskah, and the session closed. Today that is four separate invocations the owner has to remember
the order of.

The recipe is a **linear** sequence with no dependency machinery, because the underlying tool
already guards its own preconditions: it refuses to publish against an unapproved naskah, and
refuses to write attendance with no roll source. The guard belongs next to the thing it protects.

Read `rise-ops/CONTEXT.md` and the Cakrawala vocabulary it points to before starting — the terms are
load-bearing and each `_Avoid_` list is binding. This recipe must never touch the academic-record
system.

**Blocked by:** 01 — scaffold and runner.

**Status:** ready-for-agent

- [ ] A recipe exists covering briefing → attendance from the roll source → berita acara → session close
- [ ] Steps are linear; orch adds no ordering logic of its own
- [ ] The recipe's Verify confirms the sesi is closed, by asking the tool what is still open
- [ ] Running against a sesi whose naskah is not approved fails at the publish step, from the tool's own guard
- [ ] Running with no roll source fails at the attendance step, from the tool's own guard
- [ ] Exercised against an already-closed sesi, so the Verify passes on current state and nothing new is written to the portal
- [ ] The recipe never invokes the academic-record system
