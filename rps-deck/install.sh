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
  # The agent directory existing is the signal; its AGENTS.md may not exist yet.
  mkdir -p "$(dirname "$file")"
  touch "$file"
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

[ -d "$HOME/.claude" ]     && install_skill    "$HOME/.claude/skills"    "claude code"
[ -d "$HOME/.pi/agent" ]  && install_skill    "$HOME/.pi/agent/skills" "pi"
[ -d "$HOME/.claude" ]    && append_agents_md "$HOME/.claude/AGENTS.md" "claude AGENTS.md"
[ -d "$HOME/.codex" ]     && append_agents_md "$HOME/.codex/AGENTS.md"  "codex"
[ -d "$HOME/.hermes" ]    && append_agents_md "$HOME/.hermes/AGENTS.md" "hermes"
exit 0
