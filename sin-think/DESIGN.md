# DESIGN — PROBLEM to Design Doc

Use when: a non-trivial feature, service, or flow needs designing before code.
Prerequisite: read CONTEXT.md. Its terms are load-bearing.

The pipeline is a sequence of questions. Each question annotates the SAME Graph —
you are building one artifact, not eleven lists. Do not skip a step; a step you
cannot answer is a gap in your understanding of X. Go back, not forward.

```
PROBLEM
  -> "What are the shapes?"              -> §2  Shapes: the domain language
  -> "What is the happy path?"           -> §3  Graph: the call graph (A)
  -> "Is each node one-shot or a flow?"  -> §4  Cardinality
  -> "Where can it break?"               -> §5  Breaks: annotate E on the Graph
  -> "What does each node need?"         -> §6  Needs: annotate R on the Graph
  -> "Where does untrusted data enter?"  -> §7  Boundaries: Schema at the edges
  -> "What wraps nodes, unchanged?"      -> §8  Pipe
  -> "What resources need cleanup?"      -> §9  Lifecycle: Scope
  -> "Which errors does each layer own?" -> §10 Layer Scoping
  -> "Can I swap R and still run?"       -> §11 Verification: Test Layers
  -> CODE                                -> the code IS the Graph
```

## Procedure

1. Scaffold: `node ~/.agent-tools/sin-think/sin-think.mjs new "<title>"`
   (pass `--dir` if the repo keeps design docs elsewhere).
2. State X in one paragraph. If you cannot, stop — nothing else is knowable yet.
3. §2 Shapes first, always. The Graph is verbs; you cannot draw verbs before
   nouns. IDs branded. Variants finite. Errors tagged and structured.
4. §3 Graph: happy path only. `F1(A) -> F2(A) -> F3(A)`. No error handling in
   this picture — that is §5's job, drawn onto the same nodes.
5. §4–§6: walk every node. Cardinality, break decision, needs. Every node in
   the Graph must appear in all three sections — `check` enforces this.
6. §7–§9: edges and wrappers. Schema at each Boundary; Pipe for orthogonal
   behavior; Scope for every acquire.
7. §10 Layer Scoping: draw the layers, name each layer's E vocabulary. A layer
   catches only what it receives; it never leaks a deeper layer's Error upward.
8. §11 Verification: name the Test Layers. If a node's R cannot be faked, the
   design is not done — reshape it until it can.
9. Gate: `node ~/.agent-tools/sin-think/sin-think.mjs check <file>` must pass
   before any code is written. Then write code that IS the Graph.

## Rules that are easy to get wrong

- **The Gen body is A only.** If error handling lives inside the composition,
  the A path and E path are tangled and the happy path is unreadable. E handling
  lives in the Pipe. Sole exception: a marked Divergent Strategy — rare.
- **Die is not a domain Error.** Die means an invariant was violated — a
  programmer bug. Domain failures are values in E.
- **Each layer owns its vocabulary.** `SqlError -> DatabaseError -> AuthError
  -> RPC error`. Handlers never see SqlError.
- **A stale doc is a defect.** If the design changes mid-implementation, update
  the Design Doc in the same change. Code and doc move together or not at all.

## Worked example (compressed)

```
X: Receive payment webhooks; acknowledge only after durable storage.

Graph (A):   parse(raw) -> validate(event) -> store(event) -> ack(id)
Cardinality: all one-shot
Breaks (E):  parse    -> ParseError  -> escape to dead-letter
             store    -> StoreError  -> retry with backoff, then propagate
             ack      -> AckError    -> retry, then propagate
Needs (R):   store needs Database; ack needs HttpClient; rest need nothing
Boundary:    Schema at parse — unknown -> WebhookEvent
Pipe:        tracing around store; retry lives in the pipe, not the node
Lifecycle:   Database acquired at boot, Scope releases on shutdown
Layers:      Service emits StoreError; Handler catches it, emits AckError up
Verify:      in-memory Database + stub HttpClient; graph runs end to end
```

That is the whole design. It fits on one screen because the Graph does the work.
