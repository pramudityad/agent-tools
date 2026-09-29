#!/usr/bin/env bash
# Shared skill linker (see docs/adr/0001-skills-reach-agents-by-symlink.md).
#
# One tool's stubs/ is the only copy of its skill. This script links `~/.agents/skills/<tool>`
# and every present agent's own skill folder (Claude, pi, Hermes under its category dir)
# straight to that tool's `<tool>/stubs/` — not through `~/.agents/skills/<tool>` as an extra
# hop, so a plain `readlink` on any one of them shows `<tool>/stubs` directly, and every link
# still resolves to the same real path either way. Codex reads `~/.agents/skills` directly, so
# it needs no separate step.
#
# Usage: link-skills.sh <tool> <hermes-category>
#
# Idempotent — re-running leaves a correct link alone. A pre-existing REAL directory at a
# target (e.g. an old copy-installed skill) is moved aside with a timestamped suffix, never
# deleted, so a human can look at what was there before it's gone for good. An agent whose
# root directory is absent on this machine (no ~/.pi, say) is skipped with a message.
set -euo pipefail

TOOL="${1:?usage: link-skills.sh <tool> <hermes-category>}"
HERMES_CATEGORY="${2:?usage: link-skills.sh <tool> <hermes-category>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUBS="$ROOT/$TOOL/stubs"

[ -d "$STUBS" ] || { echo "✗ $TOOL/stubs not found at $STUBS" >&2; exit 1; }

# $1 the path that should become a symlink to $STUBS, $2 a label for output
link_to_stubs() {
  local target="$1" label="$2"
  if [ -L "$target" ]; then
    if [ "$(readlink "$target")" = "$STUBS" ]; then
      echo "• $label already linked — unchanged"
      return
    fi
    rm "$target"
  elif [ -e "$target" ]; then
    local backup="${target}.bak-$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$target" "$backup"
    echo "• $label — existing directory moved aside to ${backup/#$HOME/~}"
  fi
  mkdir -p "$(dirname "$target")"
  ln -s "$STUBS" "$target"
  echo "✓ $label → ${target/#$HOME/~}"
}

# $1 the agent root that must exist, $2 the skills dir to link into, $3 a label
link_agent() {
  local guard="$1" dest_dir="$2" label="$3"
  [ -d "$guard" ] || { echo "• $label not present — skipped"; return; }
  link_to_stubs "$dest_dir/$TOOL" "$label"
}

mkdir -p "$HOME/.agents/skills"
link_to_stubs "$HOME/.agents/skills/$TOOL"                        "shared hub ($TOOL)"
link_agent    "$HOME/.claude" "$HOME/.claude/skills"               "claude code ($TOOL)"
link_agent    "$HOME/.pi"     "$HOME/.pi/agent/skills"             "pi ($TOOL)"
link_agent    "$HOME/.hermes" "$HOME/.hermes/skills/$HERMES_CATEGORY" "hermes ($TOOL)"
