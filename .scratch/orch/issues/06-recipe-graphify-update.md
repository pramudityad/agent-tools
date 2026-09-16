# 06 — The knowledge graph stays current without being remembered

**What to build:** the owner's knowledge graph is rebuilt incrementally on a schedule. The rebuild
runs outside the agent turn, because it is exactly the kind of long job that an idle limit kills.

**Measure before scheduling.** This has never been run on this vault — there is no output directory
— and the vault carries a large adjacent semantic index. Duration and cost are unknown. The first
build is a measurement, run by hand; the schedule is then set from what was measured. Do not pick a
cron expression first.

**Blocked by:** 03 — schedule and doctor.

**Status:** done

- [x] A first full build is run by hand against the vault, and its duration recorded — 14.18 s cold, 11.32 s warm (see Comments)
- [x] The recorded duration is written into the ticket or the recipe as the basis for the schedule — recorded here and in the envelope script's header
- [x] A recipe exists for the incremental rebuild, declaring the `script` envelope — `orch/recipes/graphify-update.json` + `~/.hermes/scripts/vault-graphify-update.sh`
- [x] The schedule is derived from the measurement, not guessed — `0 23 * * *`, derived from the 11–14 s / 0-token measurement (see Comments)
- [x] The recipe's Verify confirms the output was refreshed, not merely that the command exited 0 — re-hashes `graph.json` against the last refresh marker + requires it fresh today; fails on stale/tampered/missing (negative test recorded)
- [x] If the first build proves too slow or costly to schedule at all, that finding is recorded and the schedule is skipped — N/A: the first build measured 14.18 s / 0 tokens, so this branch does not arise; a schedule was registered instead

## Comments

**2026-09-16** — Measured, built, scheduled.

**Measurement (the first full build, by hand).** No `graphify-out/` existed and graphify had never
been run here. The incremental rebuild is the head-less no-LLM pass: `graphify update "<vault>"`
re-extracts code **and markdown** files structurally (`.md` has an AST extractor), so it covers the
notes without an API key and without an agent turn. Cold-cache first build: **14.18 s wall clock**,
1116 files AST-extracted across 10 workers, writing `graphify-out/graph.json` (**25,030 nodes /
38,412 edges / 1,866 communities**, 26 MB) plus `GRAPH_REPORT.md` and `manifest.json`; `graph.html`
was skipped (>5000 nodes). Token cost **0 in / 0 out**. A second, no-change pass measured **11.32 s**
and reported *"No code-graph topology changes detected; outputs left untouched"* — on a quiet day
graphify does not even rewrite `graph.json`. The build is cheap and bounded, so the ticket's
skip-the-schedule branch never arises.

**Derived schedule — `0 23 * * *` (nightly, 23:00 WIB).** Derived from the measurement, not guessed:
an 11–14 s, zero-token, CPU-only pass puts no pressure to run less often than daily; the vault is
edited in batches through the day, so a nightly pass bounds graph staleness to <24 h and matches the
vault's other nightly maintenance; and 23:00 is the nearest free slot between the existing nightly
jobs at 22:20 (`vault-consolidate`) and 23:40 (`vault-reindex`). Ample headroom remains to raise the
frequency if the graph is consulted more often than daily.

**What was built.**
- `~/.hermes/scripts/vault-graphify-update.sh` (new) — the envelope's `--script`. Runs
  `graphify update "<vault>"` *outside* the turn and, on success, writes `graphify-out/refresh.json`
  (`refreshed_at`, `nodes`, `edges`, `graph_sha256`, `graphify`); its stdout is injected as context.
  The marker is the reason a script is needed at all: graphify leaves `graph.json` byte-identical on
  a no-change run, so its own exit code and mtime cannot prove *this* run refreshed anything.
- `~/.agent-tools/orch/recipes/graphify-update.json` (new) — one cheap remainder step
  (`graph-refreshed`, checks the marker exists) plus the Verify; the `schedule` block was written by
  `orch schedule`, never by hand.
- hermes job **`orch-graphify-update`**, id **`1ffea779d4a9`**, created by
  `orch schedule graphify-update '0 23 * * *' --envelope script --script vault-graphify-update.sh --workdir "/Users/flp9damarpramuditya/Documents/Obsidian Vault"`
  (`deliver: local` came from `~/.config/orch/config.json`).

**Verify, and the negative test.** The Verify re-hashes `graph.json` and requires the hash to equal
the one the last completed refresh recorded, requires ≥1 node, and requires `refreshed_at` to be
*today* (WIB). It is proven to fail, not pass regardless:
- run `61d58109-b601-4998-9257-d3494793b7e3`, fresh state → `✓ verify passed` (exit 0);
- marker backdated to 2026-09-15 → exit 1, `verify_failed`;
- `graph.json` tampered (one byte appended) → exit 1, `verify_failed`;
- marker removed → exit 1, `verify_failed`;
- state restored → `✓ verify passed` (exit 0) again.

**Readback.** `hermes cron list` shows `orch-graphify-update · 0 23 * * * · next 2026-09-16T23:00+07:00
· script vault-graphify-update.sh · workdir <vault>`; `orch status` lists it under SCHEDULED JOBS;
`hermes cron doctor` reports *"✓ Cron doctor found no issues"* (9 active jobs); `orch doctor` reports
0 findings; `node test.mjs` reports **160 passed**.

**Not done / fragile.** No scheduled dispatch was forced — ticket 06 asks only that the job reads
back, and a manual run cannot prove a scheduled envelope anyway (that proof is ticket 05's job).
The scheduled rebuild is the no-LLM `graphify update` path (code + markdown AST); the semantic
LLM extraction of papers/images still needs an agent turn and is deliberately not in the envelope.
`graphify update` writes a 26 MB `graph.json` (plus an AST cache) into the vault, and the vault's
`.gitignore` does not exclude `graphify-out/` — only the adjacent `.obsidian-semantic-index.json` is
excluded. obsidian-git's 15-min auto-commit **already picked it up** while this ticket was in
progress: commit `9c23ac7 "vault backup: 2026-09-16 19:04:11"`. No git command was run by this
ticket in either repo; the commit is obsidian-git's. Left as-is because the vault's ignore file is
outside this ticket's scope — the one-line fix the owner should apply is adding `graphify-out/` to
`~/Documents/Obsidian Vault/.gitignore`, otherwise every scheduled rebuild adds ~26 MB to the
vault's history.
