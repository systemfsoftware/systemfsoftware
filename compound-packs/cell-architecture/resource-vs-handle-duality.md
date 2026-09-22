---
title: Resource specification algebra versus runtime handle duality
applies_when:
  - designing lifecycle boundaries for capability and infrastructure packages
  - separating cold resource builders from active runtime instances
  - deciding whether to model an entity as a Context.Service, Resource, or Handle
tags: [cell, resource-vs-handle, scope, handle, lifecycle]
---

Infrastructure packages must strictly separate the **Resource Specification** (the cold declarative builder) from the **Runtime Handle** (the live materialized instance). Conflating the two or modeling the runtime handle as an ambient `Context.Service` creates identity collision and artificial ceremony:

### 1. The Duality: Cold Resource vs. Hot Handle

In Effect-TS, a managed lifecycle is a two-phase contract:

| Phase             | Role                                                                                                                                                      | Representation in Effect                                            | Example                                             |
| :---------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ | :-------------------------------------------------- |
| **Cold Resource** | The **lifecycle bracket & configuration algebra**. Immutable data at rest describing how to allocate, configure, and release an entity.                   | `Effect<Handle, Error, Scope>` or a staged builder (`ResourceSpec`) | `Container.make('redis:7')`, `Database.config(...)` |
| **Hot Handle**    | The **live materialized capability object** held while the `Scope` remains open. Represents an active external process, container, socket, or connection. | A nominal interface extending `Pipeable`, branded with `TypeId`     | `Fiber`, `Socket`, `Queue`, `RunningVM`             |

### 2. Never Model a Runtime Handle as a `Context.Service`

A `Context.Service` represents an ambient, usually singleton dependency in the environment (`R`). Runtime handles are **ephemeral values** bound to an active `Scope`:

- **Singleton Collision**: If a library models its running container handle as `export const RunningContainer = Context.Service<RunningContainer>('RunningContainer')`, an application running two containers (e.g. `redis` and `postgres`) cannot hold both in `Context`. One container overwrites the other.
- **Handles are Values, not Environment Identifiers**: Just as Effect's `Fiber`, `Socket`, `Queue`, and `Ref` are plain interfaces and never `Context.Service` tags, container and database instances are values returned by `yield* spec.scoped`.
- **Parameterized Layer Synthesis**: When an application _does_ want to bind a handle to a specific domain tag in `Context`, the library provides parameterized layer synthesis on demand:
  ```ts
  spec.layer(RedisTag) // Layer.Layer<RedisTag, Error, ...>
  ```

### 3. Handles are Minimal Protocol Records; Operations are Standalone Dual Functions

In idiomatic Effect (`Socket`, `Queue`, `Fiber`, `Ref`), **handles are not OOP-style fat bags of closures**. A handle is a minimal protocol record carrying identity, bindings, and underlying runtime references, while operations are standalone dual functions in the module namespace:

```ts
// 1. Nominal TypeId branding:
export const TypeId = Symbol.for('~my-org/package/RunningInstance')
export type TypeId = typeof TypeId

// 2. Type guard:
export const isRunningInstance = (u: unknown): u is RunningInstance =>
  Predicate.hasProperty(u, TypeId)

// 3. Minimal protocol record extending Pipeable:
export interface RunningInstance extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly id: string
  readonly endpoint: string
}

// 4. Operations are dual pipeable functions (data-first & data-last):
export const exec: {
  (cmd: string): (self: RunningInstance) => Effect.Effect<ExecResult, ExecError>
  (self: RunningInstance, cmd: string): Effect.Effect<ExecResult, ExecError>
} = dual(2, (self: RunningInstance, cmd: string) => ...)
```

Where a handle carries a third-party driver token, the symbol-slot mechanism is prescribed by `handle-state-privacy.md`.

```ts
// WRONG: Modeling an acquired entity as an ambient singleton Service
export const RunningContainer = Context.Service<RunningContainer>('RunningContainer')

// RIGHT: Cold Resource builder compiling to live Handle value inside Scope
const redisSpec = Container.make('redis:7').withPort(6379)
const postgresSpec = Container.make('postgres:16').withPort(5432)

Effect.scoped(
  Effect.gen(function*() {
    const redis = yield* redisSpec.scoped // Handle 1
    const postgres = yield* postgresSpec.scoped // Handle 2
    yield* redis.pipe(Container.exec('redis-cli ping'))
    yield* postgres.pipe(Container.exec('pg_isready'))
  }),
)
```

Gate: `review` — verify runtime instances are modeled as `Pipeable` handles with nominal `TypeId`s rather than `Context.Service` tags.
