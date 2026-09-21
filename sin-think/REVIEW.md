# REVIEW — code vs Graph

Use when: a Design Doc exists and code now exists too — review a PR, audit drift,
or verify your own implementation. Prerequisite: read CONTEXT.md.

The law: **if the code doesn't match the call Graph, the implementation is
wrong.** This playbook turns the law into a procedure with three honest Verdicts.

## Procedure

1. Run the mechanical gate first:
   `node ~/.agent-tools/sin-think/sin-think.mjs check <design-doc>`
   A doc that fails `check` is incomplete — the design itself is unfinished;
   reviewing code against it is premature. Say so and stop.
2. Extract the actual call graph from the code. Entry points first, follow the
   calls. Do not skim — draw it.
3. Compare, node by node, edge by edge:
   - Same nodes, same order, same data flowing along the edges?
   - Every Gen body free of error handling? (Sole exception: a Divergent
     Strategy marked in the doc. Unmarked inline E handling = finding.)
   - Every layer's Pipe enumerates only the Errors that layer receives?
     A handler catching SqlError is a Layer Scoping violation.
   - Every Boundary has its Schema, and untrusted data never crosses elsewhere?
   - Every acquire has its Scope; no cleanup left to a TODO or a prayer?
   - R provided by Layers; tests swap Test Layers without touching nodes?
4. Record the Verdict in the PR or the doc.

## Verdicts

- **`matches`** — code and Graph agree. Nothing to do.
- **`wrong-code`** — the implementation drifted: missing node, extra node,
  reordered edge, E handled in the Gen body, a layer leaking a deeper Error.
  Fix the code. The Graph was agreed; the code is the suspect.
- **`stale-doc`** — the design genuinely changed during implementation and the
  code is right. Update the Design Doc IN THE SAME CHANGE, re-run `check`.
  Never let doc and code diverge silently — a stale doc is worse than no doc,
  because it lies with authority.

Choosing between `wrong-code` and `stale-doc` is the judgement call. Ask: would
the designer, knowing what the implementer now knows, have drawn this Graph? If
yes, the doc is stale. If no, the code is wrong. When unsure, treat it as
`wrong-code` — the burden of proof is on the change.

## Status honesty

The Status line under the H1 must reflect reality:
`draft` = sections incomplete · `designed` = check passed, no code yet ·
`implemented` = code exists, not yet reviewed · `verified` = REVIEW ran, verdict
`matches` (or `stale-doc` resolved). Never write `verified` yourself for code
you also wrote without an independent pass.
