---
title: Resource definitions form an immutable fluent data algebra with lawful phase ordering
applies_when:
  - designing a builder, configuration, or specification model for an external resource
  - authoring container, database, process, queue, or network resource definitions
  - structuring public entrypoints of a capability package
tags: [cell, resource, lawful-builder, staged-phases]
---

A resource (Container, Database, Daemon, Worker, Browser, Sandbox) is an immutable, schema-declared spec describing an external target. Building one performs no side effect and starts no process or connection.

### The Lawful Staged Builder Rule

`Resource.make({ spec, handle, prepare?, ready? })` declares a resource kind; the kind orders every phase:

1. **Identity first**: `kind.of(spec)` takes the type of the spec's Schema class, so the identifying field (image tag, connection string, command path, file contents) is required before a resource value exists. A package's entry point, such as `MicroVM.service(image)`, fills that field.
2. **Configuration is pure**: each option is a `dual(2, …)` that returns a new resource value (`pipeable-dual-parity.md`). Configuration never touches a driver.
3. **Projections exist only on the resource**: `scoped`, `layer`, and `bind(key)` are properties of a built resource, all derived from one scoped acquisition. No free-floating function acquires from a headless config.

```ts
// WRONG: an untyped config handed to an ambient service
const rawConfig = { ports: [5432] } // no image identity
const service = yield * DatabaseService
const db = yield * service.start(rawConfig)

// RIGHT: identity, then configuration, then a projection
const postgres = Database.make('postgres:16-alpine').pipe(
  Database.withPort(5432),
  Database.withEnv({ POSTGRES_DB: 'app' }),
  Database.withWaitStrategy(Database.Wait.forPort(5432)),
)
const db = yield * postgres.scoped
const DbLayer = postgres.layer
```

Gate: `Resource.make` builds `of`, `scoped`, `layer`, and `bind`, and `of` accepts only the spec's Schema-declared type (`pnpm --filter @systemfsoftware/effect-cell-types test:types` refuses a spec missing its identity and pins the projections). `@systemfsoftware/oxlint-plugin-cell-architecture` rule `kind-file-construction` requires every `*.resource.ts` file to build its resource with `Resource.make`.
