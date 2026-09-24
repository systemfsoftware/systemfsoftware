---
title: Resource builders and combinators must implement full Pipeable and dual parity
applies_when:
  - authoring combinators and methods on resource builders
  - implementing fluent APIs in capability packages
  - integrating builders with Effect pipe workflows
tags: [cell, pipeable, dual, combinators]
---

Resources and handles are pipeable data; every combinator over them is a `dual(2, …)`. Configuration is dual-only: a resource value carries its spec, `pipe`, and its projections, and no configuration methods. Effect v4 configures its child-process command the same way (`repos/effect/packages/effect/src/unstable/process/ChildProcess.ts:798`).

### 1. Pipeable by construction

`Resource.make` and `Handle.make` put `pipe` on every resource and handle they build. A package never spreads `Pipeable.Prototype` by hand for either kind.

### 2. One dual per option, typed over the variants that honor it

Each option is one `dual(2, …)` over the resource types of the variants that honor it, so a variant that ignores an option refuses it at compile time:

```ts
type ServiceVM = Resource.Of<typeof ServiceKind>
type JobVM = Resource.Of<typeof JobKind>

// honored by both variants
export const withEnv: {
  (env: Record<string, string>): <Self extends ServiceVM | JobVM>(self: Self) => Self
  <Self extends ServiceVM | JobVM>(self: Self, env: Record<string, string>): Self
} = dual(2, …)

// honored only by services: a job resource is not an argument
export const withExposedPorts: {
  (ports: ReadonlyArray<number>): (self: ServiceVM) => ServiceVM
  (self: ServiceVM, ports: ReadonlyArray<number>): ServiceVM
} = dual(2, …)
```

```ts
// WRONG: a method chain beside the duals; two ways to say one thing, and the chain can't be typed per variant
MicroVM.job('alpine', ['true']).withExposedPorts([80])

// RIGHT: configuration through pipe
pipe(MicroVM.service('redis:7'), MicroVM.withExposedPorts([6379]), MicroVM.withMemoryLimit(512))
```

Gate: `missingPipeableSignature` at `error` in `packages/toolchain/tsconfig/effect.json` refuses an exported combinator without its data-last form. Each package's type tests refuse an option applied to a variant that ignores it (`pnpm --filter @systemfsoftware/effect-microsandbox test:types`). The absence of configuration methods on a resource value follows from `Resource.make` building the value.
