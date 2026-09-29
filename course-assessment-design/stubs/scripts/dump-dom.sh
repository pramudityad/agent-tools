#!/usr/bin/env bash
# dump-dom.sh — print the DOM of a local HTML file *after* its scripts have run.
#
# Usage:
#   scripts/dump-dom.sh <file.html> [virtual-time-ms] [element-id]
#
#   virtual-time-ms   how long to let timers/promises run before dumping (default 6000)
#   element-id        optional: print only that element's contents instead of the whole DOM
#
# Why this exists: to prove an interactive teaching artifact (a Vue/JS bug demo, a deck) behaves as
# advertised BEFORE it is published to students. A bug demo that no longer fires teaches the wrong
# lesson.
#
# How to use it for an interaction you cannot perform from a shell: copy the artifact to a temp file,
# append a harness <script> that drives the interaction (click(), set .value, dispatchEvent), then
# write the findings into <pre id="RESULT"> and read them back:
#
#   scripts/dump-dom.sh /tmp/_selftest.html 6000 RESULT
#
# Harness outline (works because --virtual-time-budget advances timers before the dump):
#
#   <pre id="RESULT">PENDING</pre>
#   <script>
#   const out = []
#   const step = fn => new Promise(r => setTimeout(() => { fn(); r() }, 60))
#   ;(async () => {
#     document.querySelectorAll('.modebar button')[1].click()   // drive the UI
#     await step(() => {})
#     document.querySelectorAll('.row')[1].querySelector('input[type=checkbox]').click()
#     document.querySelector('input[type=search]').value = 'kopi'
#     document.querySelector('input[type=search]').dispatchEvent(new Event('input', { bubbles: true }))
#     await step(() => {})
#     out.push([...document.querySelectorAll('.row')].map(r => r.textContent).join(' | '))
#     document.getElementById('RESULT').textContent = out.join('\n')
#   })()
#   </script>
#
# Notes / limits:
#  - Uses the Chromium that playwright already cached. A CDN <script> needs network; for a hermetic
#    check, curl the library once (curl -sL https://unpkg.com/vue@3/dist/vue.global.prod.js) into the
#    temp dir and rewrite the src to the local file — that also proves the demo runs offline-ish.
#  - If the artifact reads state the browser would normally collect (clicks, typing), set it with a
#    real .click() / set .value + dispatchEvent, not by assigning Vue's internal state — the point is
#    to exercise the DOM path the user follows.
#  - element-id extraction is regex-based, not a real HTML parser. Fine for a <pre id="RESULT">.

set -euo pipefail

file="${1:?usage: dump-dom.sh <file.html> [virtual-time-ms] [element-id]}"
budget="${2:-6000}"
sel="${3:-}"

[ -f "$file" ] || { echo "no such file: $file" >&2; exit 2; }
abs="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"

bin=""
for root in "$HOME/Library/Caches/ms-playwright" "$HOME/.cache/ms-playwright"; do
  [ -d "$root" ] || continue
  cand="$(find "$root" -type f -name 'chrome-headless-shell' 2>/dev/null | tail -1 || true)"
  [ -z "$cand" ] && cand="$(find "$root" -type f -name 'headless_shell' 2>/dev/null | tail -1 || true)"
  if [ -n "$cand" ]; then bin="$cand"; break; fi
done

if [ -z "$bin" ]; then
  echo "no headless Chromium found in the playwright cache." >&2
  echo "  npx playwright install chromium   # then re-run" >&2
  exit 3
fi

if [ -n "$sel" ]; then
  "$bin" --headless --disable-gpu --no-sandbox --virtual-time-budget="$budget" \
    --dump-dom "file://$abs" 2>/dev/null | python3 -c "
import re, sys, html
sel = sys.argv[1]
d = sys.stdin.read()
m = re.search(r'<[a-zA-Z]+[^>]*\\bid="' + re.escape(sel) + r'"[^>]*>(.*?)</[a-zA-Z]+>', d, re.S)
print(html.unescape(m.group(1)) if m else 'element #' + sel + ' not found in dumped DOM', end='')
" "$sel"
else
  "$bin" --headless --disable-gpu --no-sandbox --virtual-time-budget="$budget" \
    --dump-dom "file://$abs" 2>/dev/null
fi
