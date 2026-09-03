#!/usr/bin/env bash
# Install thin per-agent pointers to this toolkit. Idempotent — safe to re-run after an
# upgrade. Only touches agents that are actually present on this machine.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER="## rps-deck"

install_skill() {
  local dest_dir="$1" label="$2"
  [ -d "$dest_dir" ] || { echo "• $label not present — skipped"; return; }
  mkdir -p "$dest_dir/rps-deck"
  cp "$ROOT/stubs/SKILL.md" "$dest_dir/rps-deck/SKILL.md"
  echo "✓ $label → $dest_dir/rps-deck/SKILL.md"
}

append_agents_md() {
  local file="$1" label="$2"
  [ -f "$file" ] || { echo "• $label not present — skipped"; return; }
  if grep -qF "$MARKER" "$file"; then
    echo "• $label already references the toolkit — left unchanged"
    return
  fi
  printf '\n' >> "$file"
  cat "$ROOT/stubs/AGENTS.md" >> "$file"
  echo "✓ $label → $file"
}

node "$ROOT/test.mjs" > /dev/null || { echo "✗ tests fail — refusing to install"; exit 1; }
echo "✓ tests pass"

install_skill "$HOME/.claude/skills" "Claude Code"
append_agents_md "$HOME/.claude/AGENTS.md" "Claude AGENTS.md"
