---
title: Adapters and services bind once at the composition root and cell.run requires R = never
applies_when:
  - providing layers, stores, or adapters to a cell pipeline
  - configuring services at the application entrypoint
  - calling cell.run at the process edge
tags: [cell, layer, provide, composition-root, dependencies]
---

Capability ports required by a cell pipeline's `R` channel must be provided **exactly once** at the application composition root (`main.ts` or server bootstrap) using `Cell.provide(layer)`:

- **Single Binding Site**: Cell pipelines accumulate required services in `R` as they compose. The composition root constructs the concrete adapter stack (`Layer.mergeAll(...)`) and eliminates `R` via `Cell.provide(AdapterStack)`.
- **Run Edge Invariant ($R = \text{never}$)**: Calling `cell.run(input)` requires that all service dependencies in `R` have been eliminated (reduced to `never`). The only lawful exception is `Scope` when the edge wraps execution in `Effect.scoped`.
- **No Mid-Pipeline Binding**: Never call `Effect.provide(program, layer)` or `Cell.provide` inside domain cells, workflows, or route handlers. Mid-pipeline binding scatters dependency wiring, prevents substitution during testing, and recreates service instances per request.
- **Config Binds in `make`**: Configuration parameters (retries, intervals, URLs) are declared as `Context.Service` tags with no `make`. Services yield that tag in their own module-level `make` function. The root provides the configuration using `Layer.succeed(ConfigTag, config)`.

```ts
// WRONG: providing layers inside handler or domain code
export const executeTransfer = (cmd: TransferCmd, layer: Layer.Layer<LedgerStore>) =>
  Effect.provide(transferCell.run(cmd), layer)

// RIGHT: Cell dependencies infer into R; provided once at root
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
