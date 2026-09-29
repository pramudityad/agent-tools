# Skills reach every agent by symlink, not by copy

Each tool's `stubs/` is the only copy of its skill. `~/.agents/skills/<tool>` symlinks to it, and
Claude, pi and Hermes link to that; Codex reads `~/.agents/skills` directly. We replaced
copy-on-install because copies drifted silently (rise-ops, rps-deck and orch were all behind their
stubs) and Hermes's in-place edits were lost in a copy nobody reviewed.

## Consequences

An agent that rewrites a skill now edits the source. The guard is `git diff` in this repo, not an
installed copy — review agent edits there before committing.
