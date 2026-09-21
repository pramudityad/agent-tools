# sin-think Contract

Exact shapes. If behavior disagrees with this file, this file is right — fix the code.

## CLI

```bash
node ~/.agent-tools/sin-think/sin-think.mjs new "<title>" [--dir <dir>] [--date YYYY-MM-DD]
node ~/.agent-tools/sin-think/sin-think.mjs check <file>
node ~/.agent-tools/sin-think/sin-think.mjs nodes <file>
node ~/.agent-tools/sin-think/sin-think.mjs --help
```

- Output is JSON by default; `--summary` prints human-readable text instead.
- Exit codes: `0` success / check passed · `1` check failed · `2` usage error (bad
  args, file missing, output already exists).

### new

Creates `<dir>/<date>-<slug>.md` from `TEMPLATE.md` (sibling of the script).
- `--dir` default: `docs/design` (created if absent, relative to cwd).
- `--date` default: today, local time.
- slug: title lowercased, non-alphanumeric runs collapse to `-`, edges trimmed.
- Refuses to overwrite an existing file (exit 2). The created file is a draft —
  it must NOT pass `check` until a human or agent has filled every section.

### nodes

Prints the node list extracted from the doc's Graph section. Debugging aid for
`check`; same extraction code path.

### check

Structural lint of a Design Doc. Failures are printed as a list; exit 1 if any.

1. **Sections.** Every required heading exists and has at least one non-empty,
   non-comment line (HTML comments `<!-- ... -->` are guidance, not content):
   `Problem`, `Shapes`, `Graph`, `Cardinality`, `Breaks`, `Needs`, `Boundaries`,
   `Pipe`, `Lifecycle`, `Layer Scoping`, `Verification`.
   Headings are matched leniently: `## 2. Graph (A)` matches `Graph`.
   `## Divergent Strategies` is optional and unchecked.
2. **Graph has edges.** The Graph section contains at least one `->` or `→`.
3. **Node coverage.** Every node appearing in the Graph is named in each of
   Cardinality, Breaks, and Needs. One failure per missing (node, section) pair.

Node extraction: from lines in the Graph section containing `->` or `→`, split on
the arrow; from each side take the first identifier (`[A-Za-z_][A-Za-z0-9_]*`).
`F1(A)` → `F1`, `validate(input)` → `validate`. Annotation-only tokens such as a
bare `E=SqlError` yield no identifier and are ignored.

## Design Doc layout

Produced by `new`, consumed by `check`. See `TEMPLATE.md` — it is the canonical
layout; the heading names above are load-bearing.

Status line directly under the H1: `Status: draft | designed | implemented | verified`.
`check` does not gate on Status; REVIEW.md defines when each value is honest.

## What check does NOT do

- It cannot judge whether the annotations are *good* — only that they exist and
  cover the graph. Judgement is the agent's job in DESIGN.md / REVIEW.md.
- It never reads source code. Code-vs-graph comparison is REVIEW.md, done by the
  agent, verdict recorded in the doc or PR.
