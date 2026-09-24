---
title: Blueprint definitions form an immutable fluent data algebra with lawful phase ordering
applies_when:
  - designing a builder, configuration, or specification model for an external target
  - authoring container, database, process, queue, or network blueprints
  - structuring public entrypoints of a capability package
tags: [cell, blueprint, lawful-builder, staged-phases]
---

A blueprint definition (e.g. Container, Database, Daemon, Worker, Browser, Sandbox) is a cold, immutable description of an external target. It must never perform side-effects or initiate network/process operations upon creation; only its compilation targets acquire anything.

### The Lawful Staged Builder Rule

A blueprint declares its members once on the kind with `Blueprint.make<Spec>()(TypeId)`, and those members enforce lawful order through staged phases:

1. **Mandatory Identity Entrypoint**: The module mints the kind with `Blueprint.make<Spec>()(TypeId).steps({ steps, targets })` (or `.operations<Ops>()({ operations, targets })`) and exposes a factory (`make(id)`) that is the definition's only `of` caller. It requires the mandatory identifier (image tag, connection string, command path, or target name) and returns a configured blueprint. It is prohibited to begin configuration without an established target identity; `of` is never reached from outside the module.
2. **Configuration Phase (Pure Combinators)**: Each `.withPort`, `.withEnv`, `.withMount`, `.withTimeout` is a pure `(spec, ...args) => Spec` transform declared in `steps` and re-exported as `definition.operations.<name>`. It returns a new immutable blueprint and runs no I/O.
3. **Terminal Execution Phase (Targets)**: `.scoped` and `.layer` are compilation **targets** declared in `targets` and exist only on a blueprint minted through the kind. Free-floating execution functions that accept unvalidated or headless inputs are forbidden.

```ts
import { Blueprint } from '@systemfsoftware/effect-cell-types'
import { Effect, Layer } from 'effect'
import type * as Scope from 'effect/Scope'

export const TypeId = Symbol.for('~my-org/effect-container/Container')
export type TypeId = typeof TypeId

// 1. Pure steps and terminal targets, declared once on the kind.
const Containers = Blueprint.make<ContainerSpec>()(TypeId).steps({
  steps: {
    withPort: (spec: ContainerSpec, port: number): ContainerSpec => new ContainerSpec({ ...spec, port }),
    withEnv: (spec: ContainerSpec, env: Record<string, string>): ContainerSpec =>
      new ContainerSpec({ ...spec, env: { ...spec.env, ...env } }),
  },
  targets: {
    scoped: (spec: ContainerSpec): Effect.Effect<Container, ContainerError, Scope.Scope> => acquire(spec),
    layer: (spec: ContainerSpec) => (key: Context.Key<Container>): Layer.Layer<Container, ContainerError> =>
      Layer.effect(key)(acquire(spec)),
  },
})

export type ContainerBlueprint = Blueprint.Of<typeof Containers>

// 2. Identity entrypoint: the definition's only caller of `of`.
export const make = (image: string): ContainerBlueprint =>
  Containers.of(new ContainerSpec({ image, port: undefined, env: {} }))

export const withPort = Containers.operations.withPort
export const withEnv = Containers.operations.withEnv
```

```ts
// WRONG: configuring an unvalidated, headless spec through an ambient singleton
const rawConfig = { ports: [5432] } // Missing image identity — illegal headless state!
const service = yield * DatabaseService
const db = yield * service.start(rawConfig)

// RIGHT: identity first; only the configured blueprint carries acquisition targets
const postgres = make('postgres:16-alpine').pipe(
  withPort(5432),
  withEnv({ POSTGRES_DB: 'app' }),
)

const container = yield * postgres.scoped // Scoped acquisition with managed lifecycle
const Postgres = postgres.layer(Context.Key<Container>()) // Parameterized Layer for composition
```

Gate: `kind-file-construction`, `kind-record-minted-by-kind`, `type-checker`, `review` — verify the module is a `*.blueprint.ts` that mints through `Blueprint.make` imported from `@systemfsoftware/effect-cell-types` and never hand-brands a record; the identity entrypoint is the definition's only `of` caller; and execution targets (`.scoped`, `.layer`) exist only on a minted blueprint, making uninitialized acquisition impossible to compile.
