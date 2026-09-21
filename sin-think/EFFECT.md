# EFFECT — reference mapping to Effect-TS

The pipeline is language-agnostic; Effect is where A, E, R are literal types.
`Effect<A, E, R>` = succeeds with A, fails with E, needs R. Read CONTEXT.md first.

## Channels

| sin-think | Effect-TS |
|---|---|
| A | the success type of `Effect<A, E, R>` |
| E | the error type — tagged errors via `Data.TaggedError` |
| R | the requirements type — services via `Context.Tag`, provided by `Layer` |
| one-shot | `Effect` |
| flow | `Stream` |
| time-bounded | `Effect.cached`, `Effect.cachedFunction`, RequestResolver batching |
| Schema | `Schema` — `Schema.decodeUnknown` at each Boundary |
| Scope | `Effect.acquireRelease`, `Effect.scoped`, `Scope` |
| Test Layer | `Layer.succeed` / `Layer.sync` fakes, `Effect.provide` in tests |

## The structural rules in code

**Gen body = A, Pipe = E.** The composition is the Graph; error handling is the
annotation.

```ts
// ✅ the gen body reads as the Graph: parse -> validate -> store -> ack
const program = Effect.gen(function* () {
  const raw     = yield* parse      // each yield* is an A flowing through
  const event   = yield* validate(raw)
  yield* store(event)
  return yield* ack(event.id)
}).pipe(
  Effect.retry({ schedule: Schedule.exponential("100 millis"), while: isTransient }),
  Effect.catchTag("StoreError", (e) => Effect.fail(new AckError({ cause: e }))),
  Effect.withSpan("webhook"),
)
// ❌ Effect.tryPromise / catchTag INSIDE the gen body — A and E tangled
```

**Shapes.**

```ts
class EventId extends Schema.String.pipe(Schema.brand("EventId")) {} // IDs branded
const Status = Schema.Literal("Received", "Stored", "Acked")          // Variants finite
class StoreError extends Data.TaggedError("StoreError")<{ reason: string }> {}
```

**Layer Scoping** — each layer catches only what it receives, re-emits its own E:

```ts
// Repository: SqlError -> StoreError. Service: StoreError -> DomainError.
// Handler: DomainError -> RPC-declared error. Nobody upstream sees SqlError.
query(...).pipe(Effect.mapError((sql) => new StoreError({ reason: String(sql) })))
```

**Divergent Strategy** — the one marked exception, inline because the outer pipe
cannot tell which yield failed:

```ts
// MARKED Divergent Strategy: profile must not fail the request; payment must.
const profile = yield* loadProfile(id).pipe(Effect.orElseSucceed(() => GUEST))
const charge  = yield* chargeCard(order)   // hard fail — propagates
```

**Die is for defects only.** `Effect.die` when an invariant is violated — never
for a domain failure the caller could reasonably handle.

## Beyond Effect

The channels exist in every language; only their explicitness varies. In Go:
A and E arrive together as `(T, error)`, R is constructor-injected fields. The
discipline transfers unchanged: wrap errors at layer boundaries (never leak
`sql.ErrNoRows` past the repository), keep the happy path visually straight
(early returns ARE the pipe), make cleanup structural (`defer` at the acquire
site), and brand IDs with distinct types. The Graph, the coverage check, and the
Verdicts are identical — `check` does not care what language the doc describes.
