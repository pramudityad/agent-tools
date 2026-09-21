## sin-think toolkit
`~/.agent-tools/sin-think/` — design pipeline: PROBLEM -> annotated call Graph
(A/E/R per node) -> code that IS the Graph. Read `CONTEXT.md` before first use;
its terms are load-bearing (`X`, `Graph`, `Node`, `A`, `E`, `R`, `Cardinality`,
`Boundary`, `Schema`, `Pipe`, `Gen body`, `Scope`, `Layer Scoping`, `Divergent
Strategy`, `Test Layer`, `Verdict`). Use them exactly; correct the user when they
use an `_Avoid_` term (e.g. `exception`, `crash`, `spec`).
```bash
node ~/.agent-tools/sin-think/sin-think.mjs new "<title>"   # scaffold a Design Doc
node ~/.agent-tools/sin-think/sin-think.mjs check <file>    # gate: lint before code
node ~/.agent-tools/sin-think/sin-think.mjs nodes <file>    # extracted graph nodes
```
Phases: DESIGN.md (problem -> doc), REVIEW.md (doc + code -> verdict). The gen body
is A only; error handling lives in the pipe. If the code doesn't match the Graph,
the implementation is wrong — or the doc is stale; REVIEW.md decides which.
