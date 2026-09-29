#!/usr/bin/env bash
# Install the cakrawala router skill. Idempotent — safe to re-run after an upgrade.
#
# cakrawala is skill-only by design (docs/adr/0001-skills-reach-agents-by-symlink.md's
# scheme, applied here with no CLI to gate on): no CLI, no state, no test.mjs. It just links
# stubs/ into every present agent's skills directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"

# Hermes groups skills into category directories; the Hermes original lived under "teaching".
HERMES_CATEGORY="${HERMES_CATEGORY:-teaching}"

bash "$REPO_ROOT/link-skills.sh" cakrawala "$HERMES_CATEGORY"
exit 0
