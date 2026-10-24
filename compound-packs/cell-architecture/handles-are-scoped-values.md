---
title: A live instance acquired in a scope is a handle value minted by Handle.make, never a Context.Service
applies_when:
  - modelling a running container, VM, process, connection, open file or transaction
  - writing a handle's operations or holding a third-party driver object
  - keeping per-instance state for a handle or a service
tags: [handle, blueprint, scope, dual]
---

- A live instance acquired within a scope (a running container, VM, process, connection, open file or transaction) is a handle minted by Handle.make; its type is never declared as a Context.Service in any file.
- An instance that must sit in Context is bound under a Context.Key the caller passes in, never under a tag the library declares for that instance.
- A third-party object a handle holds lives in the kind slot (Handle.make<Data, Slot>()(TypeId)), never in a public record field.
- A handle's operations are standalone functions exported from its module, written with dual(...) when they take arguments beyond the handle; never closures or methods on the record.

```typescript
// WRONG
export class RunningContainer extends Context.Service<RunningContainer, ContainerShape>()('app/RunningContainer') {}
```

```typescript
// RIGHT
const redis = yield * Container.make('redis:7').scoped
const postgres = yield * Container.make('postgres:16').scoped
yield * redis.pipe(Container.exec('redis-cli ping'))
```

Gate: judge
