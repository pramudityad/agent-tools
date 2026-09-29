# Cakrawala harness — agent-agnostic

**Status:** ready-for-agent

## Problem Statement

The lecturer runs three Cakrawala courses (BI, WAD, SDLC) at two sesi a week with no prep week
between them, using four agents — Claude Code, Hermes, pi and Codex. The tools that do the work
(`rps-deck`, `rise-ops`, `orch`) are agent-agnostic CLIs, but the *skills* that tell an agent how
to use them are not: each agent holds its own stale copy, the umbrella that ties a whole sesi
together exists only in Hermes, and the most field-tested lessons live only in Hermes's copies.
Nothing shows the vault-side state of a course, so a missing naskah surfaces the night before
class. A naskah can pass `check` while claiming the 150-minute slot no course actually has, and
the `deck-build` recipe's check has never gone green.

## Solution

One source of truth per skill, reached by every agent through symlinks, so whatever agent the
lecturer opens reads the same instructions. A new `cakrawala` router tells any agent which tool
fits a whole-sesi or "what's next" request — the sesi flow (prep → run → close) and its on-ramps
(susulan, batch publish, UTS/UAS). `rps-deck status` shows each course's vault-side state beside
`rise-ops todo`. `check` refuses a naskah whose slot disagrees with the one slot table, or whose
sub-CPMK is not verbatim from the RPS contract; everything that needs judgement goes through a
portable naskah-review prompt before the lecturer approves.

## User Stories

1. As the lecturer, I want every agent to read the same skill text, so that switching from Hermes to Claude mid-week does not change how a sesi is run.
2. As the lecturer, I want an edit an agent makes to a skill to appear in `git diff`, so that I can review it instead of losing it in one agent's private copy.
3. As the lecturer, I want the tool installers to link skills rather than copy them, so that an upgrade cannot leave an agent on an old copy.
4. As the lecturer, I want Hermes treated as a consumer like the others, so that no skill has its only copy inside one agent.
5. As the lecturer, I want Hermes's field-tested lessons (the four-things-called-"the-deck" table, the RISE description-field pitfalls, the SDLC double-sesi notes) preserved in the source, so that the move loses nothing.
6. As the lecturer, I want each SKILL.md kept lean with lessons in references, so that an agent does not load 44 KB every time a skill fires.
7. As the lecturer, I want `course-assessment-design` available to every agent, so that UTS/UAS work is not Hermes-only.
8. As the lecturer, I want to say "siapkan sesi berikutnya BI" to any agent and have it route me through prep → run → close, so that I do not have to remember which tool does which step.
9. As the lecturer, I want a single-verb request ("brief kelas besok", "buat slide sesi 8") to go straight to the tool's own skill, so that the router never competes with it.
10. As the lecturer, I want the router to tell me when I am on an on-ramp (susulan Tugas, batch publish, UTS), so that I follow the right checklist for it.
11. As the lecturer, I want the router to state that nilai akhir is never written, so that no agent confuses a RISE tugas score with the SIAKAD record.
12. As the lecturer, I want one command listing every session note in a course with its naskah state (missing, draft, approved, stale), so that I see the gap before class, not during it.
13. As the lecturer, I want that listing to show whether Slides and Materi exist, so that I know which sesi still need building.
14. As the lecturer, I want the listing to name the next sesi with no approved naskah, so that I know what to author next without reading the whole table.
15. As the lecturer, I want the listing keyed by session note number, so that WAD's sesi-order drift is left to the reconcile step rather than guessed.
16. As the lecturer, I want `check` to refuse a naskah whose `slot-start`/`slot-minutes` disagree with the course's real slot, so that a 150-minute plan cannot pass.
17. As the lecturer, I want SDLC's two sesi per night checked against their own start times (odd sesi 18:30, even 20:00, 90 min each), so that a double-sesi night is not treated as one slot.
18. As the lecturer, I want the real slots held in one machine-readable place, with the date each was confirmed, so that there is never a second copy to drift.
19. As the lecturer, I want the vault's slot table replaced by a pointer to that place, so that the vault and the tool cannot disagree.
20. As the lecturer, I want `check` to refuse a sub-CPMK that is not verbatim from the RPS contract row, so that paraphrase never reaches students.
21. As the lecturer, I want a naskah-review checker prompt any agent can run, returning RED/AMBER findings, so that topic drift, pedagogy for the slot, assessment numbers and sanitisation calls get a second look.
22. As the lecturer, I want review capped at two rework rounds, so that it converges before class.
23. As the lecturer, I want approval to stay my manual act, so that no agent can approve its own naskah.
24. As the lecturer, I want the `deck-build` recipe's check to confirm an approved, built, rendered naskah instead of re-running build, so that `orch verify` can go green.
25. As the lecturer, I want Codex covered through the shared skills directory and marked unverified until I install it, so that support is honest about what has been proven.

## Implementation Decisions

- **Skill reach (ADR `docs/adr/0001`)** — each tool's `stubs/` is the only copy. A shared skill-linking script at the repo root links `~/.agents/skills/<tool>` to it, and links Claude's, pi's and Hermes's skill folders (Hermes under its category directory) to that. Codex reads `~/.agents/skills` directly. Every tool's `install.sh` calls the shared script instead of copying; the marker-guarded `AGENTS.md` append is unchanged. An existing non-symlink directory at a target is moved aside with a timestamped suffix, never deleted.
- **Merge before linking** — for `rps-deck` and `rise-ops`, the stub `SKILL.md` is the base (it carries newer commands such as `tugas review/grade`); each Hermes-only lesson moves into `stubs/references/<topic>.md` with a one-line pointer from SKILL.md; Hermes-only `references/`, `scripts/`, `templates/` move into `stubs/` as-is. The lecturer reviews the merge in `git diff` before any link replaces a Hermes copy.
- **`cakrawala` context** — skill only, no CLI, no state; a deliberate exception to the house shape noted in the context map. Holds two skills: the router (ported from Hermes `cakrawala-session-ops` plus its references, reshaped as sesi flow + on-ramps + out-of-scope) and `course-assessment-design` (moved from Hermes, same progressive-disclosure treatment). The router's description triggers only on whole-sesi and "what's next" requests and says it is not for a single `rise-ops`/`rps-deck` verb. It carries the naskah-review section.
- **`rps-deck status <course-dir>`** — read-only. One row per `Sesi NN - <topic>.md` session note: naskah `missing | draft | approved | stale` (stale = approval hash no longer matches, reusing the existing approval-state logic), Slides present, Materi present. Final line names the lowest-numbered sesi with no approved naskah. Exit 0 always; it reports, it does not judge.
- **Slot truth (ADR `rps-deck/0008`)** — a JSON file in `rps-deck`, keyed by the naskah's `course` frontmatter value; each course has `start`, `minutes`, `confirmed`, and SDLC has a per-parity start (odd 18:30, even 20:00). `check` fails with a line pointing at the disagreeing field when `slot-start` or `slot-minutes` differ; a course absent from the table fails with "ask the lecturer for the real slot" rather than passing.
- **Verbatim sub-CPMK** — when the naskah is checked against an RPS contract row, any quoted sub-CPMK must match the row's text exactly (whitespace-normalised). Mismatch is a `check` error.
- **naskah-review** — a checker prompt ("not finding problems is your failure") covering topic vs sesi-order drift, pedagogy fit for the slot, assessment numbers vs the approved RPS, and sanitisation calls `scan` cannot see. Output is RED/AMBER lists. RED blocks approval; at most two rework rounds; the lecturer runs `approve`.
- **`deck-build` recipe check** — replaced with a `rps-deck status`-based assertion that the given naskah is `approved` and has Slides and Materi.
- No stub may rely on a primitive only one agent has (subagent files, hooks, SendMessage, TaskCreate).

## Testing Decisions

- A good test drives the real CLI or script and asserts on its output or on the filesystem it leaves — never on internal functions.
- **rps-deck** — through the existing `run([...args])` helper in its `test.mjs`: `status` against a temp course directory with sesi in each state; `check` against a temp slot table (a 150-minute BI naskah fails, a correct one passes, SDLC odd/even starts, an unknown course fails); `check` with a paraphrased sub-CPMK fails.
- **Skill linking** — a small root-level `test.mjs` runs the shared script with `HOME` pointed at a temp directory holding fake `.claude`, `.pi`, `.hermes`, `.agents`, and asserts each link's target, idempotency on re-run, skipping of absent agents, and that a pre-existing real directory is moved aside, not deleted. A deviation from one-test-file-per-tool because the script belongs to no tool.
- **orch deck-build check** — no new test; verified by a real `orch run deck-build` then `orch verify` exiting 0 on an approved BI naskah.
- **Router and naskah-review** — no code seam; a fresh session of Claude, Hermes and pi given "siapkan sesi berikutnya BI" loads the `cakrawala` skill and runs `rps-deck status` + `rise-ops todo`. naskah-review flags RED on a copy of an approved naskah edited to 150 minutes.
- Prior art: `rps-deck/test.mjs`, `rise-ops/test.mjs`, `orch/test.mjs` (hermetic, zero-dep, `install.sh` refuses on failure).

## Out of Scope

- Writing nilai akhir (rise-ops ADR 0001). `tugas grade` is unaffected.
- Multi-agent teams, subagent definitions, hooks — nothing that only one agent can run.
- A teaching review/gate lane in `orch`; the naskah-review prompt plus manual `approve` is the gate.
- Hand-maintained progress files; state is derived.
- Verifying Codex end to end (not installed); it becomes a ticket on first install.
- Resolving which pertemuan a WAD sesi note maps to — that stays judgement in the naskah reconcile step.

## Further Notes

- References: walkinglabs/learn-harness-engineering (harness = instructions, state, verification, scope, lifecycle; only a run check is evidence) and revfactory/harness-100 (orchestrator + reviewer, two rework rounds) — shape borrowed, Claude-only mechanism not.
- `rps-deck` has uncommitted work and an untracked ADR 0007; commit or confirm it before any ticket touches `deck.mjs`.
- Hermes currently holds edits that exist nowhere else; the merge ticket must land before the linking ticket replaces any Hermes directory.
