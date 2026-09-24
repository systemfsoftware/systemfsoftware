---
title: Blueprint specification algebra versus runtime handle duality
applies_when:
  - designing lifecycle boundaries for capability and infrastructure packages
  - separating cold blueprints from active runtime handles
  - deciding whether to model an entity as a Context.Service, Blueprint, or Handle
tags: [cell, blueprint-vs-handle, scope, handle, lifecycle]
---

Infrastructure packages must strictly separate the **Blueprint** (the cold declarative description) from the **Runtime Handle** (the live materialized instance). Conflating the two or modeling the runtime handle as an ambient `Context.Service` creates identity collision and artificial ceremony:

### 1. The Duality: Cold Blueprint vs. Hot Handle

In Effect-TS and cell architecture, a managed lifecycle is a two-phase contract:

| Phase              | Role                                                                                                                                                      | Representation in Effect                                                                                                   | Example                                             |
| :----------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| **Cold Blueprint** | The **lifecycle bracket & configuration algebra**. Immutable data at rest describing how to allocate, configure, and release an entity.                   | A nominal `Blueprint<TypeId, Spec, Ops>` minted with `Blueprint.make`, compiling into acquisition via `.scoped` / `.layer` | `Container.make('redis:7')`, `Database.config(...)` |
| **Hot Handle**     | The **live materialized capability object** held while the `Scope` remains open. Represents an active external process, container, socket, or connection. | A nominal record minted with `Handle.make`, extending `Pipeable`, branded with `TypeId`                                    | `Fiber`, `Socket`, `Queue`, `RunningVM`             |

A blueprint module lives in `*.blueprint.ts` and a handle module lives in `*.handle.ts`. The legacy `*.resource.ts` file suffix is retired (rename to `*.blueprint.ts`; a blueprint is a cold description, never Effect's `Resource`).

### 2. Never Model a Runtime Handle as a `Context.Service`

A `Context.Service` represents an ambient, usually singleton dependency in the environment (`R`). Runtime handles are **ephemeral values** bound to an active `Scope`:

- **Singleton Collision**: If a library models its running container handle as `export const RunningContainer = Context.Service<RunningContainer>('RunningContainer')`, an application running two containers (e.g. `redis` and `postgres`) cannot hold both in `Context`. One container overwrites the other.
- **Handles are Values, not Environment Identifiers**: Just as Effect's `Fiber`, `Socket`, `Queue`, and `Ref` are plain interfaces and never `Context.Service` tags, container and database instances are values returned by `yield* spec.scoped`.
- **Parameterized Layer Synthesis**: When an application _does_ want to bind a handle to a specific domain tag in `Context`, the blueprint provides parameterized layer synthesis on demand:
  ```ts
  spec.layer(RedisTag) // Layer.Layer<RedisTag, Error, ...>
  ```

### 3. Handles are Minimal Protocol Records; Operations are Standalone Dual Functions

In idiomatic Effect and cell architecture, **handles are not OOP-style fat bags of closures**. A handle is a minimal protocol record carrying identity, bindings, and underlying runtime references, while operations are standalone dual functions in the module namespace:

```ts
import { Handle } from '@systemfsoftware/effect-cell-types'
import { Effect, Predicate } from 'effect'
import { dual } from 'effect/Function'

// 1. Nominal TypeId branding (Symbol.for('<literal>')), minted into a module-private definition
//    whose slot state is unnameable from consumer code:
export const TypeId = Symbol.for('~my-org/package/RunningInstance')
export type TypeId = typeof TypeId

const RunningInstance = Handle.make<
  { readonly id: string; readonly endpoint: string },
  RawDriver
>()(TypeId)

export type RunningInstance = Handle.Of<typeof RunningInstance>

// 2. The public predicate is the definition's own is, never a hand-rolled one:
export const isRunningInstance = RunningInstance.is

// 3. The kind mints the record; the factory never builds it by hand:
export const make = (id: string, endpoint: string, driver: RawDriver): RunningInstance =>
  RunningInstance.make({ id, endpoint }, driver)

// 4. Operations are standalone dual pipeable functions (data-first & data-last):
export const exec: {
  (cmd: string): (self: RunningInstance) => Effect.Effect<ExecResult, ExecError>
  (self: RunningInstance, cmd: string): Effect.Effect<ExecResult, ExecError>
} = dual(2, (self: RunningInstance, cmd: string): Effect.Effect<ExecResult, ExecError> =>
  Effect.tryPromise({
    try: () => RunningInstance.slot(self).execute(cmd),
    catch: (cause) => new ExecError({ cmd, cause }),
  }))
```

Where a handle carries a third-party driver token, private state lives in the kind's slot passed to `Handle.make<Data, Slot>()(TypeId)` and read back via `RunningInstance.slot(self)` as prescribed by `handle-state-privacy.md`.

```ts
// WRONG: Modeling an acquired entity as an ambient singleton Service in a kind file
export const RunningContainer = Context.Service<RunningContainer>('RunningContainer')

// RIGHT: Cold Blueprint compiling to live Handle value inside Scope
const redisBlueprint = Container.make('redis:7').withPort(6379)
const postgresBlueprint = Container.make('postgres:16').withPort(5432)

Effect.scoped(
  Effect.gen(function*() {
    const redis = yield* redisBlueprint.scoped // Handle 1
    const postgres = yield* postgresBlueprint.scoped // Handle 2
    yield* redis.pipe(Container.exec('redis-cli ping'))
    yield* postgres.pipe(Container.exec('pg_isready'))
  }),
)
```

Gate: `kind-file-declares-no-service`, `kind-file-construction`, `handle-definition-stays-private`, `handle-exports-guard`, `kind-record-minted-by-kind`, `kind-typeid-by-symbol-for`, `type-checker` — verify runtime instances are modeled as values minted with `Handle.make` rather than `Context.Service` declarations, TypeId is minted via `Symbol.for`, the definition remains private, and the `is<Name>` guard is exported.
