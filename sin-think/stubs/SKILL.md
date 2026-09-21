---
name: sin-think
description: >
  MUST USE when the user wants to design a non-trivial feature, service, or
  flow before writing code — the design pipeline that turns a problem into an
  annotated call graph (A = what flows, E = where it breaks, R = what nodes
  need) and gates code on it. Also use to review code against an existing
  Design Doc, to audit design drift, or when the user mentions Effect-TS
  design, Effect.gen discipline, layer error scoping, tagged errors, or asks
  whether code matches its design. Triggered by phrases such as design this,
  think through the design, draw the call graph, sin-think, or does this code
  match the design. NOT for: one-line bug fixes, trivial CRUD, exploratory
  spikes the user explicitly wants un-designed, or domains with no data flow
  (pure config, static content).
---
# sin-think
An agent-agnostic toolkit living at `~/.agent-tools/sin-think/`. Everything below is in
that directory — read the files, do not guess at their contents.
**Always read `~/.agent-tools/sin-think/CONTEXT.md` first.** It is the glossary and its
terms are load-bearing: `X`, `Graph`, `Node`, `Shape`, `Record`, `ID`, `Variant`,
`Error`, `A`, `E`, `R`, `Cardinality`, `Retry`, `Escape`, `Propagate`, `Die`,
`Boundary`, `Schema`, `Pipe`, `Gen body`, `Scope`, `Layer`, `Layer Scoping`,
`Divergent Strategy`, `Test Layer`, `Design Doc`, `Verdict`. The `_Avoid_` lists
matter: a `Die` is never a "crash", an `Error` is never a string, and the design
artifact is a `Design Doc`, never a "spec".
Then pick the phase:
| Task | Read |
|---|---|
| Designing something new — PROBLEM to Design Doc | `~/.agent-tools/sin-think/DESIGN.md` |
| A Design Doc and code both exist — verify, audit drift, review a PR | `~/.agent-tools/sin-think/REVIEW.md` |
| Exact CLI shape, check rules, exit codes, doc layout | `~/.agent-tools/sin-think/CONTRACT.md` |
| Mapping the channels to Effect-TS (or Go) idioms | `~/.agent-tools/sin-think/EFFECT.md` |
```bash
node ~/.agent-tools/sin-think/sin-think.mjs new "<title>"   # scaffold a Design Doc
node ~/.agent-tools/sin-think/sin-think.mjs check <file>    # structural lint — gate
node ~/.agent-tools/sin-think/sin-think.mjs nodes <file>    # show extracted graph nodes
node ~/.agent-tools/sin-think/test.mjs                      # hermetic test suite
```
Three rules that are easy to get wrong:
- **The Gen body is A only.** Error handling lives in the Pipe. The sole exception is
  a marked Divergent Strategy — rare, and it must be named in the doc.
- **Each layer owns its Error vocabulary.** `SqlError -> DatabaseError -> AuthError ->
  RPC error`. Consumers never see implementation errors from deeper layers.
- **`check` passing is a floor, not a verdict.** It proves the doc covers its Graph;
  judging whether the annotations are good is your job, and code-vs-Graph verdicts
  (`matches`, `stale-doc`, `wrong-code`) belong to REVIEW.md, never to the CLI.
