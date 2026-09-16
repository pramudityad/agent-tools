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

**Status:** done

- [x] A recipe exists covering briefing → attendance from the roll source → berita acara → session close
- [x] Steps are linear; orch adds no ordering logic of its own
- [x] The recipe's Verify confirms the sesi is closed, by asking the tool what is still open
- [x] Running against a sesi whose naskah is not approved fails at the publish step, from the tool's own guard
- [x] Running with no roll source fails at the attendance step, from the tool's own guard
- [ ] Exercised against an already-closed sesi, so the Verify passes on current state and nothing new is written to the portal
- [x] The recipe never invokes the academic-record system

The final box is **not** closed: `rise-ops auth` reports `auth_expired`, so no command reaches RISE
and the recipe cannot be exercised end to end. Everything reachable without RISE is verified
below; the live exercise is blocked on the owner refreshing the cookie.

## Comments

**2026-09-16** — `~/.agent-tools/orch/recipes/sesi-run.json` written; no other file in scope was touched.

**The recipe.** Four linear steps, each a literal `rise-ops` argv — orch adds no ordering of its own, and
the two preconditions the ticket cares about are guarded by rise-ops itself, next to what they protect:

| Step id | argv |
| :--- | :--- |
| `brief` | `rise-ops brief {1} --sesi {2}` |
| `attendance` | `rise-ops attendance zoom {1} {2} {3}` |
| `berita-acara` | `rise-ops acara {1} {2}` |
| `session-close` | `rise-ops session end {1} {2}` |
| **Verify** | `rise-ops todo` |

Positional idiom (the recipe declares no `schedule`, so `{n}` is legal): `orch run sesi-run <class> <sesi> <roll-source.csv>`.
`{3}` is the **roll source** — a Zoom usage export, per `rise-ops/CONTEXT.md` and the README's own sequence
(`brief → attendance zoom → acara → session end`). I used `rise-ops`' vocabulary throughout: **sesi**, **roll
source**, **berita acara**, **RISE** (never "portal" as a synonym, never "SIAKAD"). `acara` is left without
`--end` so that "berita acara" and "session close" stay the two distinct steps the ticket names.

**Why the Verify asks the tool.** `verify.command` is `["rise-ops", "todo"]`, not a hand-rolled file check:
`todo` is rise-ops' own answer to "what is still open across all classes", so the check reads the same live
state the operator does and cannot drift from RISE. orch runs it unchanged via `orch verify <run-id>`.

**Evidence (real commands, real output).**
- Recipe loads and plans (pure `loadRecipe`/`planSteps`): `brief -> attendance -> berita-acara -> session-close`,
  verify `["rise-ops","todo"]`; plan for `[BI, 3, participants.csv]` is exactly the four argv above.
- No `schedule` field → not scheduled, `{n}` positions legal. No `siakad`/`academic`/`grade` token in the file.
- **Unapproved naskah → tool's own guard** (SDLC sesi 3's Naskah is `status: draft`):
  `rise-ops acara SDLC 3` → `{"error":"Naskah status is \"draft\", expected \"approved\"","code":"unapproved_naskah"}`.
  The recipe's `berita-acara` step plans that exact command `["rise-ops","acara","SDLC","3"]`. The refusal comes
  from `buildAcara`, which runs *before* any HTTP call.
- **No roll source → tool's own guard** (`rise-ops attendance zoom`): with no CSV,
  `{"error":"usage: rise-ops attendance zoom <class> <sesi> <participants.csv>","code":"bad_input"}`; with a
  missing path, `{"error":"no such file: …","code":"bad_input"}`. The named `no_roll` guard ("no Zoom row
  matched the roster") sits *behind* the RISE read, so it is unreachable while auth is expired — proven
  hermetically at its boundary: `parseZoomCsv(header-only csv) → []`, `matchZoom([], roster)` leaves `updates`
  empty, which is exactly the branch that raises `no_roll` (`ops.mjs:797`).
- End to end: `orch run sesi-run BI 3 /tmp/participants.csv` → `{"code":"step_failed", …}`; the audit log shows
  only `{"step":"brief","cmd":["rise-ops","brief","BI","--sesi","3"],"exit":1}` — the run stops at the first
  failure and later steps never run. `orch verify <run-id>` → `{"code":"verify_failed", …}` because `todo`
  itself cannot reach RISE.
- `cd ~/.agent-tools/orch && node test.mjs` → **160 passed**.

**RISE reachability / what is blocked.** RISE is reachable on the network — `rise-ops auth` returns
`{"code":"auth_expired"}`, i.e. the API answered HTTP 401 — but the `cakrawala_session_siakad` cookie is expired,
so *every* rise-ops command short-circuits at auth. That blocks the one remaining box: exercising the recipe
against an already-closed sesi (BI 1–3 / SDLC 1–2 / WAD 1–3 are `SELESAI` in the cache) so `orch verify` passes
on current state. No write to RISE was attempted. Per the ticket's live-system care, the offline evidence above
was gathered by running the *real* pre-network guard code paths against a fresh copy of the 12h cache in a
throwaway sandbox `HOME`; the expired cookie was not bypassed and SIAKAD was never touched.

**Fragility worth recording.** `rise-ops todo` exits `0` whenever RISE answers — it exits non-zero only
when RISE can't be reached at all (auth/cache failure). So as an exit-code-only Verify it confirms "the
tool answered and, in its own listing, nothing is open" rather than isolating *this* sesi; a check that fails
on a specific still-open sesi would need a shell pipeline (forbidden — commands are argv arrays) or a new
`rise-ops todo <class> <sesi>` flag. I implemented the tool's own answer as instructed rather than inventing a
hand-rolled check. Separately, because the roll source is a positional `{3}`, "no roll source" is expressed by
passing an empty/absent roll source, not by omitting the argument — omitting it is refused by orch at plan time
(`bad_input`), before the attendance step.
