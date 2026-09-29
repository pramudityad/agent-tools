#!/usr/bin/env bash
# Install thin per-agent pointers to this toolkit. Idempotent — safe to re-run after an
# upgrade. Only touches agents that are actually present on this machine.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
MARKER="## orch"

# Hermes groups skills into category directories; Claude and pi keep them flat. orch spans
# harness maintenance and teaching, so it sits under "ops" rather than either alone.
HERMES_CATEGORY="${HERMES_CATEGORY:-ops}"

append_agents_md() {
  local guard="$1" file="$2" label="$3"
  [ -d "$guard" ] || { echo "• $label not present — skipped"; return; }
  # The agent directory existing is the signal; its AGENTS.md may not exist yet.
  mkdir -p "$(dirname "$file")"
  touch "$file"
  if grep -qF "$MARKER" "$file"; then
    echo "• $label already references the toolkit — left unchanged"
    return
  fi
  printf '\n' >> "$file"
  cat "$ROOT/stubs/AGENTS.md" >> "$file"
  echo "✓ $label → ${file/#$HOME/~}"
}

node "$ROOT/test.mjs" > /dev/null || { echo "✗ tests fail — refusing to install"; exit 1; }
echo "✓ tests pass"

# The CLI is only useful on PATH; the skills call it by bare name.
mkdir -p "$HOME/.local/bin"
ln -sf "$ROOT/orch.mjs" "$HOME/.local/bin/orch"
chmod +x "$ROOT/orch.mjs"
echo "✓ orch → ~/.local/bin/orch"

# Symlinks the skill into ~/.agents/skills/orch and every present agent's own skills dir —
# see docs/adr/0001 and ../link-skills.sh's own header for the scheme.
bash "$REPO_ROOT/link-skills.sh" orch "$HERMES_CATEGORY"

append_agents_md "$HOME/.claude"  "$HOME/.claude/AGENTS.md"                   "claude AGENTS.md"
append_agents_md "$HOME/.codex"   "$HOME/.codex/AGENTS.md"                    "codex"
append_agents_md "$HOME/.hermes"  "$HOME/.hermes/AGENTS.md"                   "hermes AGENTS.md"
exit 0
