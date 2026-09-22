---
title: Adapters and services bind once at the composition root and libraries export parameterized layers
applies_when:
  - providing layers, stores, or adapters to a cell pipeline
  - configuring services at the application entrypoint
  - exporting Layer definitions from a reusable library or SDK package
tags: [cell, layer, provide, composition-root, dependencies, constructors]
---

Capability ports required by a cell pipeline's `R` channel must be provided **exactly once** at the application composition root (`main.ts` or test bootstrap) using `Cell.provide(layer)`:

- **Single Binding Site**: Cell pipelines accumulate required services in `R` as they compose. The composition root constructs the concrete adapter stack (`Layer.mergeAll(...)`) and eliminates `R` via `Cell.provide(AdapterStack)`.
- **Run Edge Invariant ($R = \text{never}$)**: Calling `cell.run(input)` requires that all service dependencies in `R` have been eliminated (reduced to `never`). The only lawful exception is `Scope` when the edge wraps execution in `Effect.scoped`.
- **No Mid-Pipeline Binding**: Never call `Effect.provide(program, layer)` or `Cell.provide` inside domain cells, workflows, or route handlers. Mid-pipeline binding scatters dependency wiring, prevents substitution during testing, and recreates service instances per request.
- **Parameterized Layer Constructors in Libraries**: Reusable capability and SDK libraries export parameterized `layer(spec)` constructors (e.g. `spec.layer` or `Layer.scoped(tag, spec.scoped)`), never static `*Live` singletons. The `*Live` naming convention belongs strictly to application composition roots where a concrete implementation is chosen over a test double.

```ts
// WRONG: providing layers inside handler code or exporting static Live singletons from a library
export const executeTransfer = (cmd: TransferCmd, layer: Layer.Layer<LedgerStore>) =>
  Effect.provide(transferCell.run(cmd), layer)

export const ContainerLive: Layer.Layer<ContainerDriver> = ... // Static singleton anti-pattern

// RIGHT: Cell dependencies infer into R; provided once at composition root
// In cell module:
export const transferCell: Cell.Cell<TransferCmd, Outcome, Err, LedgerStore> = ...

// At composition root (main.ts):
const AppStack = Layer.mergeAll(LedgerStoreLive, CustomerGateLive)
const runnableCell = transferCell.pipe(Cell.provide(AppStack))

// R is now never -> safe to run at edge:
NodeRuntime.runMain(Layer.launch(HttpServer.serve(runnableCell)))
```

Gate: `type-checker` — `cell.run(input)` fails compilation with `Type 'Service' is not assignable to type 'never'` if any service in `R` is unprovided.
Lint: `oxlint` bans `Cell.provide` and `Effect.provide` outside of composition-root files.
