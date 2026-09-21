# {{TITLE}}
Status: draft

## 1. Problem
<!-- X — what you're trying to build. One paragraph. The problem, not the ticket. -->

## 2. Shapes
<!-- The nouns. Records (entities), IDs (branded, never bare strings), Variants
     (finite states), Errors (tagged, structured, carrying context). You cannot
     draw the graph until you know what flows through it. -->

## 3. Graph (A)
<!-- The happy path as a call graph. Nodes = functions, edges = data flow.
     Example: parse(raw) -> validate(cmd) -> charge(card) -> receipt(order)
     This graph IS your program structure. Draw it before any code. -->

## 4. Cardinality
<!-- Per node: one-shot | flow | time-bounded.
     one-shot = runs once, produces A (Effect). flow = emits A over time (Stream).
     time-bounded = result valid for a window; cache it, dedupe concurrent calls. -->

## 5. Breaks (E)
<!-- Per node: where it breaks and what happens.
     retry = transient failure (timeout, rate limit). escape = recoverable, return
     an alternative. propagate = flows up (the default). die = defect / invariant
     violation, NEVER a domain error. Errors are values until you cannot handle them. -->

## 6. Needs (R)
<!-- Per node: what it must be given to exist — "we cannot do X without Y".
     Note how layers shrink R; when R is never, the program can run. -->

## 7. Boundaries
<!-- Where untrusted data enters: HTTP, files, env, user input, third-party APIs.
     Name the Schema at each boundary: unknown -> trusted, defined once, used
     everywhere. One definition = type + validator + transformer. -->

## 8. Pipe
<!-- Behavior that wraps nodes without changing them: retries, logging, tracing,
     caching, metrics. Orthogonal — the node does not know it is wrapped. -->

## 9. Lifecycle
<!-- Acquire/release pairs. Which nodes open resources (connections, handles,
     subscriptions) and which scope guarantees their release — on success, on
     error, on interrupt. Cleanup is structural, not a TODO comment. -->

## 10. Layer Scoping
<!-- Each layer catches only what IT receives and re-emits in its own vocabulary.
     SqlError -> DatabaseError -> AuthError -> RPC error. Consumers never see
     implementation errors from deeper layers. Draw the layering:
     Services -> Auth -> Handlers, each with its own E=. -->

## 11. Verification
<!-- How you prove the graph works with R swapped: test layers, fakes at
     boundaries, the happy path runnable end to end without real infrastructure.
     If R cannot be swapped and the graph still run, the design is not done. -->

## Divergent Strategies
<!-- Optional, rare. The ONE exception to "no error handling in the gen body":
     two effects in the same composition need different E handling — one fails
     hard, one falls back. Mark each fork explicitly or delete this section. -->
