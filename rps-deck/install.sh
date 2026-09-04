#!/usr/bin/env bash
# Install thin per-agent pointers to this toolkit. Idempotent — safe to re-run after an
# upgrade. Only touches agents that are actually present on this machine.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER="## rps-deck"

# Hermes groups skills into category directories; Claude and pi keep them flat.
HERMES_CATEGORY="${HERMES_CATEGORY:-teaching}"

# $1 the agent root that must exist, $2 the skills dir to write into, $3 a label
install_skill() {
  local guard="$1" dest_dir="$2" label="$3"
  [ -d "$guard" ] || { echo "• $label not present — skipped"; return; }
  mkdir -p "$dest_dir/rps-deck"
  cp "$ROOT/stubs/SKILL.md" "$dest_dir/rps-deck/SKILL.md"
  echo "✓ $label → ${dest_dir/#$HOME/~}/rps-deck/SKILL.md"
}

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

install_skill    "$HOME/.claude"  "$HOME/.claude/skills"                      "claude code"
install_skill    "$HOME/.pi"      "$HOME/.pi/agent/skills"                    "pi"
install_skill    "$HOME/.hermes"  "$HOME/.hermes/skills/$HERMES_CATEGORY"     "hermes"
append_agents_md "$HOME/.claude"  "$HOME/.claude/AGENTS.md"                   "claude AGENTS.md"
append_agents_md "$HOME/.codex"   "$HOME/.codex/AGENTS.md"                    "codex"
append_agents_md "$HOME/.hermes"  "$HOME/.hermes/AGENTS.md"                   "hermes AGENTS.md"
exit 0
