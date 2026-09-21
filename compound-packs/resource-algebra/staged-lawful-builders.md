---
title: Resource definitions form an immutable, fluent data algebra with lawful phase ordering
applies_when:
  - designing a builder, configuration, or specification model for an external resource
  - authoring container, database, process, queue, or network resource definitions
  - structuring the public entrypoints of an infrastructure or capability package
tags: [resource-algebra, lawful-builder, staged-phases, type-checker]
---

A resource definition (e.g. Container, Database, Daemon, Worker, Browser, Sandbox) is an immutable data blueprint describing an external target. It must never perform side-effects or initiate network/process operations upon creation.

### The Lawful Staged Builder Rule

Resource definitions must enforce lawful order of operations through staged builder phases:

1. **Mandatory Identity Entrypoint**: The initial factory function (`Resource.make(id)` or `Resource.spec(id)`) requires the mandatory identifier (e.g. image tag, connection string, command path, or target name). It returns a configured builder instance. It is nonsensical and prohibited to begin configuration without an established target identity.
2. **Configuration Phase (Pure Combinators)**: The builder exposes pure, chainable methods (`.withPort`, `.withEnv`, `.withMount`, `.withTimeout`) that return a new immutable specification value.
3. **Terminal Execution Phase (Projections)**: Execution handles (`.scoped` and `.layer`) exist **only** on the configured builder returned after identity has been established. Free-floating standalone execution functions that accept unvalidated or headless inputs are forbidden.

```ts
// WRONG: Untyped configuration object passed to ambient singleton service
const rawConfig = { ports: [5432] } // Missing database/image identity — illegal headless state!
const service = yield * DatabaseService
const db = yield * service.start(rawConfig) // Runtime failure or unvalidated acquisition

// RIGHT: Lawful staged builder; identity required before execution exists
const postgres = Database.make('postgres:16-alpine')
  .withPort(5432)
  .withEnv({ POSTGRES_DB: 'app' })
  .withWaitStrategy(Database.Wait.forPort(5432))

// Execution properties exist only on the configured definition:
const db = yield * postgres.scoped // Scoped acquisition with managed lifecycle
const DbLayer = postgres.layer // Parameterized Layer for test/production composition
```

Gate: `type-checker` — verify terminal execution properties (`.scoped`, `.layer`) exist only on the configured builder instance, making uninitialized resource acquisition impossible to compile.
