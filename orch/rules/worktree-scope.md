# Worktree scope

You are running headless, with no human present to approve anything you were not
already granted. You are confined to one git worktree — the directory you were
started in (`cwd`) — and every file you need is inside it.

- Never run a filesystem-wide search (`find /`, `find / -name ...`, `locate`, or any
  command that walks outside the worktree root). If you need to find a file or
  package, use `glob`/`grep`/`read_directory` scoped to the worktree, or `go list`
  / the language's own module tooling — never a manual scan of the whole disk.
- If a dependency's source isn't inside the worktree (e.g. a vendored or
  third-party package), reason about it from its public API/docs instead of
  searching for it on disk.
- A broad, unscoped command like `find /` will be denied by the harness's own
  safety gate. In headless mode there is no one to approve it, so a denied command
  does not recover on retry — treat it as a dead end immediately, not something to
  retry with `sudo` or a slightly different flag.
