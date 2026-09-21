# sin-think Context

Glossary. These terms are load-bearing — use them exactly, and correct the user
when they use an `_Avoid_` term. Source: "Design Thinking" (r17x),
https://gist.github.com/r17x/90eb2f7be93932b5693753aedb09c01a

## The frame

- **`X`** — the problem. What you are trying to build, stated in one paragraph.
  _Avoid_: "ticket", "task" — X is the problem, not the work item.
- **`Graph`** — the program drawn before it is written. Nodes are functions,
  edges are data flow. The code IS the Graph; if they disagree, see REVIEW.md.
- **`Node`** — one function/step in the Graph. Carries four annotations:
  Cardinality, A, E, R.
- **`Design Doc`** — the committed artifact that holds X, the Graph, and all
  annotations. Lives at `docs/design/<date>-<slug>.md` unless `--dir` says
  otherwise. _Avoid_: "spec" (that word belongs to test-evidence).

## The nouns (§1)

- **`Shape`** — a domain noun. Exactly four kinds:
  - **`Record`** — an entity that flows through Nodes. A User, an Order.
  - **`ID`** — identity. Branded, constrained, never a bare string.
  - **`Variant`** — a finite set of states. `Pending | Active | Cancelled`.
  - **`Error`** — a named failure mode. Tagged, structured, carrying context.
    _Avoid_: "error string", "error message".

## The channels (§2–§5)

- **`A`** — the success channel. What flows through Nodes on the happy path.
  Think A first: the happy-path call Graph comes before everything else.
- **`E`** — the failure channel. Where the Graph breaks. Errors are VALUES in E
  until you truly cannot handle them; they flow through the Graph like data.
  _Avoid_: "exception" — exceptions are thrown; E is carried.
- **`R`** — the requirements channel. What a Node needs to exist. "We cannot do
  X without Y." R shrinks as Layers are provided; when R is `never`, the
  program can run. R is compile-time proof that dependencies are satisfied.
- **`Cardinality`** — one of three, per Node:
  - `one-shot` — runs, produces A, done. (In Effect: `Effect`.)
  - `flow` — emits A over time: events, subscriptions, pages. (In Effect: `Stream`.)
  - `time-bounded` — result valid for a window; cache it, dedupe concurrent calls.
  Same three channels in all cases; different Cardinality. Mark it on the Graph.

## Break decisions (§4)

Where the Graph can break, each break is one of four decisions:

- **`Retry`** — transient failure, try again. Timeout, rate limit, connection reset.
- **`Escape`** — recoverable; return an alternative. Fallback, cached result, default.
- **`Propagate`** — the default; the value flows up the E channel unhandled here.
- **`Die`** — defect, invariant violation, programmer bug. NEVER a domain Error.
  Die only when the program's assumptions are violated. _Avoid_: "crash".

## Structure (§6–§9)

- **`Boundary`** — where untrusted data enters the Graph: HTTP, files, env,
  user input, third-party responses.
- **`Schema`** — converts `unknown -> trusted` at a Boundary. One definition =
  type + validator + transformer. Defined once, used everywhere.
- **`Pipe`** — behavior wrapped around a Node without changing it: retries,
  logging, tracing, caching. Orthogonal. Also where E handling lives.
- **`Gen body`** — the happy path in code form. Every step is an A flowing
  through the Graph. NO error handling inside. This is structural, not
  stylistic: the Gen body IS the Graph, the Pipe IS the E annotation.
- **`Scope`** — structural acquire/release. If a Node opens a connection, Scope
  ensures it closes — on error, on interrupt. Cleanup is a guarantee, not a
  TODO comment. _Avoid_: "finally block" (a hope, not a guarantee).
- **`Layer`** — provides R to Nodes.
- **`Layer Scoping`** — each Layer catches only what IT receives and re-emits in
  its own Error vocabulary. `SqlError -> DatabaseError -> AuthError -> RPC error`.
  Consumers never see implementation Errors from deeper Layers.
- **`Divergent Strategy`** — the ONE exception to "no error handling in the Gen
  body": two steps in one composition need different E handling (one fails hard,
  one falls back). Exists because the Graph has a fork. Must be marked. Rare.
- **`Test Layer`** — swaps R. If the Graph still runs, the design holds. If R
  cannot be swapped, the design is not done.

## Verdicts (REVIEW.md)

- **`matches`** — code and Graph agree.
- **`stale-doc`** — code moved on; the Design Doc is updated deliberately, in
  the same change, never silently.
- **`wrong-code`** — the implementation drifted from the Graph; fix the code.
  The gist's law: if the code doesn't match the call Graph, the implementation
  is wrong. The `stale-doc` verdict exists because law needs a release valve.
