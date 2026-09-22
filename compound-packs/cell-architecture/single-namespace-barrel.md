---
title: Export primary abstractions as cohesive namespace barrels matching Effect lineage
applies_when:
  - structuring public package exports in mod.ts or index.ts
  - designing API surface for a capability package
  - deciding between fragmented namespace barrels and consolidated modules
tags: [cell, namespace-barrel, export-topology]
---

In the Effect lineage, core domain abstractions are exported as cohesive, single-noun namespace barrels (e.g. `export * as Effect from './Effect.ts'`, `export * as Layer from './Layer.ts'`). Reusable capability packages follow this exact topology:

### 1. Single Primary Namespace Barrel

The package root (`mod.ts`) exports its primary capability as a single namespace barrel (`export * as Resource from './Resource/mod.js'`). Consumers write `import { Resource } from '@org/effect-resource'`.

### 2. Elimination of Fragmented Barrels

Do not splinter a capability into artificial namespace buckets (e.g. `ResourceError`, `ResourceSpec`, `ResourceSandbox`, `ResourceConfig`). Errors, builders, combinators, and handles belong to the capability they describe:

- **Constructors**: `Resource.make(...)`, `Resource.spec(...)`
- **Builder DSL / Combinators**: `Resource.withOption(...)`, `Resource.Wait`
- **Execution Handlers**: `Resource.scoped(...)`, `Resource.layer(...)`
- **Handles & Tags**: `Resource.Running`, `type Resource.Running`, `type Resource.Handle`
- **Errors**: `Resource.BootError`, `Resource.TimeoutError`, `type Resource.Error`

### 3. Zero-Cycle Import Invariants

The namespace barrel imports from non-cyclic leaf modules. Internal cycles are broken by extracting pure type contracts, schemas, and tags into dedicated leaf modules.

```ts
// WRONG: Fragmented, awkward namespace barrels
import {
  Resource,
  ResourceError,
  ResourceSandbox,
  ResourceSpec,
  ResourceSpecSchema,
} from '@org/effect-resource'

// RIGHT: Single cohesive namespace barrel matching Effect conventions
import { Container } from '@org/effect-container'

const container = Container.make('redis:7-alpine')
  .withPort(6379)
  .withWaitStrategy(Container.Wait.forPort(6379))

const vm = yield* container.scoped
```

Gate: `review` — verify `mod.ts` exports only the primary domain namespace barrels and contains zero fragmented error or schema barrels.
