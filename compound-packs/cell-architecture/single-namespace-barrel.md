---
title: Export primary abstractions as cohesive namespace barrels matching Effect lineage
applies_when:
  - structuring public package exports in mod.ts or index.ts
  - designing API surface for a capability package
  - deciding between fragmented namespace barrels and consolidated modules
tags: [cell, namespace-barrel, export-topology]
---

In the Effect lineage, core domain abstractions are exported as cohesive, single-noun namespace barrels (e.g. `export * as Effect from './Effect.js'`, `export * as Layer from './Layer.js'`). Reusable capability packages follow this exact topology:

### 1. Single Primary Namespace Barrel

The package root (`mod.ts`) re-exports its primary capability from the kind leaves as a single namespace barrel (`export * as Container from './Container/mod.js'`). Consumers write `import { Container } from '@org/effect-container'`. The underlying `*.blueprint.ts` and `*.handle.ts` modules are leaves under that namespace; they are not themselves the public surface.

### 2. Elimination of Fragmented Barrels

Do not splinter a capability into artificial namespace buckets (e.g. `ContainerError`, `ContainerBlueprint`, `ContainerSandbox`, `ContainerSchema`). Errors, blueprints, combinators, targets, and handles belong to the capability they describe:

- **Constructors**: `Container.make(...)`, `Container.spec(...)`
- **Combinators**: `Container.withPort(...)`, `Container.Wait`
- **Guards & Types**: `Container.isRunning`, `type Container.Running`, `type Container.Blueprint`
- **Errors**: `Container.BootError`, `Container.TimeoutError`, `type Container.Error`

Execution targets (`.scoped`, `.layer`) are properties on a minted blueprint, not namespace functions — the barrel exports the constructor that mints it.

### 3. Zero-Cycle Import Invariants

The namespace barrel imports from non-cyclic leaf modules (`*.blueprint.ts`, `*.handle.ts`, `*.service.ts`). Internal cycles are broken by extracting pure type contracts, schemas, and tags into dedicated leaf modules.

```ts
// WRONG: fragmented, awkward namespace barrels
import {
  Container,
  ContainerError,
  ContainerSandbox,
  ContainerBlueprint,
  ContainerSchema,
} from '@org/effect-container'

// RIGHT: single cohesive namespace barrel matching Effect conventions
import { Container } from '@org/effect-container'

const container = Container.make('redis:7-alpine')
  .pipe(Container.withPort(6379), Container.withWaitStrategy(Container.Wait.forPort(6379)))

const vm = yield* container.scoped
```

Gate: `review` — verify `mod.ts` exports only the primary domain namespace barrels and contains zero fragmented error, schema, or blueprint barrels.
