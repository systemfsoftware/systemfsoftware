---
title: Resource specification algebra versus runtime handle duality
applies_when:
  - designing lifecycle boundaries for capability and infrastructure packages
  - separating cold resource builders from active runtime instances
  - deciding whether to model an entity as a Context.Service, Resource, or Handle
tags: [cell, resource-vs-handle, scope, handle, lifecycle]
---

Infrastructure packages separate the **resource** (the inert, schema-declared spec) from the **handle** (the live instance it acquires). Both are cell kinds in `@systemfsoftware/effect-cell-types`: `Resource.make` builds a resource kind in a `*.resource.ts` file, and `Handle.make` builds a handle kind in a `*.handle.ts` file. A kind is a file suffix; its constructor carries what a type can see, and a suffix-keyed rule carries the rest.

### 1. The Duality: Inert Resource vs. Live Handle

| Kind         | Role                                                                                                    | Built by        | Example                                                  |
| :----------- | :------------------------------------------------------------------------------------------------------ | :-------------- | :------------------------------------------------------- |
| **Resource** | Immutable data: a spec plus projections of one scoped acquisition (`scoped`, `layer`, `bind(key)`).     | `Resource.make` | `MicroVM.service('redis:7')`, `MemoryFileSystem.make(…)` |
| **Handle**   | Branded, pipeable data held while the `Scope` stays open; its driver sits in a slot callers can't name. | `Handle.make`   | `RunningVM`, `OpenFile`, `ObservationWindow`             |

Building a resource performs no I/O. Acquiring it runs the handle's `create` and registers the release in the caller's `Scope` in the same uninterruptible step.

### 2. Never Model a Handle as a `Context.Service`

A `Context.Service` is one ambient dependency per environment. Handles are values bound to a `Scope`:

- **Singleton collision**: a running container modeled as `Context.Service<RunningContainer>` cannot exist twice in one `Context`; `redis` overwrites `postgres`.
- **Handles are values**: like Effect's `Fiber`, `Socket`, and `Queue`, a handle is returned by `yield* resource.scoped`.
- **Binding on demand**: an application that wants a handle under its own key asks for it: `resource.bind(RedisKey)` returns `Layer<RedisKey, …>`. The key belongs to the caller, never to the resource or handle file.
- **Services come from the handle**: a service a handle provides (Effect's `FileSystem`, trace-spec's `Observation`) is assembled from the built operations in the definition's `services`, or from a third-party library layer in its `integration`.

### 3. Handles are Data; Operations are Duals the Kind Builds

A handle carries its name, its data, and a private driver slot. It never carries closures. The definition declares each operation as a function that receives the driver first and the handle second; the kind returns it as a dual over the handle:

```ts
// running-vm.handle.ts
export const RunningVM = Handle.make({
  name: 'RunningVM',
  create: (input: SandboxInput) =>
    Effect.map(createSandbox(input), (sandbox) => ({ driver: sandbox, data: { name: input.name } })),
  release: [
    [(sandbox) => Effect.tryPromise(() => sandbox.stop()), (sandbox) => Effect.tryPromise(() => sandbox.kill())],
    [(sandbox) => Effect.tryPromise(() => sandbox.destroy())],
  ],
  operations: {
    exec: (sandbox, _vm, cmd: string) => Effect.tryPromise(() => sandbox.exec(cmd)),
  },
})
export const exec = RunningVM.operations.exec // (self, cmd) and (cmd)(self)
```

```ts
// WRONG: an acquired entity modeled as an ambient singleton service
export class RunningContainer extends Context.Service<RunningContainer, Container>()('RunningContainer') {}

// RIGHT: two resources, two handle values, one Scope
Effect.scoped(
  Effect.gen(function*() {
    const redis = yield* Container.make('redis:7').pipe(Container.withPort(6379)).scoped
    const postgres = yield* Container.make('postgres:16').pipe(Container.withPort(5432)).scoped
    yield* redis.pipe(Container.exec('redis-cli ping'))
    yield* postgres.pipe(Container.exec('pg_isready'))
  }),
)
```

Where the driver may travel is prescribed by `handle-state-privacy.md`.

Gate: `@systemfsoftware/oxlint-plugin-cell-architecture` rules `kind-file-construction` (a `*.resource.ts` file calls `Resource.make`, a `*.handle.ts` file calls `Handle.make`), `kind-construction-location` (neither constructor anywhere else), and `kind-file-declares-no-service` (no `Context.Service` in either file). The branded record, the private driver slot, and the built duals are the constructor's output, so `pnpm --filter @systemfsoftware/effect-cell-types test:types` holds their shape.
