---
title: Export primary abstractions as cohesive namespace barrels matching Effect lineage
applies_when:
  - structuring public package exports in mod.ts or index.ts
  - designing API surface for a capability package
  - deciding between fragmented namespace barrels and consolidated modules
tags: [resource-algebra, namespace-barrel, export-topology, effect-style]
---

In the Effect lineage, core domain abstractions are exported as cohesive, single-noun namespace barrels (e.g. `export * as Effect from './Effect.ts'`, `export * as Layer from './Layer.ts'`). Reusable capability packages follow this exact topology:

- **Single Primary Namespace Barrel**: The package root (`mod.ts`) exports its primary capability as a single namespace barrel (`export * as MicroVM from './MicroVM.js'`). Consumers write `import { MicroVM } from '@systemfsoftware/...'`.
- **No Fragmented Barrels**: Do not splinter a capability into artificial namespace buckets (e.g. `MicroVMError`, `MicroVMSpec`, `MicroVMSpecSchema`, `MicroVMSandbox`). Errors, builders, combinators, and handles belong to the capability they describe.
- **Member Types & Values Accessible**: The namespace barrel re-exports:
  - Constructors: `MicroVM.spec(...)`, `MicroVM.scoped(...)`, `MicroVM.layer(...)`
  - Builder DSL: `MicroVM.Wait`
  - Handles & Tags: `MicroVM.RunningVM`, `type MicroVM.RunningVM`, `type MicroVM.ExecResult`
  - Errors: `MicroVM.SandboxBootError`, `type MicroVM.MicroVMError`
- **Zero Cycle Invariants**: The barrel imports from non-cyclic leaf modules (`RunningVM.ts`, `MicroVMSpec.ts`, `MicroVMSandbox.ts`).

```ts
// WRONG: Fragmented, awkward namespace barrels
import { MicroVM, MicroVMError, MicroVMSandbox, MicroVMSpec, MicroVMSpecSchema } from '@systemfsoftware/effect-microsandbox'

// RIGHT: Single cohesive namespace barrel matching Effect conventions
import { MicroVM } from '@systemfsoftware/effect-microsandbox'

const container = MicroVM.spec('redis:7-alpine')
  .withExposedPorts([6379])
  .withWaitStrategy(MicroVM.Wait.forPort(6379))

const vm = yield* container.scoped
```

Gate: `review` — verify `mod.ts` exports only the primary domain namespace barrels and contains zero fragmented error or schema barrels.
