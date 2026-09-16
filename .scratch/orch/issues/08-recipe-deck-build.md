# 08 — A session deck is built from the reviewed spec in one command

**What to build:** the owner runs one command and a session's instructor and student decks are
produced from a spec they have reviewed — scan, then naskah, then render — instead of driving each
stage by hand.

Approval is the gate. A naskah that has not been approved must not reach publication, and the
downstream tool already enforces that; this recipe's check is that approval actually happened.

Read `rps-deck/CONTEXT.md` plus its format and sanitising notes before starting. `rps-deck` and
`rise-ops` are siblings: this builds the sesi that 07 then runs.

**Blocked by:** 01 — scaffold and runner.

**Status:** ready-for-agent

- [ ] A recipe exists covering scan → naskah → render
- [ ] Instructor and student outputs are produced separately
- [ ] The recipe's Verify confirms the naskah reached approved status
- [ ] An unapproved naskah fails the check, and publication is not attempted
- [ ] Whatever the session projects is sanitised before rendering, per the tool's own rules
- [ ] The recipe calls the tool's CLI; it does not reimplement or wrap its subcommands
