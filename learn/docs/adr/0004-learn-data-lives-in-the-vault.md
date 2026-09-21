# Learner data lives in the vault, not beside the code

The toolkit's stores live at `<vault>/.learn/` — `registry.jsonl`,
`observations.jsonl`, `sessions/`, `transcripts/`, `policy.json` — resolved in order by
`--home`, then `$LEARN_HOME`, then the path recorded by `init --vault`. Nothing lives
beside the code in `~/.agent-tools/learn/`.

`~/.agent-tools` has no git remote (verified); the vault has one and auto-commits. Data
placed beside the code would have no backup story and no cross-device story. Data inside
the vault inherits both from the vault's existing remote and sync. `.pi/` sets the
precedent: a committed dot-folder that Obsidian ignores — hidden from explorer, graph, and
search, so the vault stays a human artifact, but fully present to git.

Code and data also have different lifetimes. Code is versioned, shared across toolkits,
and replaced wholesale; learner data is personal, append-only (ADR 0001), and must survive
code rewrites without a migration. Co-locating them would couple the two.

Within the vault, the format is JSONL — one record per line, never a JSON array — because
line appends conflict by union and resolve mechanically, while an array rewrites the whole
file on every append so two devices conflict on the same lines. SQLite is unmergeable
binary and the worst possible artifact to place in a git-synced folder.

Durability is two-tiered on purpose: Observations are small, precious, and committed;
transcripts are bulky, useful only for re-reading and crash-resume, and stay local
(gitignored). Every verbatim thing that must survive — the item, the learner's answer, the
judgement — lives in an Observation, not in the prose.

## Consequences

The core never writes outside `.learn/` (a stated non-goal in `CONTRACT.md`) — lesson
notes are the agent's job through the vault's own folder map. Vault resolution is ordered
and its failure mode is explicit: failing all three knobs exits `1` with
`not_configured`. Moving or renaming the vault breaks the recorded path, but `--home` and
`$LEARN_HOME` are the recovery knobs. Losing a transcript costs replay ability and nothing
else.
