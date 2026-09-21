#!/usr/bin/env bash
# Install thin per-agent pointers to this toolkit. Idempotent — safe to re-run after an
# upgrade. Only touches agents that are actually present on this machine.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER="## LinkedIn Jobs"

install_skill() {
  local dest_dir="$1" label="$2"
  mkdir -p "$dest_dir/linkedin-jobs"
  cp "$ROOT/stubs/SKILL.md" "$dest_dir/linkedin-jobs/SKILL.md"
  echo "✓ $label → $dest_dir/linkedin-jobs/SKILL.md"
}

append_agents_md() {
  local file="$1" label="$2"
  mkdir -p "$(dirname "$file")"
  if [ -f "$file" ] && grep -qF "$MARKER" "$file"; then
    echo "• $label already references the toolkit — left unchanged"
    return
  fi
  printf '\n' >> "$file"
  cat "$ROOT/stubs/AGENTS.md" >> "$file"
  echo "✓ $label → $file"
}

# Agents parse this frontmatter with different YAML strictness — Claude Code tolerates an
# unquoted `Triggers: "x"` inside the description, pi rejects it as a nested mapping. Fail
# here rather than shipping a stub that only breaks under one agent.
validate_frontmatter() {
  command -v python3 >/dev/null 2>&1 || { echo "• python3 absent — skipping frontmatter validation"; return 0; }
  python3 - "$ROOT/stubs/SKILL.md" <<'PY' || { echo "✗ stubs/SKILL.md frontmatter is not valid YAML — not installing."; exit 1; }
import sys
try:
    import yaml
except ImportError:
    sys.exit(0)
raw = open(sys.argv[1]).read()
parts = raw.split('---')
if len(parts) < 3:
    print('missing frontmatter delimiters'); sys.exit(1)
try:
    data = yaml.safe_load(parts[1])
except Exception as err:
    print(err); sys.exit(1)
if not isinstance(data, dict) or set(data) != {'name', 'description'}:
    print('expected exactly name and description, got %r' % (data,)); sys.exit(1)
if not all(isinstance(v, str) for v in data.values()):
    print('name and description must both be plain strings'); sys.exit(1)
PY
  echo "✓ frontmatter valid"
}

echo "Installing linkedin-jobs pointers from $ROOT"
validate_frontmatter

[ -d "$HOME/.claude" ] && install_skill "$HOME/.claude/skills" "claude code"
[ -d "$HOME/.pi/agent" ] && install_skill "$HOME/.pi/agent/skills" "pi"
[ -d "$HOME/.codex" ] && append_agents_md "$HOME/.codex/AGENTS.md" "codex"
[ -d "$HOME/.hermes" ] && append_agents_md "$HOME/.hermes/AGENTS.md" "hermes"

echo
echo "Not installed for agents that aren't present. Re-run this script after installing one."

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "! node was not found on PATH — li.mjs needs it (see docs/adr/0001)."
fi
