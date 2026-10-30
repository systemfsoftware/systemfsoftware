---
title: A live instance acquired in a scope is a handle value minted by Handle.make, never a Context.Service, and it enters Context only under a key the caller passes
applies_when:
  - modelling a running container, VM, process, connection, open file or transaction
  - making a running instance available to other code through Context
tags: [handle, blueprint, scope, context]
---

Model a live instance acquired in a scope (a running container, VM, process, connection, open file or transaction) as a value of a handle kind declared with `Handle.make`, minted once per acquisition. Never declare its type as a `Context.Service`, `Context.Tag` or `Context.Key`: a key holds one value per Context, so a program needing two instances of a kind (a primary and a replica connection) cannot hold both, and the instance would outlive its scope with the layer.

When code needs such an instance in Context, the function that binds it takes the `Context.Key` from its caller and never declares a key of its own.

```typescript
// WRONG
export class RunningContainer extends Context.Service<RunningContainer, ContainerShape>()('app/RunningContainer') {}
// RIGHT
const cache = yield* Container.make('cache:7').scoped
const database = yield* Container.make('database:16').scoped
```
