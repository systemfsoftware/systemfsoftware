---
title: A live instance acquired in a scope is a handle value minted by Handle.make, never a Context.Service, and it enters Context only under a key the caller passes
applies_when:
  - modelling a running container, VM, process, connection, open file or transaction
  - making a running instance available to other code through Context
tags: [handle, blueprint, scope, context]
---

A live instance acquired in a scope (a running container, VM, process, connection, open file or transaction) is a value of a handle kind declared with Handle.make and minted once per acquisition. Its type is never declared as a Context.Service, Context.Tag or Context.Key. When code needs such an instance in Context, the function that binds it takes the Context.Key from its caller and never declares a key of its own for it.

**Decision test.** For each Context.Service, Context.Tag or Context.Key the diff declares, ask whether its value is one acquired instance: something started, opened or begun, and later stopped, closed or ended. The rule fails if it is. It also fails when a library function that puts such an instance into Context uses a key it declares instead of one its caller passes.

**Defect it prevents.** A service key holds one value per Context. A program that needs two instances of the same kind at once (a cache container and a database container, a primary and a replica connection) cannot hold both, and the instance lives as long as the layer instead of the scope that acquired it.

```typescript
// WRONG
export class RunningContainer extends Context.Service<RunningContainer, ContainerShape>()('app/RunningContainer') {}
```

```typescript
// RIGHT
const program = Effect.gen(function*() {
  const cache = yield* Container.make('cache:7').scoped
  const database = yield* Container.make('database:16').scoped
  yield* cache.pipe(Container.exec('ping'))
})
// a library that binds an instance into Context takes the key from its caller
export declare const layer: <I>(
  key: Context.Key<I, Connection>,
  options: ConnectOptions,
) => Layer.Layer<I, ConnectError>
```

**Source.** @systemfsoftware/effect-cell-types: `Handle.make` "declares a handle kind: a minimal protocol record of Data, branded with its TypeId" (src/Handle.ts), and a blueprint "never acquires anything; `.scoped` and `.layer` compile it into acquisition" (src/Blueprint.ts), https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-cell-types. The cell-architecture lint rule `kind-file-declares-no-service` reports a Context.Service, Tag or Key declared in a blueprint or handle file.

Gate: judge
