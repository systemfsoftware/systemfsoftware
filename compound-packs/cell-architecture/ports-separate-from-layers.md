---
title: Capability ports must be declared in separate modules from concrete Layer implementations
applies_when:
  - declaring a service key, Context.Tag, or capability interface
  - implementing a Layer that satisfies a service port
  - organizing dependency injection and service boundaries in Effect
  - reviewing imports between domain consumers and infrastructure implementations
tags: [cell-architecture, ports-and-adapters, context-tag, layer, dependency-inversion]
---

# Capability ports must be declared in separate modules from concrete Layer implementations

A capability port (`Context.Tag` / `Context.Service`) and the concrete implementation (`Layer`) that satisfies it represent two completely different architectural concerns with two distinct consumer audiences (`docs/solutions/architecture-patterns/one-cell-cannot-hold-a-port-and-its-implementation.md`, `CONSTITUTION.md` CONST-B4).

When a single module exports both the port and the layer, consumers that only need the interface are forced into a dependency on the concrete implementation, corrupting the dependency graph and forcing test projection workarounds.

## Doctrine & Constraints

- **Port in a shared declaration cell**: The capability port (`Context.Tag<Service>`) and its abstract interface belong in a lean, dependency-free declaration module that any consumer may freely import.
- **Layer at the composition edge**: Concrete implementations (`Layer.effect`, `Layer.succeed`) must live in separate adapter or infrastructure modules that are imported only at the application composition root (`main.ts`).
- **Inward import direction**: Domain workflows and core cell operations must never import concrete Layers or driver packages. They only ever mention capability tags in their requirements (`R`) channel.
- **Single responsibility per file**: Never co-locate `DatabasePort` and `DatabaseLive` in the same file.

## Calibration Examples

- **wrong**:
  ```ts
  // One file holds both port and implementation
  // src/services/UserRepository.ts
  import { PgClient } from '@effect/sql-pg' // Impure driver import!
  import { Context, Layer } from 'effect'

  export class UserRepository extends Context.Tag('UserRepository')<
    UserRepository,
    { readonly findById: (id: string) => Effect.Effect<User, NotFound> }
  >() {}

  // Forbidden: co-located implementation forces Postgres dependency on every caller of the port
  export const UserRepositoryLive = Layer.effect(
    UserRepository,
    Effect.gen(function*() {
      const sql = yield* PgClient.PgClient
      // ...
    }),
  )
  ```
- **right**:
  ```ts
  // File 1: Port declaration (lean, pure interface)
  // src/domain/UserRepository.ts
  import { Context, Effect } from 'effect'

  export class UserRepository extends Context.Tag('UserRepository')<
    UserRepository,
    { readonly findById: (id: string) => Effect.Effect<User, NotFound> }
  >() {}

  // File 2: Implementation (separate infrastructure module, imported only at composition root)
  // src/infrastructure/UserRepositoryPgLive.ts
  import { PgClient } from '@effect/sql-pg'
  import { Effect, Layer } from 'effect'
  import { UserRepository } from '../domain/UserRepository'

  export const UserRepositoryPgLive = Layer.effect(
    UserRepository,
    Effect.gen(function*() {
      const sql = yield* PgClient.PgClient
      // ...
    }),
  )
  ```

## Verification & Gate

- `lint`: Import-graph lint ensures pure and domain modules do not import infrastructure or driver packages (`@effect/sql-*`, `@effect/platform-node`, `node:*`).
- `review`: Reviewer checks that `Context.Tag` declaration files export zero `Layer` instances, and that `Layer` exports exist exclusively in adapter/infrastructure files.
