#!/usr/bin/env bash
# Install the course-assessment-design skill. Idempotent — safe to re-run after an upgrade.
#
# Skill-only, like cakrawala (docs/adr/0001-skills-reach-agents-by-symlink.md's scheme, applied
# here with no CLI to gate on): no CLI, no state, no test.mjs. It just links stubs/ into every
# present agent's skills directory. Kept as its own top-level tool directory rather than a
# second stubs/ under cakrawala/ because link-skills.sh links exactly one stubs/ per tool name
# (see link-skills.sh's own header) — a cross-reference in cakrawala/CONTEXT.md and
# CONTEXT-MAP.md documents that it shares the router's course.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"

# Hermes groups skills into category directories; the Hermes original lived under "teaching".
HERMES_CATEGORY="${HERMES_CATEGORY:-teaching}"

bash "$REPO_ROOT/link-skills.sh" course-assessment-design "$HERMES_CATEGORY"
exit 0
