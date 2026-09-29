# More `check` failures — beyond FORMAT.md's own gotcha list

`FORMAT.md`'s "Gotchas that fail check" covers the general rule: a line-leading ALL-CAPS
word that isn't a real marker fails the parse. These are the concrete cases that rule
produces in practice, plus their fixes.

- **A code-fence continuation line starting with an ALL-CAPS SQL keyword** (e.g. a `GROUP
  BY` wrapped onto its own line) fails as `unknown marker GROUP` — indentation does not save
  it, the parser strips leading whitespace before checking. Fix: keep the SQL on one line
  inside the scalar (`sql: SELECT … GROUP BY 1 HAVING …`), or lowercase the continuation.
- **Raw HTTP examples** (`GET /index.html HTTP/1.1`, `HTTP/1.1 200 OK`) fail the same way —
  a line-leading ALL-CAPS word inside a fence still trips it. Fix: indent every line in the
  fence 2 spaces and lowercase the method/status line; headers like `Host:` are safe as-is.
- **A bare `FLAG` or `CONTOH` at line start, not bolded, is not a field** — it stays inside
  `KONTEN` as prose and fails as an unknown marker. A marker only does anything as
  `**FLAG** …`; a plain `FLAG …` line is just text that happens to trip the same check.
- **`VEIL` inside a `FINE:`/prose line renders as the literal word "VEIL"**, not as a
  covered cell — the marker only does something as a table-cell segment
  (`| VEIL tidak | VEIL ya |`). For a predict-then-reveal that isn't a table, put the intent
  in `VISUAL` instead of reaching for the marker.
- **Check the working tree before authoring.** `ls -R <course>/artifacts`, `git status
  --short` and the course's defect register, run once before `restamp`/`check` — an
  unstaged edit or a stale draft map file from a previous attempt is easy to mistake for the
  current state and wastes a `restamp` cycle finding out.
